import fs from 'fs';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// 1. Set up __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 2. Load .env from the repo root (no-op in Docker; env vars come from docker-compose)
const envPath = path.resolve(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://10.10.10.30:27017';
const MONGODB_DB = process.env.MONGODB_DB || 'chat_app';

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
  name: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  systemPrompt: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

// Ensure unique name per user
FolderSchema.index({ userId: 1, name: 1 }, { unique: true });

export const Folder = mongoose.model('Folder', FolderSchema);

// --- Conversation Schema ---
const ConversationSchema = new mongoose.Schema({
  title: { type: String, default: 'New Conversation' },
  messages: [{
    role: { type: String, required: true },
    content: { type: String, default: '' },
    tool_calls: { type: [mongoose.Schema.Types.Mixed], default: undefined },
    tool_call_id: { type: String, default: undefined }
  }],
  folderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Folder', default: null },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  providerId: { type: mongoose.Schema.Types.ObjectId, ref: 'AiProvider', default: null },
  selectedModel: { type: String, default: '' },
  systemPrompt: { type: String, default: '' },
  systemPromptHash: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

export const Conversation = mongoose.model('Conversation', ConversationSchema);

// --- AI Provider Schema ---
const AiProviderSchema = new mongoose.Schema({
  name: { type: String, required: true },
  baseUrl: { type: String, required: true },
  apiKey: { type: String, default: '' },
  models: [{ type: String }],
  enabled: { type: Boolean, default: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

AiProviderSchema.index({ userId: 1, name: 1 }, { unique: true });

export const AiProvider = mongoose.model('AiProvider', AiProviderSchema);

// --- MCP Server Schema ---
const McpServerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  url: { type: String, required: true },
  headers: { type: Object, default: {} },
  enabled: { type: Boolean, default: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

export const McpServer = mongoose.model('McpServer', McpServerSchema);

export { dbConnected };
