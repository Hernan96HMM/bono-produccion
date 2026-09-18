const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { loadGrupo } = require('../lib/critRepo');

const router = express.Router();

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
