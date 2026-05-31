import { describe, it, expect, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { Conversation, Folder } from '../db.js';

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
    email: 'convuser@test.com',
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
  const mod = await import('../conversations.js');
  return mod[name];
}

describe('Conversation CRUD', () => {
  beforeEach(async () => {
    await createUser();
  });

  describe('createConversation', () => {
    it('creates a conversation with default title', async () => {
      const handler = await importHandler('createConversation');
      const req = {
        body: {},
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.title).toBe('New Conversation');
      expect(res.body.userId.toString()).toBe(testUser._id.toString());
    });

    it('creates a conversation with custom title', async () => {
      const handler = await importHandler('createConversation');
      const req = {
        body: { title: 'My Chat' },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.title).toBe('My Chat');
    });

    it('inherits systemPrompt from folder', async () => {
      const folder = await Folder.create({
        name: 'Tech',
        userId: testUser._id,
        systemPrompt: 'You are a tech expert.',
      });
      const handler = await importHandler('createConversation');
      const req = {
        body: { folderId: folder._id.toString() },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.systemPrompt).toBe('You are a tech expert.');
      expect(res.body.folderId._id.toString()).toBe(folder._id.toString());
    });

    it('initializes messages with system message', async () => {
      const handler = await importHandler('createConversation');
      const req = {
        body: {},
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.body.messages).toBeDefined();
      expect(res.body.messages.length).toBeGreaterThan(0);
      expect(res.body.messages[0].role).toBe('system');
    });
  });

  describe('getConversations', () => {
    it('returns user conversations sorted by date descending', async () => {
      await Conversation.create([
        { title: 'First', userId: testUser._id, createdAt: new Date('2024-01-01') },
        { title: 'Second', userId: testUser._id, createdAt: new Date('2024-06-01') },
      ]);
      const handler = await importHandler('getConversations');
      const req = { user: { id: testUser._id.toString() } };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].title).toBe('Second');
      expect(res.body[1].title).toBe('First');
    });

    it('does not return another user\'s conversations', async () => {
      const User = getUserModel();
      const user2 = await User.create({
        email: 'otherconv@test.com',
        password: await bcrypt.hash('pass', 10),
      });
      await Conversation.create({ title: 'Secret', userId: user2._id });
      const handler = await importHandler('getConversations');
      const req = { user: { id: testUser._id.toString() } };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveLength(0);
    });
  });

  describe('getConversation', () => {
    it('returns a single conversation by id', async () => {
      const conv = await Conversation.create({
        title: 'FindMe',
        userId: testUser._id,
        messages: [{ role: 'user', content: 'hello' }],
      });
      const handler = await importHandler('getConversation');
      const req = {
        params: { id: conv._id.toString() },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.title).toBe('FindMe');
      expect(res.body.messages).toHaveLength(1);
    });

    it('returns 404 for non-existent conversation', async () => {
      const handler = await importHandler('getConversation');
      const req = {
        params: { id: '000000000000000000000000' },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(404);
    });

    it('returns 404 for another user\'s conversation', async () => {
      const User = getUserModel();
      const user2 = await User.create({
        email: 'ownerconv@test.com',
        password: await bcrypt.hash('pass', 10),
      });
      const conv = await Conversation.create({ title: 'Owned', userId: user2._id });
      const handler = await importHandler('getConversation');
      const req = {
        params: { id: conv._id.toString() },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(404);
    });
  });

  describe('updateConversation', () => {
    it('updates conversation title', async () => {
      const conv = await Conversation.create({ title: 'Old', userId: testUser._id });
      const handler = await importHandler('updateConversation');
      const req = {
        params: { id: conv._id.toString() },
        body: { title: 'New Title' },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.title).toBe('New Title');
    });

    it('updates conversation folderId', async () => {
      const folder = await Folder.create({ name: 'NewFolder', userId: testUser._id });
      const conv = await Conversation.create({ title: 'Move', userId: testUser._id });
      const handler = await importHandler('updateConversation');
      const req = {
        params: { id: conv._id.toString() },
        body: { folderId: folder._id.toString() },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.folderId._id.toString()).toBe(folder._id.toString());
    });

    it('returns 400 when no update data provided', async () => {
      const conv = await Conversation.create({ title: 'Test', userId: testUser._id });
      const handler = await importHandler('updateConversation');
      const req = {
        params: { id: conv._id.toString() },
        body: {},
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(400);
    });

    it('returns 404 for another user\'s conversation', async () => {
      const User = getUserModel();
      const user2 = await User.create({
        email: 'ownerconv2@test.com',
        password: await bcrypt.hash('pass', 10),
      });
      const conv = await Conversation.create({ title: 'Owned', userId: user2._id });
      const handler = await importHandler('updateConversation');
      const req = {
        params: { id: conv._id.toString() },
        body: { title: 'Hacked' },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(404);
    });
  });

  describe('deleteConversation', () => {
    it('deletes the conversation', async () => {
      const conv = await Conversation.create({ title: 'DeleteMe', userId: testUser._id });
      const handler = await importHandler('deleteConversation');
      const req = {
        params: { id: conv._id.toString() },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(200);
      expect(await Conversation.findById(conv._id)).toBeNull();
    });

    it('returns 404 for non-existent conversation', async () => {
      const handler = await importHandler('deleteConversation');
      const req = {
        params: { id: '000000000000000000000000' },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(404);
    });

    it('returns 404 for another user\'s conversation', async () => {
      const User = getUserModel();
      const user2 = await User.create({
        email: 'ownerdel@test.com',
        password: await bcrypt.hash('pass', 10),
      });
      const conv = await Conversation.create({ title: 'Owned', userId: user2._id });
      const handler = await importHandler('deleteConversation');
      const req = {
        params: { id: conv._id.toString() },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(404);
    });
  });
});
