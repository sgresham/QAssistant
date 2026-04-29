import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// 1. Set up __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 2. Load .env from the ROOT directory
dotenv.config({ path: path.resolve(__dirname, '../.env') });

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
    content: { type: String, required: true }
  }],
  folderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Folder', default: null },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now }
});

export const Conversation = mongoose.model('Conversation', ConversationSchema);

export { dbConnected };
