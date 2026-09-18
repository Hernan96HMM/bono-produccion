const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

const SAFE_COLUMNS = 'id, username, name, role, evaluador_nombre, created_at';

router.get('/', async (req, res) => {
  const { rows } = await pool.query(`SELECT ${SAFE_COLUMNS} FROM users ORDER BY username`);
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { username, password, name, role, evaluador_nombre } = req.body || {};
  if (!username || !password || !name || !role) return res.status(400).json({ error: 'username, password, name y role son obligatorios' });
  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (username, password_hash, name, role, evaluador_nombre)
       VALUES ($1,$2,$3,$4,$5) RETURNING ${SAFE_COLUMNS}`,
      [username, hash, name, role, role === 'supervisor' ? (evaluador_nombre || '') : '']
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ese usuario ya existe' });
    throw err;
  }
});

router.put('/:id', async (req, res) => {
  const { name, role, evaluador_nombre, password } = req.body || {};
  const evNombre = role === 'supervisor' ? (evaluador_nombre || '') : '';
  if (password) {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `UPDATE users SET name=$1, role=$2, evaluador_nombre=$3, password_hash=$4 WHERE id=$5 RETURNING ${SAFE_COLUMNS}`,
      [name, role, evNombre, hash, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'No encontrado' });
    return res.json(rows[0]);
  }
  const { rows } = await pool.query(
    `UPDATE users SET name=$1, role=$2, evaluador_nombre=$3 WHERE id=$4 RETURNING ${SAFE_COLUMNS}`,
    [name, role, evNombre, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'No encontrado' });
  res.json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  const { rows } = await pool.query('SELECT username FROM users WHERE id=$1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'No encontrado' });
  if (rows[0].username === 'admin') return res.status(400).json({ error: 'No se puede eliminar el usuario admin' });
  await pool.query('DELETE FROM users WHERE id=$1', [req.params.id]);
  res.status(204).end();
});

module.exports = router;
