const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/server');
const { pool } = require('../src/db');
const { resetDb } = require('./dbHelpers');

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await pool.end(); });

async function loginAs(username, role) {
  const hash = await bcrypt.hash('Pass1234!', 10);
  await pool.query(`INSERT INTO users (username, password_hash, name, role) VALUES ($1,$2,$3,$4)`, [username, hash, username, role]);
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ username, password: 'Pass1234!' });
  return agent;
}

async function seedBase() {
  await pool.query(
    `INSERT INTO personal (legajo, nombre, sector, evaluador, tipo, spm, estado, sueldo_base) VALUES
     ('1001','PEREZ, JUAN','Taller','Foos','Jornalizado',true,'Activo',1000000)`
  );
  await pool.query(`INSERT INTO config (id, mes, horas_normales, descuento, bono_base_pct) VALUES (1,'2026-02',0,0,15)`);
  await pool.query(`INSERT INTO calendario_reglas (id, lun_jue, vie, sab, dom, descanso) VALUES (1,9,8,0,0,1)`);
  await pool.query(`INSERT INTO factores (factor_key, icono, label, peso) VALUES ('hs','','Horas',100),('pred','','Predisposicion',0),('sh','','S&H',0)`);
  await pool.query(`INSERT INTO niveles (numero, label, porcentaje) VALUES (1,'No cumple',0),(2,'Regular',50),(3,'Esperado',100),(4,'Sobresaliente',125)`);
  await pool.query(`INSERT INTO evaluaciones (legajo, mes, vac_horas, horas_reales) VALUES ('1001','2026-02',0,156)`);
}

test('POST /api/historial/cerrar como admin archiva el mes configurado', async () => {
  await seedBase();
  const agent = await loginAs('admin', 'admin');
  const res = await agent.post('/api/historial/cerrar');
  expect(res.status).toBe(201);
  expect(res.body.mes).toBe('2026-02');
  expect(res.body.n).toBe(1);
  expect(res.body.avg).toBeCloseTo(0.15);
  expect(res.body.money).toBeCloseTo(150000);
});

test('POST /api/historial/cerrar devuelve 403 si no es admin', async () => {
  await seedBase();
  const agent = await loginAs('prod', 'produccion');
  const res = await agent.post('/api/historial/cerrar');
  expect(res.status).toBe(403);
});

test('GET /api/historial como admin incluye money, como produccion no', async () => {
  await seedBase();
  const admin = await loginAs('admin', 'admin');
  await admin.post('/api/historial/cerrar');
  const resAdmin = await admin.get('/api/historial');
  expect(resAdmin.body[0]).toHaveProperty('money');

  const prod = await loginAs('prod', 'produccion');
  const resProd = await prod.get('/api/historial');
  expect(resProd.body[0].money).toBeUndefined();
  expect(resProd.body[0]).toHaveProperty('avg');
});

test('DELETE /api/historial/:mes elimina el periodo si es admin', async () => {
  await seedBase();
  const admin = await loginAs('admin', 'admin');
  await admin.post('/api/historial/cerrar');
  const res = await admin.delete('/api/historial/2026-02');
  expect(res.status).toBe(204);
  const check = await admin.get('/api/historial');
  expect(check.body).toHaveLength(0);
});

test('DELETE /api/historial/:mes devuelve 403 si no es admin', async () => {
  await seedBase();
  const admin = await loginAs('admin', 'admin');
  await admin.post('/api/historial/cerrar');
  const prod = await loginAs('prod', 'produccion');
  const res = await prod.delete('/api/historial/2026-02');
  expect(res.status).toBe(403);
});
