const { pool } = require('../src/db');
const { seed } = require('../seed');
const { resetDb } = require('./dbHelpers');

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await pool.end(); });

test('seed crea los 4 usuarios esperados con sus roles y evaluador asignado', async () => {
  await seed();
  const { rows } = await pool.query('SELECT username, role, evaluador_nombre FROM users ORDER BY username');
  expect(rows).toEqual([
    { username: 'admin', role: 'admin', evaluador_nombre: '' },
    { username: 'foos', role: 'supervisor', evaluador_nombre: 'Foos' },
    { username: 'produccion', role: 'produccion', evaluador_nombre: '' },
    { username: 'schmidt', role: 'syh', evaluador_nombre: '' },
  ]);
});

test('seed carga los 16 feriados 2026, los 3 factores con sus pesos y los 4 niveles', async () => {
  await seed();
  const feriados = await pool.query('SELECT count(*) FROM calendario_feriados');
  expect(Number(feriados.rows[0].count)).toBe(16);
  const factores = await pool.query('SELECT factor_key, peso FROM factores ORDER BY factor_key');
  expect(factores.rows).toEqual([
    { factor_key: 'hs', peso: 25 },
    { factor_key: 'pred', peso: 50 },
    { factor_key: 'sh', peso: 25 },
  ]);
  const niveles = await pool.query('SELECT numero, porcentaje FROM niveles ORDER BY numero');
  expect(niveles.rows.map(n => n.porcentaje)).toEqual([0, 50, 100, 125]);
});

test('seed carga 3 criterios de predisposicion y 3 de S&H, cada uno con 4 rubricas', async () => {
  await seed();
  const pred = await pool.query("SELECT id FROM criterios WHERE grupo='pred'");
  const sh = await pool.query("SELECT id FROM criterios WHERE grupo='sh'");
  expect(pred.rows).toHaveLength(3);
  expect(sh.rows).toHaveLength(3);
  const rub = await pool.query('SELECT count(*) FROM criterio_rubricas WHERE criterio_id_ref=$1', [pred.rows[0].id]);
  expect(Number(rub.rows[0].count)).toBe(4);
});

test('seed deja la tabla personal vacia (RRHH importa la nomina real)', async () => {
  await seed();
  const { rows } = await pool.query('SELECT count(*) FROM personal');
  expect(Number(rows[0].count)).toBe(0);
});

test('seed es idempotente: correrlo dos veces no duplica usuarios ni feriados', async () => {
  await seed();
  await seed();
  const users = await pool.query('SELECT count(*) FROM users');
  expect(Number(users.rows[0].count)).toBe(4);
  const feriados = await pool.query('SELECT count(*) FROM calendario_feriados');
  expect(Number(feriados.rows[0].count)).toBe(16);
});
