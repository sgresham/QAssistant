import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { createMcpExpressApp } from '@modelcontextprotocol/express';
import { McpServer } from '@modelcontextprotocol/server';
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
import * as z from 'zod/v4';
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
// MCP INTEGRATION START (Streamable HTTP - Stateful)
// ==========================================

const mcpServer = new McpServer({
  name: 'qassistant-mcp-server',
  version: '1.0.0'
});

// Example: Register a simple tool
mcpServer.registerTool(
  'get_system_status',
  {
    description: 'Returns the current status of the AI system.',
    inputSchema: z.object()
  },
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

// Map to store active sessions
const sessions = new Map();

app.post('/mcp', async (req, res) => {
  // 1. Determine Session ID
  // Prefer header, fallback to query param
  let sessionId = req.headers['mcp-session-id'] || req.query.sessionId;

  if (!sessionId) {
    // If no session exists, generate a new one
    sessionId = crypto.randomUUID();
  }

  // Check if we already have a transport for this session
  let transport = sessions.get(sessionId);

  if (!transport) {
    // Create a new transport for this session
    transport = new NodeStreamableHTTPServerTransport({
      sessionIdGenerator: () => sessionId
    });

    try {
      // Connect the server to the transport. This sets up the message handler.
      await mcpServer.connect(transport);

      // Store in map
      sessions.set(sessionId, transport);
      console.log(`DEBUG: New MCP session created: ${sessionId}`);
    } catch (err) {
      console.error("Failed to connect MCP transport:", err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error during initialization" },
          id: null
        });
      }
      return;
    }
  }

  try {
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("Error handling MCP request:", error);
    if (!res.headersSent) {
      // Check if it's a specific MCP error we want to expose
      if (error.code === -32099 || (error.message && error.message.includes("not initialized"))) {
        // This error usually means the client didn't send 'initialize' first.
        // The SDK might have already sent a response, or we need to send one.
        // Note: If transport.handleRequest already sent a response, headersSent will be true.
        res.status(400).json({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Server not initialized. Please send 'initialize' method first." },
          id: req.body?.id || null
        });
      } else {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal error" },
          id: req.body?.id || null
        });
      }
    }
  }
});
// ==========================================
// MCP INTEGRATION END
// ==========================================

// Start Server
const protocol = API_HTTPS_ENABLED ? 'https' : 'http';
app.listen(PORT, API_IP, () => {
  console.log(`🚀 Backend API running on ${protocol}://${API_IP}:${PORT}`);
  console.log(`🤖 MCP Streamable HTTP Endpoint: ${protocol}://${API_IP}:${PORT}/mcp`);
});