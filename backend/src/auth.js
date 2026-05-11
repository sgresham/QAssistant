import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';

// --- User Schema ---
const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String }, // Made optional for OAuth users
  googleId: { type: String, unique: true, sparse: true }, // Allow null/undefined for non-google users
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);

// --- Helper: Hash Password ---
async function hashPassword(password) {
  return await bcrypt.hash(password, 10);
}

// --- Helper: Compare Password ---
async function comparePassword(password, hashedPassword) {
  return await bcrypt.compare(password, hashedPassword);
}

// --- Helper: Generate JWT ---
function generateToken(user) {
  const secret = process.env.JWT_SECRET || 'default_secret_key_change_in_production';
  return jwt.sign(
    { id: user._id, email: user.email },
    secret,
    { expiresIn: '24h' }
  );
}

// --- Middleware: Verify Token ---
export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  const secret = process.env.JWT_SECRET || 'default_secret_key_change_in_production';
  jwt.verify(token, secret, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

// --- Auth Endpoints ---

// 1. Register User
export async function register(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }

    const hashedPassword = await hashPassword(password);
    const newUser = new User({ email, password: hashedPassword });
    await newUser.save();

    const token = generateToken(newUser);
    res.status(201).json({ message: 'User registered successfully', token, user: { id: newUser._id, email: newUser.email } });
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).json({ error: error.message });
  }
}

// 2. Login User
export async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isMatch = await comparePassword(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = generateToken(user);
    res.json({ message: 'Login successful', token, user: { id: user._id, email: user.email } });
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).json({ error: error.message });
  }
}

// 3. Google Login
export async function googleLogin(req, res) {
  try {
    const { code } = req.body; // Received from frontend

    if (!code) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }

    const client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'postmessage' // Special redirect URI for the auth-code flow
    );

    // Exchange the code for tokens
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    // Get user info from the id_token
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, sub: googleId } = payload;

    // --- MCP Integration Point ---
    // tokens.refresh_token should be saved to your DB if you want 
    // the MCP server to work while the user is offline.
    // ------------------------------

    let user = await User.findOne({ $or: [{ email }, { googleId }] });

    if (user) {
      if (!user.googleId) {
        user.googleId = googleId;
        await user.save();
      }
    } else {
      user = new User({ email, googleId, password: null });
      await newUser.save();
    }

    const token = generateToken(user);
    res.json({ message: 'Google login successful', token, user: { id: user._id, email: user.email } });
  } catch (error) {
    console.error('Detailed Google Auth Error:', error);
    res.status(500).json({ error: 'Google authentication failed' });
  }
}

// --- Initialization: Create Default Admin ---
export async function initializeDefaultAdmin() {
  try {
    const adminExists = await User.findOne({ email: 'admin' });
    if (!adminExists) {
      const hashedPassword = await hashPassword('admin');
      await User.create({ email: 'admin', password: hashedPassword });
      console.log('✅ Default admin user created (email: admin, password: admin)');
    } else {
      console.log('ℹ️ Default admin user already exists');
    }
  } catch (error) {
    console.error('❌ Error initializing default admin:', error);
  }
}
