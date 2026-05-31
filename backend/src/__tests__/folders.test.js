import { describe, it, expect, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { Folder, Conversation } from '../db.js';

function getUserModel() {
  return mongoose.model('User');
}

let testUser;
let testToken;
const JWT_SECRET = 'test_jwt_secret';

beforeEach(() => {
  process.env.JWT_SECRET = JWT_SECRET;
});

async function createUser() {
  const User = getUserModel();
  testUser = await User.create({
    email: 'folderuser@test.com',
    password: await bcrypt.hash('pass123', 10),
  });
  const secret = process.env.JWT_SECRET || 'default_secret_key_change_in_production';
  testToken = jwt.sign({ id: testUser._id, email: testUser.email }, secret, { expiresIn: '24h' });
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
  const mod = await import('../folders.js');
  return mod[name];
}

describe('Folder CRUD', () => {
  beforeEach(async () => {
    await createUser();
  });

  describe('createFolder', () => {
    it('creates a folder with name and userId', async () => {
      const handler = await importHandler('createFolder');
      const req = {
        body: { name: 'Work', systemPrompt: 'Be professional' },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.name).toBe('Work');
      expect(res.body.systemPrompt).toBe('Be professional');
    });

    it('returns 400 when name is missing', async () => {
      const handler = await importHandler('createFolder');
      const req = {
        body: {},
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(400);
    });

    it('returns 409 for duplicate folder name per user', async () => {
      const handler = await importHandler('createFolder');
      const req = {
        body: { name: 'Duplicate' },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(200);

      await handler(req, res);
      expect(res.statusCode).toBe(409);
    });

    it('allows same folder name for different users', async () => {
      const User = getUserModel();
      const user2 = await User.create({
        email: 'folderuser2@test.com',
        password: await bcrypt.hash('pass', 10),
      });
      const handler = await importHandler('createFolder');

      const res1 = mockRes();
      await handler({ body: { name: 'Same' }, user: { id: testUser._id.toString() } }, res1);
      expect(res1.statusCode).toBe(200);

      const res2 = mockRes();
      await handler({ body: { name: 'Same' }, user: { id: user2._id.toString() } }, res2);
      expect(res2.statusCode).toBe(200);
    });
  });

  describe('getFolders', () => {
    it('returns user folders sorted by name', async () => {
      await Folder.create([
        { name: 'Zebra', userId: testUser._id },
        { name: 'Alpha', userId: testUser._id },
        { name: 'Middle', userId: testUser._id },
      ]);
      const handler = await importHandler('getFolders');
      const req = { user: { id: testUser._id.toString() } };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveLength(3);
      expect(res.body[0].name).toBe('Alpha');
      expect(res.body[1].name).toBe('Middle');
      expect(res.body[2].name).toBe('Zebra');
    });

    it('does not return another user\'s folders', async () => {
      const User = getUserModel();
      const user2 = await User.create({
        email: 'other@test.com',
        password: await bcrypt.hash('pass', 10),
      });
      await Folder.create({ name: 'Secret', userId: user2._id });
      const handler = await importHandler('getFolders');
      const req = { user: { id: testUser._id.toString() } };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveLength(0);
    });
  });

  describe('updateFolder', () => {
    it('updates folder name and systemPrompt', async () => {
      const folder = await Folder.create({ name: 'Old', userId: testUser._id });
      const handler = await importHandler('updateFolder');
      const req = {
        params: { id: folder._id.toString() },
        body: { name: 'New', systemPrompt: 'Updated prompt' },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.name).toBe('New');
      expect(res.body.systemPrompt).toBe('Updated prompt');
    });

    it('returns 404 for non-existent folder', async () => {
      const handler = await importHandler('updateFolder');
      const req = {
        params: { id: '000000000000000000000000' },
        body: { name: 'New' },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(404);
    });

    it('returns 404 for another user\'s folder', async () => {
      const User = getUserModel();
      const user2 = await User.create({
        email: 'owner@test.com',
        password: await bcrypt.hash('pass', 10),
      });
      const folder = await Folder.create({ name: 'Owned', userId: user2._id });
      const handler = await importHandler('updateFolder');
      const req = {
        params: { id: folder._id.toString() },
        body: { name: 'Hacked' },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(404);
    });

    it('returns 400 when no update data provided', async () => {
      const folder = await Folder.create({ name: 'Test', userId: testUser._id });
      const handler = await importHandler('updateFolder');
      const req = {
        params: { id: folder._id.toString() },
        body: {},
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(400);
    });
  });

  describe('deleteFolder', () => {
    it('deletes the folder', async () => {
      const folder = await Folder.create({ name: 'DeleteMe', userId: testUser._id });
      const handler = await importHandler('deleteFolder');
      const req = {
        params: { id: folder._id.toString() },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(200);
      expect(await Folder.findById(folder._id)).toBeNull();
    });

    it('cascades conversations to ungrouped', async () => {
      const folder = await Folder.create({ name: 'WithConvs', userId: testUser._id });
      await Conversation.create([
        { title: 'C1', userId: testUser._id, folderId: folder._id },
        { title: 'C2', userId: testUser._id, folderId: folder._id },
        { title: 'C3', userId: testUser._id, folderId: null },
      ]);
      const handler = await importHandler('deleteFolder');
      const req = {
        params: { id: folder._id.toString() },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(200);

      const c1 = await Conversation.findOne({ title: 'C1' });
      const c2 = await Conversation.findOne({ title: 'C2' });
      const c3 = await Conversation.findOne({ title: 'C3' });
      expect(c1.folderId).toBeNull();
      expect(c2.folderId).toBeNull();
      expect(c3.folderId).toBeNull();
    });

    it('returns 404 for non-existent folder', async () => {
      const handler = await importHandler('deleteFolder');
      const req = {
        params: { id: '000000000000000000000000' },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(404);
    });
  });
});
