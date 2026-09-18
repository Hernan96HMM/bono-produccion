const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/server');
const { pool } = require('../src/db');
const { resetDb } = require('./dbHelpers');

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await pool.end(); });

async function loginAs(role, extra = {}) {
  const hash = await bcrypt.hash('Pass1234!', 10);
  await pool.query(
    `INSERT INTO users (username, password_hash, name, role, evaluador_nombre) VALUES ($1,$2,$3,$4,$5)`,
    [role, hash, role, role, extra.evaluador_nombre || '']
  );
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ username: role, password: 'Pass1234!' });
  return agent;
}

test('GET /api/config sin sesion devuelve 401', async () => {
  const res = await request(app).get('/api/config');
  expect(res.status).toBe(401);
});

test('GET /api/config devuelve la fila unica de configuracion (creada si no existe)', async () => {
  const agent = await loginAs('admin');
  const res = await agent.get('/api/config');
  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('mes');
  expect(res.body).toHaveProperty('bono_base_pct');
});

test('PUT /api/config actualiza la configuracion si el usuario es admin', async () => {
  const agent = await loginAs('admin');
  const res = await agent.put('/api/config').send({ mes: '2026-03', horas_normales: 160, descuento: 18, bono_base_pct: 20 });
  expect(res.status).toBe(200);
  expect(res.body.mes).toBe('2026-03');
  expect(Number(res.body.bono_base_pct)).toBe(20);
  const check = await agent.get('/api/config');
  expect(check.body.mes).toBe('2026-03');
});

test('PUT /api/config devuelve 403 si el usuario no es admin', async () => {
  const agent = await loginAs('produccion');
  const res = await agent.put('/api/config').send({ mes: '2026-03' });
  expect(res.status).toBe(403);
});

test('PUT /api/config sin mes devuelve 400', async () => {
  const agent = await loginAs('admin');
  const res = await agent.put('/api/config').send({ bono_base_pct: 20 });
  expect(res.status).toBe(400);
});
