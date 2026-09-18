const { pool } = require('../db');

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

async function loadFactores() {
  const { rows } = await pool.query('SELECT factor_key, peso FROM factores');
  const out = {};
  rows.forEach(r => { out[r.factor_key] = Number(r.peso); });
  return out;
}

async function loadNiveles() {
  const { rows } = await pool.query('SELECT numero, label, porcentaje FROM niveles ORDER BY numero');
  return rows.map(r => ({ numero: r.numero, label: r.label, porcentaje: Number(r.porcentaje) }));
}

module.exports = { loadGrupo, loadFactores, loadNiveles };
