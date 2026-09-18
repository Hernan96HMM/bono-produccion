const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/server');
const { pool } = require('../src/db');
const { resetDb } = require('./dbHelpers');

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await pool.end(); });

async function loginAsAdmin() {
  const hash = await bcrypt.hash('Admin1234!', 10);
  await pool.query(
    `INSERT INTO users (username, password_hash, name, role) VALUES ('admin',$1,'RRHH','admin')`,
    [hash]
  );
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ username: 'admin', password: 'Admin1234!' });
  return agent;
}

test('GET /api/users devuelve 403 para un rol no admin', async () => {
  await loginAsAdmin();
  const hash = await bcrypt.hash('Foos1234!', 10);
  await pool.query(`INSERT INTO users (username, password_hash, name, role, evaluador_nombre) VALUES ('foos',$1,'Foos','supervisor','Foos')`, [hash]);
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ username: 'foos', password: 'Foos1234!' });
  const res = await agent.get('/api/users');
  expect(res.status).toBe(403);
});

test('GET /api/users como admin nunca expone password_hash', async () => {
  const agent = await loginAsAdmin();
  const res = await agent.get('/api/users');
  expect(res.status).toBe(200);
  expect(res.body[0].password_hash).toBeUndefined();
});

test('POST /api/users crea un usuario con la contrasena hasheada', async () => {
  const agent = await loginAsAdmin();
  const res = await agent.post('/api/users').send({ username: 'foos', password: 'Foos1234!', name: 'Jose Foos', role: 'supervisor', evaluador_nombre: 'Foos' });
  expect(res.status).toBe(201);
  expect(res.body.username).toBe('foos');
  expect(res.body.password_hash).toBeUndefined();
  const row = await pool.query('SELECT password_hash FROM users WHERE username=$1', ['foos']);
  expect(row.rows[0].password_hash).not.toBe('Foos1234!');
});

test('POST /api/users con username repetido devuelve 409', async () => {
  const agent = await loginAsAdmin();
  const res = await agent.post('/api/users').send({ username: 'admin', password: 'x', name: 'x', role: 'admin' });
  expect(res.status).toBe(409);
});

test('PUT /api/users/:id actualiza nombre y rol sin tocar la contrasena si no se envia', async () => {
  const agent = await loginAsAdmin();
  const created = await agent.post('/api/users').send({ username: 'foos', password: 'Foos1234!', name: 'Foos', role: 'supervisor', evaluador_nombre: 'Foos' });
  const res = await agent.put(`/api/users/${created.body.id}`).send({ name: 'Jose C. Foos', role: 'supervisor', evaluador_nombre: 'Foos' });
  expect(res.status).toBe(200);
  expect(res.body.name).toBe('Jose C. Foos');
  const login = await request.agent(app).post('/api/auth/login').send({ username: 'foos', password: 'Foos1234!' });
  expect(login.status).toBe(200);
});

test('PUT /api/users/:id con password nueva la actualiza', async () => {
  const agent = await loginAsAdmin();
  const created = await agent.post('/api/users').send({ username: 'foos', password: 'Foos1234!', name: 'Foos', role: 'supervisor', evaluador_nombre: 'Foos' });
  await agent.put(`/api/users/${created.body.id}`).send({ name: 'Foos', role: 'supervisor', evaluador_nombre: 'Foos', password: 'NuevaPass1!' });
  const login = await request.agent(app).post('/api/auth/login').send({ username: 'foos', password: 'NuevaPass1!' });
  expect(login.status).toBe(200);
});

test('DELETE /api/users/:id elimina un usuario que no sea admin', async () => {
  const agent = await loginAsAdmin();
  const created = await agent.post('/api/users').send({ username: 'foos', password: 'Foos1234!', name: 'Foos', role: 'supervisor', evaluador_nombre: 'Foos' });
  const res = await agent.delete(`/api/users/${created.body.id}`);
  expect(res.status).toBe(204);
});

test('DELETE /api/users/:id sobre el usuario admin devuelve 400', async () => {
  const agent = await loginAsAdmin();
  const me = await agent.get('/api/auth/me');
  const res = await agent.delete(`/api/users/${me.body.user.id}`);
  expect(res.status).toBe(400);
});
