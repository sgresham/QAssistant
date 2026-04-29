import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
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
const API_IP = process.env.API_IP || 'localhost';
const API_HTTPS_ENABLED = process.env.API_HTTPS_ENABLED === 'true';

// Middleware
app.use(cors());
app.use(express.json());

// Initialize default admin after DB connection
// We use a promise to ensure this runs after connection is established
mongoose.connection.once('open', () => {
  initializeDefaultAdmin();
});

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
app.get('/api/conversations', authenticateToken, getConversations);

// 2. Get a specific conversation
app.get('/api/conversations/:id', authenticateToken, getConversation);

// 3. Create a new conversation
app.post('/api/conversations', authenticateToken, createConversation);

// 4. Update conversation (e.g., move to folder or rename)
app.put('/api/conversations/:id', authenticateToken, updateConversation);

// 5. Delete a conversation
app.delete('/api/conversations/:id', authenticateToken, deleteConversation);

// 6. Chat Endpoint (Streaming) (Protected)
app.post('/api/chat', authenticateToken, chat);

// Start Server
const protocol = API_HTTPS_ENABLED ? 'https' : 'http';
app.listen(PORT, API_IP, () => {
  console.log(`🚀 Backend API running on ${protocol}://${API_IP}:${PORT}`);
});
