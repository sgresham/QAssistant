import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import mongoose from 'mongoose';
import { Honcho } from "@honcho-ai/sdk";
import { authenticateToken, initializeDefaultAdmin, register, login } from './auth.js';
import { Folder, Conversation, dbConnected } from './db.js';
import { getFolders, createFolder, deleteFolder } from './folders.js';

// 1. Set up __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 2. Load .env from the ROOT directory
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const app = express();
const PORT = process.env.API_PORT || 3001;
const API_IP = process.env.API_IP || 'localhost';
const API_HTTPS_ENABLED = process.env.API_HTTPS_ENABLED === 'true';

// Middleware
app.use(cors());
app.use(express.json());

// Configuration
const LLAMA_BASE_URL = process.env.LLAMA_ENDPOINT || 'http://10.10.10.30:8888/v1';
const LLM_TIMEOUT = parseInt(process.env.LLM_TIMEOUT, 10) || 600; // in seconds

// Define Model IDs
const MODELS = {
  THINKER: process.env.THINKER_MODEL,
  REFLEX: process.env.REFLEX_MODEL
};

// --- Honcho Setup ---
const honcho = new Honcho({
  apiKey: process.env.HONCHO_API_KEY,
  baseURL: process.env.HONCHO_API_URL,
  workspaceId: "Qtest",
});

let honchoSessionID = null;

// Initialize default admin after DB connection
// We use a promise to ensure this runs after connection is established
mongoose.connection.once('open', () => {
  initializeDefaultAdmin();
});


// --- Helper: Call Llama.cpp with Streaming ---
async function* streamLlama(model, messages, temperature = 0.7) {
  try {
    const response = await axios.post(
      `${LLAMA_BASE_URL}/chat/completions`,
      {
        model: model,
        messages: messages,
        temperature: temperature,
        stream: true // Enable streaming
      },
      {
        timeout: LLM_TIMEOUT * 1000,
        responseType: 'stream' // Important for axios to handle stream
      }
    );

    // Parse the stream chunks (llama.cpp sends "data: {...}" lines)
    const stream = response.data;
    const decoder = new TextDecoder();

    for await (const chunk of stream) {
      const text = decoder.decode(chunk, { stream: true });
      const lines = text.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataStr = line.slice(6);
          if (dataStr === '[DONE]') {
            return; // End of stream
          }
          try {
            const data = JSON.parse(dataStr);
            if (data.choices && data.choices[0].delta?.content) {
              yield data.choices[0].delta.content;
            }
          } catch (e) {
            // Ignore malformed lines
          }
        }
      }
    }
  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      throw new Error(`LLM request timed out after ${LLM_TIMEOUT} seconds.`);
    }
    throw new Error(`LLM failed: ${error.message}`);
  }
}

// --- Auth API Endpoints ---

// Register
app.post('/api/auth/register', register);

// Login
app.post('/api/auth/login', login);

// --- Folder API Endpoints (Protected) ---

// 1. List all folders
app.get('/api/folders', authenticateToken, getFolders);

// 2. Create a new folder
app.post('/api/folders', authenticateToken, createFolder);

// 3. Delete a folder
app.delete('/api/folders/:id', authenticateToken, deleteFolder);

// --- Conversation API Endpoints (Protected) ---

// 1. List all conversations (with folder info)
app.get('/api/conversations', authenticateToken, async (req, res) => {
  try {
    if (!dbConnected) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    const conversations = await Conversation.find()
      .populate('folderId', 'name')
      .sort({ createdAt: -1 });
    res.json(conversations);
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ error: error.message });
  }
});

// 2. Get a specific conversation
app.get('/api/conversations/:id', authenticateToken, async (req, res) => {
  try {
    if (!dbConnected) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    const conversation = await Conversation.findById(req.params.id).populate('folderId', 'name');
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    res.json(conversation);
  } catch (error) {
    console.error('Error fetching conversation:', error);
    res.status(500).json({ error: error.message });
  }
});

// 3. Create a new conversation
app.post('/api/conversations', authenticateToken, async (req, res) => {
  try {
    if (!dbConnected) {
      return res.status(503).json({ error: 'Database not connected' });
    }

    const { title = 'New Conversation', folderId = null } = req?.body || {};

    const newConversation = new Conversation({
      title,
      folderId,
      messages: [{ role: 'system', content: 'You are a helpful AI assistant.' }]
    });
    await newConversation.save();
    res.json(newConversation);
  } catch (error) {
    console.error('Error creating conversation:', error);
    res.status(500).json({ error: error.message });
  }
});

// 4. Update conversation (e.g., move to folder or rename)
app.put('/api/conversations/:id', authenticateToken, async (req, res) => {
  try {
    if (!dbConnected) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    const { folderId, title } = req.body;

    const updateData = {};
    if (folderId !== undefined) updateData.folderId = folderId || null;
    if (title !== undefined) updateData.title = title;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No valid update data provided' });
    }

    const conversation = await Conversation.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    ).populate('folderId', 'name');

    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    res.json(conversation);
  } catch (error) {
    console.error('Error updating conversation:', error);
    res.status(500).json({ error: error.message });
  }
});

// 5. Delete a conversation
app.delete('/api/conversations/:id', authenticateToken, async (req, res) => {
  try {
    if (!dbConnected) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    const result = await Conversation.findByIdAndDelete(req.params.id);
    if (!result) return res.status(404).json({ error: 'Conversation not found' });
    res.json({ message: 'Conversation deleted successfully' });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    res.status(500).json({ error: error.message });
  }
});

// 6. Chat Endpoint (Streaming) (Protected)
app.post('/api/chat', authenticateToken, async (req, res) => {
  const { messages, modelPreference = 'auto', conversationId } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid request: "messages" array is required.' });
  }

  // Extract latest user message
  const latestUserMessage = messages.slice().reverse().find(m => m.role === 'user');
  const currentInput = latestUserMessage ? latestUserMessage.content : '';

  // Routing Logic
  let selectedModel = MODELS.THINKER;
  if (modelPreference === 'reflex') selectedModel = MODELS.REFLEX;
  else if (modelPreference === 'thinker') selectedModel = MODELS.THINKER;
  else if (currentInput && currentInput.length < 20) selectedModel = MODELS.REFLEX;

  console.log(`[ROUTER] Using model: ${selectedModel}`);

  // Set headers for streaming
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Prepare to save to DB after stream finishes
  let fullResponse = '';
  let conversationDoc = null;

  try {
    // If updating existing, load it now
    if (conversationId) {
      honchoSessionID = conversationId;
      conversationDoc = await Conversation.findById(conversationId);
      if (!conversationDoc) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
      // Add user message immediately
      conversationDoc.messages.push(latestUserMessage);
      await conversationDoc.save();
    }

    // Stream the response
    for await (const chunk of streamLlama(selectedModel, messages)) {
      fullResponse += chunk;
      // Send chunk to client in SSE format
      res.write(`data: ${JSON.stringify({ content: chunk, model: selectedModel })}\n\n`);
    }

    // Stream finished, save the full assistant message to DB
    if (conversationDoc) {
      conversationDoc.messages.push({ role: 'assistant', content: fullResponse });
      // Update title if it's the first user message
      if (conversationDoc.messages.length === 3) {
        conversationDoc.title = currentInput.substring(0, 30) + (currentInput.length > 30 ? '...' : '');
      }
      await conversationDoc.save();
    } else {
      // Create new conversation if no ID provided
      const newConv = new Conversation({
        title: currentInput.substring(0, 30) + (currentInput.length > 30 ? '...' : ''),
        messages: [
          { role: 'system', content: 'You are a helpful AI assistant.' },
          latestUserMessage,
          { role: 'assistant', content: fullResponse }
        ]
      });
      await newConv.save();
      honchoSessionID = newConv._id

      // Send the new ID as a final message
      res.write(`data: ${JSON.stringify({ type: 'new_conversation', id: newConv._id })}\n\n`);
    }
    // Add to Honcho
    const assistant = await honcho.peer("Q");
    const steve = await honcho.peer("steve");

    await honcho.peers();

    const session = await honcho.session(honchoSessionID, {
      config: {
        reasoning: { enabled: true },
        peer_card: { create: true, use: true },
        summary: {
          enabled: true,
          messages_per_short_summary: 15,
          messages_per_long_summary: 45
        }
      }
    });
    await session.addPeers([steve, assistant]);
    await session.addMessages([
      steve.message(latestUserMessage.content),
      assistant.message(fullResponse),
    ]);
    // const status = await honcho.queueStatus();
    // console.log(`Honcho status: ${JSON.stringify(status)}`)
    console.log('Honcho Complete')


    // Signal end of stream
    res.write('data: [DONE]\n\n');
    res.end();

  } catch (error) {
    console.error('Error in chat endpoint:', error);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

// Start Server
const protocol = API_HTTPS_ENABLED ? 'https' : 'http';
app.listen(PORT, API_IP, () => {
  console.log(`🚀 Backend API running on ${protocol}://${API_IP}:${PORT}`);
});
