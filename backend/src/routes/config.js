const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

function defMes() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

router.get('/', requireAuth, async (req, res) => {
  let { rows } = await pool.query('SELECT * FROM config WHERE id = 1');
  if (!rows[0]) {
    const insert = await pool.query(
      `INSERT INTO config (id, mes, horas_normales, descuento, bono_base_pct) VALUES (1,$1,0,0,15) RETURNING *`,
      [defMes()]
    );
    rows = insert.rows;
  }
  res.json(rows[0]);
});

router.put('/', requireAuth, requireRole('admin'), async (req, res) => {
  const { mes, horas_normales, descuento, bono_base_pct } = req.body || {};
  if (!mes) return res.status(400).json({ error: 'mes es requerido' });
  const { rows } = await pool.query(
    `INSERT INTO config (id, mes, horas_normales, descuento, bono_base_pct)
     VALUES (1,$1,$2,$3,$4)
     ON CONFLICT (id) DO UPDATE SET mes=$1, horas_normales=$2, descuento=$3, bono_base_pct=$4, updated_at=now()
     RETURNING *`,
    [mes, horas_normales || 0, descuento || 0, bono_base_pct || 0]
  );
  res.json(rows[0]);
});

module.exports = router;
