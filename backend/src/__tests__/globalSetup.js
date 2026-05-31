import { MongoMemoryServer } from 'mongodb-memory-server';

export async function setup() {
  const mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  process.env.MONGODB_URI = uri;
  process.env.MONGODB_DB = 'test_db';
  // Store the server instance globally so we can stop it later
  global.__MONGO_MEMORY_SERVER__ = mongoServer;
}

export async function teardown() {
  try {
    if (global.__MONGO_MEMORY_SERVER__) {
      await global.__MONGO_MEMORY_SERVER__.stop();
    }
  } catch {}
}
