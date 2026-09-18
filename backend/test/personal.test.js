const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/server');
const { pool } = require('../src/db');
const { resetDb } = require('./dbHelpers');

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await pool.end(); });

async function loginAs(role) {
  const hash = await bcrypt.hash('Pass1234!', 10);
  await pool.query(
    `INSERT INTO users (username, password_hash, name, role) VALUES ($1,$2,$3,$4)`,
    [role, hash, role, role]
  );
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ username: role, password: 'Pass1234!' });
  return agent;
}

async function seedPersonal() {
  await pool.query(
    `INSERT INTO personal (legajo, nombre, sector, evaluador, tipo, spm, estado, sueldo_base) VALUES
     ('1001','PEREZ, JUAN','Taller','Foos','Jornalizado',true,'Activo',500000),
     ('1002','GOMEZ, ANA','Pintura','Astezano','Jornalizado',true,'Baja',400000),
     ('2001','LOPEZ, LUIS','Administracion','—','Mensual',false,'Activo',0)`
  );
}

test('GET /api/personal sin sesion devuelve 401', async () => {
  const res = await request(app).get('/api/personal');
  expect(res.status).toBe(401);
});

test('GET /api/personal devuelve 403 para un rol que no es admin', async () => {
  const agent = await loginAs('supervisor');
  const res = await agent.get('/api/personal');
  expect(res.status).toBe(403);
});

test('GET /api/personal como admin devuelve toda la nomina', async () => {
  await seedPersonal();
  const agent = await loginAs('admin');
  const res = await agent.get('/api/personal');
  expect(res.status).toBe(200);
  expect(res.body).toHaveLength(3);
});

test('GET /api/personal filtra por estado y spm', async () => {
  await seedPersonal();
  const agent = await loginAs('admin');
  const res = await agent.get('/api/personal?estado=Activo&spm=1');
  expect(res.body.map(p => p.legajo)).toEqual(['1001']);
});

test('GET /api/personal filtra por texto libre en nombre o legajo', async () => {
  await seedPersonal();
  const agent = await loginAs('admin');
  const res = await agent.get('/api/personal?q=gomez');
  expect(res.body.map(p => p.legajo)).toEqual(['1002']);
});

test('POST /api/personal crea una persona nueva', async () => {
  const agent = await loginAs('admin');
  const res = await agent.post('/api/personal').send({ legajo: '3001', nombre: 'RUIZ, SOFIA', sector: 'Calidad', evaluador: '—', tipo: 'Mensual', spm: false, estado: 'Activo', sueldo_base: 0 });
  expect(res.status).toBe(201);
  expect(res.body.legajo).toBe('3001');
});

test('POST /api/personal con legajo repetido devuelve 409', async () => {
  await seedPersonal();
  const agent = await loginAs('admin');
  const res = await agent.post('/api/personal').send({ legajo: '1001', nombre: 'DUPLICADO' });
  expect(res.status).toBe(409);
});

test('POST /api/personal sin legajo o nombre devuelve 400', async () => {
  const agent = await loginAs('admin');
  const res = await agent.post('/api/personal').send({ sector: 'X' });
  expect(res.status).toBe(400);
});

test('PUT /api/personal/:legajo actualiza los datos', async () => {
  await seedPersonal();
  const agent = await loginAs('admin');
  const res = await agent.put('/api/personal/1001').send({ nombre: 'PEREZ, JUAN CARLOS', sector: 'Taller', evaluador: 'Foos', tipo: 'Jornalizado', spm: true, estado: 'Activo', sueldo_base: 550000 });
  expect(res.status).toBe(200);
  expect(res.body.nombre).toBe('PEREZ, JUAN CARLOS');
  expect(Number(res.body.sueldo_base)).toBe(550000);
});

test('PUT /api/personal/:legajo con legajo inexistente devuelve 404', async () => {
  const agent = await loginAs('admin');
  const res = await agent.put('/api/personal/9999').send({ nombre: 'X' });
  expect(res.status).toBe(404);
});

test('DELETE /api/personal/:legajo elimina la persona', async () => {
  await seedPersonal();
  const agent = await loginAs('admin');
  const res = await agent.delete('/api/personal/1001');
  expect(res.status).toBe(204);
  const check = await pool.query('SELECT * FROM personal WHERE legajo=$1', ['1001']);
  expect(check.rows).toHaveLength(0);
});
