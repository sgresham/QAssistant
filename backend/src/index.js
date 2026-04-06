import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

// 1. Set up __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 2. Load .env from the ROOT directory (two levels up from src/index.js)
// path.resolve(__dirname, '../../.env') goes: src -> backend -> root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const app = express();
const PORT = process.env.API_PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Configuration
const LLAMA_BASE_URL = process.env.LLAMA_ENDPOINT || 'http://10.10.10.30:8888/v1';

// Define Model IDs (Exact names as loaded in llama.cpp)
const MODELS = {
  THINKER: process.env.THINKER_MODEL, // High intelligence, slower
  REFLEX: process.env.REFLEX_MODEL  // Fast, lower intelligence
};

// Health Check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    llamaEndpoint: LLAMA_BASE_URL,
    availableModels: Object.values(MODELS)
  });
});

// Helper: Call Llama.cpp
async function callLlama(model, messages, temperature = 0.7) {
  try {
    const response = await axios.post(
      `${LLAMA_BASE_URL}/chat/completions`,
      {
        model: model,
        messages: messages,
        temperature: temperature,
        stream: false // We can add streaming later for real-time feel
      },
      { timeout: 60000 } // 60s timeout for the 27B model
    );
    return response.data.choices[0].message.content;
  } catch (error) {
    console.error(`[LLAMA ERROR] Model: ${model}, Error:`, error.message);
    throw new Error(`LLM failed: ${error.message}`);
  }
}

// Chat Endpoint
app.post('/api/chat', async (req, res) => {
  const { message, modelPreference = 'auto' } = req.body;

  // Simple Routing Logic
  // In a real app, we might use the 0.8B model to *decide* which model to use.
  // For now, we use a simple heuristic: if the message is short (< 20 chars), use Reflex.
  let selectedModel = MODELS.THINKER;
  let reason = 'Defaulting to Thinker';

  if (modelPreference === 'reflex') {
    selectedModel = MODELS.REFLEX;
    reason = 'User requested Reflex';
  } else if (modelPreference === 'thinker') {
    selectedModel = MODELS.THINKER;
    reason = 'User requested Thinker';
  } else if (message.length < 20) {
    selectedModel = MODELS.REFLEX;
    reason = 'Short query detected -> Reflex';
  }

  console.log(`[ROUTER] Using model: ${selectedModel} (${reason})`);

  try {
    const responseText = await callLlama(selectedModel, [
      { role: "system", content: "You are a helpful AI assistant for a software engineer. You have access to local tools. Keep answers concise unless asked for detail." },
      { role: "user", content: message }
    ]);

    res.json({ 
      reply: responseText, 
      modelUsed: selectedModel,
      latency: 'calculated' // Placeholder for real latency tracking
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Backend API running on http://localhost:${PORT}`);
  console.log(`🧠 Models configured: ${MODELS.THINKER}, ${MODELS.REFLEX}`);
});