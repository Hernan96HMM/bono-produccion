const { pool } = require('../db');
const { calTotals } = require('./calendar');

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

async function hsBaseNetas(mes) {
  const reglas = await loadReglas();
  const feriados = await loadFeriados();
  const dias = await loadDias();
  const totals = calTotals(mes, {
    lun_jue: Number(reglas.lun_jue), vie: Number(reglas.vie), sab: Number(reglas.sab),
    dom: Number(reglas.dom), descanso: Number(reglas.descanso),
  }, feriados, dias);
  return totals.netas;
}

module.exports = { loadReglas, loadFeriados, loadDias, hsBaseNetas };
