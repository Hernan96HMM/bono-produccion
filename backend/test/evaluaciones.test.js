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
     ('1002','GOMEZ, ANA','Pintura','Astezano','Jornalizado',true,'Activo',800000),
     ('2001','LOPEZ, LUIS','Administracion','—','Mensual',false,'Activo',0)`
  );
  await pool.query(`INSERT INTO config (id, mes, horas_normales, descuento, bono_base_pct) VALUES (1,'2026-02',0,0,15)`);
  await pool.query(`INSERT INTO calendario_reglas (id, lun_jue, vie, sab, dom, descanso) VALUES (1,9,8,0,0,1)`);
  await pool.query(`INSERT INTO factores (factor_key, icono, label, peso) VALUES ('hs','','Horas',25),('pred','','Predisposicion',50),('sh','','S&H',25)`);
  await pool.query(`INSERT INTO niveles (numero, label, porcentaje) VALUES (1,'No cumple',0),(2,'Regular',50),(3,'Esperado',100),(4,'Sobresaliente',125)`);
  const p1 = await pool.query(`INSERT INTO criterios (grupo, criterio_id, label, orden) VALUES ('pred','p1','Iniciativa',0) RETURNING id`);
  const s1 = await pool.query(`INSERT INTO criterios (grupo, criterio_id, label, orden) VALUES ('sh','s1','EPP',0) RETURNING id`);
  return { predCritId: p1.rows[0].id, shCritId: s1.rows[0].id };
}

test('GET /api/evaluaciones/:mes como admin devuelve todos los SPM activos con los campos ya calculados', async () => {
  await seedBase();
  const agent = await loginAs('admin', 'admin');
  const res = await agent.get('/api/evaluaciones/2026-02');
  expect(res.status).toBe(200);
  expect(Object.keys(res.body).sort()).toEqual(['1001', '1002']); // 2001 no es SPM
  expect(res.body['1001']).toHaveProperty('hsEsp');
  expect(res.body['1001']).toHaveProperty('fHs');
  expect(res.body['1001']).toHaveProperty('res');
});

test('GET /api/evaluaciones/:mes como supervisor solo devuelve sus asignados (match por apellido)', async () => {
  await seedBase();
  const agent = await loginAs('foos', 'supervisor', 'FOOS, JOSE CARLOS');
  const res = await agent.get('/api/evaluaciones/2026-02');
  expect(Object.keys(res.body)).toEqual(['1001']);
});

test('GET /api/evaluaciones/:mes/:legajo fuera del alcance del supervisor devuelve 404', async () => {
  await seedBase();
  const agent = await loginAs('foos', 'supervisor', 'FOOS, JOSE CARLOS');
  const res = await agent.get('/api/evaluaciones/2026-02/1002');
  expect(res.status).toBe(404);
});

test('PUT como produccion carga vac/real y devuelve la fila recalculada', async () => {
  await seedBase();
  const agent = await loginAs('prod', 'produccion');
  const res = await agent.put('/api/evaluaciones/2026-02/1001').send({ vac: 0, real: 156 });
  expect(res.status).toBe(200);
  expect(res.body.hsEsp).toBe(156);
  expect(res.body.fHs).toBeCloseTo(1);
});

test('PUT como produccion intentando cargar pred devuelve 403', async () => {
  await seedBase();
  const agent = await loginAs('prod', 'produccion');
  const res = await agent.put('/api/evaluaciones/2026-02/1001').send({ pred: { p1: 3 } });
  expect(res.status).toBe(403);
});

test('PUT como supervisor carga pred de su gente y el factor sube al guardar', async () => {
  await seedBase();
  const agent = await loginAs('foos', 'supervisor', 'FOOS, JOSE CARLOS');
  const res = await agent.put('/api/evaluaciones/2026-02/1001').send({ pred: { p1: 3 } });
  expect(res.status).toBe(200);
  expect(res.body.fPr).toBeCloseTo(1);
});

test('PUT como supervisor sobre un legajo ajeno devuelve 404', async () => {
  await seedBase();
  const agent = await loginAs('foos', 'supervisor', 'FOOS, JOSE CARLOS');
  const res = await agent.put('/api/evaluaciones/2026-02/1002').send({ pred: { p1: 3 } });
  expect(res.status).toBe(404);
});

test('PUT como syh carga sh y comentario de sh; comentario de pred le devuelve 403', async () => {
  await seedBase();
  const agent = await loginAs('schmidt', 'syh');
  const ok = await agent.put('/api/evaluaciones/2026-02/1001').send({ sh: { s1: 3 }, com: { sh: 'todo en orden' } });
  expect(ok.status).toBe(200);
  expect(ok.body.fSh).toBeCloseTo(1);
  const forbidden = await agent.put('/api/evaluaciones/2026-02/1001').send({ com: { pred: 'no deberia poder' } });
  expect(forbidden.status).toBe(403);
});

test('PUT persiste los valores entre llamadas (no pisa lo cargado por otro rol)', async () => {
  await seedBase();
  const prodAgent = await loginAs('prod', 'produccion');
  await prodAgent.put('/api/evaluaciones/2026-02/1001').send({ real: 100 });
  const supAgent = await loginAs('foos', 'supervisor', 'FOOS, JOSE CARLOS');
  await supAgent.put('/api/evaluaciones/2026-02/1001').send({ pred: { p1: 3 } });
  const adminAgent = await loginAs('admin', 'admin');
  const res = await adminAgent.get('/api/evaluaciones/2026-02/1001');
  expect(res.body.real).toBe(100);
  expect(res.body.pred.p1).toBe(3);
});

test('POST /api/evaluaciones/:mes/finalizar marca la finalizacion del usuario actual', async () => {
  await seedBase();
  const agent = await loginAs('foos', 'supervisor', 'FOOS, JOSE CARLOS');
  const res = await agent.post('/api/evaluaciones/2026-02/finalizar');
  expect(res.status).toBe(200);
});

test('GET /api/evaluaciones/:mes/estado-evaluadores solo accesible para admin', async () => {
  await seedBase();
  const supAgent = await loginAs('foos', 'supervisor', 'FOOS, JOSE CARLOS');
  const denied = await supAgent.get('/api/evaluaciones/2026-02/estado-evaluadores');
  expect(denied.status).toBe(403);
  await supAgent.post('/api/evaluaciones/2026-02/finalizar');
  const adminAgent = await loginAs('admin', 'admin');
  const res = await adminAgent.get('/api/evaluaciones/2026-02/estado-evaluadores');
  expect(res.status).toBe(200);
  const foosRow = res.body.find(u => u.username === 'foos');
  expect(foosRow.finalizado_at).not.toBeNull();
});

test('GET /api/evaluaciones/:mes/mi-estado devuelve null antes de finalizar y una fecha despues', async () => {
  await seedBase();
  const agent = await loginAs('foos', 'supervisor', 'FOOS, JOSE CARLOS');
  const antes = await agent.get('/api/evaluaciones/2026-02/mi-estado');
  expect(antes.body.finalizado_at).toBeNull();
  await agent.post('/api/evaluaciones/2026-02/finalizar');
  const despues = await agent.get('/api/evaluaciones/2026-02/mi-estado');
  expect(despues.body.finalizado_at).not.toBeNull();
});
