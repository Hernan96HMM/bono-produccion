const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT numero, label, porcentaje FROM niveles ORDER BY numero');
  res.json(rows);
});

router.put('/', requireAuth, requireRole('admin'), async (req, res) => {
  const list = Array.isArray(req.body) ? req.body : [];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM niveles');
    for (const n of list) {
      await client.query('INSERT INTO niveles (numero, label, porcentaje) VALUES ($1,$2,$3)', [n.numero, n.label, n.porcentaje]);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  const { rows } = await pool.query('SELECT numero, label, porcentaje FROM niveles ORDER BY numero');
  res.json(rows);
});

module.exports = router;
