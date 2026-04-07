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
    // Don't crash the server, but log the error
  });

const ConversationSchema = new mongoose.Schema({
  title: { type: String, default: 'New Conversation' },
  messages: [{
    role: { type: String, required: true }, // 'system', 'user', 'assistant'
    content: { type: String, required: true }
  }],
  createdAt: { type: Date, default: Date.now }
});

const Conversation = mongoose.model('Conversation', ConversationSchema);

// --- Helper: Call Llama.cpp ---
async function callLlama(model, messages, temperature = 0.7) {
  try {
    const response = await axios.post(
      `${LLAMA_BASE_URL}/chat/completions`,
      {
        model: model,
        messages: messages,
        temperature: temperature,
        stream: false
      },
      {
        timeout: LLM_TIMEOUT * 1000, // Convert seconds to milliseconds
        headers: { 'Content-Type': 'application/json' }
      }
    );
    return response.data.choices[0].message.content;
  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      throw new Error(`LLM request timed out after ${LLM_TIMEOUT} seconds.`);
    }
    if (error.response && error.response.status === 502) {
      throw new Error(`LLM server returned 502 Bad Gateway.`);
    }
    throw new Error(`LLM failed: ${error.message}`);
  }
}

// --- API Endpoints ---

// 1. List all conversations
app.get('/api/conversations', async (req, res) => {
  try {
    if (!mongoose.connection.readyState) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    const conversations = await Conversation.find().sort({ createdAt: -1 });
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
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    res.json(conversation);
  } catch (error) {
    console.error('Error fetching conversation:', error);
    res.status(500).json({ error: error.message });
  }
});

// 3. Create a new conversation (or start a session)  
app.post('/api/conversations', async (req, res) => {  
  try {  
    if (!mongoose.connection.readyState) {  
      return res.status(503).json({ error: 'Database not connected' });  
    }  
    
    // FIX: Ensure req.body is at least an empty object before destructuring
    const { title = 'New Conversation' } = req?.body || {};  
    
    const newConversation = new Conversation({  
      title,  
      messages: [{ role: 'system', content: 'You are a helpful AI assistant.' }]  
    });  
    await newConversation.save();  
    res.json(newConversation);  
  } catch (error) {  
    console.error('Error creating conversation:', error);  
    res.status(500).json({ error: error.message });  
  }  
});

// 4. Chat Endpoint (Updated to save to DB)
app.post('/api/chat', async (req, res) => {
  const { messages, modelPreference = 'auto', conversationId } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid request: "messages" array is required.' });
  }

  // Extract latest user message for routing
  const latestUserMessage = messages.slice().reverse().find(m => m.role === 'user');
  const currentInput = latestUserMessage ? latestUserMessage.content : '';

  // Routing Logic
  let selectedModel = MODELS.THINKER;
  if (modelPreference === 'reflex') selectedModel = MODELS.REFLEX;
  else if (modelPreference === 'thinker') selectedModel = MODELS.THINKER;
  else if (currentInput && currentInput.length < 20) selectedModel = MODELS.REFLEX;

  console.log(`[ROUTER] Using model: ${selectedModel}`);

  try {
    const responseText = await callLlama(selectedModel, messages);
    const assistantMessage = { role: 'assistant', content: responseText };

    // Save/Update Conversation in DB
    if (conversationId) {
      // Update existing
      const conversation = await Conversation.findById(conversationId);
      if (conversation) {
        // Append user and assistant messages
        conversation.messages.push(latestUserMessage, assistantMessage);
        // Update title if it's the first user message
        if (conversation.messages.length === 3) { // System + User + Assistant
          conversation.title = currentInput.substring(0, 30) + (currentInput.length > 30 ? '...' : '');
        }
        await conversation.save();
      }
    } else {
      // Create new if no ID provided (fallback)
      const newConv = new Conversation({
        title: currentInput.substring(0, 30) + (currentInput.length > 30 ? '...' : ''),
        messages: messages.concat([assistantMessage])
      });
      await newConv.save();
      // Return the new ID so frontend can track it
      res.json({
        reply: responseText,
        modelUsed: selectedModel,
        conversationId: newConv._id
      });
      return;
    }

    res.json({
      reply: responseText,
      modelUsed: selectedModel,
      conversationId: conversationId
    });
  } catch (error) {
    console.error('Error in chat endpoint:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start Server
const protocol = API_HTTPS_ENABLED ? 'https' : 'http';
app.listen(PORT, API_IP, () => {
  console.log(`🚀 Backend API running on ${protocol}://${API_IP}:${PORT}`);
});
