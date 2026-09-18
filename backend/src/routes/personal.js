const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

router.get('/', async (req, res) => {
  const { sector, evaluador, estado, spm, q } = req.query;
  const clauses = [];
  const params = [];
  if (sector) { params.push(sector); clauses.push(`sector = $${params.length}`); }
  if (evaluador) { params.push(evaluador); clauses.push(`evaluador = $${params.length}`); }
  if (estado) { params.push(estado); clauses.push(`estado = $${params.length}`); }
  if (spm === '0' || spm === '1') { params.push(spm === '1'); clauses.push(`spm = $${params.length}`); }
  if (q) { params.push(`%${q.toLowerCase()}%`); clauses.push(`(LOWER(nombre) LIKE $${params.length} OR legajo LIKE $${params.length})`); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { rows } = await pool.query(`SELECT * FROM personal ${where} ORDER BY nombre`, params);
  res.json(rows);
});

router.post('/', async (req, res) => {
  const p = req.body || {};
  if (!p.legajo || !p.nombre) return res.status(400).json({ error: 'Legajo y nombre son obligatorios' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO personal (legajo, nombre, sector, puesto, evaluador, tipo, spm, estado, acceso, sueldo_base)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [p.legajo, p.nombre, p.sector || '', p.puesto || '', p.evaluador || '—', p.tipo || 'Jornalizado',
        !!p.spm, p.estado || 'Activo', p.acceso || '—', p.sueldo_base || 0]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ese legajo ya existe' });
    throw err;
  }
});

router.put('/:legajo', async (req, res) => {
  const p = req.body || {};
  if (!p.nombre) return res.status(400).json({ error: 'Nombre es obligatorio' });
  const { rows } = await pool.query(
    `UPDATE personal SET nombre=$1, sector=$2, puesto=$3, evaluador=$4, tipo=$5, spm=$6, estado=$7, acceso=$8, sueldo_base=$9
     WHERE legajo=$10 RETURNING *`,
    [p.nombre, p.sector || '', p.puesto || '', p.evaluador || '—', p.tipo || 'Jornalizado',
      !!p.spm, p.estado || 'Activo', p.acceso || '—', p.sueldo_base || 0, req.params.legajo]
  );
  if (!rows[0]) return res.status(404).json({ error: 'No encontrado' });
  res.json(rows[0]);
});

router.delete('/:legajo', async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM personal WHERE legajo=$1', [req.params.legajo]);
  if (!rowCount) return res.status(404).json({ error: 'No encontrado' });
  res.status(204).end();
});

module.exports = router;
