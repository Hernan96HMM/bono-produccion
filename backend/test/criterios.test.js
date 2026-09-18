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

test('GET /api/criterios devuelve pred y sh vacios si no hay nada cargado', async () => {
  const agent = await loginAs('syh');
  const res = await agent.get('/api/criterios');
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ pred: [], sh: [] });
});

test('PUT /api/criterios como admin reemplaza pred y sh con sus rubricas', async () => {
  const agent = await loginAs('admin');
  const payload = {
    pred: [{ id: 'p1', label: 'Iniciativa', descripcion: 'Actua por cuenta propia', rubricas: { 1: 'Bajo', 2: 'Medio', 3: 'Esperado', 4: 'Alto' } }],
    sh: [{ id: 's1', label: 'EPP', descripcion: 'Uso de EPP', rubricas: { 1: 'No usa', 3: 'Usa siempre' } }],
  };
  const put = await agent.put('/api/criterios').send(payload);
  expect(put.status).toBe(200);
  const res = await agent.get('/api/criterios');
  expect(res.body.pred).toHaveLength(1);
  expect(res.body.pred[0].label).toBe('Iniciativa');
  expect(res.body.pred[0].rubricas['3']).toBe('Esperado');
  expect(res.body.sh[0].id).toBe('s1');
});

test('PUT /api/criterios reemplaza completamente el set anterior (no acumula)', async () => {
  const agent = await loginAs('admin');
  await agent.put('/api/criterios').send({ pred: [{ id: 'p1', label: 'A', descripcion: '', rubricas: {} }], sh: [] });
  await agent.put('/api/criterios').send({ pred: [{ id: 'p2', label: 'B', descripcion: '', rubricas: {} }], sh: [] });
  const res = await agent.get('/api/criterios');
  expect(res.body.pred.map(c => c.id)).toEqual(['p2']);
});

test('PUT /api/criterios devuelve 403 si no es admin', async () => {
  const agent = await loginAs('produccion');
  const res = await agent.put('/api/criterios').send({ pred: [], sh: [] });
  expect(res.status).toBe(403);
});
