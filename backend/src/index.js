import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import mongoose from 'mongoose';

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
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://10.10.10.30:27017';
const MONGODB_DB = process.env.MONGODB_DB || 'chat_app';
const LLM_TIMEOUT = parseInt(process.env.LLM_TIMEOUT, 10) || 600; // in seconds

// Define Model IDs
const MODELS = {
  THINKER: process.env.THINKER_MODEL,
  REFLEX: process.env.REFLEX_MODEL
};

// --- MongoDB Setup ---
let dbConnected = false;

mongoose.connect(`${MONGODB_URI}/${MONGODB_DB}`)
  .then(() => {
    console.log(`✅ Connected to MongoDB: ${MONGODB_DB}`);
    dbConnected = true;
  })
  .catch(err => {
    console.error(`❌ MongoDB Connection Error:`, err);
  });

// --- Folder Schema ---
const FolderSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now }
});

const Folder = mongoose.model('Folder', FolderSchema);

// --- Conversation Schema ---
const ConversationSchema = new mongoose.Schema({
  title: { type: String, default: 'New Conversation' },
  messages: [{
    role: { type: String, required: true },
    content: { type: String, required: true }
  }],
  folderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Folder', default: null },
  createdAt: { type: Date, default: Date.now }
});

const Conversation = mongoose.model('Conversation', ConversationSchema);

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

// --- Folder API Endpoints ---

// 1. List all folders
app.get('/api/folders', async (req, res) => {
  try {
    if (!mongoose.connection.readyState) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    const folders = await Folder.find().sort({ name: 1 });
    res.json(folders);
  } catch (error) {
    console.error('Error fetching folders:', error);
    res.status(500).json({ error: error.message });
  }
});

// 2. Create a new folder
app.post('/api/folders', async (req, res) => {
  try {
    if (!mongoose.connection.readyState) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Folder name is required' });

    const newFolder = new Folder({ name });
    await newFolder.save();
    res.json(newFolder);
  } catch (error) {
    console.error('Error creating folder:', error);
    if (error.code === 11000) {
      return res.status(409).json({ error: 'Folder with this name already exists' });
    }
    res.status(500).json({ error: error.message });
  }
});

// 3. Delete a folder
app.delete('/api/folders/:id', async (req, res) => {
  try {
    if (!mongoose.connection.readyState) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    const result = await Folder.findByIdAndDelete(req.params.id);
    if (!result) return res.status(404).json({ error: 'Folder not found' });
    
    // Optional: Move conversations in this folder to null (ungrouped)
    await Conversation.updateMany({ folderId: req.params.id }, { folderId: null });

    res.json({ message: 'Folder deleted successfully' });
  } catch (error) {
    console.error('Error deleting folder:', error);
    res.status(500).json({ error: error.message });
  }
});

// --- Conversation API Endpoints ---

// 1. List all conversations (with folder info)
app.get('/api/conversations', async (req, res) => {
  try {
    if (!mongoose.connection.readyState) {
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
app.get('/api/conversations/:id', async (req, res) => {
  try {
    if (!mongoose.connection.readyState) {
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
app.post('/api/conversations', async (req, res) => {
  try {
    if (!mongoose.connection.readyState) {
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

// 4. Update conversation (e.g., move to folder)
app.put('/api/conversations/:id', async (req, res) => {
  try {
    if (!mongoose.connection.readyState) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    const { folderId } = req.body;
    
    const conversation = await Conversation.findByIdAndUpdate(
      req.params.id,
      { folderId: folderId || null },
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
app.delete('/api/conversations/:id', async (req, res) => {
  try {
    if (!mongoose.connection.readyState) {
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

// 6. Chat Endpoint (Streaming)
app.post('/api/chat', async (req, res) => {
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
      // Send the new ID as a final message
      res.write(`data: ${JSON.stringify({ type: 'new_conversation', id: newConv._id })}\n\n`);
    }

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
