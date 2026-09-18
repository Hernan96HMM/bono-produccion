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

test('PUT /api/factores como admin actualiza los tres factores y GET los refleja', async () => {
  const agent = await loginAs('admin');
  const payload = [
    { factor_key: 'hs', icono: '⏱', label: 'Horas Productivas', peso: 30 },
    { factor_key: 'pred', icono: '🤝', label: 'Predisposicion', peso: 40 },
    { factor_key: 'sh', icono: '🦺', label: 'Seg. Orden y Limpieza', peso: 30 },
  ];
  const put = await agent.put('/api/factores').send(payload);
  expect(put.status).toBe(200);
  const res = await agent.get('/api/factores');
  const hs = res.body.find(f => f.factor_key === 'hs');
  expect(hs.peso).toBe(30);
});

test('PUT /api/factores devuelve 403 si no es admin', async () => {
  const agent = await loginAs('syh');
  const res = await agent.put('/api/factores').send([]);
  expect(res.status).toBe(403);
});
