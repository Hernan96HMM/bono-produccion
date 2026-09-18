const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/server');
const { pool } = require('../src/db');
const { resetDb } = require('./dbHelpers');

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await pool.end(); });

async function makeUser(overrides = {}) {
  const hash = await bcrypt.hash(overrides.password || 'Admin1234!', 10);
  const { rows } = await pool.query(
    `INSERT INTO users (username, password_hash, name, role, evaluador_nombre)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [overrides.username || 'admin', hash, overrides.name || 'RRHH', overrides.role || 'admin', overrides.evaluador_nombre || '']
  );
  return rows[0];
}

test('login con credenciales correctas devuelve cookie httpOnly y datos de usuario', async () => {
  await makeUser({ username: 'admin', password: 'Admin1234!' });
  const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'Admin1234!' });
  expect(res.status).toBe(200);
  expect(res.body.user.username).toBe('admin');
  expect(res.body.user.password_hash).toBeUndefined();
  expect(res.headers['set-cookie'][0]).toMatch(/HttpOnly/);
});

test('login con contrasena incorrecta devuelve 401', async () => {
  await makeUser({ username: 'admin', password: 'Admin1234!' });
  const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'mala' });
  expect(res.status).toBe(401);
});

test('login con usuario inexistente devuelve 401 (sin filtrar si el usuario existe)', async () => {
  const res = await request(app).post('/api/auth/login').send({ username: 'noexiste', password: 'x' });
  expect(res.status).toBe(401);
});

test('POST /api/auth/login sin body devuelve 400', async () => {
  const res = await request(app).post('/api/auth/login').send({});
  expect(res.status).toBe(400);
});

test('GET /api/auth/me sin cookie devuelve 401', async () => {
  const res = await request(app).get('/api/auth/me');
  expect(res.status).toBe(401);
});

test('GET /api/auth/me con sesion devuelve el usuario', async () => {
  await makeUser({ username: 'admin', password: 'Admin1234!', role: 'admin' });
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ username: 'admin', password: 'Admin1234!' });
  const res = await agent.get('/api/auth/me');
  expect(res.status).toBe(200);
  expect(res.body.user.username).toBe('admin');
  expect(res.body.user.role).toBe('admin');
});

test('POST /api/auth/logout limpia la cookie y GET /api/auth/me vuelve a dar 401', async () => {
  await makeUser({ username: 'admin', password: 'Admin1234!' });
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ username: 'admin', password: 'Admin1234!' });
  await agent.post('/api/auth/logout');
  const res = await agent.get('/api/auth/me');
  expect(res.status).toBe(401);
});
