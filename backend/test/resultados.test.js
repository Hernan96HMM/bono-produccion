const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/server');
const { pool } = require('../src/db');
const { resetDb } = require('./dbHelpers');

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await pool.end(); });

async function loginAs(username, role, evaluador_nombre = '') {
  const hash = await bcrypt.hash('Pass1234!', 10);
  await pool.query(
    `INSERT INTO users (username, password_hash, name, role, evaluador_nombre) VALUES ($1,$2,$3,$4,$5)`,
    [username, hash, username, role, evaluador_nombre]
  );
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ username, password: 'Pass1234!' });
  return agent;
}

async function seedBase() {
  await pool.query(
    `INSERT INTO personal (legajo, nombre, sector, evaluador, tipo, spm, estado, sueldo_base) VALUES
     ('1001','PEREZ, JUAN','Taller','Foos','Jornalizado',true,'Activo',1000000),
     ('1002','GOMEZ, ANA','Pintura','Astezano','Jornalizado',true,'Activo',800000)`
  );
  await pool.query(`INSERT INTO config (id, mes, horas_normales, descuento, bono_base_pct) VALUES (1,'2026-02',0,0,15)`);
  await pool.query(`INSERT INTO calendario_reglas (id, lun_jue, vie, sab, dom, descanso) VALUES (1,9,8,0,0,1)`);
  await pool.query(`INSERT INTO factores (factor_key, icono, label, peso) VALUES ('hs','','Horas',25),('pred','','Predisposicion',50),('sh','','S&H',25)`);
  await pool.query(`INSERT INTO niveles (numero, label, porcentaje) VALUES (1,'No cumple',0),(2,'Regular',50),(3,'Esperado',100),(4,'Sobresaliente',125)`);
  const ev = await pool.query(`INSERT INTO evaluaciones (legajo, mes, vac_horas, horas_reales) VALUES ('1001','2026-02',0,156) RETURNING id`);
  return ev.rows[0].id;
}

test('GET /api/resultados/:mes como admin incluye sueldo_base e inc', async () => {
  await seedBase();
  const agent = await loginAs('admin', 'admin');
  const res = await agent.get('/api/resultados/2026-02');
  expect(res.status).toBe(200);
  const row = res.body.find(r => r.legajo === '1001');
  expect(row).toHaveProperty('sueldo_base');
  expect(row).toHaveProperty('inc');
  expect(row.res).toBeCloseTo(0.15 * 0.25); // solo horas al 100%, pred/sh en 0
});

test('GET /api/resultados/:mes como produccion NO incluye sueldo_base ni inc', async () => {
  await seedBase();
  const agent = await loginAs('prod', 'produccion');
  const res = await agent.get('/api/resultados/2026-02');
  const row = res.body.find(r => r.legajo === '1001');
  expect(row.sueldo_base).toBeUndefined();
  expect(row.inc).toBeUndefined();
  expect(row.fHs).toBeCloseTo(1);
});

test('GET /api/resultados/:mes como supervisor solo trae sus asignados', async () => {
  await seedBase();
  const agent = await loginAs('foos', 'supervisor', 'FOOS, JOSE CARLOS');
  const res = await agent.get('/api/resultados/2026-02');
  expect(res.body.map(r => r.legajo)).toEqual(['1001']);
});

test('GET /api/resultados/:mes sin sesion devuelve 401', async () => {
  const res = await request(app).get('/api/resultados/2026-02');
  expect(res.status).toBe(401);
});
