import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';

import { authenticateToken, initializeDefaultAdmin, register, login } from './auth.js';
import { Folder, Conversation, dbConnected } from './db.js';
import { getFolders, createFolder, deleteFolder } from './folders.js';
import {
  getConversations,
  getConversation,
  createConversation,
  updateConversation,
  deleteConversation,
  chat
} from './conversations.js';

// 1. Set up __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 2. Load .env from the ROOT of backend
dotenv.config({ path: path.resolve(__dirname, '.env') });

const app = express();
const PORT = process.env.API_PORT || 3001;
const API_IP = process.env.API_IP || '0.0.0.0';
const API_HTTPS_ENABLED = process.env.API_HTTPS_ENABLED === 'true';

// Middleware
app.use(cors());
app.use(express.json());

// Initialize default admin after DB connection
mongoose.connection.once('open', () => {
  initializeDefaultAdmin();
});

// --- Auth API Endpoints ---
app.post('/api/auth/register', register);
app.post('/api/auth/login', login);

// --- Folder API Endpoints (Protected) ---
app.get('/api/folders', authenticateToken, getFolders);
app.post('/api/folders', authenticateToken, createFolder);
app.delete('/api/folders/:id', authenticateToken, deleteFolder);

// --- Conversation API Endpoints (Protected) ---
app.get('/api/conversations', authenticateToken, getConversations);
app.get('/api/conversations/:id', authenticateToken, getConversation);
app.post('/api/conversations', authenticateToken, createConversation);
app.put('/api/conversations/:id', authenticateToken, updateConversation);
app.delete('/api/conversations/:id', authenticateToken, deleteConversation);

// --- Chat Endpoint (Streaming) (Protected) ---
app.post('/api/chat', authenticateToken, chat);

// ==========================================
// MCP INTEGRATION START
// ==========================================

const mcpServer = new McpServer({
  name: 'qassistant-mcp-server',
  version: '1.0.0'
});

// Example: Register a simple tool to test MCP
// You will move this logic to a separate file later (e.g., ./agents/index.js)
mcpServer.tool(
  'get_system_status',
  'Returns the current status of the AI system and available agents.',
  {}, // No parameters
  async () => {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'online',
            agents: ['thinker', 'reflex', 'auto'],
            dbConnected: mongoose.connection.readyState === 1
          })
        }
      ]
    };
  }
);

// --- MCP Endpoints ---

// 1. Initialize SSE Connection
// This endpoint is called by the client to establish the connection.
app.post('/mcp', async (req, res) => {
  const transport = new SSEServerTransport('/mcp/messages', res);
  await mcpServer.connect(transport);
});

// 2. Message Endpoint
// This endpoint handles the bidirectional communication after the SSE connection is established.
app.post('/mcp/messages', async (req, res) => {
  // The SSEServerTransport handles the message internally, 
  // but we need to ensure the request is processed.
  // In some implementations, you might need to handle the message dispatch here 
  // if using a different transport, but for SSE, the transport usually handles it.
  // However, for robustness in Express, we can just let the transport handle it.
  // If you encounter issues with 'message not found', ensure the transport is correctly linked.
});

// ==========================================
// MCP INTEGRATION END
// ==========================================

// Start Server
const protocol = API_HTTPS_ENABLED ? 'https' : 'http';
app.listen(PORT, API_IP, () => {
  console.log(`🚀 Backend API running on ${protocol}://${API_IP}:${PORT}`);
  console.log(`🤖 MCP SSE Endpoint: ${protocol}://${API_IP}:${PORT}/mcp`);
});