const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createUser, getUserByEmail, getUserById } = require('../store');
const { sanitizeUser, authMiddleware } = require('../utils');

const router = express.Router();

router.post('/register', async (req, res) => {
  const { name, email, password } = req.body || {};
  const normalizedEmail = String(email || '').trim().toLowerCase();

  if (!name || !normalizedEmail || !password) {
    return res.status(400).json({ message: 'Name, email, and password are required.' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return res.status(400).json({ message: 'Please provide a valid college email address.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters long.' });
  }

  if (getUserByEmail(normalizedEmail)) {
    return res.status(409).json({ message: 'An account with that email already exists.' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = createUser({ name, email: normalizedEmail, passwordHash });
  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'campusbidding-secret', { expiresIn: '7d' });

  return res.status(201).json({ token, user: sanitizeUser(user) });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  const normalizedEmail = String(email || '').trim().toLowerCase();

  if (!normalizedEmail || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  const user = getUserByEmail(normalizedEmail);
  if (!user) {
    return res.status(401).json({ message: 'Invalid email or password.' });
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    return res.status(401).json({ message: 'Invalid email or password.' });
  }

  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'campusbidding-secret', { expiresIn: '7d' });
  return res.json({ token, user: sanitizeUser(user) });
});

router.get('/me', authMiddleware, (req, res) => {
  const user = getUserById(req.user.id);
  return res.json({ user: sanitizeUser(user) });
});

module.exports = router;
