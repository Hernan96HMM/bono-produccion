const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { calTotals } = require('../lib/calendar');

const router = express.Router();
router.use(requireAuth, requireRole('admin', 'produccion'));

async function loadReglas() {
  const { rows } = await pool.query('SELECT lun_jue, vie, sab, dom, descanso FROM calendario_reglas WHERE id=1');
  if (rows[0]) return rows[0];
  const insert = await pool.query(
    `INSERT INTO calendario_reglas (id, lun_jue, vie, sab, dom, descanso) VALUES (1,9,8,0,0,1) RETURNING lun_jue, vie, sab, dom, descanso`
  );
  return insert.rows[0];
}

async function loadFeriados() {
  const { rows } = await pool.query('SELECT fecha, nombre FROM calendario_feriados');
  const out = {};
  rows.forEach(r => { out[r.fecha.toISOString().slice(0, 10)] = r.nombre; });
  return out;
}

async function loadDias() {
  const { rows } = await pool.query('SELECT fecha, horas_brutas, descuento, nombre FROM calendario_dias_especiales');
  const out = {};
  rows.forEach(r => { out[r.fecha.toISOString().slice(0, 10)] = { horas_brutas: r.horas_brutas, descuento: r.descuento, nombre: r.nombre }; });
  return out;
}

router.get('/:mes', async (req, res) => {
  const reglas = await loadReglas();
  const feriados = await loadFeriados();
  const dias = await loadDias();
  const totals = calTotals(req.params.mes, {
    lun_jue: Number(reglas.lun_jue), vie: Number(reglas.vie), sab: Number(reglas.sab),
    dom: Number(reglas.dom), descanso: Number(reglas.descanso),
  }, feriados, dias);
  res.json({ reglas, feriados, dias, totals });
});

router.put('/reglas', async (req, res) => {
  const { lun_jue, vie, sab, dom, descanso } = req.body || {};
  await pool.query(
    `INSERT INTO calendario_reglas (id, lun_jue, vie, sab, dom, descanso) VALUES (1,$1,$2,$3,$4,$5)
     ON CONFLICT (id) DO UPDATE SET lun_jue=$1, vie=$2, sab=$3, dom=$4, descanso=$5`,
    [lun_jue || 0, vie || 0, sab || 0, dom || 0, descanso || 0]
  );
  res.json(await loadReglas());
});

router.put('/feriados', async (req, res) => {
  const { fecha, nombre } = req.body || {};
  if (!fecha) return res.status(400).json({ error: 'fecha es obligatoria' });
  if (nombre === null || nombre === undefined || nombre === '') {
    await pool.query('DELETE FROM calendario_feriados WHERE fecha=$1', [fecha]);
  } else {
    await pool.query(
      `INSERT INTO calendario_feriados (fecha, nombre) VALUES ($1,$2)
       ON CONFLICT (fecha) DO UPDATE SET nombre=$2`,
      [fecha, nombre]
    );
  }
  res.json(await loadFeriados());
});

router.put('/dia/:fecha', async (req, res) => {
  const { fecha } = req.params;
  const { clear, horas_brutas, descuento, nombre } = req.body || {};
  if (clear) {
    await pool.query('DELETE FROM calendario_dias_especiales WHERE fecha=$1', [fecha]);
  } else {
    await pool.query(
      `INSERT INTO calendario_dias_especiales (fecha, horas_brutas, descuento, nombre) VALUES ($1,$2,$3,$4)
       ON CONFLICT (fecha) DO UPDATE SET horas_brutas=$2, descuento=$3, nombre=$4`,
      [fecha, horas_brutas || 0, descuento || 0, nombre || '']
    );
  }
  res.json(await loadDias());
});

module.exports = router;
