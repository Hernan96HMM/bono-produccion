const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { computeResultados } = require('./resultados');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT mes, datos, cerrado_at FROM historial ORDER BY mes');
  const out = rows.map(r => {
    const base = { mes: r.mes, n: r.datos.n, avg: r.datos.avg, cerrado_at: r.cerrado_at };
    if (req.user.role === 'admin') base.money = r.datos.money;
    return base;
  });
  res.json(out);
});

router.post('/cerrar', requireAuth, requireRole('admin'), async (req, res) => {
  const { rows: cfgRows } = await pool.query('SELECT mes FROM config WHERE id=1');
  if (!cfgRows[0]) return res.status(400).json({ error: 'No hay un mes configurado' });
  const mes = cfgRows[0].mes;
  const rows = await computeResultados(mes, { role: 'admin' });
  const snapshot = rows.map(r => ({ legajo: r.legajo, nombre: r.nombre, sector: r.sector, res: r.res, inc: r.inc }));
  const evaluados = snapshot.filter(x => x.res > 0);
  const n = evaluados.length;
  const avg = n ? evaluados.reduce((a, b) => a + b.res, 0) / n : 0;
  const money = evaluados.reduce((a, b) => a + b.inc, 0);
  const datos = { n, avg, money, snapshot };
  const { rows: inserted } = await pool.query(
    `INSERT INTO historial (mes, datos) VALUES ($1,$2)
     ON CONFLICT (mes) DO UPDATE SET datos=$2, cerrado_at=now()
     RETURNING mes, datos, cerrado_at`,
    [mes, JSON.stringify(datos)]
  );
  res.status(201).json({ mes: inserted[0].mes, n, avg, money, cerrado_at: inserted[0].cerrado_at });
});

router.delete('/:mes', requireAuth, requireRole('admin'), async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM historial WHERE mes=$1', [req.params.mes]);
  if (!rowCount) return res.status(404).json({ error: 'No encontrado' });
  res.status(204).end();
});

module.exports = router;
