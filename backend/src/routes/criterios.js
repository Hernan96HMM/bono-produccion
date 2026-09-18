const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

async function loadGrupo(grupo) {
  const { rows: crits } = await pool.query('SELECT * FROM criterios WHERE grupo=$1 ORDER BY orden', [grupo]);
  const out = [];
  for (const c of crits) {
    const { rows: rub } = await pool.query('SELECT nivel, texto FROM criterio_rubricas WHERE criterio_id_ref=$1', [c.id]);
    const rubricas = {};
    rub.forEach(r => { rubricas[r.nivel] = r.texto; });
    out.push({ id: c.criterio_id, label: c.label, descripcion: c.descripcion, orden: c.orden, rubricas });
  }
  return out;
}

router.get('/', requireAuth, async (req, res) => {
  res.json({ pred: await loadGrupo('pred'), sh: await loadGrupo('sh') });
});

router.put('/', requireAuth, requireRole('admin'), async (req, res) => {
  const { pred = [], sh = [] } = req.body || {};
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM criterios');
    for (const grupo of ['pred', 'sh']) {
      const list = grupo === 'pred' ? pred : sh;
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        const { rows } = await client.query(
          `INSERT INTO criterios (grupo, criterio_id, label, descripcion, orden) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
          [grupo, c.id, c.label, c.descripcion || '', i]
        );
        const critId = rows[0].id;
        for (const [nivel, texto] of Object.entries(c.rubricas || {})) {
          await client.query(
            `INSERT INTO criterio_rubricas (criterio_id_ref, nivel, texto) VALUES ($1,$2,$3)`,
            [critId, Number(nivel), texto]
          );
        }
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  res.json({ pred: await loadGrupo('pred'), sh: await loadGrupo('sh') });
});

module.exports = router;
