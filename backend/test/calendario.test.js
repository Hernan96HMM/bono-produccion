const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/server');
const { pool } = require('../src/db');
const { resetDb } = require('./dbHelpers');

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await pool.end(); });

async function loginAs(role) {
  const hash = await bcrypt.hash('Pass1234!', 10);
  await pool.query(`INSERT INTO users (username, password_hash, name, role) VALUES ($1,$2,$3,$4)`, [role, hash, role, role]);
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ username: role, password: 'Pass1234!' });
  return agent;
}

test('GET /api/calendario/:mes devuelve reglas por defecto y totales calculados', async () => {
  const agent = await loginAs('admin');
  const res = await agent.get('/api/calendario/2026-02');
  expect(res.status).toBe(200);
  expect(res.body.reglas).toEqual({ lun_jue: '9.0', vie: '8.0', sab: '0.0', dom: '0.0', descanso: '1.0' });
  expect(res.body.totals.dias).toBe(20);
});

test('GET /api/calendario/:mes devuelve 403 para un rol sin acceso al calendario', async () => {
  const agent = await loginAs('syh');
  const res = await agent.get('/api/calendario/2026-02');
  expect(res.status).toBe(403);
});

test('PUT /api/calendario/reglas actualiza las reglas y afecta los totales del mes', async () => {
  const agent = await loginAs('produccion');
  await agent.put('/api/calendario/reglas').send({ lun_jue: 8, vie: 6, sab: 0, dom: 0, descanso: 0.5 });
  const res = await agent.get('/api/calendario/2026-02');
  expect(res.body.reglas.lun_jue).toBe('8.0');
  expect(res.body.totals.netas).toBe(16 * 7.5 + 4 * 5.5);
});

test('PUT /api/calendario/feriados agrega un feriado y GET lo refleja con 0 horas ese dia', async () => {
  const agent = await loginAs('admin');
  await agent.put('/api/calendario/feriados').send({ fecha: '2026-02-03', nombre: 'Paro' }); // era martes habil
  const res = await agent.get('/api/calendario/2026-02');
  expect(res.body.feriados['2026-02-03']).toBe('Paro');
  expect(res.body.totals.dias).toBe(19);
});

test('PUT /api/calendario/feriados con nombre null elimina el feriado', async () => {
  const agent = await loginAs('admin');
  await agent.put('/api/calendario/feriados').send({ fecha: '2026-02-03', nombre: 'Paro' });
  await agent.put('/api/calendario/feriados').send({ fecha: '2026-02-03', nombre: null });
  const res = await agent.get('/api/calendario/2026-02');
  expect(res.body.feriados['2026-02-03']).toBeUndefined();
});

test('PUT /api/calendario/dia/:fecha sobreescribe un dia puntual', async () => {
  const agent = await loginAs('admin');
  await agent.put('/api/calendario/dia/2026-02-03').send({ horas_brutas: 4, descuento: 0, nombre: 'Media jornada' });
  const res = await agent.get('/api/calendario/2026-02');
  expect(res.body.dias['2026-02-03']).toEqual({ horas_brutas: '4.0', descuento: '0.0', nombre: 'Media jornada' });
});

test('PUT /api/calendario/dia/:fecha con clear:true vuelve a la regla general', async () => {
  const agent = await loginAs('admin');
  await agent.put('/api/calendario/dia/2026-02-03').send({ horas_brutas: 4, descuento: 0, nombre: 'Media jornada' });
  await agent.put('/api/calendario/dia/2026-02-03').send({ clear: true });
  const res = await agent.get('/api/calendario/2026-02');
  expect(res.body.dias['2026-02-03']).toBeUndefined();
});
