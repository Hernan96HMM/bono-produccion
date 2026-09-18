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

test('PUT /api/niveles reemplaza la escala completa y GET la devuelve ordenada por numero', async () => {
  const agent = await loginAs('admin');
  const payload = [
    { numero: 2, label: 'Regular', porcentaje: 50 },
    { numero: 1, label: 'No cumple', porcentaje: 0 },
  ];
  await agent.put('/api/niveles').send(payload);
  const res = await agent.get('/api/niveles');
  expect(res.body.map(n => n.numero)).toEqual([1, 2]);
});

test('PUT /api/niveles devuelve 403 si no es admin', async () => {
  const agent = await loginAs('supervisor');
  const res = await agent.put('/api/niveles').send([]);
  expect(res.status).toBe(403);
});
