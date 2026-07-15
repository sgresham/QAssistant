import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

// User model is not exported from auth.js; retrieve from Mongoose's model cache
function getUserModel() {
  return mongoose.model('User');
}

let testUser;
const JWT_SECRET = 'test_jwt_secret';

beforeEach(() => {
  process.env.JWT_SECRET = JWT_SECRET;
});

describe('User model', () => {
  it('creates a user with email and hashed password', async () => {
    const User = getUserModel();
    const user = await User.create({
      email: 'test@example.com',
      password: await bcrypt.hash('password123', 10),
    });
    expect(user.email).toBe('test@example.com');
    expect(user.password).not.toBe('password123');
  });

  it('lowercases and trims email on creation', async () => {
    const User = getUserModel();
    const user = await User.create({
      email: '  Test@Example.COM  ',
      password: 'hashed',
    });
    expect(user.email).toBe('test@example.com');
  });

  it('enforces unique email constraint', async () => {
    const User = getUserModel();
    await User.create({ email: 'unique@test.com', password: 'hash1' });
    await expect(
      User.create({ email: 'unique@test.com', password: 'hash2' })
    ).rejects.toThrow();
  });
});

describe('JWT utilities', () => {
  beforeEach(async () => {
    const User = getUserModel();
    testUser = await User.create({
      email: 'jwt@test.com',
      password: await bcrypt.hash('pass', 10),
    });
  });

  it('generates a valid JWT token', () => {
    const secret = process.env.JWT_SECRET || 'default_secret_key_change_in_production';
    const token = jwt.sign(
      { id: testUser._id, email: testUser.email },
      secret,
      { expiresIn: '24h' }
    );
    const decoded = jwt.verify(token, secret);
    expect(decoded.id).toBe(testUser._id.toString());
    expect(decoded.email).toBe('jwt@test.com');
  });

  it('token expires after 24h', () => {
    const secret = process.env.JWT_SECRET || 'default_secret_key_change_in_production';
    const token = jwt.sign({ id: '123', email: 'exp@test.com' }, secret, { expiresIn: '24h' });
    const decoded = jwt.verify(token, secret);
    expect(decoded.exp).toBeDefined();
    expect(decoded.exp).toBeLessThanOrEqual(Date.now() / 1000 + 86400);
  });
});

describe('authenticateToken middleware', () => {
  let authenticateToken;
  beforeEach(async () => {
    const authModule = await import('../auth.js');
    authenticateToken = authModule.authenticateToken;
    const User = getUserModel();
    testUser = await User.findOne({ email: 'jwt@test.com' });
    if (!testUser) {
      testUser = await User.create({
        email: 'jwt@test.com',
        password: await bcrypt.hash('pass', 10),
      });
    }
    const secret = process.env.JWT_SECRET || 'default_secret_key_change_in_production';
    testUser._token = jwt.sign({ id: testUser._id, email: testUser.email }, secret, { expiresIn: '24h' });
  });

  it('attaches user to req when token is valid', async () => {
    const req = { headers: { authorization: `Bearer ${testUser._token}` } };
    const res = { status: () => ({ json: () => {} }) };
    const next = vi.fn();

    await authenticateToken(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(req.user.id).toBe(testUser._id.toString());
  });

  it('returns 401 when no token provided', async () => {
    const req = { headers: {} };
    let capturedCode, capturedBody;
    const res = {
      status: function(code) {
        capturedCode = code;
        return {
          json: function(body) { capturedBody = body; }
        };
      }
    };
    const next = vi.fn();
    await authenticateToken(req, res, next);
    expect(capturedCode).toBe(401);
    expect(capturedBody.error).toBe('Access token required');
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when token is invalid', async () => {
    const req = { headers: { authorization: 'Bearer invalidtoken' } };
    let capturedCode, capturedBody;
    const res = {
      status: function(code) {
        capturedCode = code;
        return {
          json: function(body) { capturedBody = body; }
        };
      }
    };
    const next = vi.fn();
    await authenticateToken(req, res, next);
    expect(capturedCode).toBe(401);
    expect(capturedBody.error).toBe('Invalid or expired token');
    expect(next).not.toHaveBeenCalled();
  });
});

describe('register', () => {
  let register;
  beforeEach(async () => {
    const authModule = await import('../auth.js');
    register = authModule.register;
  });

  it('returns 400 when email or password missing', async () => {
    const req = { body: {} };
    let capturedCode;
    const res = {
      status: function(code) {
        capturedCode = code;
        return this;
      },
      json: vi.fn()
    };
    await register(req, res);
    expect(capturedCode).toBe(400);
  });

  it('returns 409 when user already exists', async () => {
    const User = getUserModel();
    await User.create({ email: 'dup@test.com', password: 'hash' });
    const req = { body: { email: 'dup@test.com', password: 'pass' } };
    let capturedCode;
    const res = {
      status: function(code) {
        capturedCode = code;
        return this;
      },
      json: vi.fn()
    };
    await register(req, res);
    expect(capturedCode).toBe(409);
  });

  it('returns 201 with token on successful registration', async () => {
    const req = { body: { email: 'newreg@test.com', password: 'strongpass' } };
    let capturedCode;
    const jsonCalls = [];
    const res = {
      status: function(code) {
        capturedCode = code;
        return this;
      },
      json: function(data) { jsonCalls.push(data); }
    };
    await register(req, res);
    expect(capturedCode).toBe(201);
    expect(jsonCalls[0].token).toBeDefined();
    expect(jsonCalls[0].user.email).toBe('newreg@test.com');
  });
});

describe('login', () => {
  let login;
  beforeEach(async () => {
    const authModule = await import('../auth.js');
    login = authModule.login;
  });

  it('returns 400 when credentials missing', async () => {
    const req = { body: {} };
    let capturedCode;
    const res = {
      status: function(code) {
        capturedCode = code;
        return this;
      },
      json: vi.fn()
    };
    await login(req, res);
    expect(capturedCode).toBe(400);
  });

  it('returns 401 for non-existent user', async () => {
    const req = { body: { email: 'noone@test.com', password: 'pass' } };
    let capturedCode;
    const res = {
      status: function(code) {
        capturedCode = code;
        return this;
      },
      json: vi.fn()
    };
    await login(req, res);
    expect(capturedCode).toBe(401);
  });

  it('returns 401 for wrong password', async () => {
    const User = getUserModel();
    await User.create({
      email: 'login@test.com',
      password: await bcrypt.hash('correct', 10),
    });
    const req = { body: { email: 'login@test.com', password: 'wrong' } };
    let capturedCode;
    const res = {
      status: function(code) {
        capturedCode = code;
        return this;
      },
      json: vi.fn()
    };
    await login(req, res);
    expect(capturedCode).toBe(401);
  });

  it('returns 200 with token on successful login', async () => {
    const User = getUserModel();
    const plainPass = 'correctpass123';
    await User.create({
      email: 'goodlogin@test.com',
      password: await bcrypt.hash(plainPass, 10),
    });
    const req = { body: { email: 'goodlogin@test.com', password: plainPass } };
    const jsonCalls = [];
    const res = {
      status: vi.fn().mockReturnThis(),
      json: function(data) { jsonCalls.push(data); }
    };
    await login(req, res);
    expect(jsonCalls[0].token).toBeDefined();
    expect(jsonCalls[0].user.email).toBe('goodlogin@test.com');
  });
});

describe('googleLogin', () => {
  let googleLogin;

  beforeEach(async () => {
    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
    const authModule = await import('../auth.js');
    googleLogin = authModule.googleLogin;
  });

  it('returns 400 when authorization code is missing', async () => {
    const req = { body: {} };
    const jsonFn = vi.fn();
    const res = {
      status: vi.fn(() => ({ json: jsonFn })),
      json: vi.fn(),
    };
    await googleLogin(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('creates a new user on first google login', async () => {
    const req = { body: { code: 'valid-code' } };
    const jsonFn = vi.fn();
    const res = {
      json: jsonFn,
      status: vi.fn(() => ({ json: jsonFn })),
    };
    await googleLogin(req, res);
    expect(jsonFn).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Google login successful',
        token: expect.any(String),
        user: expect.objectContaining({ email: 'google@test.com' }),
      })
    );

    const User = getUserModel();
    const user = await User.findOne({ email: 'google@test.com' });
    expect(user).toBeDefined();
    expect(user.googleId).toBe('google123');
  });

  it('links googleId to existing email-only user', async () => {
    const User = getUserModel();
    const existing = await User.create({
      email: 'google@test.com',
      password: await bcrypt.hash('oldpass', 10),
    });

    const req = { body: { code: 'valid-code' } };
    const jsonFn = vi.fn();
    const res = {
      json: jsonFn,
      status: vi.fn(() => ({ json: jsonFn })),
    };
    await googleLogin(req, res);
    expect(jsonFn).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Google login successful',
        token: expect.any(String),
      })
    );

    const updated = await User.findById(existing._id);
    expect(updated.googleId).toBe('google123');
  });

  it('returns 500 when Google API call fails', async () => {
    const { OAuth2Client } = await import('google-auth-library');
    const instance = OAuth2Client.mock.results[0]?.value;
    if (instance?.getToken) {
      instance.getToken.mockRejectedValue(new Error('Invalid code'));
    }

    const req = { body: { code: 'bad-code' } };
    const jsonFn = vi.fn();
    const res = {
      status: vi.fn(() => ({ json: jsonFn })),
      json: vi.fn(),
    };
    await googleLogin(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('initializeDefaultAdmin', () => {
  it('creates admin user when none exists', async () => {
    const authModule = await import('../auth.js');
    await authModule.initializeDefaultAdmin();
    const User = getUserModel();
    const admin = await User.findOne({ email: 'admin' });
    expect(admin).toBeDefined();
    expect(await bcrypt.compare('admin', admin.password)).toBe(true);
  });

  it('does not create duplicate admin', async () => {
    const User = getUserModel();
    await User.create({ email: 'admin', password: await bcrypt.hash('admin', 10) });
    const authModule = await import('../auth.js');
    await authModule.initializeDefaultAdmin();
    const admins = await User.find({ email: 'admin' });
    expect(admins).toHaveLength(1);
  });
});
