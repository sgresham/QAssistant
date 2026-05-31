import mongoose from 'mongoose';

// Ensures mongoose is connected to the in-memory MongoDB started by setup.js.
// Must be called before importing db.js or auth.js.
export async function ensureConnected() {
  if (mongoose.connection.readyState === 1) {
    return;
  }
  // The in-memory server URI is stored in global by the test runner
  // We reconnect if needed (e.g., after disconnect)
}

// Get the User model from mongoose's model cache
// auth.js defines the User model but doesn't export it
export function getUserModel() {
  return mongoose.model('User');
}

// Generate a JWT for test auth
import jwt from 'jsonwebtoken';
export function createTestToken(userId) {
  const secret = process.env.JWT_SECRET || 'default_secret_key_change_in_production';
  return jwt.sign({ id: userId, email: 'test@test.com' }, secret, { expiresIn: '24h' });
}
