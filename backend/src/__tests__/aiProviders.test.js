import { describe, it, expect, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { AiProvider } from '../db.js';

function getUserModel() {
  return mongoose.model('User');
}

let testUser;
const JWT_SECRET = 'test_jwt_secret';

beforeEach(() => {
  process.env.JWT_SECRET = JWT_SECRET;
});

async function createUser() {
  const User = getUserModel();
  testUser = await User.create({
    email: 'aiprovider@test.com',
    password: await bcrypt.hash('pass123', 10),
  });
}

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status: function (code) {
      this.statusCode = code;
      return this;
    },
    json: function (data) {
      this.body = data;
      return this;
    },
  };
  return res;
}

async function importHandler(name) {
  const mod = await import('../aiProviders.js');
  return mod[name];
}

describe('AI Provider CRUD', () => {
  beforeEach(async () => {
    await createUser();
  });

  describe('createAiProvider', () => {
    it('creates an AI provider with name, baseUrl, apiKey, models', async () => {
      const handler = await importHandler('createAiProvider');
      const req = {
        body: { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', apiKey: 'sk-test', models: ['deepseek-chat', 'deepseek-reasoner'] },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(201);
      expect(res.body.name).toBe('DeepSeek');
      expect(res.body.baseUrl).toBe('https://api.deepseek.com/v1');
      expect(res.body.apiKey).toBe('sk-test');
      expect(res.body.models).toEqual(['deepseek-chat', 'deepseek-reasoner']);
    });

    it('defaults apiKey to empty string when not provided', async () => {
      const handler = await importHandler('createAiProvider');
      const req = {
        body: { name: 'Local', baseUrl: 'http://localhost:8888/v1' },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(201);
      expect(res.body.apiKey).toBe('');
    });

    it('defaults models to empty array when not provided', async () => {
      const handler = await importHandler('createAiProvider');
      const req = {
        body: { name: 'Local', baseUrl: 'http://localhost:8888/v1' },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(201);
      expect(res.body.models).toEqual([]);
    });

    it('returns 400 when name is missing', async () => {
      const handler = await importHandler('createAiProvider');
      const req = {
        body: { baseUrl: 'http://localhost:8888/v1' },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when baseUrl is missing', async () => {
      const handler = await importHandler('createAiProvider');
      const req = {
        body: { name: 'No URL' },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(400);
    });

    it('returns 409 for duplicate name per user', async () => {
      const handler = await importHandler('createAiProvider');
      const req = {
        body: { name: 'Duplicate', baseUrl: 'http://test.com' },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(201);

      await handler(req, res);
      expect(res.statusCode).toBe(409);
    });
  });

  describe('getAiProviders', () => {
    it('returns user AI providers sorted by date descending', async () => {
      await AiProvider.create([
        { name: 'First', baseUrl: 'http://a.com', userId: testUser._id, createdAt: new Date('2024-01-01') },
        { name: 'Second', baseUrl: 'http://b.com', userId: testUser._id, createdAt: new Date('2024-06-01') },
      ]);
      const handler = await importHandler('getAiProviders');
      const req = { user: { id: testUser._id.toString() } };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].name).toBe('Second');
      expect(res.body[1].name).toBe('First');
    });

    it('does not return another user\'s AI providers', async () => {
      const User = getUserModel();
      const user2 = await User.create({
        email: 'otherprov@test.com',
        password: await bcrypt.hash('pass', 10),
      });
      await AiProvider.create({ name: 'Secret', baseUrl: 'http://x.com', userId: user2._id });
      const handler = await importHandler('getAiProviders');
      const req = { user: { id: testUser._id.toString() } };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveLength(0);
    });
  });

  describe('getAiProvider', () => {
    it('returns a single AI provider by id', async () => {
      const provider = await AiProvider.create({
        name: 'FindMe',
        baseUrl: 'http://find.com',
        userId: testUser._id,
      });
      const handler = await importHandler('getAiProvider');
      const req = {
        params: { id: provider._id.toString() },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.name).toBe('FindMe');
    });

    it('returns 404 for non-existent provider', async () => {
      const handler = await importHandler('getAiProvider');
      const req = {
        params: { id: '000000000000000000000000' },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(404);
    });

    it('returns 404 for another user\'s provider', async () => {
      const User = getUserModel();
      const user2 = await User.create({
        email: 'ownerprov@test.com',
        password: await bcrypt.hash('pass', 10),
      });
      const provider = await AiProvider.create({ name: 'Owned', baseUrl: 'http://o.com', userId: user2._id });
      const handler = await importHandler('getAiProvider');
      const req = {
        params: { id: provider._id.toString() },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(404);
    });
  });

  describe('updateAiProvider', () => {
    it('updates provider name and baseUrl', async () => {
      const provider = await AiProvider.create({ name: 'Old', baseUrl: 'http://old.com', userId: testUser._id });
      const handler = await importHandler('updateAiProvider');
      const req = {
        params: { id: provider._id.toString() },
        body: { name: 'New', baseUrl: 'http://new.com' },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.name).toBe('New');
      expect(res.body.baseUrl).toBe('http://new.com');
    });

    it('updates provider apiKey', async () => {
      const provider = await AiProvider.create({ name: 'Test', baseUrl: 'http://t.com', userId: testUser._id });
      const handler = await importHandler('updateAiProvider');
      const req = {
        params: { id: provider._id.toString() },
        body: { apiKey: 'new-key' },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.apiKey).toBe('new-key');
    });

    it('updates provider models', async () => {
      const provider = await AiProvider.create({ name: 'Test', baseUrl: 'http://t.com', userId: testUser._id, models: ['old'] });
      const handler = await importHandler('updateAiProvider');
      const req = {
        params: { id: provider._id.toString() },
        body: { models: ['new-model'] },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.models).toEqual(['new-model']);
    });

    it('disables provider by setting enabled to false', async () => {
      const provider = await AiProvider.create({ name: 'Test', baseUrl: 'http://t.com', userId: testUser._id });
      expect(provider.enabled).toBe(true);
      const handler = await importHandler('updateAiProvider');
      const req = {
        params: { id: provider._id.toString() },
        body: { enabled: false },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.enabled).toBe(false);
    });

    it('returns 404 for non-existent provider', async () => {
      const handler = await importHandler('updateAiProvider');
      const req = {
        params: { id: '000000000000000000000000' },
        body: { name: 'New' },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(404);
    });

    it('returns 404 for another user\'s provider', async () => {
      const User = getUserModel();
      const user2 = await User.create({
        email: 'ownerprov2@test.com',
        password: await bcrypt.hash('pass', 10),
      });
      const provider = await AiProvider.create({ name: 'Owned', baseUrl: 'http://o.com', userId: user2._id });
      const handler = await importHandler('updateAiProvider');
      const req = {
        params: { id: provider._id.toString() },
        body: { name: 'Hacked' },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(404);
    });

    it('returns 400 when no update data provided', async () => {
      const provider = await AiProvider.create({ name: 'Test', baseUrl: 'http://t.com', userId: testUser._id });
      const handler = await importHandler('updateAiProvider');
      const req = {
        params: { id: provider._id.toString() },
        body: {},
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(400);
    });
  });

  describe('deleteAiProvider', () => {
    it('deletes the AI provider', async () => {
      const provider = await AiProvider.create({ name: 'DeleteMe', baseUrl: 'http://d.com', userId: testUser._id });
      const handler = await importHandler('deleteAiProvider');
      const req = {
        params: { id: provider._id.toString() },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(200);
      expect(await AiProvider.findById(provider._id)).toBeNull();
    });

    it('returns 404 for non-existent provider', async () => {
      const handler = await importHandler('deleteAiProvider');
      const req = {
        params: { id: '000000000000000000000000' },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(404);
    });

    it('returns 404 for another user\'s provider', async () => {
      const User = getUserModel();
      const user2 = await User.create({
        email: 'ownerdelprov@test.com',
        password: await bcrypt.hash('pass', 10),
      });
      const provider = await AiProvider.create({ name: 'Owned', baseUrl: 'http://o.com', userId: user2._id });
      const handler = await importHandler('deleteAiProvider');
      const req = {
        params: { id: provider._id.toString() },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(404);
    });
  });
});
