const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { sameEv } = require('../lib/access');
const { calcRow } = require('../lib/calc');
const { hsBaseNetas } = require('../lib/calendarRepo');
const { loadGrupo, loadFactores, loadNiveles } = require('../lib/critRepo');

const router = express.Router();

async function computeResultados(mes, user) {
  const { rows: personal } = await pool.query(
    `SELECT legajo, nombre, sector, evaluador, sueldo_base FROM personal WHERE spm=true AND estado='Activo' ORDER BY nombre`
  );
  const people = user.role === 'supervisor' ? personal.filter(p => sameEv(p.evaluador, user.evaluador_nombre)) : personal;
  if (!people.length) return [];

  const legajos = people.map(p => p.legajo);
  const { rows: evs } = await pool.query('SELECT * FROM evaluaciones WHERE mes=$1 AND legajo = ANY($2)', [mes, legajos]);
  const evByLegajo = {};
  const idToLegajo = {};
  evs.forEach(e => {
    evByLegajo[e.legajo] = { vac: Number(e.vac_horas), real: Number(e.horas_reales), pred: {}, sh: {} };
    idToLegajo[e.id] = e.legajo;
  });
  const ids = evs.map(e => e.id);
  if (ids.length) {
    const { rows: crits } = await pool.query('SELECT * FROM evaluaciones_criterios WHERE evaluacion_id = ANY($1)', [ids]);
    crits.forEach(c => { evByLegajo[idToLegajo[c.evaluacion_id]][c.grupo][c.criterio_id] = c.nivel; });
  }

  const niveles = await loadNiveles();
  const factores = await loadFactores();
  const predCrits = await loadGrupo('pred');
  const shCrits = await loadGrupo('sh');
  const { rows: cfgRows } = await pool.query('SELECT bono_base_pct FROM config WHERE id=1');
  const base = cfgRows[0] ? Number(cfgRows[0].bono_base_pct) : 0;
  const hsBase = await hsBaseNetas(mes);

  return people.map(p => {
    const e = evByLegajo[p.legajo] || { vac: 0, real: 0, pred: {}, sh: {} };
    const calc = calcRow({
      hsBaseNetas: hsBase, vac: e.vac, real: e.real,
      predValores: e.pred, shValores: e.sh,
      predIds: predCrits.map(c => c.id), shIds: shCrits.map(c => c.id),
      niveles, base, pesoHs: factores.hs, pesoPred: factores.pred, pesoSh: factores.sh,
      sueldoBase: Number(p.sueldo_base) || 0,
    });
    return {
      legajo: p.legajo, nombre: p.nombre, sector: p.sector, evaluador: p.evaluador,
      sueldo_base: Number(p.sueldo_base) || 0, ...calc,
    };
  });
}

router.get('/:mes', requireAuth, async (req, res) => {
  const rows = await computeResultados(req.params.mes, req.user);
  const out = rows.map(r => {
    if (req.user.role === 'admin') return r;
    const { sueldo_base, inc, ...rest } = r;
    return rest;
  });
  res.json(out);
});

module.exports = { router, computeResultados };
