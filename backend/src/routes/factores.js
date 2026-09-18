const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT factor_key, icono, label, peso FROM factores ORDER BY factor_key');
  res.json(rows);
});

router.put('/', requireAuth, requireRole('admin'), async (req, res) => {
  const list = Array.isArray(req.body) ? req.body : [];
  for (const f of list) {
    await pool.query(
      `INSERT INTO factores (factor_key, icono, label, peso) VALUES ($1,$2,$3,$4)
       ON CONFLICT (factor_key) DO UPDATE SET icono=$2, label=$3, peso=$4`,
      [f.factor_key, f.icono || '', f.label, f.peso || 0]
    );
  }
  const { rows } = await pool.query('SELECT factor_key, icono, label, peso FROM factores ORDER BY factor_key');
  res.json(rows);
});

module.exports = router;
