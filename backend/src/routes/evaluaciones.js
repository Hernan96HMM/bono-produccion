const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { sameEv } = require('../lib/access');
const { calcRow } = require('../lib/calc');
const { hsBaseNetas } = require('../lib/calendarRepo');
const { loadGrupo, loadFactores, loadNiveles } = require('../lib/critRepo');

const router = express.Router();
router.use(requireAuth);

async function evaluablesForUser(user) {
  const { rows } = await pool.query(
    `SELECT legajo, nombre, sector, evaluador FROM personal WHERE spm=true AND estado='Activo' ORDER BY nombre`
  );
  if (user.role === 'supervisor') {
    return rows.filter(p => sameEv(p.evaluador, user.evaluador_nombre));
  }
  return rows;
}

async function loadEvalRows(mes, legajos) {
  const out = {};
  legajos.forEach(leg => { out[leg] = { vac: 0, real: 0, pred: {}, sh: {}, com: {} }; });
  if (!legajos.length) return out;
  const { rows: evs } = await pool.query('SELECT * FROM evaluaciones WHERE mes=$1 AND legajo = ANY($2)', [mes, legajos]);
  const idToLegajo = {};
  evs.forEach(e => {
    out[e.legajo] = { vac: Number(e.vac_horas), real: Number(e.horas_reales), pred: {}, sh: {}, com: {} };
    idToLegajo[e.id] = e.legajo;
  });
  const ids = evs.map(e => e.id);
  if (ids.length) {
    const { rows: crits } = await pool.query('SELECT * FROM evaluaciones_criterios WHERE evaluacion_id = ANY($1)', [ids]);
    crits.forEach(c => { out[idToLegajo[c.evaluacion_id]][c.grupo][c.criterio_id] = c.nivel; });
    const { rows: coms } = await pool.query('SELECT * FROM evaluaciones_comentarios WHERE evaluacion_id = ANY($1)', [ids]);
    coms.forEach(c => { out[idToLegajo[c.evaluacion_id]].com[c.grupo] = c.texto; });
  }
  return out;
}

async function loadCalcContext(mes) {
  const niveles = await loadNiveles();
  const factores = await loadFactores();
  const predCrits = await loadGrupo('pred');
  const shCrits = await loadGrupo('sh');
  const { rows: cfgRows } = await pool.query('SELECT bono_base_pct FROM config WHERE id=1');
  const base = cfgRows[0] ? Number(cfgRows[0].bono_base_pct) : 0;
  const hsBase = await hsBaseNetas(mes);
  return { niveles, factores, predIds: predCrits.map(c => c.id), shIds: shCrits.map(c => c.id), base, hsBase };
}

function computeWithContext(ctx, e) {
  return calcRow({
    hsBaseNetas: ctx.hsBase, vac: e.vac, real: e.real,
    predValores: e.pred, shValores: e.sh,
    predIds: ctx.predIds, shIds: ctx.shIds,
    niveles: ctx.niveles, base: ctx.base,
    pesoHs: ctx.factores.hs, pesoPred: ctx.factores.pred, pesoSh: ctx.factores.sh,
    sueldoBase: 0,
  });
}

router.get('/:mes', async (req, res) => {
  const people = await evaluablesForUser(req.user);
  const evalMap = await loadEvalRows(req.params.mes, people.map(p => p.legajo));
  const ctx = await loadCalcContext(req.params.mes);
  const out = {};
  people.forEach(p => {
    const e = evalMap[p.legajo];
    out[p.legajo] = { legajo: p.legajo, nombre: p.nombre, sector: p.sector, evaluador: p.evaluador, ...e, ...computeWithContext(ctx, e) };
  });
  res.json(out);
});

router.get('/:mes/estado-evaluadores', requireRole('admin'), async (req, res) => {
  const { rows: evaluadores } = await pool.query(
    `SELECT id, username, name, role FROM users WHERE role IN ('produccion','supervisor','syh') ORDER BY name`
  );
  const { rows: fin } = await pool.query('SELECT user_id, finalizado_at FROM evaluaciones_finalizadas WHERE mes=$1', [req.params.mes]);
  const finByUser = {};
  fin.forEach(f => { finByUser[f.user_id] = f.finalizado_at; });
  res.json(evaluadores.map(u => ({ id: u.id, username: u.username, name: u.name, role: u.role, finalizado_at: finByUser[u.id] || null })));
});

router.get('/:mes/mi-estado', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT finalizado_at FROM evaluaciones_finalizadas WHERE mes=$1 AND user_id=$2',
    [req.params.mes, req.user.id]
  );
  res.json({ finalizado_at: rows[0] ? rows[0].finalizado_at : null });
});

router.get('/:mes/:legajo', async (req, res) => {
  const people = await evaluablesForUser(req.user);
  const p = people.find(x => x.legajo === req.params.legajo);
  if (!p) return res.status(404).json({ error: 'No encontrado o fuera de tu alcance' });
  const evalMap = await loadEvalRows(req.params.mes, [p.legajo]);
  const ctx = await loadCalcContext(req.params.mes);
  const e = evalMap[p.legajo];
  res.json({ legajo: p.legajo, nombre: p.nombre, sector: p.sector, evaluador: p.evaluador, ...e, ...computeWithContext(ctx, e) });
});

router.put('/:mes/:legajo', async (req, res) => {
  const { mes, legajo } = req.params;
  const people = await evaluablesForUser(req.user);
  const p = people.find(x => x.legajo === legajo);
  if (!p) return res.status(404).json({ error: 'No encontrado o fuera de tu alcance' });

  const body = req.body || {};
  const role = req.user.role;
  if ((body.vac !== undefined || body.real !== undefined) && !['admin', 'produccion'].includes(role)) {
    return res.status(403).json({ error: 'No autorizado a cargar horas' });
  }
  if (body.pred && !['admin', 'supervisor'].includes(role)) {
    return res.status(403).json({ error: 'No autorizado a cargar Predisposicion' });
  }
  if (body.sh && !['admin', 'syh'].includes(role)) {
    return res.status(403).json({ error: 'No autorizado a cargar S&H' });
  }
  if (body.com) {
    if (body.com.pred !== undefined && !['admin', 'supervisor'].includes(role)) return res.status(403).json({ error: 'No autorizado' });
    if (body.com.sh !== undefined && !['admin', 'syh'].includes(role)) return res.status(403).json({ error: 'No autorizado' });
  }

  const ctx = await loadCalcContext(mes);
  for (const grupo of ['pred', 'sh']) {
    if (body[grupo]) {
      for (const [criterioId, nivel] of Object.entries(body[grupo])) {
        if (nivel === '' || nivel === null || nivel === undefined) continue;
        const nivelNum = Number(nivel);
        if (!Number.isFinite(nivelNum) || !ctx.niveles.some(n => n.numero === nivelNum)) {
          return res.status(400).json({ error: 'Nivel invalido: ' + nivel });
        }
      }
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: existing } = await client.query('SELECT * FROM evaluaciones WHERE legajo=$1 AND mes=$2', [legajo, mes]);
    let evaluacionId;
    if (existing[0]) {
      evaluacionId = existing[0].id;
      const vac = body.vac !== undefined ? Number(body.vac) || 0 : Number(existing[0].vac_horas);
      const real = body.real !== undefined ? Number(body.real) || 0 : Number(existing[0].horas_reales);
      await client.query('UPDATE evaluaciones SET vac_horas=$1, horas_reales=$2, updated_at=now() WHERE id=$3', [vac, real, evaluacionId]);
    } else {
      const vac = Number(body.vac) || 0;
      const real = Number(body.real) || 0;
      const { rows } = await client.query(
        'INSERT INTO evaluaciones (legajo, mes, vac_horas, horas_reales) VALUES ($1,$2,$3,$4) RETURNING id',
        [legajo, mes, vac, real]
      );
      evaluacionId = rows[0].id;
    }

    for (const grupo of ['pred', 'sh']) {
      if (body[grupo]) {
        for (const [criterioId, nivel] of Object.entries(body[grupo])) {
          const nivelNum = (nivel === '' || nivel === null || nivel === undefined) ? null : Number(nivel);
          await client.query(
            `INSERT INTO evaluaciones_criterios (evaluacion_id, grupo, criterio_id, nivel) VALUES ($1,$2,$3,$4)
             ON CONFLICT (evaluacion_id, grupo, criterio_id) DO UPDATE SET nivel=$4`,
            [evaluacionId, grupo, criterioId, nivelNum]
          );
        }
      }
    }
    if (body.com) {
      for (const grupo of ['pred', 'sh']) {
        if (body.com[grupo] !== undefined) {
          await client.query(
            `INSERT INTO evaluaciones_comentarios (evaluacion_id, grupo, texto) VALUES ($1,$2,$3)
             ON CONFLICT (evaluacion_id, grupo) DO UPDATE SET texto=$3`,
            [evaluacionId, grupo, body.com[grupo] || '']
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

  const evalMap = await loadEvalRows(mes, [legajo]);
  const e = evalMap[legajo];
  res.json({ legajo: p.legajo, nombre: p.nombre, sector: p.sector, evaluador: p.evaluador, ...e, ...computeWithContext(ctx, e) });
});

router.post('/:mes/finalizar', async (req, res) => {
  await pool.query(
    `INSERT INTO evaluaciones_finalizadas (mes, user_id) VALUES ($1,$2)
     ON CONFLICT (mes, user_id) DO UPDATE SET finalizado_at=now()`,
    [req.params.mes, req.user.id]
  );
  res.json({ ok: true });
});

module.exports = router;
