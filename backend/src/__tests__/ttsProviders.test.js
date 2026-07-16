import { describe, it, expect, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { TtsProvider } from '../db.js';

function getUserModel() {
  return mongoose.model('User');
}

let testUser;

async function createUser() {
  const User = getUserModel();
  testUser = await User.create({
    email: 'ttsprov@test.com',
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
  const mod = await import('../ttsProviders.js');
  return mod[name];
}

describe('TTS Provider CRUD', () => {
  beforeEach(async () => {
    await createUser();
  });

  describe('createTtsProvider', () => {
    it('creates a TTS provider with name, apiKey, defaultVoice', async () => {
      const handler = await importHandler('createTtsProvider');
      const req = {
        body: { name: 'ElevenLabs', apiKey: 'sk-test', defaultVoice: 'voice123' },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(201);
      expect(res.body.name).toBe('ElevenLabs');
      expect(res.body.apiKey).toBe('sk-test');
      expect(res.body.defaultVoice).toBe('voice123');
    });

    it('defaults apiKey to empty string when not provided', async () => {
      const handler = await importHandler('createTtsProvider');
      const req = {
        body: { name: 'DefaultKey' },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(201);
      expect(res.body.apiKey).toBe('');
    });

    it('defaults defaultVoice to Julian voice ID when not provided', async () => {
      const handler = await importHandler('createTtsProvider');
      const req = {
        body: { name: 'DefaultVoice' },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(201);
      expect(res.body.defaultVoice).toBe('7p1Ofvcwsv7UBPoFNcpI');
    });

    it('returns 400 when name is missing', async () => {
      const handler = await importHandler('createTtsProvider');
      const req = {
        body: { apiKey: 'sk-test' },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(400);
    });

    it('returns 409 for duplicate name per user', async () => {
      const handler = await importHandler('createTtsProvider');
      const req = {
        body: { name: 'Duplicate' },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(201);

      await handler(req, res);
      expect(res.statusCode).toBe(409);
    });
  });

  describe('getTtsProviders', () => {
    it('returns user TTS providers sorted by date descending', async () => {
      await TtsProvider.create([
        { name: 'First', apiKey: 'k1', userId: testUser._id, createdAt: new Date('2024-01-01') },
        { name: 'Second', apiKey: 'k2', userId: testUser._id, createdAt: new Date('2024-06-01') },
      ]);
      const handler = await importHandler('getTtsProviders');
      const req = { user: { id: testUser._id.toString() } };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].name).toBe('Second');
      expect(res.body[1].name).toBe('First');
    });

    it('does not return another user\'s TTS providers', async () => {
      const User = getUserModel();
      const user2 = await User.create({
        email: 'othertts@test.com',
        password: await bcrypt.hash('pass', 10),
      });
      await TtsProvider.create({ name: 'Secret', apiKey: 'k', userId: user2._id });
      const handler = await importHandler('getTtsProviders');
      const req = { user: { id: testUser._id.toString() } };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveLength(0);
    });
  });

  describe('getTtsProvider', () => {
    it('returns a single TTS provider by id', async () => {
      const provider = await TtsProvider.create({
        name: 'FindMe',
        apiKey: 'k-find',
        userId: testUser._id,
      });
      const handler = await importHandler('getTtsProvider');
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
      const handler = await importHandler('getTtsProvider');
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
        email: 'ownertts@test.com',
        password: await bcrypt.hash('pass', 10),
      });
      const provider = await TtsProvider.create({ name: 'Owned', apiKey: 'k', userId: user2._id });
      const handler = await importHandler('getTtsProvider');
      const req = {
        params: { id: provider._id.toString() },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(404);
    });
  });

  describe('updateTtsProvider', () => {
    it('updates provider name and apiKey', async () => {
      const provider = await TtsProvider.create({ name: 'Old', apiKey: 'old-key', userId: testUser._id });
      const handler = await importHandler('updateTtsProvider');
      const req = {
        params: { id: provider._id.toString() },
        body: { name: 'New', apiKey: 'new-key' },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.name).toBe('New');
      expect(res.body.apiKey).toBe('new-key');
    });

    it('updates defaultVoice', async () => {
      const provider = await TtsProvider.create({ name: 'Test', apiKey: 'k', userId: testUser._id });
      const handler = await importHandler('updateTtsProvider');
      const req = {
        params: { id: provider._id.toString() },
        body: { defaultVoice: 'new-voice-id' },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.defaultVoice).toBe('new-voice-id');
    });

    it('disables provider by setting enabled to false', async () => {
      const provider = await TtsProvider.create({ name: 'Test', apiKey: 'k', userId: testUser._id });
      expect(provider.enabled).toBe(true);
      const handler = await importHandler('updateTtsProvider');
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
      const handler = await importHandler('updateTtsProvider');
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
        email: 'ownertts2@test.com',
        password: await bcrypt.hash('pass', 10),
      });
      const provider = await TtsProvider.create({ name: 'Owned', apiKey: 'k', userId: user2._id });
      const handler = await importHandler('updateTtsProvider');
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
      const provider = await TtsProvider.create({ name: 'Test', apiKey: 'k', userId: testUser._id });
      const handler = await importHandler('updateTtsProvider');
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

  describe('deleteTtsProvider', () => {
    it('deletes the TTS provider', async () => {
      const provider = await TtsProvider.create({ name: 'DeleteMe', apiKey: 'k', userId: testUser._id });
      const handler = await importHandler('deleteTtsProvider');
      const req = {
        params: { id: provider._id.toString() },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(200);
      expect(await TtsProvider.findById(provider._id)).toBeNull();
    });

    it('returns 404 for non-existent provider', async () => {
      const handler = await importHandler('deleteTtsProvider');
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
        email: 'ownerdeltts@test.com',
        password: await bcrypt.hash('pass', 10),
      });
      const provider = await TtsProvider.create({ name: 'Owned', apiKey: 'k', userId: user2._id });
      const handler = await importHandler('deleteTtsProvider');
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
