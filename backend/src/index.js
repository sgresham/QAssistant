import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.API_PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Placeholder: Llama.cpp Proxy (Securely forward requests to local LLM)
app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  
  // TODO: Implement actual Llama.cpp logic here
  // For now, return a mock response
  console.log(`[LLAMA] Received message: ${message}`);
  res.json({ 
    reply: `I am ready to process: "${message}". Llama endpoint configured at ${process.env.LLAMA_ENDPOINT}` 
  });
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Backend API running on http://localhost:${PORT}`);
});