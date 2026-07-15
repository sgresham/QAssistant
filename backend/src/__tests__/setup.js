import { afterAll, afterEach, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

vi.mock('google-auth-library', () => {
  const mockGetToken = vi.fn().mockResolvedValue({ tokens: { id_token: 'mock-id-token' } });
  const mockVerifyIdToken = vi.fn().mockResolvedValue({
    getPayload: () => ({ email: 'google@test.com', sub: 'google123' }),
  });
  return {
    OAuth2Client: vi.fn(() => ({
      getToken: mockGetToken,
      setCredentials: vi.fn(),
      verifyIdToken: mockVerifyIdToken,
    })),
  };
});

// Top-level await ensures this completes before test files are loaded
const mongoServer = await MongoMemoryServer.create();
let uri = mongoServer.getUri();
// Strip trailing slash so db.js can append the database name
uri = uri.replace(/\/+$/, '');
process.env.MONGODB_URI = uri;
process.env.MONGODB_DB = 'test_db';
global.__MONGO_MEMORY_SERVER__ = mongoServer;

// Import both auth.js (User model) and db.js (Folder, Conversation, McpServer models + DB connection)
await import('../auth.js');
await import('../db.js');

afterAll(async () => {
  try {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.dropDatabase();
    }
    await mongoose.connection.close();
  } catch {}
  try {
    if (global.__MONGO_MEMORY_SERVER__) {
      await global.__MONGO_MEMORY_SERVER__.stop();
    }
  } catch {}
});

afterEach(async () => {
  try {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
  } catch {}
});
