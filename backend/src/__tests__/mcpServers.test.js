import { describe, it, expect, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { McpServer } from '../db.js';

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
    email: 'mcpuser@test.com',
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
  const mod = await import('../mcpServers.js');
  return mod[name];
}

describe('MCP Server CRUD', () => {
  beforeEach(async () => {
    await createUser();
  });

  describe('createMcpServer', () => {
    it('creates an MCP server with name and URL', async () => {
      const handler = await importHandler('createMcpServer');
      const req = {
        body: { name: 'My MCP', url: 'http://localhost:8080/mcp' },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(201);
      expect(res.body.name).toBe('My MCP');
      expect(res.body.url).toBe('http://localhost:8080/mcp');
      expect(res.body.headers).toEqual({});
    });

    it('creates an MCP server with custom headers', async () => {
      const handler = await importHandler('createMcpServer');
      const req = {
        body: {
          name: 'Auth MCP',
          url: 'http://localhost:8080/mcp',
          headers: { Authorization: 'Bearer secret' },
        },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(201);
      expect(res.body.headers).toEqual({ Authorization: 'Bearer secret' });
    });

    it('returns 400 when name is missing', async () => {
      const handler = await importHandler('createMcpServer');
      const req = {
        body: { url: 'http://localhost:8080/mcp' },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when URL is missing', async () => {
      const handler = await importHandler('createMcpServer');
      const req = {
        body: { name: 'No URL' },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(400);
    });
  });

  describe('getMcpServers', () => {
    it('returns user MCP servers sorted by date descending', async () => {
      await McpServer.create([
        { name: 'First', url: 'http://a.com', userId: testUser._id, createdAt: new Date('2024-01-01') },
        { name: 'Second', url: 'http://b.com', userId: testUser._id, createdAt: new Date('2024-06-01') },
      ]);
      const handler = await importHandler('getMcpServers');
      const req = { user: { id: testUser._id.toString() } };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].name).toBe('Second');
      expect(res.body[1].name).toBe('First');
    });

    it('does not return another user\'s MCP servers', async () => {
      const User = getUserModel();
      const user2 = await User.create({
        email: 'othermcp@test.com',
        password: await bcrypt.hash('pass', 10),
      });
      await McpServer.create({ name: 'Secret', url: 'http://x.com', userId: user2._id });
      const handler = await importHandler('getMcpServers');
      const req = { user: { id: testUser._id.toString() } };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveLength(0);
    });
  });

  describe('getMcpServer', () => {
    it('returns a single MCP server by id', async () => {
      const server = await McpServer.create({
        name: 'FindMe',
        url: 'http://find.com',
        userId: testUser._id,
      });
      const handler = await importHandler('getMcpServer');
      const req = {
        params: { id: server._id.toString() },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.name).toBe('FindMe');
    });

    it('returns 404 for non-existent server', async () => {
      const handler = await importHandler('getMcpServer');
      const req = {
        params: { id: '000000000000000000000000' },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(404);
    });

    it('returns 404 for another user\'s server', async () => {
      const User = getUserModel();
      const user2 = await User.create({
        email: 'ownermcp@test.com',
        password: await bcrypt.hash('pass', 10),
      });
      const server = await McpServer.create({ name: 'Owned', url: 'http://o.com', userId: user2._id });
      const handler = await importHandler('getMcpServer');
      const req = {
        params: { id: server._id.toString() },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(404);
    });
  });

  describe('updateMcpServer', () => {
    it('updates server name and URL', async () => {
      const server = await McpServer.create({ name: 'Old', url: 'http://old.com', userId: testUser._id });
      const handler = await importHandler('updateMcpServer');
      const req = {
        params: { id: server._id.toString() },
        body: { name: 'New', url: 'http://new.com' },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.name).toBe('New');
      expect(res.body.url).toBe('http://new.com');
    });

    it('updates headers', async () => {
      const server = await McpServer.create({ name: 'Test', url: 'http://t.com', userId: testUser._id });
      const handler = await importHandler('updateMcpServer');
      const req = {
        params: { id: server._id.toString() },
        body: { headers: { 'X-Custom': 'value' } },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.headers).toEqual({ 'X-Custom': 'value' });
    });

    it('returns 404 for non-existent server', async () => {
      const handler = await importHandler('updateMcpServer');
      const req = {
        params: { id: '000000000000000000000000' },
        body: { name: 'New' },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(404);
    });

    it('returns 404 for another user\'s server', async () => {
      const User = getUserModel();
      const user2 = await User.create({
        email: 'ownermcp2@test.com',
        password: await bcrypt.hash('pass', 10),
      });
      const server = await McpServer.create({ name: 'Owned', url: 'http://o.com', userId: user2._id });
      const handler = await importHandler('updateMcpServer');
      const req = {
        params: { id: server._id.toString() },
        body: { name: 'Hacked' },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(404);
    });
  });

  describe('deleteMcpServer', () => {
    it('deletes the MCP server', async () => {
      const server = await McpServer.create({ name: 'DeleteMe', url: 'http://d.com', userId: testUser._id });
      const handler = await importHandler('deleteMcpServer');
      const req = {
        params: { id: server._id.toString() },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(200);
      expect(await McpServer.findById(server._id)).toBeNull();
    });

    it('returns 404 for non-existent server', async () => {
      const handler = await importHandler('deleteMcpServer');
      const req = {
        params: { id: '000000000000000000000000' },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(404);
    });

    it('returns 404 for another user\'s server', async () => {
      const User = getUserModel();
      const user2 = await User.create({
        email: 'ownerdelmcp@test.com',
        password: await bcrypt.hash('pass', 10),
      });
      const server = await McpServer.create({ name: 'Owned', url: 'http://o.com', userId: user2._id });
      const handler = await importHandler('deleteMcpServer');
      const req = {
        params: { id: server._id.toString() },
        user: { id: testUser._id.toString() },
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(404);
    });
  });
});
