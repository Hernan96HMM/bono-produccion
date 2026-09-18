const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const COOKIE_OPTS = { httpOnly: true, sameSite: 'lax', maxAge: 12 * 60 * 60 * 1000 };

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Usuario y contrasena requeridos' });
  const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'Usuario o contrasena incorrectos' });
  }
  const payload = { id: user.id, username: user.username, name: user.name, role: user.role, evaluador_nombre: user.evaluador_nombre };
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '12h' });
  res.cookie('token', token, COOKIE_OPTS);
  res.json({ user: payload });
});

router.post('/logout', (req, res) => {
  res.clearCookie('token', { httpOnly: true, sameSite: 'lax' });
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
