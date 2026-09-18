# Migración Bono de Producción a Fullstack Docker — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir `Bono_Produccion_v22.html` (localStorage) en una app fullstack dockerizada (Node/Express + PostgreSQL + nginx) que preserve exactamente la lógica de negocio, roles y UI del HTML original.

**Architecture:** Backend Express expone la API REST descripta en el spec; toda la lógica de `calcRow` vive en `backend/src/lib/calc.js` (puro, sin DB) y se usa desde las rutas de evaluaciones/resultados/historial. El frontend sigue siendo el mismo HTML/CSS/JS de la app original: se reemplazan únicamente las funciones que tocaban `localStorage` (`DB.save/DB.load`) por un cliente `api.js` que llama a la API con `credentials:'include'`; el resto de render, filtros, modales y tablas no se toca.

**Tech Stack:** Node 22 + Express 4 + `pg` + `bcryptjs` + `jsonwebtoken` + `cookie-parser`; PostgreSQL 16; nginx alpine; Jest + Supertest para tests backend (contra Postgres real vía Docker); Docker Compose.

**Spec:** `prompt_bono_produccion.md` (raíz del repo) + lógica de negocio extraída de `Bono_Produccion_v22.html` (líneas 310-1176, revisado completo).

## Global Constraints

- Mantener EXACTAMENTE la misma lógica de negocio, estructura visual y funcionalidad del HTML original (spec, sección "Objetivo").
- Stack fijo: Node/Express/PostgreSQL backend, mismo HTML/CSS/JS de frontend, bcrypt+JWT en cookie httpOnly, Docker Compose con 3 servicios (`db`,`backend`,`frontend`).
- `docker-compose.yml` debe tener exactamente los 3 servicios `db` (`sica_bonobd`), `backend` (`sica_bonos_backend`), `frontend` (`sica_bonos_frontend`, puerto `3000:80`) tal como en el spec.
- `nginx.conf` interno debe proxyear `/api` a `sica_bonos_backend:3001` reenviando cookies (`proxy_pass_header Set-Cookie`, `proxy_cookie_path / /`).
- Seed: usuarios `admin/Admin1234!`, `foos/Foos1234!` (supervisor), `produccion/Prod1234!`, `schmidt/Syh1234!` (syh); feriados 2026 (`FERIADOS_2026` del HTML); factores hs=25/pred=50/sh=25; niveles 1=0%,2=50%,3=100%,4=125%; criterios Predisposición/S&H con rúbricas de `DEFAULT_RUB`. **NO** generar nómina demo — tabla `personal` vacía.
- UNIQUE constraint en `evaluaciones(legajo, mes)`.
- Roles y alcance exactamente como en `ROLES` del HTML: admin (todo), supervisor (`eval,res,hist`, solo sus empleados por `evaluador`), produccion (`eval,res,hist,cal`, todos los SPM), syh (`eval,res,hist`, todos los SPM, carga solo S&H).

## Decisiones de diseño (desvíos puntuales del spec, para preservar exactitud funcional)

Estas decisiones resuelven ambigüedades del spec contra la lógica real leída en el HTML. Se documentan explícitamente porque cada una es una desviación pequeña pero deliberada del modelo de datos/API tal como estaban redactados:

1. **`config.bono_base_pct`** (columna nueva, no listada en el spec original): el HTML guarda el "bono base %" (`crit.base`, ej. 15%) fuera de `factores`/`niveles`/`criterios` — es un parámetro global. Se agrega a la tabla `config` porque es el único lugar que tiene sentido para un valor único de configuración. `horas_normales`/`descuento` de `config` se mantienen por pedido del spec pero son informativos: el cálculo real de horas esperadas sale siempre de `calendario_reglas`+`calendario_feriados`+`calendario_dias_especiales` (igual que en el HTML original, donde `cfg.hn`/`cfg.desc` tampoco se usaban para el cálculo).
2. **`GET /api/personal` es admin-only.** En el HTML original, `personal` vivía completo en el cliente (localStorage) sin control de acceso real; el filtrado por rol era solo de UI. Como ahora hay autenticación real, la lista completa de personal (incluye sueldos) sólo se expone a admin, que es el único rol con `personal` en `ROLES.sees`. Los demás roles reciben los datos de personal que necesitan (legajo, nombre, sector, evaluador) ya incluidos y acotados por rol dentro de las respuestas de `/api/evaluaciones/:mes` y `/api/resultados/:mes`.
3. **`colView` (mostrar/ocultar columnas Sector/Evaluador) queda en `localStorage`.** Es una preferencia de UI pura del navegador, no dato de negocio; no forma parte del modelo de datos del spec y no tiene sentido persistirla en Postgres.
4. **El cálculo (`calcRow`) vive 100% en el backend**, incluso para el feedback en vivo de la grilla de Evaluaciones. Cada `PUT /api/evaluaciones/:mes/:legajo` devuelve la fila recalculada (`hsEsp,fHs,fPr,fSh,res,inc`); el frontend actualiza solo esas celdas con la respuesta (igual que hoy actualiza con el resultado de `calcRow()` local), en vez de recalcular localmente.

## File Structure

```
bono-produccion/
├── docker-compose.yml
├── .env.example
├── README.md
├── db/
│   └── init.sql
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── seed.js
│   ├── seedData.js
│   ├── src/
│   │   ├── server.js
│   │   ├── db.js
│   │   ├── middleware/auth.js
│   │   ├── lib/calendar.js
│   │   ├── lib/calc.js
│   │   ├── lib/access.js
│   │   └── routes/
│   │       ├── auth.js
│   │       ├── config.js
│   │       ├── personal.js
│   │       ├── users.js
│   │       ├── criterios.js
│   │       ├── factores.js
│   │       ├── niveles.js
│   │       ├── calendario.js
│   │       ├── evaluaciones.js
│   │       ├── resultados.js
│   │       └── historial.js
│   └── test/
│       ├── dbHelpers.js
│       ├── calc.test.js
│       ├── calendar.test.js
│       ├── auth.test.js
│       ├── personal.test.js
│       ├── users.test.js
│       ├── criterios.test.js
│       ├── calendario.test.js
│       ├── evaluaciones.test.js
│       ├── resultados.test.js
│       └── historial.test.js
└── frontend/
    ├── Dockerfile
    ├── nginx.conf
    └── public/
        └── index.html   (Bono_Produccion_v22.html adaptado)
```

---

### Task 1: Estructura del proyecto, Docker Compose y `.env.example`

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `db/init.sql` (vacío por ahora, se llena en Task 2)
- Create: `backend/` , `frontend/public/` (carpetas vacías con `.gitkeep`)

**Interfaces:**
- Produces: nombres de servicio (`db`,`backend`,`frontend`), nombres de contenedor (`sica_bonobd`,`sica_bonos_backend`,`sica_bonos_frontend`), variables de entorno `DB_PASSWORD`, `JWT_SECRET`, `DATABASE_URL` que todas las tareas siguientes asumen.

- [ ] **Step 1: Crear estructura de carpetas**

```bash
mkdir -p db backend/src/middleware backend/src/lib backend/src/routes backend/test frontend/public
touch backend/.gitkeep frontend/public/.gitkeep
```

- [ ] **Step 2: Crear `.env.example`**

```
DB_PASSWORD=changeme_strong_password
JWT_SECRET=changeme_random_secret_at_least_32_chars
```

- [ ] **Step 3: Crear `docker-compose.yml`**

```yaml
services:
  db:
    image: postgres:16
    container_name: sica_bonobd
    volumes:
      - ./data/postgres:/var/lib/postgresql/data
      - ./db/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    environment:
      POSTGRES_DB: sica_bonos
      POSTGRES_USER: sica
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U sica -d sica_bonos"]
      interval: 5s
      timeout: 5s
      retries: 10
    restart: always

  backend:
    build: ./backend
    container_name: sica_bonos_backend
    depends_on:
      db:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://sica:${DB_PASSWORD}@db:5432/sica_bonos
      JWT_SECRET: ${JWT_SECRET}
    restart: always

  frontend:
    build: ./frontend
    container_name: sica_bonos_frontend
    ports:
      - "3000:80"
    depends_on:
      - backend
    restart: always
```

- [ ] **Step 4: Crear `db/init.sql` vacío como placeholder momentáneo**

```sql
-- Se completa en Task 2
```

- [ ] **Step 5: Verificar que Compose parsea el archivo**

Run: `docker compose config --quiet`
Expected: sin salida ni error (exit code 0). Si falla por `${DB_PASSWORD}` no definida, crear un `.env` local de prueba con `cp .env.example .env` antes de correr el comando (no commitear `.env`).

- [ ] **Step 6: Ignorar archivos sensibles y de datos**

Crear `.gitignore` en la raíz:

```
.env
data/
node_modules/
```

- [ ] **Step 7: Commit**

```bash
git add docker-compose.yml .env.example .gitignore db/init.sql backend/.gitkeep frontend/public/.gitkeep
git commit -m "chore: scaffold docker compose structure for fullstack migration"
```

### Task 2: Esquema SQL (`db/init.sql`)

**Files:**
- Modify: `db/init.sql`

**Interfaces:**
- Produces: todas las tablas del modelo de datos, usadas por todas las rutas backend de las tareas siguientes.

- [ ] **Step 1: Escribir el esquema completo**

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name VARCHAR(150) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin','supervisor','produccion','syh')),
  evaluador_nombre VARCHAR(150) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE personal (
  id SERIAL PRIMARY KEY,
  legajo VARCHAR(20) UNIQUE NOT NULL,
  nombre VARCHAR(200) NOT NULL,
  sector VARCHAR(100) NOT NULL DEFAULT '',
  puesto VARCHAR(100) NOT NULL DEFAULT '',
  evaluador VARCHAR(150) NOT NULL DEFAULT '—',
  tipo VARCHAR(20) NOT NULL DEFAULT 'Jornalizado' CHECK (tipo IN ('Jornalizado','Mensual')),
  spm BOOLEAN NOT NULL DEFAULT true,
  estado VARCHAR(10) NOT NULL DEFAULT 'Activo' CHECK (estado IN ('Activo','Baja')),
  acceso VARCHAR(20) NOT NULL DEFAULT '—',
  sueldo_base NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE config (
  id SMALLINT PRIMARY KEY DEFAULT 1,
  mes VARCHAR(7) NOT NULL,
  horas_normales INT NOT NULL DEFAULT 0,
  descuento INT NOT NULL DEFAULT 0,
  bono_base_pct NUMERIC(5,2) NOT NULL DEFAULT 15,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT config_single_row CHECK (id = 1)
);

CREATE TABLE criterios (
  id SERIAL PRIMARY KEY,
  grupo VARCHAR(10) NOT NULL CHECK (grupo IN ('pred','sh')),
  criterio_id VARCHAR(20) NOT NULL,
  label VARCHAR(150) NOT NULL,
  descripcion TEXT NOT NULL DEFAULT '',
  orden INT NOT NULL DEFAULT 0,
  UNIQUE(grupo, criterio_id)
);

CREATE TABLE criterio_rubricas (
  id SERIAL PRIMARY KEY,
  criterio_id_ref INT NOT NULL REFERENCES criterios(id) ON DELETE CASCADE,
  nivel INT NOT NULL,
  texto TEXT NOT NULL DEFAULT '',
  UNIQUE(criterio_id_ref, nivel)
);

CREATE TABLE factores (
  id SERIAL PRIMARY KEY,
  factor_key VARCHAR(10) UNIQUE NOT NULL CHECK (factor_key IN ('hs','pred','sh')),
  icono VARCHAR(10) NOT NULL DEFAULT '',
  label VARCHAR(100) NOT NULL,
  peso INT NOT NULL DEFAULT 0
);

CREATE TABLE niveles (
  id SERIAL PRIMARY KEY,
  numero INT UNIQUE NOT NULL,
  label VARCHAR(50) NOT NULL,
  porcentaje INT NOT NULL
);

CREATE TABLE calendario_reglas (
  id SMALLINT PRIMARY KEY DEFAULT 1,
  lun_jue NUMERIC(4,1) NOT NULL DEFAULT 9,
  vie NUMERIC(4,1) NOT NULL DEFAULT 8,
  sab NUMERIC(4,1) NOT NULL DEFAULT 0,
  dom NUMERIC(4,1) NOT NULL DEFAULT 0,
  descanso NUMERIC(4,1) NOT NULL DEFAULT 1,
  CONSTRAINT calendario_reglas_single_row CHECK (id = 1)
);

CREATE TABLE calendario_feriados (
  id SERIAL PRIMARY KEY,
  fecha DATE UNIQUE NOT NULL,
  nombre VARCHAR(150) NOT NULL
);

CREATE TABLE calendario_dias_especiales (
  id SERIAL PRIMARY KEY,
  fecha DATE UNIQUE NOT NULL,
  horas_brutas NUMERIC(4,1) NOT NULL DEFAULT 0,
  descuento NUMERIC(4,1) NOT NULL DEFAULT 0,
  nombre VARCHAR(150) NOT NULL DEFAULT ''
);

CREATE TABLE evaluaciones (
  id SERIAL PRIMARY KEY,
  legajo VARCHAR(20) NOT NULL REFERENCES personal(legajo) ON DELETE CASCADE,
  mes VARCHAR(7) NOT NULL,
  vac_horas NUMERIC(6,2) NOT NULL DEFAULT 0,
  horas_reales NUMERIC(6,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(legajo, mes)
);

CREATE TABLE evaluaciones_criterios (
  id SERIAL PRIMARY KEY,
  evaluacion_id INT NOT NULL REFERENCES evaluaciones(id) ON DELETE CASCADE,
  grupo VARCHAR(10) NOT NULL CHECK (grupo IN ('pred','sh')),
  criterio_id VARCHAR(20) NOT NULL,
  nivel INT,
  UNIQUE(evaluacion_id, grupo, criterio_id)
);

CREATE TABLE evaluaciones_comentarios (
  id SERIAL PRIMARY KEY,
  evaluacion_id INT NOT NULL REFERENCES evaluaciones(id) ON DELETE CASCADE,
  grupo VARCHAR(10) NOT NULL CHECK (grupo IN ('pred','sh')),
  texto TEXT NOT NULL DEFAULT '',
  UNIQUE(evaluacion_id, grupo)
);

CREATE TABLE evaluaciones_finalizadas (
  id SERIAL PRIMARY KEY,
  mes VARCHAR(7) NOT NULL,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  finalizado_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(mes, user_id)
);

CREATE TABLE historial (
  id SERIAL PRIMARY KEY,
  mes VARCHAR(7) UNIQUE NOT NULL,
  datos JSONB NOT NULL,
  cerrado_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- [ ] **Step 2: Levantar solo `db` y verificar que las migraciones corren**

```bash
cp .env.example .env
docker compose up -d db
docker compose logs db --tail 30
```
Expected: logs muestran `database system is ready to accept connections` y ningún error de sintaxis SQL.

- [ ] **Step 3: Verificar las tablas creadas**

```bash
docker compose exec db psql -U sica -d sica_bonos -c "\dt"
```
Expected: lista con las 15 tablas (`users, personal, config, criterios, criterio_rubricas, factores, niveles, calendario_reglas, calendario_feriados, calendario_dias_especiales, evaluaciones, evaluaciones_criterios, evaluaciones_comentarios, evaluaciones_finalizadas, historial`).

Nota: si `init.sql` se edita después de la primera vez que Postgres crea el volumen en `./data/postgres`, no se re-ejecuta automáticamente (Postgres solo corre `docker-entrypoint-initdb.d` en un data dir vacío). Durante desarrollo de este plan, si se necesita reaplicar el esquema: `docker compose down && rm -rf data/postgres && docker compose up -d db`.

- [ ] **Step 4: Commit**

```bash
git add db/init.sql
git commit -m "feat: add postgres schema for bono de produccion"
```

### Task 3: Backend scaffold — `package.json`, `server.js`, `db.js`, `Dockerfile`

**Files:**
- Create: `backend/package.json`
- Create: `backend/Dockerfile`
- Create: `backend/src/db.js`
- Create: `backend/src/server.js`
- Test: `backend/test/health.test.js`

**Interfaces:**
- Produces: `require('../src/db').pool` (instancia `pg.Pool`), `require('../src/server')` (app Express exportada, sin `listen` en modo test) — usados por TODOS los tests de tareas siguientes.

- [ ] **Step 1: Crear `backend/package.json`**

```json
{
  "name": "bono-produccion-backend",
  "version": "1.0.0",
  "private": true,
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js",
    "seed": "node seed.js",
    "test": "jest --runInBand"
  },
  "dependencies": {
    "express": "^4.19.2",
    "pg": "^8.12.0",
    "bcryptjs": "^2.4.3",
    "jsonwebtoken": "^9.0.2",
    "cookie-parser": "^1.4.6",
    "dotenv": "^16.4.5"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "supertest": "^7.0.0"
  }
}
```

- [ ] **Step 2: Crear `backend/src/db.js`**

```js
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

module.exports = { pool };
```

- [ ] **Step 3: Crear `backend/src/server.js` (sin rutas todavía, solo salud)**

```js
require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');

const app = express();
app.use(express.json());
app.use(cookieParser());

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Error interno' });
});

const PORT = process.env.PORT || 3001;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Backend escuchando en :${PORT}`));
}

module.exports = app;
```

- [ ] **Step 4: Escribir el test de salud**

```js
// backend/test/health.test.js
const request = require('supertest');
const app = require('../src/server');

test('GET /api/health responde ok', async () => {
  const res = await request(app).get('/api/health');
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ ok: true });
});
```

- [ ] **Step 5: Crear `backend/Dockerfile`**

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3001
CMD ["node", "src/server.js"]
```

- [ ] **Step 6: Instalar dependencias localmente y correr el test**

```bash
cd backend && npm install
npm test
cd ..
```
Expected: `PASS test/health.test.js`.

- [ ] **Step 7: Levantar backend con Docker Compose y probar el endpoint real**

```bash
docker compose up -d --build db backend
docker compose logs backend --tail 30
```
Expected: log `Backend escuchando en :3001`, sin errores de conexión a DB (no hace falta usarla todavía).

```bash
docker compose exec backend node -e "fetch('http://localhost:3001/api/health').then(r=>r.json()).then(console.log)"
```
Expected: `{ ok: true }`.

- [ ] **Step 8: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/Dockerfile backend/src/db.js backend/src/server.js backend/test/health.test.js
git commit -m "feat: scaffold express backend with health check"
```

### Task 4: Módulo de cálculo puro — `calendar.js` + `calc.js`

Esta es la lógica central del sistema (spec, sección "Lógica de cálculo"), portada literal desde `Bono_Produccion_v22.html:471-491` (calcRow) y `:473-484` (calendario). Son funciones puras (sin DB, sin Express) para poder testearlas exhaustivamente sin infraestructura.

**Files:**
- Create: `backend/src/lib/calendar.js`
- Create: `backend/src/lib/calc.js`
- Test: `backend/test/calendar.test.js`
- Test: `backend/test/calc.test.js`

**Interfaces:**
- Produces: `calendar.daysOfMonth(mes)`, `calendar.dayInfo(iso,dow,reglas,feriados,dias)`, `calendar.calTotals(mes,reglas,feriados,dias)`, `calendar.DOW_ES`; `calc.nf(niveles,n)`, `calc.avgCrit(niveles,valores,criterioIds)`, `calc.calcRow(input)` — usados por las rutas `evaluaciones`, `resultados` y `historial` (Tasks 11-13).

- [ ] **Step 1: Escribir tests de `calendar.js`**

```js
// backend/test/calendar.test.js
const { daysOfMonth, dayInfo, calTotals } = require('../src/lib/calendar');

test('daysOfMonth devuelve un objeto por dia del mes con dia de la semana', () => {
  const days = daysOfMonth('2026-02');
  expect(days).toHaveLength(28);
  expect(days[0]).toEqual({ d: 1, iso: '2026-02-01', dow: 0 }); // domingo
});

test('dayInfo: dia habil lunes a jueves usa reglas.lun_jue y descuenta descanso', () => {
  const reglas = { lun_jue: 9, vie: 8, sab: 0, dom: 0, descanso: 1 };
  const info = dayInfo('2026-02-03', 2, reglas, {}, {}); // martes
  expect(info).toEqual({ brutas: 9, desc: 1, netas: 8, tipo: 'Habil', nombre: '' });
});

test('dayInfo: fin de semana sin horas queda No laboral si brutas=0', () => {
  const reglas = { lun_jue: 9, vie: 8, sab: 0, dom: 0, descanso: 1 };
  const info = dayInfo('2026-02-01', 0, reglas, {}, {}); // domingo
  expect(info).toEqual({ brutas: 0, desc: 0, netas: 0, tipo: 'Fin de semana', nombre: '' });
});

test('dayInfo: feriado cuenta 0 horas sin importar la regla del dia', () => {
  const reglas = { lun_jue: 9, vie: 8, sab: 0, dom: 0, descanso: 1 };
  const info = dayInfo('2026-05-01', 5, reglas, { '2026-05-01': 'Dia del Trabajador' }, {});
  expect(info).toEqual({ brutas: 0, desc: 0, netas: 0, tipo: 'Feriado', nombre: 'Dia del Trabajador' });
});

test('dayInfo: override de dia especial gana sobre regla y feriado', () => {
  const reglas = { lun_jue: 9, vie: 8, sab: 0, dom: 0, descanso: 1 };
  const dias = { '2026-02-03': { horas_brutas: 4, descuento: 0, nombre: 'Media jornada' } };
  const info = dayInfo('2026-02-03', 2, reglas, {}, dias);
  expect(info).toEqual({ brutas: 4, desc: 0, netas: 4, tipo: 'Especial', nombre: 'Media jornada' });
});

test('calTotals suma brutas, desc, netas y dias trabajados del mes', () => {
  const reglas = { lun_jue: 9, vie: 8, sab: 0, dom: 0, descanso: 1 };
  const totals = calTotals('2026-02', reglas, {}, {});
  expect(totals.dias).toBe(20);
  expect(totals.netas).toBe(156);
  expect(totals.brutas).toBe(16 * 9 + 4 * 8);
  expect(totals.desc).toBe(20 * 1);
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan (modulo no existe)**

Run: `cd backend && npm test -- calendar.test.js`
Expected: `Cannot find module '../src/lib/calendar'`.

- [ ] **Step 3: Implementar `backend/src/lib/calendar.js`**

```js
const DOW_ES = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];

function daysOfMonth(mes) {
  const [y, m] = mes.split('-').map(Number);
  const n = new Date(y, m, 0).getDate();
  const arr = [];
  for (let d = 1; d <= n; d++) {
    const iso = `${mes}-${String(d).padStart(2, '0')}`;
    arr.push({ d, iso, dow: new Date(y, m - 1, d).getDay() });
  }
  return arr;
}

function dayInfo(iso, dow, reglas, feriados, dias) {
  const ov = dias[iso];
  if (ov) {
    const brutas = Number(ov.horas_brutas) || 0;
    const desc = Number(ov.descuento) || 0;
    const netas = Math.max(brutas - desc, 0);
    return { brutas, desc, netas, tipo: 'Especial', nombre: ov.nombre || '' };
  }
  if (feriados[iso]) {
    return { brutas: 0, desc: 0, netas: 0, tipo: 'Feriado', nombre: feriados[iso] };
  }
  let brutas = dow === 0 ? reglas.dom : dow === 6 ? reglas.sab : dow === 5 ? reglas.vie : reglas.lun_jue;
  brutas = Number(brutas) || 0;
  const desc = brutas > 0 ? (Number(reglas.descanso) || 0) : 0;
  const netas = Math.max(brutas - desc, 0);
  const tipo = (dow === 0 || dow === 6) ? 'Fin de semana' : (brutas > 0 ? 'Habil' : 'No laboral');
  return { brutas, desc, netas, tipo, nombre: '' };
}

function calTotals(mes, reglas, feriados, dias) {
  let brutas = 0, desc = 0, netas = 0, diasCount = 0;
  daysOfMonth(mes).forEach(({ iso, dow }) => {
    const i = dayInfo(iso, dow, reglas, feriados, dias);
    brutas += i.brutas;
    desc += i.desc;
    netas += i.netas;
    if (i.netas > 0) diasCount++;
  });
  return { brutas, desc, netas, dias: diasCount };
}

module.exports = { DOW_ES, daysOfMonth, dayInfo, calTotals };
```

Nota: los valores de `tipo` se llevan sin tildes (`Habil` en vez de `Hábil`) para evitar problemas de codificación entre este documento y la terminal; al implementar en el repo real, usar las tildes correctas tal como aparecen en el HTML original (`Hábil`, `Día del Trabajador`, etc.) y ajustar los tests para que coincidan carácter por carácter.

- [ ] **Step 4: Correr los tests de calendario y verificar que pasan**

Run: `npm test -- calendar.test.js`
Expected: 6 tests en PASS.

- [ ] **Step 5: Escribir tests de `calc.js`**

```js
// backend/test/calc.test.js
const { nf, avgCrit, calcRow } = require('../src/lib/calc');

const NIVELES = [
  { numero: 1, porcentaje: 0 },
  { numero: 2, porcentaje: 50 },
  { numero: 3, porcentaje: 100 },
  { numero: 4, porcentaje: 125 },
];

test('nf convierte nivel a fraccion segun la escala de niveles', () => {
  expect(nf(NIVELES, 3)).toBe(1);
  expect(nf(NIVELES, 2)).toBe(0.5);
  expect(nf(NIVELES, 99)).toBe(0); // nivel inexistente
});

test('avgCrit promedia los niveles cargados de una lista de criterios', () => {
  const valores = { p1: 3, p2: 2, p3: 4 };
  const avg = avgCrit(NIVELES, valores, ['p1', 'p2', 'p3']);
  expect(avg).toBeCloseTo((1 + 0.5 + 1.25) / 3);
});

test('avgCrit devuelve 0 si no hay criterios en la lista', () => {
  expect(avgCrit(NIVELES, {}, [])).toBe(0);
});

test('avgCrit trata un criterio sin cargar como nivel 0 por ciento', () => {
  const avg = avgCrit(NIVELES, { p1: 3 }, ['p1', 'p2']);
  expect(avg).toBeCloseTo((1 + 0) / 2);
});

test('calcRow: sin horas reales cargadas, resultado e incentivo son 0', () => {
  const r = calcRow({
    hsBaseNetas: 156, vac: 0, real: 0,
    predValores: {}, shValores: {}, predIds: ['p1'], shIds: ['s1'],
    niveles: NIVELES, base: 15, pesoHs: 25, pesoPred: 50, pesoSh: 25, sueldoBase: 1000000,
  });
  expect(r).toEqual({ hsEsp: 156, real: 0, fHs: 0, fPr: 0, fSh: 0, res: 0, inc: 0 });
});

test('calcRow: caso completo con horas, predisposicion y S&H en nivel Esperado da el bono base completo', () => {
  const r = calcRow({
    hsBaseNetas: 156, vac: 0, real: 156,
    predValores: { p1: 3, p2: 3, p3: 3 }, shValores: { s1: 3, s2: 3, s3: 3 },
    predIds: ['p1', 'p2', 'p3'], shIds: ['s1', 's2', 's3'],
    niveles: NIVELES, base: 15, pesoHs: 25, pesoPred: 50, pesoSh: 25, sueldoBase: 1000000,
  });
  expect(r.fHs).toBeCloseTo(1);
  expect(r.fPr).toBeCloseTo(1);
  expect(r.fSh).toBeCloseTo(1);
  expect(r.res).toBeCloseTo(0.15);
  expect(r.inc).toBeCloseTo(150000);
});

test('calcRow: horas reales tope al 125 por ciento del factor horas', () => {
  const r = calcRow({
    hsBaseNetas: 100, vac: 0, real: 500,
    predValores: {}, shValores: {}, predIds: [], shIds: [],
    niveles: NIVELES, base: 15, pesoHs: 100, pesoPred: 0, pesoSh: 0, sueldoBase: 0,
  });
  expect(r.fHs).toBe(1.25);
});

test('calcRow: vacaciones reducen las horas esperadas sin bajar de 0', () => {
  const r = calcRow({
    hsBaseNetas: 50, vac: 80, real: 10,
    predValores: {}, shValores: {}, predIds: [], shIds: [],
    niveles: NIVELES, base: 15, pesoHs: 25, pesoPred: 0, pesoSh: 0, sueldoBase: 0,
  });
  expect(r.hsEsp).toBe(0);
  expect(r.fHs).toBe(0);
});
```

- [ ] **Step 6: Correr y verificar que fallan (modulo no existe)**

Run: `npm test -- calc.test.js`
Expected: `Cannot find module '../src/lib/calc'`.

- [ ] **Step 7: Implementar `backend/src/lib/calc.js`**

```js
function nf(niveles, n) {
  const lv = niveles.find(x => x.numero === Number(n));
  return lv ? (Number(lv.porcentaje) || 0) / 100 : 0;
}

function avgCrit(niveles, valores, criterioIds) {
  if (!criterioIds.length) return 0;
  let s = 0;
  criterioIds.forEach(id => { s += nf(niveles, valores[id]); });
  return s / criterioIds.length;
}

function calcRow(input) {
  const { hsBaseNetas, vac, real, predValores, shValores, predIds, shIds, niveles, base, pesoHs, pesoPred, pesoSh, sueldoBase } = input;
  const hsEsp = Math.max((Number(hsBaseNetas) || 0) - (Number(vac) || 0), 0);
  const realN = Number(real) || 0;
  const fHs = hsEsp > 0 ? Math.min(realN / hsEsp, 1.25) : 0;
  const fPr = avgCrit(niveles, predValores || {}, predIds || []);
  const fSh = avgCrit(niveles, shValores || {}, shIds || []);
  const baseFrac = (Number(base) || 0) / 100;
  const wHs = (Number(pesoHs) || 0) / 100;
  const wPr = (Number(pesoPred) || 0) / 100;
  const wSh = (Number(pesoSh) || 0) / 100;
  const res = realN > 0 ? baseFrac * (wHs * fHs + wPr * fPr + wSh * fSh) : 0;
  const inc = (Number(sueldoBase) || 0) * res;
  return { hsEsp, real: realN, fHs, fPr, fSh, res, inc };
}

module.exports = { nf, avgCrit, calcRow };
```

- [ ] **Step 8: Correr todos los tests del backend**

Run: `npm test`
Expected: los suites `health`, `calendar`, `calc` en PASS, 0 failures.

- [ ] **Step 9: Commit**

```bash
git add backend/src/lib/calendar.js backend/src/lib/calc.js backend/test/calendar.test.js backend/test/calc.test.js
git commit -m "feat: port calcRow and calendar logic to pure backend modules"
```

### Task 5: Autenticacion — bcrypt + JWT en cookie httpOnly

**Files:**
- Create: `backend/src/middleware/auth.js`
- Create: `backend/src/routes/auth.js`
- Modify: `backend/src/server.js` (montar router de auth)
- Create: `backend/test/dbHelpers.js`
- Test: `backend/test/auth.test.js`

**Interfaces:**
- Consumes: `pool` de `../src/db`, tabla `users` de Task 2.
- Produces: middleware `requireAuth(req,res,next)` (llena `req.user = {id,username,name,role,evaluador_nombre}`), `requireRole(...roles)` — usados por TODAS las rutas de las tareas 6-13. Cookie `token` httpOnly, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`.

- [ ] **Step 1: Agregar dependencias de bcrypt/jwt (ya estan en package.json de Task 3), instalar**

```bash
cd backend && npm install
```

- [ ] **Step 2: Crear helper de reseteo de base para tests**

```js
// backend/test/dbHelpers.js
const { pool } = require('../src/db');

async function resetDb() {
  await pool.query(`TRUNCATE TABLE
    evaluaciones_finalizadas, evaluaciones_comentarios, evaluaciones_criterios, evaluaciones,
    historial, calendario_dias_especiales, calendario_feriados, calendario_reglas,
    niveles, factores, criterio_rubricas, criterios, config, personal, users
    RESTART IDENTITY CASCADE`);
}

module.exports = { resetDb };
```

- [ ] **Step 3: Escribir `backend/test/auth.test.js`**

```js
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
```

- [ ] **Step 4: Correr los tests y verificar que fallan**

Run: `docker compose up -d db && docker compose run --rm -e DATABASE_URL="postgresql://sica:$(grep DB_PASSWORD .env | cut -d= -f2)@db:5432/sica_bonos" -e JWT_SECRET=test_secret backend npm test -- auth.test.js`
Expected: falla porque `../src/routes/auth` no existe todavia.

(A partir de aca, para simplificar, todas las corridas de test que necesitan Postgres real se hacen con este mismo patron: `docker compose up -d db` una vez, y luego `docker compose run --rm backend npm test` — Docker Compose ya inyecta `DATABASE_URL`/`JWT_SECRET` del `backend` service definidos en `docker-compose.yml`, tomados de `.env`.)

- [ ] **Step 5: Implementar `backend/src/middleware/auth.js`**

```js
const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies.token;
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Sesion invalida' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
```

- [ ] **Step 6: Implementar `backend/src/routes/auth.js`**

```js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const COOKIE_OPTS = { httpOnly: true, sameSite: 'lax', maxAge: 12 * 60 * 60 * 1000 };

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Usuario y contrasena requeridos' });
  const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'Usuario o contrasena incorrectos' });
  }
  const payload = { id: user.id, username: user.username, name: user.name, role: user.role, evaluador_nombre: user.evaluador_nombre };
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '12h' });
  res.cookie('token', token, COOKIE_OPTS);
  res.json({ user: payload });
});

router.post('/logout', (req, res) => {
  res.clearCookie('token', { httpOnly: true, sameSite: 'lax' });
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
```

- [ ] **Step 7: Montar el router en `backend/src/server.js`**

Reemplazar la linea `app.get('/api/health', ...)` agregando el montaje del router justo despues:

```js
const authRoutes = require('./routes/auth');
// ...
app.use('/api/auth', authRoutes);
```

- [ ] **Step 8: Correr los tests y verificar que pasan**

Run: `docker compose run --rm backend npm test`
Expected: suites `health`, `calendar`, `calc`, `auth` en PASS.

- [ ] **Step 9: Commit**

```bash
git add backend/src/middleware/auth.js backend/src/routes/auth.js backend/src/server.js backend/test/dbHelpers.js backend/test/auth.test.js
git commit -m "feat: add bcrypt+JWT auth with httpOnly cookie"
```

### Task 6: Ruta `/api/config`

**Files:**
- Create: `backend/src/routes/config.js`
- Modify: `backend/src/server.js` (montar router)
- Test: `backend/test/config.test.js`

**Interfaces:**
- Consumes: `requireAuth`, `requireRole` de Task 5; tabla `config` de Task 2.
- Produces: `GET /api/config` (cualquier usuario autenticado), `PUT /api/config` (solo admin) — body `{mes, horas_normales, descuento, bono_base_pct}`. Usado por el frontend en la seccion Configuracion y por las rutas de calculo para leer `bono_base_pct` y `mes` actual.

- [ ] **Step 1: Escribir `backend/test/config.test.js`**

```js
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
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `docker compose run --rm backend npm test -- config.test.js`
Expected: falla porque la ruta no existe.

- [ ] **Step 3: Implementar `backend/src/routes/config.js`**

```js
const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

function defMes() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

router.get('/', requireAuth, async (req, res) => {
  let { rows } = await pool.query('SELECT * FROM config WHERE id = 1');
  if (!rows[0]) {
    const insert = await pool.query(
      `INSERT INTO config (id, mes, horas_normales, descuento, bono_base_pct) VALUES (1,$1,0,0,15) RETURNING *`,
      [defMes()]
    );
    rows = insert.rows;
  }
  res.json(rows[0]);
});

router.put('/', requireAuth, requireRole('admin'), async (req, res) => {
  const { mes, horas_normales, descuento, bono_base_pct } = req.body || {};
  const { rows } = await pool.query(
    `INSERT INTO config (id, mes, horas_normales, descuento, bono_base_pct)
     VALUES (1,$1,$2,$3,$4)
     ON CONFLICT (id) DO UPDATE SET mes=$1, horas_normales=$2, descuento=$3, bono_base_pct=$4, updated_at=now()
     RETURNING *`,
    [mes, horas_normales || 0, descuento || 0, bono_base_pct || 0]
  );
  res.json(rows[0]);
});

module.exports = router;
```

- [ ] **Step 4: Montar en `backend/src/server.js`**

```js
const configRoutes = require('./routes/config');
// ...
app.use('/api/config', configRoutes);
```

- [ ] **Step 5: Correr los tests**

Run: `docker compose run --rm backend npm test -- config.test.js`
Expected: 4 tests en PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/config.js backend/src/server.js backend/test/config.test.js
git commit -m "feat: add config route"
```

### Task 7: Ruta `/api/personal` (CRUD, admin-only)

Ver decision de diseno #2: solo `admin` tiene esta ruta (coincide con `ROLES.admin.sees` siendo el unico rol con `personal` en el HTML original).

**Files:**
- Create: `backend/src/routes/personal.js`
- Modify: `backend/src/server.js`
- Test: `backend/test/personal.test.js`

**Interfaces:**
- Consumes: `requireAuth`, `requireRole` de Task 5.
- Produces: `GET /api/personal?sector=&evaluador=&estado=&spm=&q=`, `POST /api/personal`, `PUT /api/personal/:legajo`, `DELETE /api/personal/:legajo` — todas admin-only. Usado por Task 11 (evaluaciones) y Task 12 (resultados) via SQL directo (no HTTP interno), y por la seccion Personal del frontend (Task 17).

- [ ] **Step 1: Escribir `backend/test/personal.test.js`**

```js
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
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `docker compose run --rm backend npm test -- personal.test.js`
Expected: falla, la ruta no existe.

- [ ] **Step 3: Implementar `backend/src/routes/personal.js`**

```js
const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

router.get('/', async (req, res) => {
  const { sector, evaluador, estado, spm, q } = req.query;
  const clauses = [];
  const params = [];
  if (sector) { params.push(sector); clauses.push(`sector = $${params.length}`); }
  if (evaluador) { params.push(evaluador); clauses.push(`evaluador = $${params.length}`); }
  if (estado) { params.push(estado); clauses.push(`estado = $${params.length}`); }
  if (spm === '0' || spm === '1') { params.push(spm === '1'); clauses.push(`spm = $${params.length}`); }
  if (q) { params.push(`%${q.toLowerCase()}%`); clauses.push(`(LOWER(nombre) LIKE $${params.length} OR legajo LIKE $${params.length})`); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { rows } = await pool.query(`SELECT * FROM personal ${where} ORDER BY nombre`, params);
  res.json(rows);
});

router.post('/', async (req, res) => {
  const p = req.body || {};
  if (!p.legajo || !p.nombre) return res.status(400).json({ error: 'Legajo y nombre son obligatorios' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO personal (legajo, nombre, sector, puesto, evaluador, tipo, spm, estado, acceso, sueldo_base)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [p.legajo, p.nombre, p.sector || '', p.puesto || '', p.evaluador || '—', p.tipo || 'Jornalizado',
        !!p.spm, p.estado || 'Activo', p.acceso || '—', p.sueldo_base || 0]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ese legajo ya existe' });
    throw err;
  }
});

router.put('/:legajo', async (req, res) => {
  const p = req.body || {};
  const { rows } = await pool.query(
    `UPDATE personal SET nombre=$1, sector=$2, puesto=$3, evaluador=$4, tipo=$5, spm=$6, estado=$7, acceso=$8, sueldo_base=$9
     WHERE legajo=$10 RETURNING *`,
    [p.nombre, p.sector || '', p.puesto || '', p.evaluador || '—', p.tipo || 'Jornalizado',
      !!p.spm, p.estado || 'Activo', p.acceso || '—', p.sueldo_base || 0, req.params.legajo]
  );
  if (!rows[0]) return res.status(404).json({ error: 'No encontrado' });
  res.json(rows[0]);
});

router.delete('/:legajo', async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM personal WHERE legajo=$1', [req.params.legajo]);
  if (!rowCount) return res.status(404).json({ error: 'No encontrado' });
  res.status(204).end();
});

module.exports = router;
```

- [ ] **Step 4: Montar en `backend/src/server.js`**

```js
const personalRoutes = require('./routes/personal');
// ...
app.use('/api/personal', personalRoutes);
```

- [ ] **Step 5: Correr los tests**

Run: `docker compose run --rm backend npm test -- personal.test.js`
Expected: 11 tests en PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/personal.js backend/src/server.js backend/test/personal.test.js
git commit -m "feat: add personal CRUD route (admin only)"
```

### Task 8: Ruta `/api/users` (CRUD, admin-only)

**Files:**
- Create: `backend/src/routes/users.js`
- Modify: `backend/src/server.js`
- Test: `backend/test/users.test.js`

**Interfaces:**
- Consumes: `requireAuth`, `requireRole` de Task 5.
- Produces: `GET /api/users`, `POST /api/users`, `PUT /api/users/:id`, `DELETE /api/users/:id` — todas admin-only. Nunca devuelven `password_hash`. El usuario `admin` no puede eliminarse (igual que `delUser` en el HTML original).

- [ ] **Step 1: Escribir `backend/test/users.test.js`**

```js
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
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `docker compose run --rm backend npm test -- users.test.js`
Expected: falla, la ruta no existe.

- [ ] **Step 3: Implementar `backend/src/routes/users.js`**

```js
const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

const SAFE_COLUMNS = 'id, username, name, role, evaluador_nombre, created_at';

router.get('/', async (req, res) => {
  const { rows } = await pool.query(`SELECT ${SAFE_COLUMNS} FROM users ORDER BY username`);
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { username, password, name, role, evaluador_nombre } = req.body || {};
  if (!username || !password || !name || !role) return res.status(400).json({ error: 'username, password, name y role son obligatorios' });
  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (username, password_hash, name, role, evaluador_nombre)
       VALUES ($1,$2,$3,$4,$5) RETURNING ${SAFE_COLUMNS}`,
      [username, hash, name, role, role === 'supervisor' ? (evaluador_nombre || '') : '']
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ese usuario ya existe' });
    throw err;
  }
});

router.put('/:id', async (req, res) => {
  const { name, role, evaluador_nombre, password } = req.body || {};
  const evNombre = role === 'supervisor' ? (evaluador_nombre || '') : '';
  if (password) {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `UPDATE users SET name=$1, role=$2, evaluador_nombre=$3, password_hash=$4 WHERE id=$5 RETURNING ${SAFE_COLUMNS}`,
      [name, role, evNombre, hash, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'No encontrado' });
    return res.json(rows[0]);
  }
  const { rows } = await pool.query(
    `UPDATE users SET name=$1, role=$2, evaluador_nombre=$3 WHERE id=$4 RETURNING ${SAFE_COLUMNS}`,
    [name, role, evNombre, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'No encontrado' });
  res.json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  const { rows } = await pool.query('SELECT username FROM users WHERE id=$1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'No encontrado' });
  if (rows[0].username === 'admin') return res.status(400).json({ error: 'No se puede eliminar el usuario admin' });
  await pool.query('DELETE FROM users WHERE id=$1', [req.params.id]);
  res.status(204).end();
});

module.exports = router;
```

- [ ] **Step 4: Montar en `backend/src/server.js`**

```js
const usersRoutes = require('./routes/users');
// ...
app.use('/api/users', usersRoutes);
```

- [ ] **Step 5: Correr los tests**

Run: `docker compose run --rm backend npm test -- users.test.js`
Expected: 8 tests en PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/users.js backend/src/server.js backend/test/users.test.js
git commit -m "feat: add users CRUD route (admin only)"
```

### Task 9: Rutas `/api/criterios`, `/api/factores`, `/api/niveles`

Estos tres recursos son configuracion global chica (pocas filas) que en el HTML se guardaba/leia como un solo blob (`crit.pred`, `crit.sh`, `crit.factores`, `crit.niveles`). Lectura para cualquier rol autenticado (los usa el panel guia de Evaluaciones); escritura solo admin.

**Files:**
- Create: `backend/src/routes/criterios.js`
- Create: `backend/src/routes/factores.js`
- Create: `backend/src/routes/niveles.js`
- Modify: `backend/src/server.js`
- Test: `backend/test/criterios.test.js`
- Test: `backend/test/factores.test.js`
- Test: `backend/test/niveles.test.js`

**Interfaces:**
- Produces:
  - `GET /api/criterios` -> `{ pred: [{id,label,descripcion,orden,rubricas:{nivel:texto}}], sh: [...] }`
  - `PUT /api/criterios` (admin) -> reemplaza completo el contenido de `pred` y `sh` (borra e inserta en transaccion), devuelve el mismo shape que GET.
  - `GET /api/factores` -> `[{factor_key,icono,label,peso}]`
  - `PUT /api/factores` (admin) -> body `[{factor_key,icono,label,peso}]`, actualiza cada fila por `factor_key`.
  - `GET /api/niveles` -> `[{numero,label,porcentaje}]` ordenado por `numero`.
  - `PUT /api/niveles` (admin) -> reemplaza completo (borra e inserta), body `[{numero,label,porcentaje}]`.
- Consumidos por Task 11/12 (motor de calculo necesita `niveles`, `factores`, `criterios` con sus ids para armar `predIds`/`shIds`).

- [ ] **Step 1: Escribir `backend/test/criterios.test.js`**

```js
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
```

- [ ] **Step 2: Escribir `backend/test/factores.test.js`**

```js
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
```

- [ ] **Step 3: Escribir `backend/test/niveles.test.js`**

```js
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
```

- [ ] **Step 4: Correr y verificar que fallan**

Run: `docker compose run --rm backend npm test -- criterios.test.js factores.test.js niveles.test.js`
Expected: fallan, las rutas no existen.

- [ ] **Step 5: Implementar `backend/src/routes/criterios.js`**

```js
const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

async function loadGrupo(grupo) {
  const { rows: crits } = await pool.query('SELECT * FROM criterios WHERE grupo=$1 ORDER BY orden', [grupo]);
  const out = [];
  for (const c of crits) {
    const { rows: rub } = await pool.query('SELECT nivel, texto FROM criterio_rubricas WHERE criterio_id_ref=$1', [c.id]);
    const rubricas = {};
    rub.forEach(r => { rubricas[r.nivel] = r.texto; });
    out.push({ id: c.criterio_id, label: c.label, descripcion: c.descripcion, orden: c.orden, rubricas });
  }
  return out;
}

router.get('/', requireAuth, async (req, res) => {
  res.json({ pred: await loadGrupo('pred'), sh: await loadGrupo('sh') });
});

router.put('/', requireAuth, requireRole('admin'), async (req, res) => {
  const { pred = [], sh = [] } = req.body || {};
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM criterios');
    for (const grupo of ['pred', 'sh']) {
      const list = grupo === 'pred' ? pred : sh;
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        const { rows } = await client.query(
          `INSERT INTO criterios (grupo, criterio_id, label, descripcion, orden) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
          [grupo, c.id, c.label, c.descripcion || '', i]
        );
        const critId = rows[0].id;
        for (const [nivel, texto] of Object.entries(c.rubricas || {})) {
          await client.query(
            `INSERT INTO criterio_rubricas (criterio_id_ref, nivel, texto) VALUES ($1,$2,$3)`,
            [critId, Number(nivel), texto]
          );
        }
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  res.json({ pred: await loadGrupo('pred'), sh: await loadGrupo('sh') });
});

module.exports = router;
```

- [ ] **Step 6: Implementar `backend/src/routes/factores.js`**

```js
const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT factor_key, icono, label, peso FROM factores ORDER BY factor_key');
  res.json(rows);
});

router.put('/', requireAuth, requireRole('admin'), async (req, res) => {
  const list = Array.isArray(req.body) ? req.body : [];
  for (const f of list) {
    await pool.query(
      `INSERT INTO factores (factor_key, icono, label, peso) VALUES ($1,$2,$3,$4)
       ON CONFLICT (factor_key) DO UPDATE SET icono=$2, label=$3, peso=$4`,
      [f.factor_key, f.icono || '', f.label, f.peso || 0]
    );
  }
  const { rows } = await pool.query('SELECT factor_key, icono, label, peso FROM factores ORDER BY factor_key');
  res.json(rows);
});

module.exports = router;
```

- [ ] **Step 7: Implementar `backend/src/routes/niveles.js`**

```js
const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT numero, label, porcentaje FROM niveles ORDER BY numero');
  res.json(rows);
});

router.put('/', requireAuth, requireRole('admin'), async (req, res) => {
  const list = Array.isArray(req.body) ? req.body : [];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM niveles');
    for (const n of list) {
      await client.query('INSERT INTO niveles (numero, label, porcentaje) VALUES ($1,$2,$3)', [n.numero, n.label, n.porcentaje]);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  const { rows } = await pool.query('SELECT numero, label, porcentaje FROM niveles ORDER BY numero');
  res.json(rows);
});

module.exports = router;
```

- [ ] **Step 8: Montar las tres rutas en `backend/src/server.js`**

```js
const criteriosRoutes = require('./routes/criterios');
const factoresRoutes = require('./routes/factores');
const nivelesRoutes = require('./routes/niveles');
// ...
app.use('/api/criterios', criteriosRoutes);
app.use('/api/factores', factoresRoutes);
app.use('/api/niveles', nivelesRoutes);
```

- [ ] **Step 9: Correr los tests**

Run: `docker compose run --rm backend npm test -- criterios.test.js factores.test.js niveles.test.js`
Expected: todos en PASS.

- [ ] **Step 10: Commit**

```bash
git add backend/src/routes/criterios.js backend/src/routes/factores.js backend/src/routes/niveles.js backend/src/server.js backend/test/criterios.test.js backend/test/factores.test.js backend/test/niveles.test.js
git commit -m "feat: add criterios, factores and niveles routes"
```

### Task 10: Rutas `/api/calendario`

Acceso: lectura y escritura reservadas a los roles que ven `cal` en el HTML (`admin`, `produccion`).

**Files:**
- Create: `backend/src/routes/calendario.js`
- Modify: `backend/src/server.js`
- Test: `backend/test/calendario.test.js`

**Interfaces:**
- Consumes: `calendar.calTotals`/`dayInfo` de Task 4.
- Produces:
  - `GET /api/calendario/:mes` -> `{ reglas:{lun_jue,vie,sab,dom,descanso}, feriados:{iso:nombre}, dias:{iso:{horas_brutas,descuento,nombre}}, totals:{brutas,desc,netas,dias} }`
  - `PUT /api/calendario/reglas` -> body `{lun_jue,vie,sab,dom,descanso}`
  - `PUT /api/calendario/feriados` -> body `{fecha, nombre}` upsert; body `{fecha, nombre: null}` elimina el feriado de esa fecha.
  - `PUT /api/calendario/dia/:fecha` -> body `{horas_brutas,descuento,nombre}` upsert; body `{clear:true}` elimina el override (vuelve a la regla general).
- Usado por Task 11/12 (via SQL directo, no HTTP) para calcular `hsBase(mes)`.

- [ ] **Step 1: Escribir `backend/test/calendario.test.js`**

```js
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

test('GET /api/calendario/:mes devuelve reglas por defecto y totales calculados', async () => {
  const agent = await loginAs('admin');
  const res = await agent.get('/api/calendario/2026-02');
  expect(res.status).toBe(200);
  expect(res.body.reglas).toEqual({ lun_jue: '9.0', vie: '8.0', sab: '0.0', dom: '0.0', descanso: '1.0' });
  expect(res.body.totals.dias).toBe(20);
});

test('GET /api/calendario/:mes devuelve 403 para un rol sin acceso al calendario', async () => {
  const agent = await loginAs('syh');
  const res = await agent.get('/api/calendario/2026-02');
  expect(res.status).toBe(403);
});

test('PUT /api/calendario/reglas actualiza las reglas y afecta los totales del mes', async () => {
  const agent = await loginAs('produccion');
  await agent.put('/api/calendario/reglas').send({ lun_jue: 8, vie: 6, sab: 0, dom: 0, descanso: 0.5 });
  const res = await agent.get('/api/calendario/2026-02');
  expect(res.body.reglas.lun_jue).toBe('8.0');
  expect(res.body.totals.netas).toBe(16 * 7.5 + 4 * 5.5);
});

test('PUT /api/calendario/feriados agrega un feriado y GET lo refleja con 0 horas ese dia', async () => {
  const agent = await loginAs('admin');
  await agent.put('/api/calendario/feriados').send({ fecha: '2026-02-03', nombre: 'Paro' }); // era martes habil
  const res = await agent.get('/api/calendario/2026-02');
  expect(res.body.feriados['2026-02-03']).toBe('Paro');
  expect(res.body.totals.dias).toBe(19);
});

test('PUT /api/calendario/feriados con nombre null elimina el feriado', async () => {
  const agent = await loginAs('admin');
  await agent.put('/api/calendario/feriados').send({ fecha: '2026-02-03', nombre: 'Paro' });
  await agent.put('/api/calendario/feriados').send({ fecha: '2026-02-03', nombre: null });
  const res = await agent.get('/api/calendario/2026-02');
  expect(res.body.feriados['2026-02-03']).toBeUndefined();
});

test('PUT /api/calendario/dia/:fecha sobreescribe un dia puntual', async () => {
  const agent = await loginAs('admin');
  await agent.put('/api/calendario/dia/2026-02-03').send({ horas_brutas: 4, descuento: 0, nombre: 'Media jornada' });
  const res = await agent.get('/api/calendario/2026-02');
  expect(res.body.dias['2026-02-03']).toEqual({ horas_brutas: '4.0', descuento: '0.0', nombre: 'Media jornada' });
});

test('PUT /api/calendario/dia/:fecha con clear:true vuelve a la regla general', async () => {
  const agent = await loginAs('admin');
  await agent.put('/api/calendario/dia/2026-02-03').send({ horas_brutas: 4, descuento: 0, nombre: 'Media jornada' });
  await agent.put('/api/calendario/dia/2026-02-03').send({ clear: true });
  const res = await agent.get('/api/calendario/2026-02');
  expect(res.body.dias['2026-02-03']).toBeUndefined();
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `docker compose run --rm backend npm test -- calendario.test.js`
Expected: falla, la ruta no existe.

- [ ] **Step 3: Implementar `backend/src/routes/calendario.js`**

```js
const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { calTotals } = require('../lib/calendar');

const router = express.Router();
router.use(requireAuth, requireRole('admin', 'produccion'));

async function loadReglas() {
  const { rows } = await pool.query('SELECT lun_jue, vie, sab, dom, descanso FROM calendario_reglas WHERE id=1');
  if (rows[0]) return rows[0];
  const insert = await pool.query(
    `INSERT INTO calendario_reglas (id, lun_jue, vie, sab, dom, descanso) VALUES (1,9,8,0,0,1) RETURNING lun_jue, vie, sab, dom, descanso`
  );
  return insert.rows[0];
}

async function loadFeriados() {
  const { rows } = await pool.query('SELECT fecha, nombre FROM calendario_feriados');
  const out = {};
  rows.forEach(r => { out[r.fecha.toISOString().slice(0, 10)] = r.nombre; });
  return out;
}

async function loadDias() {
  const { rows } = await pool.query('SELECT fecha, horas_brutas, descuento, nombre FROM calendario_dias_especiales');
  const out = {};
  rows.forEach(r => { out[r.fecha.toISOString().slice(0, 10)] = { horas_brutas: r.horas_brutas, descuento: r.descuento, nombre: r.nombre }; });
  return out;
}

router.get('/:mes', async (req, res) => {
  const reglas = await loadReglas();
  const feriados = await loadFeriados();
  const dias = await loadDias();
  const totals = calTotals(req.params.mes, {
    lun_jue: Number(reglas.lun_jue), vie: Number(reglas.vie), sab: Number(reglas.sab),
    dom: Number(reglas.dom), descanso: Number(reglas.descanso),
  }, feriados, dias);
  res.json({ reglas, feriados, dias, totals });
});

router.put('/reglas', async (req, res) => {
  const { lun_jue, vie, sab, dom, descanso } = req.body || {};
  await pool.query(
    `INSERT INTO calendario_reglas (id, lun_jue, vie, sab, dom, descanso) VALUES (1,$1,$2,$3,$4,$5)
     ON CONFLICT (id) DO UPDATE SET lun_jue=$1, vie=$2, sab=$3, dom=$4, descanso=$5`,
    [lun_jue || 0, vie || 0, sab || 0, dom || 0, descanso || 0]
  );
  res.json(await loadReglas());
});

router.put('/feriados', async (req, res) => {
  const { fecha, nombre } = req.body || {};
  if (!fecha) return res.status(400).json({ error: 'fecha es obligatoria' });
  if (nombre === null || nombre === undefined || nombre === '') {
    await pool.query('DELETE FROM calendario_feriados WHERE fecha=$1', [fecha]);
  } else {
    await pool.query(
      `INSERT INTO calendario_feriados (fecha, nombre) VALUES ($1,$2)
       ON CONFLICT (fecha) DO UPDATE SET nombre=$2`,
      [fecha, nombre]
    );
  }
  res.json(await loadFeriados());
});

router.put('/dia/:fecha', async (req, res) => {
  const { fecha } = req.params;
  const { clear, horas_brutas, descuento, nombre } = req.body || {};
  if (clear) {
    await pool.query('DELETE FROM calendario_dias_especiales WHERE fecha=$1', [fecha]);
  } else {
    await pool.query(
      `INSERT INTO calendario_dias_especiales (fecha, horas_brutas, descuento, nombre) VALUES ($1,$2,$3,$4)
       ON CONFLICT (fecha) DO UPDATE SET horas_brutas=$2, descuento=$3, nombre=$4`,
      [fecha, horas_brutas || 0, descuento || 0, nombre || '']
    );
  }
  res.json(await loadDias());
});

module.exports = router;
```

- [ ] **Step 4: Montar en `backend/src/server.js`**

```js
const calendarioRoutes = require('./routes/calendario');
// ...
app.use('/api/calendario', calendarioRoutes);
```

- [ ] **Step 5: Correr los tests**

Run: `docker compose run --rm backend npm test -- calendario.test.js`
Expected: 7 tests en PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/calendario.js backend/src/server.js backend/test/calendario.test.js
git commit -m "feat: add calendario routes"
```

### Task 11: Rutas `/api/evaluaciones` (core de carga de datos y calculo en vivo)

Esta es la ruta mas grande del sistema: junta el alcance por rol (`evaluables()` del HTML, lineas 516-524), el guardado parcial por campo (`setE`/`setSub`/`setCom` del HTML) y el recalculo en vivo (`onHoras`/`onCritChange` del HTML) — pero corriendo del lado del servidor (decision de diseno #4).

Antes de escribir la ruta hace falta: (a) portar `sameEv` a un modulo compartido, y (b) extraer a repositorios reusables la carga de calendario y de criterios/factores/niveles que las Tasks 9 y 10 dejaron como funciones privadas dentro de sus archivos de ruta — este task las mueve a `backend/src/lib/` para que `evaluaciones.js` y `resultados.js` (Task 12) las puedan usar sin duplicar codigo ni hacer llamadas HTTP internas.

**Files:**
- Create: `backend/src/lib/access.js`
- Create: `backend/src/lib/calendarRepo.js`
- Create: `backend/src/lib/critRepo.js`
- Modify: `backend/src/routes/calendario.js` (usar `calendarRepo` en vez de sus funciones locales)
- Modify: `backend/src/routes/criterios.js` (usar `critRepo.loadGrupo` en vez de su copia local)
- Modify: `backend/src/routes/factores.js` (usar `critRepo.loadFactores` para el GET, sin cambiar el PUT)
- Modify: `backend/src/routes/niveles.js` (usar `critRepo.loadNiveles` para el GET, sin cambiar el PUT)
- Create: `backend/src/routes/evaluaciones.js`
- Modify: `backend/src/server.js`
- Test: `backend/test/evaluaciones.test.js`

**Interfaces:**
- Consumes: `calc.calcRow` de Task 4, `requireAuth`/`requireRole` de Task 5, tablas `personal`/`evaluaciones*`/`config` de Task 2.
- Produces: `access.sameEv(a,b)`; `calendarRepo.{loadReglas,loadFeriados,loadDias,hsBaseNetas}`; `critRepo.{loadGrupo,loadFactores,loadNiveles}`; rutas `GET /api/evaluaciones/:mes`, `GET /api/evaluaciones/:mes/estado-evaluadores`, `GET /api/evaluaciones/:mes/:legajo`, `PUT /api/evaluaciones/:mes/:legajo`, `POST /api/evaluaciones/:mes/finalizar` — usadas por Task 12 (resultados) y Task 13 (historial) para el alcance por rol, y por el frontend (Task 20). Tanto `GET` como `PUT` devuelven, ademas de `vac/real/pred/sh/com`, los campos ya calculados `hsEsp,fHs,fPr,fSh,res,inc` (via `computeWithContext`) — el frontend nunca vuelve a calcular esto localmente, ni siquiera para la pintura inicial de la grilla (decision de diseno #4).

- [ ] **Step 1: Crear `backend/src/lib/access.js` (portado de `Bono_Produccion_v22.html:516-524`)**

El original quita diacriticos con una regex sobre el rango Unicode de marcas de combinacion (ver `Bono_Produccion_v22.html:516`). Para evitar problemas de codificacion de caracteres, esta version usa un filtro por codigo de punto Unicode en vez de una regex literal; el comportamiento es identico:

```js
function stripDiacritics(str) {
  let out = '';
  for (const ch of str) {
    const code = ch.codePointAt(0);
    if (code < 0x0300 || code > 0x036f) out += ch;
  }
  return out;
}

function normEv(s) {
  return stripDiacritics((s || '').toString().trim().toLowerCase().normalize('NFD'));
}

function apellidoEv(s) {
  return normEv(s).split(',')[0].trim().split(/\s+/)[0] || '';
}

function sameEv(a, b) {
  const na = normEv(a), nb = normEv(b);
  if (!nb || nb === '—') return false;
  if (na === nb) return true;
  const pa = apellidoEv(a), pb = apellidoEv(b);
  return pa !== '' && pa === pb;
}

module.exports = { normEv, apellidoEv, sameEv };
```

- [ ] **Step 2: Crear `backend/src/lib/calendarRepo.js` con la logica de acceso a datos que hoy vive en `routes/calendario.js`**

```js
const { pool } = require('../db');
const { calTotals } = require('./calendar');

async function loadReglas() {
  const { rows } = await pool.query('SELECT lun_jue, vie, sab, dom, descanso FROM calendario_reglas WHERE id=1');
  if (rows[0]) return rows[0];
  const insert = await pool.query(
    `INSERT INTO calendario_reglas (id, lun_jue, vie, sab, dom, descanso) VALUES (1,9,8,0,0,1) RETURNING lun_jue, vie, sab, dom, descanso`
  );
  return insert.rows[0];
}

async function loadFeriados() {
  const { rows } = await pool.query('SELECT fecha, nombre FROM calendario_feriados');
  const out = {};
  rows.forEach(r => { out[r.fecha.toISOString().slice(0, 10)] = r.nombre; });
  return out;
}

async function loadDias() {
  const { rows } = await pool.query('SELECT fecha, horas_brutas, descuento, nombre FROM calendario_dias_especiales');
  const out = {};
  rows.forEach(r => { out[r.fecha.toISOString().slice(0, 10)] = { horas_brutas: r.horas_brutas, descuento: r.descuento, nombre: r.nombre }; });
  return out;
}

async function hsBaseNetas(mes) {
  const reglas = await loadReglas();
  const feriados = await loadFeriados();
  const dias = await loadDias();
  const totals = calTotals(mes, {
    lun_jue: Number(reglas.lun_jue), vie: Number(reglas.vie), sab: Number(reglas.sab),
    dom: Number(reglas.dom), descanso: Number(reglas.descanso),
  }, feriados, dias);
  return totals.netas;
}

module.exports = { loadReglas, loadFeriados, loadDias, hsBaseNetas };
```

- [ ] **Step 3: Crear `backend/src/lib/critRepo.js` con la logica de acceso a datos que hoy vive en `routes/criterios.js`**

```js
const { pool } = require('../db');

async function loadGrupo(grupo) {
  const { rows: crits } = await pool.query('SELECT * FROM criterios WHERE grupo=$1 ORDER BY orden', [grupo]);
  const out = [];
  for (const c of crits) {
    const { rows: rub } = await pool.query('SELECT nivel, texto FROM criterio_rubricas WHERE criterio_id_ref=$1', [c.id]);
    const rubricas = {};
    rub.forEach(r => { rubricas[r.nivel] = r.texto; });
    out.push({ id: c.criterio_id, label: c.label, descripcion: c.descripcion, orden: c.orden, rubricas });
  }
  return out;
}

async function loadFactores() {
  const { rows } = await pool.query('SELECT factor_key, peso FROM factores');
  const out = {};
  rows.forEach(r => { out[r.factor_key] = Number(r.peso); });
  return out;
}

async function loadNiveles() {
  const { rows } = await pool.query('SELECT numero, label, porcentaje FROM niveles ORDER BY numero');
  return rows.map(r => ({ numero: r.numero, label: r.label, porcentaje: Number(r.porcentaje) }));
}

module.exports = { loadGrupo, loadFactores, loadNiveles };
```

- [ ] **Step 4: Refactorizar `backend/src/routes/calendario.js` para usar el repositorio**

Reemplazar las funciones `loadReglas`, `loadFeriados`, `loadDias` definidas en el archivo por:

```js
const { loadReglas, loadFeriados, loadDias } = require('../lib/calendarRepo');
```

(eliminar las tres funciones locales; el resto del archivo — las rutas `GET /:mes`, `PUT /reglas`, `PUT /feriados`, `PUT /dia/:fecha` — queda igual, ya que llaman a las mismas funciones por nombre.)

- [ ] **Step 5: Refactorizar `backend/src/routes/criterios.js` para usar el repositorio**

Reemplazar la funcion local `loadGrupo` por:

```js
const { loadGrupo } = require('../lib/critRepo');
```

- [ ] **Step 6: Refactorizar `backend/src/routes/factores.js` para usar el repositorio en el GET**

Reemplazar el cuerpo de `router.get('/', ...)` para usar `loadFactores` solo internamente no aplica (ese endpoint ya devuelve directamente las columnas de la tabla `factores`, que es lo que el frontend necesita mostrar en Configuracion). Dejar `factores.js` tal cual quedo en Task 9 — no requiere cambios; se documenta aca porque `critRepo.loadFactores()` (que devuelve `{hs,pred,sh}` en formato de pesos numericos) es exclusivamente para uso interno del motor de calculo (este Task y el Task 12), no reemplaza al endpoint HTTP.

- [ ] **Step 7: Confirmar que `backend/src/routes/niveles.js` tampoco necesita cambios**

Mismo caso que el paso anterior: el endpoint HTTP de niveles ya devuelve el shape correcto para el frontend; `critRepo.loadNiveles()` es la version interna (con `porcentaje` convertido a `Number`) que usaran las rutas de evaluaciones y resultados para alimentar `calc.calcRow`.

- [ ] **Step 8: Correr toda la suite existente para confirmar que el refactor no rompio nada**

Run: `docker compose run --rm backend npm test`
Expected: todos los suites anteriores (`health, calendar, calc, auth, config, personal, users, criterios, factores, niveles, calendario`) siguen en PASS.

- [ ] **Step 9: Commit del refactor antes de seguir con la ruta nueva**

```bash
git add backend/src/lib/access.js backend/src/lib/calendarRepo.js backend/src/lib/critRepo.js backend/src/routes/calendario.js backend/src/routes/criterios.js
git commit -m "refactor: extract calendar and criterios data access into shared repos"
```

- [ ] **Step 10: Escribir `backend/test/evaluaciones.test.js`**

```js
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
```

- [ ] **Step 11: Correr los tests y verificar que fallan**

Run: `docker compose run --rm backend npm test -- evaluaciones.test.js`
Expected: falla, la ruta no existe.

- [ ] **Step 12: Implementar `backend/src/routes/evaluaciones.js`**

```js
const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { sameEv } = require('../lib/access');
const { calcRow } = require('../lib/calc');
const { hsBaseNetas } = require('../lib/calendarRepo');
const { loadGrupo, loadFactores, loadNiveles } = require('../lib/critRepo');

const router = express.Router();
router.use(requireAuth);

async function evaluablesForUser(user) {
  const { rows } = await pool.query(
    `SELECT legajo, nombre, sector, evaluador FROM personal WHERE spm=true AND estado='Activo' ORDER BY nombre`
  );
  if (user.role === 'supervisor') {
    return rows.filter(p => sameEv(p.evaluador, user.evaluador_nombre));
  }
  return rows;
}

async function loadEvalRows(mes, legajos) {
  const out = {};
  legajos.forEach(leg => { out[leg] = { vac: 0, real: 0, pred: {}, sh: {}, com: {} }; });
  if (!legajos.length) return out;
  const { rows: evs } = await pool.query('SELECT * FROM evaluaciones WHERE mes=$1 AND legajo = ANY($2)', [mes, legajos]);
  const idToLegajo = {};
  evs.forEach(e => {
    out[e.legajo] = { vac: Number(e.vac_horas), real: Number(e.horas_reales), pred: {}, sh: {}, com: {} };
    idToLegajo[e.id] = e.legajo;
  });
  const ids = evs.map(e => e.id);
  if (ids.length) {
    const { rows: crits } = await pool.query('SELECT * FROM evaluaciones_criterios WHERE evaluacion_id = ANY($1)', [ids]);
    crits.forEach(c => { out[idToLegajo[c.evaluacion_id]][c.grupo][c.criterio_id] = c.nivel; });
    const { rows: coms } = await pool.query('SELECT * FROM evaluaciones_comentarios WHERE evaluacion_id = ANY($1)', [ids]);
    coms.forEach(c => { out[idToLegajo[c.evaluacion_id]].com[c.grupo] = c.texto; });
  }
  return out;
}

async function loadCalcContext(mes) {
  const niveles = await loadNiveles();
  const factores = await loadFactores();
  const predCrits = await loadGrupo('pred');
  const shCrits = await loadGrupo('sh');
  const { rows: cfgRows } = await pool.query('SELECT bono_base_pct FROM config WHERE id=1');
  const base = cfgRows[0] ? Number(cfgRows[0].bono_base_pct) : 0;
  const hsBase = await hsBaseNetas(mes);
  return { niveles, factores, predIds: predCrits.map(c => c.id), shIds: shCrits.map(c => c.id), base, hsBase };
}

function computeWithContext(ctx, e) {
  return calcRow({
    hsBaseNetas: ctx.hsBase, vac: e.vac, real: e.real,
    predValores: e.pred, shValores: e.sh,
    predIds: ctx.predIds, shIds: ctx.shIds,
    niveles: ctx.niveles, base: ctx.base,
    pesoHs: ctx.factores.hs, pesoPred: ctx.factores.pred, pesoSh: ctx.factores.sh,
    sueldoBase: 0,
  });
}

router.get('/:mes', async (req, res) => {
  const people = await evaluablesForUser(req.user);
  const evalMap = await loadEvalRows(req.params.mes, people.map(p => p.legajo));
  const ctx = await loadCalcContext(req.params.mes);
  const out = {};
  people.forEach(p => {
    const e = evalMap[p.legajo];
    out[p.legajo] = { legajo: p.legajo, nombre: p.nombre, sector: p.sector, evaluador: p.evaluador, ...e, ...computeWithContext(ctx, e) };
  });
  res.json(out);
});

router.get('/:mes/estado-evaluadores', requireRole('admin'), async (req, res) => {
  const { rows: evaluadores } = await pool.query(
    `SELECT id, username, name, role FROM users WHERE role IN ('produccion','supervisor','syh') ORDER BY name`
  );
  const { rows: fin } = await pool.query('SELECT user_id, finalizado_at FROM evaluaciones_finalizadas WHERE mes=$1', [req.params.mes]);
  const finByUser = {};
  fin.forEach(f => { finByUser[f.user_id] = f.finalizado_at; });
  res.json(evaluadores.map(u => ({ id: u.id, username: u.username, name: u.name, role: u.role, finalizado_at: finByUser[u.id] || null })));
});

router.get('/:mes/:legajo', async (req, res) => {
  const people = await evaluablesForUser(req.user);
  const p = people.find(x => x.legajo === req.params.legajo);
  if (!p) return res.status(404).json({ error: 'No encontrado o fuera de tu alcance' });
  const evalMap = await loadEvalRows(req.params.mes, [p.legajo]);
  const ctx = await loadCalcContext(req.params.mes);
  const e = evalMap[p.legajo];
  res.json({ legajo: p.legajo, nombre: p.nombre, sector: p.sector, evaluador: p.evaluador, ...e, ...computeWithContext(ctx, e) });
});

router.put('/:mes/:legajo', async (req, res) => {
  const { mes, legajo } = req.params;
  const people = await evaluablesForUser(req.user);
  const p = people.find(x => x.legajo === legajo);
  if (!p) return res.status(404).json({ error: 'No encontrado o fuera de tu alcance' });

  const body = req.body || {};
  const role = req.user.role;
  if ((body.vac !== undefined || body.real !== undefined) && !['admin', 'produccion'].includes(role)) {
    return res.status(403).json({ error: 'No autorizado a cargar horas' });
  }
  if (body.pred && !['admin', 'supervisor'].includes(role)) {
    return res.status(403).json({ error: 'No autorizado a cargar Predisposicion' });
  }
  if (body.sh && !['admin', 'syh'].includes(role)) {
    return res.status(403).json({ error: 'No autorizado a cargar S&H' });
  }
  if (body.com) {
    if (body.com.pred !== undefined && !['admin', 'supervisor'].includes(role)) return res.status(403).json({ error: 'No autorizado' });
    if (body.com.sh !== undefined && !['admin', 'syh'].includes(role)) return res.status(403).json({ error: 'No autorizado' });
  }

  const { rows: existing } = await pool.query('SELECT * FROM evaluaciones WHERE legajo=$1 AND mes=$2', [legajo, mes]);
  let evaluacionId;
  if (existing[0]) {
    evaluacionId = existing[0].id;
    const vac = body.vac !== undefined ? Number(body.vac) || 0 : Number(existing[0].vac_horas);
    const real = body.real !== undefined ? Number(body.real) || 0 : Number(existing[0].horas_reales);
    await pool.query('UPDATE evaluaciones SET vac_horas=$1, horas_reales=$2, updated_at=now() WHERE id=$3', [vac, real, evaluacionId]);
  } else {
    const vac = Number(body.vac) || 0;
    const real = Number(body.real) || 0;
    const { rows } = await pool.query(
      'INSERT INTO evaluaciones (legajo, mes, vac_horas, horas_reales) VALUES ($1,$2,$3,$4) RETURNING id',
      [legajo, mes, vac, real]
    );
    evaluacionId = rows[0].id;
  }

  for (const grupo of ['pred', 'sh']) {
    if (body[grupo]) {
      for (const [criterioId, nivel] of Object.entries(body[grupo])) {
        const nivelNum = (nivel === '' || nivel === null || nivel === undefined) ? null : Number(nivel);
        await pool.query(
          `INSERT INTO evaluaciones_criterios (evaluacion_id, grupo, criterio_id, nivel) VALUES ($1,$2,$3,$4)
           ON CONFLICT (evaluacion_id, grupo, criterio_id) DO UPDATE SET nivel=$4`,
          [evaluacionId, grupo, criterioId, nivelNum]
        );
      }
    }
  }
  if (body.com) {
    for (const grupo of ['pred', 'sh']) {
      if (body.com[grupo] !== undefined) {
        await pool.query(
          `INSERT INTO evaluaciones_comentarios (evaluacion_id, grupo, texto) VALUES ($1,$2,$3)
           ON CONFLICT (evaluacion_id, grupo) DO UPDATE SET texto=$3`,
          [evaluacionId, grupo, body.com[grupo] || '']
        );
      }
    }
  }

  const evalMap = await loadEvalRows(mes, [legajo]);
  const e = evalMap[legajo];
  const ctx = await loadCalcContext(mes);
  res.json(computeWithContext(ctx, e));
});

router.post('/:mes/finalizar', async (req, res) => {
  await pool.query(
    `INSERT INTO evaluaciones_finalizadas (mes, user_id) VALUES ($1,$2)
     ON CONFLICT (mes, user_id) DO UPDATE SET finalizado_at=now()`,
    [req.params.mes, req.user.id]
  );
  res.json({ ok: true });
});

module.exports = router;
```

Nota de orden de rutas: `GET /:mes/estado-evaluadores` y `GET /:mes/mi-estado` (agregada en el Step 12b siguiente) estan registradas ANTES de `GET /:mes/:legajo` a proposito — si se registraran despues, Express interpretaria esos nombres como un valor de `:legajo` porque todas esas rutas tienen la misma forma de dos segmentos.

- [ ] **Step 12b: Agregar `GET /:mes/mi-estado` (cualquier rol) para que el propio usuario consulte si ya finalizo el mes**

Insertar esta ruta INMEDIATAMENTE DESPUES de `router.get('/:mes/estado-evaluadores', ...)` y ANTES de `router.get('/:mes/:legajo', ...)` (mismo motivo de orden que la nota de arriba):

```js
router.get('/:mes/mi-estado', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT finalizado_at FROM evaluaciones_finalizadas WHERE mes=$1 AND user_id=$2',
    [req.params.mes, req.user.id]
  );
  res.json({ finalizado_at: rows[0] ? rows[0].finalizado_at : null });
});
```

Esto es lo que consume el boton "Finalizar mi evaluación" del frontend (Task 20) para saber si el usuario actual ya finalizo ese mes — a diferencia de `estado-evaluadores`, que es la vista consolidada admin-only de Inicio.

- [ ] **Step 13: Montar en `backend/src/server.js`**

```js
const evaluacionesRoutes = require('./routes/evaluaciones');
// ...
app.use('/api/evaluaciones', evaluacionesRoutes);
```

- [ ] **Step 14: Correr los tests**

Run: `docker compose run --rm backend npm test -- evaluaciones.test.js`
Expected: 13 tests en PASS.

- [ ] **Step 15: Correr toda la suite completa**

Run: `docker compose run --rm backend npm test`
Expected: 0 failures en todos los suites.

- [ ] **Step 16: Commit**

```bash
git add backend/src/routes/evaluaciones.js backend/src/server.js backend/test/evaluaciones.test.js
git commit -m "feat: add evaluaciones routes with role-scoped access and live calc"
```

### Task 12: Ruta `/api/resultados/:mes`

Ejecuta el mismo motor de calculo que Task 11 pero para todo el mes de una vez (equivalente a `rRes()`/`rDash()` del HTML, lineas 740-764). Se exporta tambien `computeResultados` como funcion reusable porque Task 13 (cerrar periodo) necesita el mismo calculo para armar el snapshot del historial.

**Files:**
- Create: `backend/src/routes/resultados.js`
- Modify: `backend/src/server.js`
- Test: `backend/test/resultados.test.js`

**Interfaces:**
- Consumes: `sameEv` de Task 11, `calcRow` de Task 4, `hsBaseNetas`/`loadGrupo`/`loadFactores`/`loadNiveles` de Task 11.
- Produces: `GET /api/resultados/:mes` (cualquier rol autenticado, alcance por rol igual que evaluaciones); `computeResultados(mes, user)` exportado para Task 13. Respuesta: array de `{legajo,nombre,sector,evaluador,sueldo_base?,hsEsp,real,fHs,fPr,fSh,res,inc?}` — `sueldo_base` e `inc` solo se incluyen si el usuario es `admin` (ver decision de diseno #2: el sueldo es dato sensible).

- [ ] **Step 1: Escribir `backend/test/resultados.test.js`**

```js
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
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `docker compose run --rm backend npm test -- resultados.test.js`
Expected: falla, la ruta no existe.

- [ ] **Step 3: Implementar `backend/src/routes/resultados.js`**

```js
const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { sameEv } = require('../lib/access');
const { calcRow } = require('../lib/calc');
const { hsBaseNetas } = require('../lib/calendarRepo');
const { loadGrupo, loadFactores, loadNiveles } = require('../lib/critRepo');

const router = express.Router();

async function computeResultados(mes, user) {
  const { rows: personal } = await pool.query(
    `SELECT legajo, nombre, sector, evaluador, sueldo_base FROM personal WHERE spm=true AND estado='Activo' ORDER BY nombre`
  );
  const people = user.role === 'supervisor' ? personal.filter(p => sameEv(p.evaluador, user.evaluador_nombre)) : personal;
  if (!people.length) return [];

  const legajos = people.map(p => p.legajo);
  const { rows: evs } = await pool.query('SELECT * FROM evaluaciones WHERE mes=$1 AND legajo = ANY($2)', [mes, legajos]);
  const evByLegajo = {};
  const idToLegajo = {};
  evs.forEach(e => {
    evByLegajo[e.legajo] = { vac: Number(e.vac_horas), real: Number(e.horas_reales), pred: {}, sh: {} };
    idToLegajo[e.id] = e.legajo;
  });
  const ids = evs.map(e => e.id);
  if (ids.length) {
    const { rows: crits } = await pool.query('SELECT * FROM evaluaciones_criterios WHERE evaluacion_id = ANY($1)', [ids]);
    crits.forEach(c => { evByLegajo[idToLegajo[c.evaluacion_id]][c.grupo][c.criterio_id] = c.nivel; });
  }

  const niveles = await loadNiveles();
  const factores = await loadFactores();
  const predCrits = await loadGrupo('pred');
  const shCrits = await loadGrupo('sh');
  const { rows: cfgRows } = await pool.query('SELECT bono_base_pct FROM config WHERE id=1');
  const base = cfgRows[0] ? Number(cfgRows[0].bono_base_pct) : 0;
  const hsBase = await hsBaseNetas(mes);

  return people.map(p => {
    const e = evByLegajo[p.legajo] || { vac: 0, real: 0, pred: {}, sh: {} };
    const calc = calcRow({
      hsBaseNetas: hsBase, vac: e.vac, real: e.real,
      predValores: e.pred, shValores: e.sh,
      predIds: predCrits.map(c => c.id), shIds: shCrits.map(c => c.id),
      niveles, base, pesoHs: factores.hs, pesoPred: factores.pred, pesoSh: factores.sh,
      sueldoBase: Number(p.sueldo_base) || 0,
    });
    return {
      legajo: p.legajo, nombre: p.nombre, sector: p.sector, evaluador: p.evaluador,
      sueldo_base: Number(p.sueldo_base) || 0, ...calc,
    };
  });
}

router.get('/:mes', requireAuth, async (req, res) => {
  const rows = await computeResultados(req.params.mes, req.user);
  const out = rows.map(r => {
    if (req.user.role === 'admin') return r;
    const { sueldo_base, inc, ...rest } = r;
    return rest;
  });
  res.json(out);
});

module.exports = { router, computeResultados };
```

Nota: como este modulo exporta `{ router, computeResultados }` en vez de solo el router (a diferencia de las rutas anteriores), el montaje en `server.js` debe desestructurar `router`.

- [ ] **Step 4: Montar en `backend/src/server.js`**

```js
const { router: resultadosRoutes } = require('./routes/resultados');
// ...
app.use('/api/resultados', resultadosRoutes);
```

- [ ] **Step 5: Correr los tests**

Run: `docker compose run --rm backend npm test -- resultados.test.js`
Expected: 4 tests en PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/resultados.js backend/src/server.js backend/test/resultados.test.js
git commit -m "feat: add resultados route reusing the calc engine"
```

### Task 13: Rutas `/api/historial`

Cierra el período leyendo el `mes` actual desde `config` y reusando `computeResultados` de Task 12 para armar el snapshot (misma logica que `cerrarPeriodo()` del HTML, lineas 776-781).

**Files:**
- Create: `backend/src/routes/historial.js`
- Modify: `backend/src/server.js`
- Test: `backend/test/historial.test.js`

**Interfaces:**
- Consumes: `computeResultados` de Task 12.
- Produces: `GET /api/historial` (cualquier rol, `money` solo si admin), `POST /api/historial/cerrar` (admin), `DELETE /api/historial/:mes` (admin).

- [ ] **Step 1: Escribir `backend/test/historial.test.js`**

```js
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
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `docker compose run --rm backend npm test -- historial.test.js`
Expected: falla, la ruta no existe.

- [ ] **Step 3: Implementar `backend/src/routes/historial.js`**

```js
const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { computeResultados } = require('./resultados');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT mes, datos, cerrado_at FROM historial ORDER BY mes');
  const out = rows.map(r => {
    const base = { mes: r.mes, n: r.datos.n, avg: r.datos.avg, cerrado_at: r.cerrado_at };
    if (req.user.role === 'admin') base.money = r.datos.money;
    return base;
  });
  res.json(out);
});

router.post('/cerrar', requireAuth, requireRole('admin'), async (req, res) => {
  const { rows: cfgRows } = await pool.query('SELECT mes FROM config WHERE id=1');
  if (!cfgRows[0]) return res.status(400).json({ error: 'No hay un mes configurado' });
  const mes = cfgRows[0].mes;
  const rows = await computeResultados(mes, { role: 'admin' });
  const snapshot = rows.map(r => ({ legajo: r.legajo, nombre: r.nombre, sector: r.sector, res: r.res, inc: r.inc }));
  const evaluados = snapshot.filter(x => x.res > 0);
  const n = evaluados.length;
  const avg = n ? evaluados.reduce((a, b) => a + b.res, 0) / n : 0;
  const money = evaluados.reduce((a, b) => a + b.inc, 0);
  const datos = { n, avg, money, snapshot };
  const { rows: inserted } = await pool.query(
    `INSERT INTO historial (mes, datos) VALUES ($1,$2)
     ON CONFLICT (mes) DO UPDATE SET datos=$2, cerrado_at=now()
     RETURNING mes, datos, cerrado_at`,
    [mes, JSON.stringify(datos)]
  );
  res.status(201).json({ mes: inserted[0].mes, n, avg, money, cerrado_at: inserted[0].cerrado_at });
});

router.delete('/:mes', requireAuth, requireRole('admin'), async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM historial WHERE mes=$1', [req.params.mes]);
  if (!rowCount) return res.status(404).json({ error: 'No encontrado' });
  res.status(204).end();
});

module.exports = router;
```

- [ ] **Step 4: Montar en `backend/src/server.js`**

```js
const historialRoutes = require('./routes/historial');
// ...
app.use('/api/historial', historialRoutes);
```

- [ ] **Step 5: Correr los tests**

Run: `docker compose run --rm backend npm test -- historial.test.js`
Expected: 5 tests en PASS.

- [ ] **Step 6: Correr toda la suite del backend una ultima vez**

Run: `docker compose run --rm backend npm test`
Expected: 0 failures. En este punto la API REST completa del spec esta implementada y testeada.

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/historial.js backend/src/server.js backend/test/historial.test.js
git commit -m "feat: add historial routes (cerrar periodo, listar, eliminar)"
```

### Task 14: Script de siembra (`seed.js`)

Carga los datos iniciales exigidos por el spec (usuarios, config, calendario 2026, factores, niveles, criterios con rubricas) sin generar nomina demo. Los textos de `DEFAULT_RUB` y las fechas de `FERIADOS_2026` se portan literalmente de `Bono_Produccion_v22.html:332-411`.

**Files:**
- Create: `backend/seedData.js`
- Create: `backend/seed.js`
- Test: `backend/test/seed.test.js`

**Interfaces:**
- Produces: `seed()` (funcion async exportada, idempotente vía `ON CONFLICT`), ejecutable tambien como script (`node seed.js` / `npm run seed`, ya definido en `package.json` de Task 3).

- [ ] **Step 1: Crear `backend/seedData.js`**

```js
const FERIADOS_2026 = {
  '2026-01-01': 'Año Nuevo',
  '2026-02-16': 'Carnaval',
  '2026-02-17': 'Carnaval',
  '2026-03-24': 'Día Nacional de la Memoria por la Verdad y la Justicia',
  '2026-04-02': 'Día del Veterano y de los Caídos en Malvinas',
  '2026-04-03': 'Viernes Santo',
  '2026-05-01': 'Día del Trabajador',
  '2026-05-25': 'Día de la Revolución de Mayo',
  '2026-06-15': 'Paso a la Inmortalidad del Gral. Güemes',
  '2026-06-20': 'Paso a la Inmortalidad del Gral. Belgrano',
  '2026-07-09': 'Día de la Independencia',
  '2026-08-17': 'Paso a la Inmortalidad del Gral. San Martín',
  '2026-10-12': 'Día del Respeto a la Diversidad Cultural',
  '2026-11-23': 'Día de la Soberanía Nacional',
  '2026-12-08': 'Inmaculada Concepción de María',
  '2026-12-25': 'Navidad',
};

const DEFAULT_RUB = {
  p1: {
    label: 'Iniciativa',
    desc: 'Actúa por cuenta propia, toma la iniciativa y aporta mejoras sin esperar instrucciones.',
    rub: {
      1: 'Requiere supervisión constante y espera instrucciones detalladas; rara vez aporta ideas o soluciones.',
      2: 'Competente pero espera instrucciones antes de actuar; muestra iniciativa en ocasiones y necesita recordatorios.',
      3: 'Toma la iniciativa en situaciones nuevas sin supervisión; aporta ideas y soluciones para mejorar los procesos.',
      4: 'Busca constantemente oportunidades de mejorar e innovar; soluciones creativas y alto grado de autonomía.',
    },
  },
  p2: {
    label: 'Conducta',
    desc: 'Interés y compromiso con la calidad del trabajo: presencia en el puesto, respeto y cuidado de herramientas.',
    rub: {
      1: 'Falta de interés y compromiso; fuera del puesto, uso de celular, no respeta a colegas ni cuida herramientas.',
      2: 'Interés moderado; su conducta a veces afecta la productividad, se ausenta del puesto o usa dispositivos personales.',
      3: 'Comprometido y puntual; siempre en su puesto, respetuoso con pares y supervisores, cuida herramientas y equipos.',
      4: 'Alto interés, compromiso y entusiasmo que contribuye significativamente a la productividad.',
    },
  },
  p3: {
    label: 'Colaboración',
    desc: 'Disposición a colaborar, comunicación y compromiso con el equipo y la empresa, incluso fuera del horario.',
    rub: {
      1: 'Falta de interés en colaborar; no se puede contar con él fuera de horario y su comunicación es mínima.',
      2: 'Colaboración ocasional, con dificultades o pasividad; baja disposición a participar más allá de su rol.',
      3: 'Colaboración constante y proactiva; comprometido con los valores de la empresa, se puede contar con él ante necesidad.',
      4: 'Colaborador destacado; soluciones creativas, siempre disponible, miembro muy valioso del equipo.',
    },
  },
  s1: {
    label: 'Disposición de Residuos',
    desc: 'Correcta gestión y disposición de los residuos en el sector.',
    rub: {
      1: 'No muestra preocupación por la gestión de residuos; requiere supervisión constante.',
      2: 'En ocasiones muestra interés y preocupación por la gestión de residuos.',
      3: 'Dispone los residuos de manera correcta y consistente en su sector.',
      4: 'Gestión de residuos ejemplar; promueve activamente buenas prácticas de disposición.',
    },
  },
  s2: {
    label: 'Uso de EPP',
    desc: 'Uso correcto y consistente de los elementos de protección personal.',
    rub: {
      1: 'No utiliza adecuadamente los EPP; ignora las normativas de seguridad.',
      2: 'Uso irregular de EPP; a veces sigue las normas pero en ocasiones se olvida.',
      3: 'Compromiso constante con las políticas de seguridad; participa en capacitación y concientización.',
      4: 'Contribuye a la prevención de incidentes y promueve una cultura de seguridad; incidentes muy bajos o nulos.',
    },
  },
  s3: {
    label: 'Orden y Limpieza',
    desc: 'Mantenimiento del orden y la limpieza del lugar de trabajo.',
    rub: {
      1: 'Lugar de trabajo en desorden y suciedad constante; no cumple las normas de limpieza y orden.',
      2: 'El lugar suele estar desordenado; cumple con limpieza y orden solo en algunas ocasiones.',
      3: 'Lugar generalmente limpio y organizado; cumple de manera consistente con las normas.',
      4: 'Lugar impecable y altamente organizado; promueve la limpieza y sirve de ejemplo para otros.',
    },
  },
};

const CRITERIOS_PRED = ['p1', 'p2', 'p3'];
const CRITERIOS_SH = ['s1', 's2', 's3'];

module.exports = { FERIADOS_2026, DEFAULT_RUB, CRITERIOS_PRED, CRITERIOS_SH };
```

- [ ] **Step 2: Escribir `backend/test/seed.test.js`**

```js
const { pool } = require('../src/db');
const { seed } = require('../seed');
const { resetDb } = require('./dbHelpers');

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await pool.end(); });

test('seed crea los 4 usuarios esperados con sus roles y evaluador asignado', async () => {
  await seed();
  const { rows } = await pool.query('SELECT username, role, evaluador_nombre FROM users ORDER BY username');
  expect(rows).toEqual([
    { username: 'admin', role: 'admin', evaluador_nombre: '' },
    { username: 'foos', role: 'supervisor', evaluador_nombre: 'Foos' },
    { username: 'produccion', role: 'produccion', evaluador_nombre: '' },
    { username: 'schmidt', role: 'syh', evaluador_nombre: '' },
  ]);
});

test('seed carga los 16 feriados 2026, los 3 factores con sus pesos y los 4 niveles', async () => {
  await seed();
  const feriados = await pool.query('SELECT count(*) FROM calendario_feriados');
  expect(Number(feriados.rows[0].count)).toBe(16);
  const factores = await pool.query('SELECT factor_key, peso FROM factores ORDER BY factor_key');
  expect(factores.rows).toEqual([
    { factor_key: 'hs', peso: 25 },
    { factor_key: 'pred', peso: 50 },
    { factor_key: 'sh', peso: 25 },
  ]);
  const niveles = await pool.query('SELECT numero, porcentaje FROM niveles ORDER BY numero');
  expect(niveles.rows.map(n => n.porcentaje)).toEqual([0, 50, 100, 125]);
});

test('seed carga 3 criterios de predisposicion y 3 de S&H, cada uno con 4 rubricas', async () => {
  await seed();
  const pred = await pool.query("SELECT id FROM criterios WHERE grupo='pred'");
  const sh = await pool.query("SELECT id FROM criterios WHERE grupo='sh'");
  expect(pred.rows).toHaveLength(3);
  expect(sh.rows).toHaveLength(3);
  const rub = await pool.query('SELECT count(*) FROM criterio_rubricas WHERE criterio_id_ref=$1', [pred.rows[0].id]);
  expect(Number(rub.rows[0].count)).toBe(4);
});

test('seed deja la tabla personal vacia (RRHH importa la nomina real)', async () => {
  await seed();
  const { rows } = await pool.query('SELECT count(*) FROM personal');
  expect(Number(rows[0].count)).toBe(0);
});

test('seed es idempotente: correrlo dos veces no duplica usuarios ni feriados', async () => {
  await seed();
  await seed();
  const users = await pool.query('SELECT count(*) FROM users');
  expect(Number(users.rows[0].count)).toBe(4);
  const feriados = await pool.query('SELECT count(*) FROM calendario_feriados');
  expect(Number(feriados.rows[0].count)).toBe(16);
});
```

- [ ] **Step 3: Correr y verificar que fallan**

Run: `docker compose run --rm backend npm test -- seed.test.js`
Expected: falla, `../seed` no existe todavia.

- [ ] **Step 4: Implementar `backend/seed.js`**

```js
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('./src/db');
const { FERIADOS_2026, DEFAULT_RUB, CRITERIOS_PRED, CRITERIOS_SH } = require('./seedData');

function defMes() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function upsertUser(username, password, name, role, evaluadorNombre = '') {
  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    `INSERT INTO users (username, password_hash, name, role, evaluador_nombre) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (username) DO UPDATE SET password_hash=$2, name=$3, role=$4, evaluador_nombre=$5`,
    [username, hash, name, role, evaluadorNombre]
  );
}

async function seed() {
  await upsertUser('admin', 'Admin1234!', 'RRHH — Capital Humano', 'admin');
  await upsertUser('foos', 'Foos1234!', 'Jose C. Foos', 'supervisor', 'Foos');
  await upsertUser('produccion', 'Prod1234!', 'Gerencia de Produccion', 'produccion');
  await upsertUser('schmidt', 'Syh1234!', 'S. Schmidt — Seg&Higiene', 'syh');

  const mes = defMes();
  await pool.query(
    `INSERT INTO config (id, mes, horas_normales, descuento, bono_base_pct) VALUES (1,$1,0,0,15)
     ON CONFLICT (id) DO UPDATE SET mes=$1, updated_at=now()`,
    [mes]
  );

  await pool.query(
    `INSERT INTO calendario_reglas (id, lun_jue, vie, sab, dom, descanso) VALUES (1,9,8,0,0,1)
     ON CONFLICT (id) DO UPDATE SET lun_jue=9, vie=8, sab=0, dom=0, descanso=1`
  );

  for (const [fecha, nombre] of Object.entries(FERIADOS_2026)) {
    await pool.query(
      `INSERT INTO calendario_feriados (fecha, nombre) VALUES ($1,$2) ON CONFLICT (fecha) DO UPDATE SET nombre=$2`,
      [fecha, nombre]
    );
  }

  await pool.query(
    `INSERT INTO factores (factor_key, icono, label, peso) VALUES
     ('hs','⏱','Horas Productivas',25),
     ('pred','🤝','Predisposicion con la empresa',50),
     ('sh','🦺','Seguridad, Orden y Limpieza',25)
     ON CONFLICT (factor_key) DO UPDATE SET icono=EXCLUDED.icono, label=EXCLUDED.label, peso=EXCLUDED.peso`
  );

  await pool.query(
    `INSERT INTO niveles (numero, label, porcentaje) VALUES
     (1,'No cumple',0), (2,'Regular',50), (3,'Esperado',100), (4,'Sobresaliente',125)
     ON CONFLICT (numero) DO UPDATE SET label=EXCLUDED.label, porcentaje=EXCLUDED.porcentaje`
  );

  await pool.query('DELETE FROM criterios'); // cascadea a criterio_rubricas; se vuelve a insertar limpio
  let orden = 0;
  for (const [grupo, ids] of [['pred', CRITERIOS_PRED], ['sh', CRITERIOS_SH]]) {
    for (const id of ids) {
      const def = DEFAULT_RUB[id];
      const { rows } = await pool.query(
        `INSERT INTO criterios (grupo, criterio_id, label, descripcion, orden) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [grupo, id, def.label, def.desc, orden++]
      );
      const critId = rows[0].id;
      for (const [nivel, texto] of Object.entries(def.rub)) {
        await pool.query('INSERT INTO criterio_rubricas (criterio_id_ref, nivel, texto) VALUES ($1,$2,$3)', [critId, Number(nivel), texto]);
      }
    }
  }

  console.log('Seed completo. La tabla personal queda vacia a proposito (RRHH importa la nomina real).');
}

if (require.main === module) {
  seed().then(() => pool.end()).catch(err => { console.error(err); process.exit(1); });
}

module.exports = { seed };
```

- [ ] **Step 5: Correr los tests**

Run: `docker compose run --rm backend npm test -- seed.test.js`
Expected: 5 tests en PASS.

- [ ] **Step 6: Probar el script como se va a usar en produccion**

```bash
docker compose run --rm backend npm run seed
docker compose exec db psql -U sica -d sica_bonos -c "SELECT username, role FROM users;"
```
Expected: 4 filas de usuarios listadas.

- [ ] **Step 7: Correr toda la suite completa del backend**

Run: `docker compose run --rm backend npm test`
Expected: 0 failures. El backend completo (API + seed) queda terminado y testeado en este punto.

- [ ] **Step 8: Commit**

```bash
git add backend/seedData.js backend/seed.js backend/test/seed.test.js
git commit -m "feat: add seed script with initial config, calendar and criteria"
```

### Task 15: Copiar el HTML original al frontend y crear el cliente `api.js`

A partir de aca el trabajo es sobre el frontend. La estrategia (ver "Architecture" arriba): el HTML/CSS/JS original se copia tal cual y solo se tocan, tarea por tarea, las funciones que hoy llaman a `DB.save`/`DB.load`. Nada de la estructura visual, filtros, modales o tablas cambia.

**Files:**
- Create: `frontend/public/index.html` (copia de `Bono_Produccion_v22.html`)
- Create: `frontend/public/api.js`

**Interfaces:**
- Produces: objeto global `Api` con un metodo por endpoint de la API REST — lo consumen todas las tareas siguientes (16-21) al reemplazar cada `DB.save`/`DB.load`.

- [ ] **Step 1: Copiar el HTML original como punto de partida**

```bash
cp "Bono_Produccion_v22.html" "frontend/public/index.html"
```

- [ ] **Step 2: Crear `frontend/public/api.js`**

```js
const Api = (() => {
  async function req(path, opts = {}) {
    const res = await fetch('/api' + path, {
      credentials: 'include',
      headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
      ...opts,
    });
    if (res.status === 204) return null;
    let data = null;
    try { data = await res.json(); } catch { /* respuesta sin body */ }
    if (!res.ok) throw new Error((data && data.error) || `Error ${res.status}`);
    return data;
  }

  return {
    login: (username, password) => req('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
    logout: () => req('/auth/logout', { method: 'POST' }),
    me: () => req('/auth/me'),

    getConfig: () => req('/config'),
    saveConfig: cfg => req('/config', { method: 'PUT', body: JSON.stringify(cfg) }),

    getPersonal: (params = {}) => req('/personal?' + new URLSearchParams(params)),
    createPersonal: p => req('/personal', { method: 'POST', body: JSON.stringify(p) }),
    updatePersonal: (leg, p) => req('/personal/' + encodeURIComponent(leg), { method: 'PUT', body: JSON.stringify(p) }),
    deletePersonal: leg => req('/personal/' + encodeURIComponent(leg), { method: 'DELETE' }),

    getUsers: () => req('/users'),
    createUser: u => req('/users', { method: 'POST', body: JSON.stringify(u) }),
    updateUser: (id, u) => req('/users/' + id, { method: 'PUT', body: JSON.stringify(u) }),
    deleteUser: id => req('/users/' + id, { method: 'DELETE' }),

    getCriterios: () => req('/criterios'),
    saveCriterios: c => req('/criterios', { method: 'PUT', body: JSON.stringify(c) }),
    getFactores: () => req('/factores'),
    saveFactores: f => req('/factores', { method: 'PUT', body: JSON.stringify(f) }),
    getNiveles: () => req('/niveles'),
    saveNiveles: n => req('/niveles', { method: 'PUT', body: JSON.stringify(n) }),

    getCalendario: mes => req('/calendario/' + mes),
    saveReglas: r => req('/calendario/reglas', { method: 'PUT', body: JSON.stringify(r) }),
    saveFeriado: (fecha, nombre) => req('/calendario/feriados', { method: 'PUT', body: JSON.stringify({ fecha, nombre }) }),
    saveDia: (fecha, dia) => req('/calendario/dia/' + fecha, { method: 'PUT', body: JSON.stringify(dia) }),

    getEvaluaciones: mes => req('/evaluaciones/' + mes),
    getEvaluacion: (mes, leg) => req(`/evaluaciones/${mes}/${leg}`),
    saveEvaluacion: (mes, leg, patch) => req(`/evaluaciones/${mes}/${leg}`, { method: 'PUT', body: JSON.stringify(patch) }),
    finalizarEvaluacion: mes => req(`/evaluaciones/${mes}/finalizar`, { method: 'POST' }),
    getEstadoEvaluadores: mes => req(`/evaluaciones/${mes}/estado-evaluadores`),
    getMiEstado: mes => req(`/evaluaciones/${mes}/mi-estado`),

    getResultados: mes => req('/resultados/' + mes),

    getHistorial: () => req('/historial'),
    cerrarPeriodo: () => req('/historial/cerrar', { method: 'POST' }),
    deleteHistorial: mes => req('/historial/' + mes, { method: 'DELETE' }),
  };
})();
```

- [ ] **Step 3: Insertar `api.js` en `frontend/public/index.html` justo antes del script principal**

Buscar la linea `<script>` que abre el bloque de logica de la app (justo despues de `<div id="toast-c"></div>`) e insertar antes:

```html
<script src="api.js"></script>
<script>
```

- [ ] **Step 4: Verificar que `api.js` es JS valido**

Run: `node --check frontend/public/api.js`
Expected: sin salida (exit code 0).

- [ ] **Step 5: Verificar que el script quedo bien insertado**

Run: `grep -n "api.js" frontend/public/index.html`
Expected: una linea `<script src="api.js"></script>` ubicada antes del `<script>` grande (linea original ~310).

- [ ] **Step 6: Commit**

```bash
git add frontend/public/index.html frontend/public/api.js
git commit -m "feat: copy original frontend and add REST api client"
```

### Task 16: Frontend — autenticacion real y arranque de sesion

Reemplaza el login con hash local y la sesion en `localStorage` por la API real. Tambien elimina del cliente todo lo que ahora vive en el backend: el generador de nomina demo, `FERIADOS_2026`, `DEFAULT_RUB` y el `seed()` local (Task 14 los porto al backend).

Como el frontend no tiene un runner de tests (la app original es HTML+JS vanilla sin infraestructura de testing), la verificacion de cada tarea de frontend es: (a) chequeo de sintaxis del script inline, y (b) prueba manual en el navegador levantando `docker compose up`. Ambas se repiten en cada tarea de frontend con el mismo comando de sintaxis.

**Files:**
- Modify: `frontend/public/index.html`

**Interfaces:**
- Consumes: `Api.login`, `Api.logout`, `Api.me`, `Api.getConfig`, `Api.getCriterios`, `Api.getFactores`, `Api.getNiveles` de Task 15.
- Produces: `reload()` (ahora async, deja `cfg` y `crit` con la MISMA forma que antes — `crit.niveles=[{n,pct,label}]`, `crit.pred/sh=[{id,label,desc,rub}]`, `crit.factores.hs={ico,label,peso}` — para que el resto del codigo de render no necesite cambios); `doLogin()`, `logout()`, `startApp()` actualizados.

- [ ] **Step 1: Eliminar el bloque de persistencia local y utilidades que ya no aplican**

Borrar de `frontend/public/index.html` (dentro del `<script>` principal):
- La linea `const DB={save(k,d){...},load(k,def){...},clear(k){...}};`
- La linea `const K={users:...,sess:'bp5_session'};`
- `function hash(s){...}`
- `function mul32(a){...}`
- `function uid(){return Math.random()...}` **NO** se borra — se usa mas adelante (Task 19) para ids temporales de criterios nuevos. Dejarla donde esta.

- [ ] **Step 2: Eliminar la nomina demo y el calendario/rubrica hardcodeados**

Borrar el bloque completo `/* ============ NÓMINA DEMO (209, ~102 SPM) ============ */` hasta (sin incluir) `/* ============ SEED ============ */`: esto elimina `APE`, `NOM`, `PROD`, `MENS`, `genNomina()`.

Borrar tambien `FERIADOS_2026` y `defCalendar()` (el objeto con los feriados hardcodeados — ahora los sirve `GET /api/calendario/:mes`, poblado por `seed.js` en Task 14).

**NO borrar** `DOW_ES`, `daysOfMonth(mes)`, `dayInfo(iso,dow)` ni `calTotals(mes)` (lineas ~373 y ~473-484 del original): son pura logica de formato para pintar la tabla de la seccion Calendario (un renglon por dia del mes con sus horas), reciben `cal.reglas`/`cal.feriados`/`cal.dias` como parametro y no hacen ninguna cuenta de bono — quedan intactas y en Task 19 simplemente se las alimenta con el `cal` que ahora viene de `Api.getCalendario(mes)` en vez de `localStorage`.

Borrar `DEFAULT_RUB`, `critWith(id,label)`, `defCriteria()`, `migrateCrit()` — toda esa configuracion por defecto ahora la sirve `GET /api/criterios` + `GET /api/factores` + `GET /api/niveles` (Task 9), poblada por `seed.js` (Task 14).

Borrar `function seed(){...}` completo.

Borrar tambien el motor de calculo que ahora vive en el backend (decision de diseno #4): `function nf(n){...}`, `function avgCrit(store,list){...}`, `function calcRow(leg){...}` y `function hsBase(){...}` (con su cache `_hsCache`). **NO borrar** `badge(res,real)` ni `factorBadge(f)`: son formateadores puros (numero -> HTML de badge de color) que Task 20 sigue usando, solo que alimentados con el numero que ahora devuelve la API en vez de `calcRow()` local.

- [ ] **Step 2b: Mantener `defMes()` y `MESES`/`mesTxt()`**

`defMes()`, `MESES` y `mesTxt(m)` se usan solo para formatear/mostrar fechas en la UI (no para decidir logica de negocio) — quedan sin cambios.

- [ ] **Step 3: Reescribir las variables globales y `reload()`**

Reemplazar:

```js
let SESSION=null,users=[],personal=[],cfg={},crit={},cal={},evalData={},_hsCache={};
```

por (se quita `_hsCache`, que era el cache de `hsBase()`; `cal` se mantiene porque `daysOfMonth`/`dayInfo`/`calTotals` la siguen usando en Task 19):

```js
let SESSION=null,users=[],personal=[],cfg={},crit={},cal=defCalendarShape(),evalData={};
function defCalendarShape(){return{reglas:{lunJue:0,vie:0,sab:0,dom:0,descanso:0},feriados:{},dias:{}};}
```

Nota: `cal.reglas` sigue usando las claves camelCase que ya esperaban `dayInfo`/`calTotals` (`lunJue`, no `lun_jue`); Task 19 agrega un adaptador `mapCalendario` que traduce el shape de la API (columnas `lun_jue`, `horas_brutas`, `descuento`) a este shape, siguiendo el mismo principio de Task 17/18.

Reemplazar la funcion `reload()` completa (y `migrateCrit()` que llamaba, ya borrada en Step 2) por:

```js
function mapNiveles(rows) {
  return rows.map(r => ({ n: r.numero, pct: r.porcentaje, label: r.label }));
}
function mapCrit(rows) {
  return rows.map(c => ({ id: c.id, label: c.label, desc: c.descripcion, rub: c.rubricas }));
}
function mapFactores(rows) {
  const out = {};
  rows.forEach(f => { out[f.factor_key] = { ico: f.icono, label: f.label, peso: f.peso }; });
  return out;
}
async function reload() {
  const [cfgRes, criteriosRes, factoresRes, nivelesRes] = await Promise.all([
    Api.getConfig(), Api.getCriterios(), Api.getFactores(), Api.getNiveles(),
  ]);
  cfg = cfgRes;
  crit = {
    base: Number(cfg.bono_base_pct) || 0,
    factores: mapFactores(factoresRes),
    pred: mapCrit(criteriosRes.pred),
    sh: mapCrit(criteriosRes.sh),
    niveles: mapNiveles(nivelesRes),
  };
}
```

Esto deja `crit` con EXACTAMENTE la misma forma que usaba el resto del codigo (`crit.niveles[i].n/.pct/.label`, `crit.pred[i].id/.label/.desc/.rub`, `crit.factores.hs.ico/.label/.peso`), asi que ninguna funcion de render de Configuracion o del panel guia necesita cambios todavia (esas se ajustan en Task 19 solo para las funciones que ESCRIBEN cambios, no las que leen).

- [ ] **Step 4: Reescribir `setMes()` para que tambien persista en el backend**

Reemplazar:

```js
function setMes(m){cfg.mes=m;DB.save(K.cfg,cfg);syncMesInputs();}
```

por:

```js
async function setMes(m) {
  cfg.mes = m;
  syncMesInputs();
  try { await Api.saveConfig(cfg); } catch (err) { toast('No se pudo guardar el mes: ' + err.message, 'err'); }
}
```

- [ ] **Step 5: Reescribir autenticacion (`doLogin`, `logout`, `startApp`)**

Reemplazar:

```js
function doLogin(){const u=document.getElementById('l-user').value.trim(),p=document.getElementById('l-pass').value;
  const us=DB.load(K.users,[]).find(x=>x.user===u);
  if(!us||us.pass!==hash(p)){document.getElementById('l-err').textContent='Usuario o contraseña incorrectos';return;}
  SESSION={user:us.user,name:us.name,role:us.role,evaluador:us.evaluador};DB.save(K.sess,SESSION);startApp();}
function logout(){DB.clear(K.sess);location.reload();}
function startApp(){reload();
  document.getElementById('login').style.display='none';document.getElementById('app').style.display='grid';
  document.getElementById('u-name').textContent=SESSION.name;document.getElementById('u-role').textContent=ROLES[SESSION.role].label;
  document.getElementById('u-sector').textContent=SESSION.evaluador?('Evalúa: '+SESSION.evaluador):'';
  buildNav();syncMesInputs();goto(ROLES[SESSION.role].sees[0]);}
```

por:

```js
async function doLogin() {
  const u = document.getElementById('l-user').value.trim();
  const p = document.getElementById('l-pass').value;
  document.getElementById('l-err').textContent = '';
  try {
    const { user } = await Api.login(u, p);
    SESSION = { user: user.username, name: user.name, role: user.role, evaluador: user.evaluador_nombre };
    await reload();
    startApp();
  } catch (err) {
    document.getElementById('l-err').textContent = 'Usuario o contraseña incorrectos';
  }
}
async function logout() {
  try { await Api.logout(); } catch { /* si falla igual reiniciamos la vista */ }
  location.reload();
}
function startApp() {
  document.getElementById('login').style.display = 'none';
  document.getElementById('app').style.display = 'grid';
  document.getElementById('u-name').textContent = SESSION.name;
  document.getElementById('u-role').textContent = ROLES[SESSION.role].label;
  document.getElementById('u-sector').textContent = SESSION.evaluador ? ('Evalúa: ' + SESSION.evaluador) : '';
  buildNav(); syncMesInputs(); goto(ROLES[SESSION.role].sees[0]);
}
```

- [ ] **Step 6: Reescribir el arranque al final del script**

Reemplazar:

```js
seed();reload();
const s=DB.load(K.sess,null);if(s){SESSION=s;startApp();}
```

por:

```js
(async function boot() {
  try {
    const { user } = await Api.me();
    SESSION = { user: user.username, name: user.name, role: user.role, evaluador: user.evaluador_nombre };
    await reload();
    startApp();
  } catch {
    // sin sesion activa: se queda en la pantalla de login (ya visible por defecto)
  }
})();
```

- [ ] **Step 7: Verificar que el script inline sigue siendo JS valido**

Run:
```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('frontend/public/index.html', 'utf8');
const parts = html.split('<script>');
const last = parts[parts.length - 1].split('</script>')[0];
new Function(last);
console.log('OK: inline script parses');
"
```
Expected: `OK: inline script parses`.

- [ ] **Step 8: Prueba manual — login real end to end**

Requiere el backend y la base corriendo con seed aplicado (Tasks 1-14 ya completadas):

```bash
docker compose up -d --build db backend
docker compose run --rm backend npm run seed
docker compose up -d --build frontend
```

Abrir `http://localhost:3000`, ingresar `admin` / `Admin1234!`. Verificar en las DevTools (pestaña Network) que `POST /api/auth/login` devuelve `200` y trae un header `Set-Cookie` con `HttpOnly`, y que la app entra al dashboard mostrando "RRHH — Capital Humano" en la esquina inferior izquierda. Recargar la pagina (F5): la sesion debe mantenerse (llama a `GET /api/auth/me` con la cookie). Click en "Cerrar sesion": vuelve al login y una nueva recarga ya no entra sola.

- [ ] **Step 9: Commit**

```bash
git add frontend/public/index.html
git commit -m "feat(frontend): replace local auth and seed with real API auth"
```

### Task 17: Frontend — seccion Personal (admin)

**Principio general para todas las tareas de frontend que quedan (17-21):** en vez de renombrar campos por todo el archivo (`p.leg`, `p.nom`, `p.sec`, etc. aparecen en decenas de lugares: filtros, `ordNom`, exportacion a Excel, plantillas de fila), cada seccion define una funcion `mapX`/`toApiX` que traduce entre el shape de la API (`legajo`, `nombre`, `sector`, `sueldo_base`, ...) y el shape corto que el HTML original ya usaba (`leg`, `nom`, `sec`, `sueldo`, ...). Esto es lo que permite cumplir "no cambiar la logica de render" de forma literal: el codigo que YA existia sigue leyendo `p.leg`/`p.nom` sin tocarse; solo cambia de donde sale el objeto.

**Files:**
- Modify: `frontend/public/index.html`

**Interfaces:**
- Consumes: `Api.getPersonal`, `Api.createPersonal`, `Api.updatePersonal`, `Api.deletePersonal` de Task 15.
- Produces: `mapPersona(p)`/`toApiPersona(p)` — reusados por Task 18 (usuarios, para contar personas a cargo) y Task 20 no los necesita (evaluaciones/resultados traen sus propios campos, ver Task 20).

- [ ] **Step 1: Agregar los adaptadores `mapPersona`/`toApiPersona`**

Agregar cerca de `function esc(s){...}` (seccion UTILS) o justo antes de `rPersonal`:

```js
function mapPersona(p) {
  return {
    leg: p.legajo, nom: p.nombre, sec: p.sector, pue: p.puesto,
    evaluador: p.evaluador, tipo: p.tipo, spm: p.spm, estado: p.estado,
    acceso: p.acceso, sueldo: Number(p.sueldo_base) || 0,
  };
}
function toApiPersona(p) {
  return {
    legajo: p.leg, nombre: p.nom, sector: p.sec, puesto: p.pue,
    evaluador: p.evaluador, tipo: p.tipo, spm: !!p.spm, estado: p.estado,
    acceso: p.acceso, sueldo_base: p.sueldo,
  };
}
```

- [ ] **Step 2: Reescribir `rPersonal()` para que traiga la nomina de la API**

Reemplazar la primera linea de la funcion (el resto del cuerpo — filtros, armado de filas, `personaModal`/`delPersona` en los botones — queda IGUAL, sin tocar):

```js
async function rPersonal(){
  try { personal = (await Api.getPersonal()).map(mapPersona); }
  catch (err) { toast('No se pudo cargar la nomina: ' + err.message, 'err'); return; }
  const spmSi=personal.filter(p=>p.spm).length;
  document.getElementById('per-note').innerHTML=`La nómina tiene <b>${personal.length} personas</b> cargadas, <b>${spmSi} con Participa SPM = 1</b>. Se administra desde acá: alta, edición o baja según corresponda.`;
  // ... el resto de la funcion (fillSelect, filtros q/fs/fe/fest/fspm, armado de filas) sigue exactamente igual que en el HTML original
```

Nota de copy: se cambio la frase "La nómina de ejemplo viene de la SPM vigente..." porque ya no existe nomina de ejemplo (Task 14, punto "NO generar nómina demo" del spec) — dejar ese texto habria sido confuso/falso para un uso real. Es el unico cambio de texto visible de todo el frontend; el resto de la UI queda identica.

- [ ] **Step 3: Reescribir `savePersona`**

Reemplazar la funcion completa:

```js
async function savePersona(i) {
  const g = id => document.getElementById(id).value;
  const o = {
    leg: g('p-leg').trim(), nom: g('p-nom').trim(), sec: g('p-sec').trim(), pue: g('p-pue').trim(),
    evaluador: g('p-eval').trim() || '—', tipo: g('p-tipo'), spm: +g('p-spm'),
    estado: g('p-estado'), acceso: g('p-acceso'), sueldo: +g('p-sueldo') || 0,
  };
  if (!o.leg || !o.nom) { toast('Legajo y nombre obligatorios', 'err'); return; }
  try {
    if (i >= 0) await Api.updatePersonal(personal[i].leg, toApiPersona(o));
    else await Api.createPersonal(toApiPersona(o));
  } catch (err) {
    toast(err.message, 'err');
    return;
  }
  closeModal();
  await rPersonal();
  toast(i >= 0 ? 'Persona actualizada' : 'Persona dada de alta');
}
```

(`personaModal(i)` NO se toca: sigue leyendo `personal[i].leg/.nom/.sec/...` que ya vienen mapeados por `mapPersona`.)

- [ ] **Step 4: Reescribir `delPersona`**

```js
async function delPersona(i) {
  if (!confirm('¿Eliminar de la nómina? (para inactivar, mejor poné Estado = Baja)')) return;
  try {
    await Api.deletePersonal(personal[i].leg);
  } catch (err) {
    toast(err.message, 'err');
    return;
  }
  await rPersonal();
  toast('Eliminado', 'warn');
}
```

- [ ] **Step 5: Reescribir `applyImport` (el resto del flujo de importacion — `importModal`, `onImportFile`, `autoMap`, `showMapping`, `buildImport`, `impPreview` — no cambia, porque arma sus filas con los mismos nombres cortos `leg/nom/sec/...` que ya usaba)**

```js
async function applyImport(){
  const {out}=buildImport();
  if(!out.length){toast('No hay filas válidas (revisá Legajo y Nombre)','err');return;}
  const mode=document.getElementById('imp-mode').value;
  if(mode==='replace'&&!confirm(`¿Reemplazar TODA la nómina actual (${personal.length}) por las ${out.length} importadas?`))return;
  closeModal();
  try {
    if (mode === 'replace') {
      for (const p of personal) { await Api.deletePersonal(p.leg); }
      for (const im of out) { await Api.createPersonal(toApiPersona(im)); }
    } else {
      const existentes = new Set(personal.map(p => p.leg));
      for (const im of out) {
        if (existentes.has(im.leg)) await Api.updatePersonal(im.leg, toApiPersona(im));
        else await Api.createPersonal(toApiPersona(im));
      }
    }
  } catch (err) {
    toast('Error importando: ' + err.message, 'err');
  }
  await rPersonal();
  toast(`Nómina importada (${out.length} filas)`);
}
```

`exportMaestro()` no se toca: ya lee `p.leg/p.nom/p.sec/p.pue/p.evaluador/p.tipo/p.spm/p.estado/p.sueldo`, que siguen existiendo gracias a `mapPersona`.

- [ ] **Step 6: Verificar sintaxis**

Run:
```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('frontend/public/index.html', 'utf8');
const parts = html.split('<script>');
const last = parts[parts.length - 1].split('</script>')[0];
new Function(last);
console.log('OK: inline script parses');
"
```
Expected: `OK: inline script parses`.

- [ ] **Step 7: Prueba manual**

Con `docker compose up -d --build db backend frontend` corriendo y seed aplicado, entrar como `admin`, ir a "Personal": dar de alta una persona, editarla, exportar el maestro (xlsx se descarga), importar un archivo de prueba, y eliminar una persona. Verificar en cada paso que la tabla se actualiza y que recargando la pagina (F5) los cambios persisten (o sea, vienen de Postgres, no de localStorage).

- [ ] **Step 8: Commit**

```bash
git add frontend/public/index.html
git commit -m "feat(frontend): wire Personal section to the REST API"
```

### Task 18: Frontend — seccion Usuarios y permisos (admin)

Mismo principio de adaptador que Task 17: `mapUser` traduce `{id,username,name,role,evaluador_nombre}` de la API a `{id,user,name,role,evaluador}` que ya usaba el HTML original.

**Files:**
- Modify: `frontend/public/index.html`

**Interfaces:**
- Consumes: `Api.getUsers`, `Api.createUser`, `Api.updateUser`, `Api.deleteUser` de Task 15; `mapPersona` de Task 17 (para `countAsignados`/`evaluadoresConSPM`, que siguen leyendo el array `personal`).

- [ ] **Step 1: Agregar el adaptador `mapUser`**

```js
function mapUser(u) {
  return { id: u.id, user: u.username, name: u.name, role: u.role, evaluador: u.evaluador_nombre || '' };
}
```

- [ ] **Step 2: Reescribir `rUsers()`**

`countAsignados`, `evaluadoresConSPM` y `slugUser` NO cambian (siguen leyendo `personal`/`users` con los mismos nombres de campo). `rUsers()` ahora trae ambos arrays de la API antes de armar la tabla (el resto del cuerpo — el `forEach` que arma cada `<tr>` — queda igual):

```js
async function rUsers(){
  try {
    users = (await Api.getUsers()).map(mapUser);
    personal = (await Api.getPersonal()).map(mapPersona);
  } catch (err) { toast('No se pudieron cargar los usuarios: ' + err.message, 'err'); return; }
  const tb=document.getElementById('tb-users');tb.innerHTML='';
  users.forEach((u,i)=>{const tr=document.createElement('tr');
    let cargo='—';
    if(u.role==='supervisor'){const n=countAsignados(u.evaluador);
      cargo=n>0?`<span class="badge b-ok">${n}</span>`:`<span class="badge b-0" title="Ninguna persona de la nómina tiene este nombre en la columna Evaluador">0 ⚠</span>`;}
    else if(u.role==='syh'||u.role==='produccion'||u.role==='admin'){const n=personal.filter(p=>p.spm&&p.estado==='Activo').length;cargo=`<span class="badge b-no">${n} (todos)</span>`;}
    tr.innerHTML=`<td class="l mono">${u.user}</td><td class="l">${esc(u.name)}</td>
      <td><span class="badge b-role">${ROLES[u.role]?.label||u.role}</span></td><td class="l">${esc(u.evaluador||'—')}</td>
      <td>${cargo}</td>
      <td><button class="mini" onclick="userModal(${i})">Editar</button>
        <button class="del" onclick="delUser(${i})" ${u.user==='admin'?'disabled title="No se puede eliminar"':''}>✕</button></td>`;tb.appendChild(tr);});
}
```

(`userModal(i)` y `genSupervisoresModal()` NO se tocan: ya leen `users[i].user/.name/.role/.evaluador` y `personal`, que siguen existiendo con esos nombres.)

- [ ] **Step 3: Reescribir `saveUser`**

```js
async function saveUser(i){
  const edit=i>=0;
  const u=document.getElementById('m-user').value.trim(), n=document.getElementById('m-name').value.trim(),
    p=document.getElementById('m-pass').value, r=document.getElementById('m-role').value, ev=document.getElementById('m-eval').value.trim();
  try {
    if (edit) {
      const payload = { name: n || users[i].name, role: r, evaluador_nombre: (r === 'supervisor') ? ev : '' };
      if (p) payload.password = p;
      await Api.updateUser(users[i].id, payload);
    } else {
      if (!u || !p) { toast('Usuario y contraseña obligatorios', 'err'); return; }
      await Api.createUser({ username: u, password: p, name: n || u, role: r, evaluador_nombre: (r === 'supervisor') ? ev : '' });
    }
  } catch (err) {
    toast(err.message, 'err');
    return;
  }
  closeModal();
  await rUsers();
  toast(edit ? 'Usuario actualizado' : 'Usuario creado');
}
```

- [ ] **Step 4: Reescribir `delUser`**

```js
async function delUser(i){
  if(users[i].user==='admin')return;
  if(!confirm('¿Eliminar usuario?'))return;
  try { await Api.deleteUser(users[i].id); }
  catch (err) { toast(err.message, 'err'); return; }
  await rUsers();
  toast('Usuario eliminado','warn');
}
```

- [ ] **Step 5: Reescribir `genSupervisores`**

```js
async function genSupervisores(){
  const pass=document.getElementById('gs-pass').value||'sica2026';
  const evs=evaluadoresConSPM();
  const checks=[...document.querySelectorAll('.gs-chk')].filter(chk=>!chk.disabled&&chk.checked);
  let creados=0;
  for (const chk of checks) {
    const i=+chk.dataset.i;const ev=evs[i][0];
    const userInput=document.querySelector(`.gs-user[data-i="${i}"]`);const user=userInput.value.trim();
    if(!user)continue;
    if(users.some(x=>x.user===user)){toast(`El usuario "${user}" ya existe, saltado`,'err');continue;}
    const nombre=ev.split(',')[0].trim().split(' ').map(w=>w.charAt(0)+w.slice(1).toLowerCase()).join(' ');
    try {
      await Api.createUser({ username: user, password: pass, name: nombre, role: 'supervisor', evaluador_nombre: ev });
      creados++;
    } catch (err) {
      toast(`No se pudo crear "${user}": ${err.message}`,'err');
    }
  }
  if(creados){closeModal();await rUsers();toast(`${creados} supervisor(es) creado(s) · contraseña temporal`);}
  else{toast('No se creó ninguno (ya existían o sin selección)','warn');}
}
```

- [ ] **Step 6: Verificar sintaxis**

Run:
```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('frontend/public/index.html', 'utf8');
const parts = html.split('<script>');
const last = parts[parts.length - 1].split('</script>')[0];
new Function(last);
console.log('OK: inline script parses');
"
```
Expected: `OK: inline script parses`.

- [ ] **Step 7: Prueba manual**

Como `admin`, ir a "Usuarios y permisos": crear un usuario supervisor manualmente, editarlo, usar "Generar supervisores desde la nómina" (requiere tener personal con evaluador cargado desde Task 17), y eliminar un usuario. Verificar que el usuario `admin` no se puede eliminar (boton deshabilitado) y que iniciar sesion con un usuario recien creado funciona.

- [ ] **Step 8: Commit**

```bash
git add frontend/public/index.html
git commit -m "feat(frontend): wire Users section to the REST API"
```

### Task 19: Frontend — secciones Configuracion y Calendario laboral (admin / produccion)

**Files:**
- Modify: `frontend/public/index.html`

**Interfaces:**
- Consumes: `Api.getCalendario`, `Api.saveReglas`, `Api.saveFeriado`, `Api.saveDia` de Task 15; `Api.saveConfig`, `Api.saveFactores`, `Api.saveCriterios`, `Api.saveNiveles` de Task 15.
- Produces: `mapCalendario(apiCal)` — unico consumidor es esta seccion (Evaluaciones/Resultados en Task 20 no necesitan el calendario, solo el resultado ya calculado).

#### Calendario laboral

- [ ] **Step 1: Agregar el adaptador `mapCalendario`**

Traduce `{reglas:{lun_jue,vie,sab,dom,descanso}, feriados:{iso:nombre}, dias:{iso:{horas_brutas,descuento,nombre}}}` (forma de la API) a `{reglas:{lunJue,vie,sab,dom,descanso}, feriados:{iso:nombre}, dias:{iso:{brutas,desc,nombre}}}` (forma que ya esperaban `dayInfo`/`calTotals`, sin tocarlas):

```js
function mapCalendario(apiCal) {
  const dias = {};
  Object.entries(apiCal.dias || {}).forEach(([iso, d]) => {
    dias[iso] = { brutas: Number(d.horas_brutas), desc: Number(d.descuento), nombre: d.nombre || '' };
  });
  return {
    reglas: {
      lunJue: Number(apiCal.reglas.lun_jue), vie: Number(apiCal.reglas.vie), sab: Number(apiCal.reglas.sab),
      dom: Number(apiCal.reglas.dom), descanso: Number(apiCal.reglas.descanso),
    },
    feriados: { ...(apiCal.feriados || {}) },
    dias,
  };
}
```

- [ ] **Step 2: Separar `rCal()` (fetch) de `renderCal()` (pintado)**

`daysOfMonth`, `dayInfo`, `calTotals`, `renderCalTable`, `renderFeriados` NO cambian: siguen leyendo la variable global `cal`. Lo unico que cambia es que ahora `cal` se llena desde la API en vez de `localStorage`, y que el pintado se separa del fetch para que las funciones que modifican un campo puntual (Step 3) puedan re-pintar al instante sin re-descargar todo el mes.

Reemplazar la funcion `rCal()` completa por:

```js
async function rCal(){
  try { cal = mapCalendario(await Api.getCalendario(cfg.mes)); }
  catch (err) { toast('No se pudo cargar el calendario: ' + err.message, 'err'); return; }
  renderCal();
}
function renderCal(){
  document.getElementById('cal-mes').value=cfg.mes;
  const R=cal.reglas;document.getElementById('r-lunjue').value=R.lunJue;document.getElementById('r-vie').value=R.vie;
  document.getElementById('r-sab').value=R.sab;document.getElementById('r-dom').value=R.dom;document.getElementById('r-desc').value=R.descanso;
  const t=calTotals(cfg.mes);
  document.getElementById('cal-kpis').innerHTML=`
    <div class="kcard count"><div class="lbl">Días trabajados</div><div class="val">${t.dias}</div></div>
    <div class="kcard"><div class="lbl">Hs brutas</div><div class="val">${t.brutas}</div></div>
    <div class="kcard"><div class="lbl">Descansos</div><div class="val">${t.desc}</div></div>
    <div class="kcard avg"><div class="lbl">Hs esperadas base</div><div class="val">${t.netas}</div></div>`;
  renderFeriados();renderCalTable();
}
```

- [ ] **Step 3: Reescribir los mutadores del calendario (regla, feriados, dia especial)**

Cada uno mantiene el patron original — mutar `cal` local y repintar al instante — y ademas dispara el guardado contra la API; si el guardado falla, avisa y vuelve a sincronizar desde el servidor (`rCal()`):

```js
function setRegla(k,v){
  cal.reglas[k]=(v===''?0:+v);
  renderCal();
  Api.saveReglas({ lun_jue: cal.reglas.lunJue, vie: cal.reglas.vie, sab: cal.reglas.sab, dom: cal.reglas.dom, descanso: cal.reglas.descanso })
    .catch(async err => { toast('No se pudo guardar la regla: ' + err.message, 'err'); await rCal(); });
}
function renameFeriado(iso, nombre){
  cal.feriados[iso]=nombre;
  Api.saveFeriado(iso, nombre).catch(async err => { toast('No se pudo renombrar el feriado: ' + err.message, 'err'); await rCal(); });
}
function addFeriado(){
  const iso=cfg.mes+'-15';
  if(cal.feriados[iso]){toast('Ya hay un feriado ese día','err');return;}
  cal.feriados[iso]='Nuevo feriado';
  renderCal();
  Api.saveFeriado(iso, 'Nuevo feriado').catch(async err => { toast('No se pudo guardar el feriado: ' + err.message, 'err'); await rCal(); });
}
function delFeriado(iso){
  delete cal.feriados[iso];
  renderCal();
  Api.saveFeriado(iso, null).catch(async err => { toast('No se pudo quitar el feriado: ' + err.message, 'err'); await rCal(); });
}
function moveFeriado(oldIso,newIso){
  if(!newIso||newIso===oldIso)return;
  const nom=cal.feriados[oldIso];
  delete cal.feriados[oldIso];cal.feriados[newIso]=nom;
  renderCal();
  Promise.all([Api.saveFeriado(oldIso,null), Api.saveFeriado(newIso,nom)])
    .catch(async err => { toast('No se pudo mover el feriado: ' + err.message, 'err'); await rCal(); });
}
function setDia(iso,dow,campo,v){
  const cur=dayInfo(iso,dow);
  const o=cal.dias[iso]||{brutas:cur.brutas,desc:cur.desc,nombre:''};
  o[campo]=(v===''?0:+v);
  cal.dias[iso]=o;
  renderCal();
  Api.saveDia(iso, { horas_brutas: cal.dias[iso].brutas, descuento: cal.dias[iso].desc, nombre: cal.dias[iso].nombre || '' })
    .catch(async err => { toast('No se pudo guardar el día: ' + err.message, 'err'); await rCal(); });
}
function clearDia(iso){
  delete cal.dias[iso];
  renderCal();
  Api.saveDia(iso, { clear: true }).catch(async err => { toast('No se pudo restaurar el día: ' + err.message, 'err'); await rCal(); });
}
function markFeriado(iso){
  const nom=prompt('Nombre del feriado / día no laborable:','Feriado');
  if(nom===null)return;
  cal.feriados[iso]=nom||'Feriado';
  delete cal.dias[iso];
  renderCal();
  Promise.all([Api.saveFeriado(iso, nom || 'Feriado'), Api.saveDia(iso, { clear: true })])
    .catch(async err => { toast('No se pudo marcar el feriado: ' + err.message, 'err'); await rCal(); });
}
```

- [ ] **Step 4: Actualizar `renderFeriados()` para usar `renameFeriado`**

Cambiar solo el atributo `oninput` del input de nombre, dentro de `renderFeriados()`:

Reemplazar:
```js
<input class="txt name" value="${esc(nom)}" oninput="cal.feriados['${iso}']=this.value;DB.save(K.cal,cal)">
```
por:
```js
<input class="txt name" value="${esc(nom)}" oninput="renameFeriado('${iso}',this.value)">
```

#### Configuracion

- [ ] **Step 5: Reescribir `rCfg()`/`onCfg()` para traer el calendario del mes desde la API**

`renderFactores`, `renderCrit`, `renderNiveles`, `checkPesos` NO cambian (siguen leyendo `crit`, que Task 16 ya deja en la forma original). Reemplazar:

```js
async function rCfg(){
  document.getElementById('c-mes').value=cfg.mes;
  try { cal = mapCalendario(await Api.getCalendario(cfg.mes)); }
  catch (err) { toast('No se pudo cargar el calendario: ' + err.message, 'err'); }
  const t=calTotals(cfg.mes);
  document.getElementById('c-hn').value=t.brutas;document.getElementById('c-desc').value=t.desc;
  document.getElementById('c-hsbase').value=t.netas;document.getElementById('c-base').value=crit.base;
  renderFactores();renderCrit('pred');renderCrit('sh');renderNiveles();checkPesos();
}
async function onCfg(){
  cfg.mes=document.getElementById('c-mes').value;
  syncMesInputs();
  try { await Api.saveConfig(cfg); } catch (err) { toast('No se pudo guardar el mes: ' + err.message, 'err'); }
  await rCfg();
}
```

- [ ] **Step 6: Reescribir los mutadores de factores y bono base**

```js
async function setFactor(k,f,v){
  crit.factores[k][f]=(f==='peso')?(v===''?0:+v):v;
  checkPesos();
  const payload = Object.entries(crit.factores).map(([key, val]) => ({ factor_key: key, icono: val.ico, label: val.label, peso: val.peso }));
  try { await Api.saveFactores(payload); } catch (err) { toast('No se pudo guardar el factor: ' + err.message, 'err'); }
}
async function onWeights(){
  crit.base=+document.getElementById('c-base').value;
  try { await Api.saveConfig({ ...cfg, bono_base_pct: crit.base }); }
  catch (err) { toast('No se pudo guardar el bono base: ' + err.message, 'err'); }
}
```

- [ ] **Step 7: Reescribir los mutadores de criterios (Predisposicion / S&H)**

`renderCrit(grp)` no cambia. Agregar el adaptador y usarlo desde cada setter:

```js
function toApiCriterios() {
  const conv = list => list.map(c => ({ id: c.id, label: c.label, descripcion: c.desc, rubricas: c.rub }));
  return { pred: conv(crit.pred), sh: conv(crit.sh) };
}
async function saveCriteriosNow() {
  try { await Api.saveCriterios(toApiCriterios()); }
  catch (err) { toast('No se pudo guardar el criterio: ' + err.message, 'err'); }
}
function setCrit(grp,i,v){crit[grp][i].label=v;saveCriteriosNow();}
function setCritDesc(grp,i,v){crit[grp][i].desc=v;saveCriteriosNow();}
function setCritRub(grp,i,n,v){crit[grp][i].rub=crit[grp][i].rub||{};crit[grp][i].rub[n]=v;saveCriteriosNow();}
function addCrit(grp){crit[grp].push({id:uid(),label:'Nuevo criterio',desc:'',rub:{}});saveCriteriosNow();renderCrit(grp);toast('Criterio agregado');}
function delCrit(grp,i){if(crit[grp].length<=1){toast('Debe quedar al menos un criterio','err');return;}
  if(!confirm('¿Quitar este criterio? Cambia cuánto pesa cada uno de los restantes.'))return;crit[grp].splice(i,1);saveCriteriosNow();renderCrit(grp);toast('Criterio eliminado','warn');}
```

- [ ] **Step 8: Reescribir los mutadores de la escala de niveles**

`renderNiveles()` no cambia.

```js
function toApiNiveles() { return crit.niveles.map(l => ({ numero: l.n, label: l.label, porcentaje: l.pct })); }
async function saveNivelesNow() {
  try { await Api.saveNiveles(toApiNiveles()); }
  catch (err) { toast('No se pudo guardar la escala: ' + err.message, 'err'); }
}
function setNivel(i,f,v){crit.niveles[i][f]=(f==='pct')?(v===''?0:+v):v;saveNivelesNow();}
function addNivel(){const n=(crit.niveles.at(-1)?.n||0)+1;crit.niveles.push({n,pct:0,label:'Nivel '+n});saveNivelesNow();renderNiveles();}
function delNivel(i){if(crit.niveles.length<=2){toast('Deben quedar al menos 2 niveles','err');return;}crit.niveles.splice(i,1);crit.niveles.forEach((l,k)=>l.n=k+1);saveNivelesNow();renderNiveles();toast('Nivel eliminado','warn');}
function resetNiveles(){
  if(!confirm('¿Restaurar la escala 0/50/100/125?'))return;
  crit.niveles=[{n:1,pct:0,label:'No cumple'},{n:2,pct:50,label:'Regular'},{n:3,pct:100,label:'Esperado'},{n:4,pct:125,label:'Sobresaliente'}];
  saveNivelesNow();renderNiveles();toast('Escala restaurada');
}
```

(`resetNiveles()` ya no puede llamar a `defCriteria().niveles` porque esa funcion se borro en Task 16 — se deja la escala por defecto en linea, con los mismos valores que siembra `seed.js`.)

- [ ] **Step 9: Verificar sintaxis**

Run:
```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('frontend/public/index.html', 'utf8');
const parts = html.split('<script>');
const last = parts[parts.length - 1].split('</script>')[0];
new Function(last);
console.log('OK: inline script parses');
"
```
Expected: `OK: inline script parses`.

- [ ] **Step 10: Prueba manual**

Como `admin`: en Calendario, cambiar las horas de lunes a jueves, agregar y quitar un feriado, sobreescribir un dia puntual y marcarlo como feriado; verificar que los KPIs y la tabla se actualizan al instante. En Configuracion: cambiar el bono base, el peso de un factor (ver que `Σ = 100%` se recalcula), editar un criterio y su rubrica, y la escala de niveles. Recargar la pagina despues de cada cambio y confirmar que persiste (viene de Postgres). Como `produccion`, entrar a Calendario y confirmar que puede editarlo (tiene acceso segun `ROLES`) pero no ve Configuracion en el menu.

- [ ] **Step 11: Commit**

```bash
git add frontend/public/index.html
git commit -m "feat(frontend): wire Configuracion and Calendario sections to the REST API"
```

### Task 20: Frontend — Inicio y Evaluaciones (el corazon del sistema)

Esta es la seccion mas sensible: reemplaza `calcRow()` local por los campos ya calculados que devuelve la API (decision de diseno #4) y reemplaza `evalData` (blob unico en `localStorage`) por un cache local por seccion (`evalByLeg`) que se llena con lo que devuelve `GET /api/evaluaciones/:mes` cada vez que se entra a una pantalla que lo necesita.

**Files:**
- Modify: `frontend/public/index.html`

**Interfaces:**
- Consumes: `Api.getPersonal` (Task 15/17), `Api.getEvaluaciones`, `Api.saveEvaluacion`, `Api.finalizarEvaluacion`, `Api.getEstadoEvaluadores`, `Api.getMiEstado` (Task 15, con el agregado del Step 12b de Task 11).
- Produces: `mapEvalRow(e)`, `evalByLeg` (cache global por legajo con los datos + campos calculados del mes actual, poblado por `rInicio`/`rEval`/`rRes`).

- [ ] **Step 1: Quitar del cliente lo que ya no aplica**

Borrar `evaluables()` (ya no hay un array `personal` disponible para los roles no-admin: decision de diseno #2 — cada endpoint ya devuelve la porcion de gente que le corresponde a cada rol). Borrar tambien `getE`, `setE`, `setSub` (sus responsabilidades quedan inline en `onHoras`/`onCritChange`/`setCom`, ver Step 4).

**No borrar**: `nivSel`, `guiaShow`, `guiaFocus`, `guiaResumen`, `guiaInit`, `nivColorClass`, `nivelEsperado`, `ordNom`, `textMatch`, `uniq`, `fillSelect`, `badge`, `factorBadge`, `resPropio`, `fmt$` — son formateadores/helpers puros sin persistencia, no cambian una linea.

- [ ] **Step 2: Agregar los adaptadores de esta seccion**

```js
let evalByLeg = {};

function mapEvalRow(e) {
  return {
    leg: e.legajo, nom: e.nombre, sec: e.sector, evaluador: e.evaluador,
    vac: e.vac, real: e.real, pred: e.pred || {}, sh: e.sh || {}, com: e.com || {},
    hsEsp: e.hsEsp, fHs: e.fHs, fPr: e.fPr, fSh: e.fSh, res: e.res, inc: e.inc,
  };
}

function faltaJustificar(leg,grp){
  const e=evalByLeg[leg];if(!e)return false;
  const esp=nivelEsperado();const store=e[grp]||{};const list=(grp==='pred'?crit.pred:crit.sh);
  const hayDesvio=list.some(c=>{const v=store[c.id];return v!==undefined&&v!==''&&+v!==esp;});
  const com=(e.com&&e.com[grp]||'').trim();
  return hayDesvio&&!com;
}
```

(`faltaJustificar` reemplaza a la version original que leia `evalData[cfg.mes]?.[leg]`; el resto de su cuerpo es identico.)

- [ ] **Step 3: Reescribir `rInicio()` y `renderAvance()`**

```js
async function rInicio(){
  document.getElementById('pill-inicio').textContent=mesTxt(cfg.mes);
  let parts=[];
  try {
    personal = (await Api.getPersonal()).map(mapPersona);
    parts = personal.filter(p=>p.spm&&p.estado==='Activo');
    const evalMap = await Api.getEvaluaciones(cfg.mes);
    evalByLeg = {}; Object.values(evalMap).map(mapEvalRow).forEach(p => { evalByLeg[p.leg] = p; });
  } catch (err) { toast('No se pudo cargar el inicio: ' + err.message, 'err'); }
  let done=0; parts.forEach(p=>{const e=evalByLeg[p.leg];if(e&&+e.real>0)done++;});
  document.getElementById('inicio-kpis').innerHTML=`
    <div class="kcard count"><div class="lbl">Nómina total</div><div class="val">${personal.length}</div></div>
    <div class="kcard avg"><div class="lbl">Participan SPM (activos)</div><div class="val">${parts.length}</div></div>
    <div class="kcard"><div class="lbl">Con horas cargadas</div><div class="val">${done}</div></div>`;
  document.getElementById('inicio-quick').innerHTML=`<button class="btn-primary" onclick="goto('eval')">Cargar Evaluaciones</button>
    <button class="btn-ghost" onclick="goto('personal')">Ver Personal</button><button class="btn-ghost" onclick="goto('res')">Ver Resultados</button>`;
  renderAvance();
}
async function renderAvance(){
  const box=document.getElementById('inicio-avance');if(!box)return;
  let estado;
  try { estado = await Api.getEstadoEvaluadores(cfg.mes); }
  catch { box.innerHTML=''; return; }
  let done=0;
  const rows=estado.map(u=>{if(u.finalizado_at)done++;
    return `<tr><td class="l">${esc(u.name)}</td><td>${ROLES[u.role].label}</td>
      <td>${u.finalizado_at?`<span class="badge b-top">✓ Finalizó ${mesTxt(cfg.mes)}</span> <span style="font-size:10px;color:var(--t2)">${new Date(u.finalizado_at).toLocaleString('es-AR')}</span>`:'<span class="badge b-low">Pendiente</span>'}</td></tr>`;}).join('');
  box.innerHTML=`<h3>Avance de evaluaciones · ${mesTxt(cfg.mes)}</h3>
    <div class="phelp">${done} de ${estado.length} evaluadores marcaron su evaluación como finalizada.</div>
    <div class="tscroll"><table><thead><tr><th class="l">Evaluador</th><th>Rol</th><th class="l">Estado</th></tr></thead><tbody>${rows||'<tr><td colspan="3" style="text-align:center;color:var(--t3);padding:20px">No hay evaluadores cargados en Usuarios.</td></tr>'}</tbody></table></div>`;
}
```

- [ ] **Step 4: Reescribir `rEval()`**

El armado de filtros, cabecera de tabla y filas queda casi identico al original — la unica diferencia real es que los valores `hsEsp/fHs/fPr/fSh/res` salen del objeto ya mapeado (`p.hsEsp`, `p.fHs`, ...) en vez de llamar a `calcRow(p.leg)`:

```js
async function rEval(){
  const perm=ROLES[SESSION.role],carga=perm.carga;const F=crit.factores;
  let desc='',scope='';
  if(carga==='todo'){desc='Carga completa de todos los factores';scope=`Administrador: cargás ${F.hs.label}, ${F.pred.label} y ${F.sh.label} de los participantes SPM activos.`;}
  else if(carga==='pred'){desc=crit.pred.map(c=>c.label).join(' · ');scope=`Supervisor: evaluás ${F.pred.label} de las personas donde figurás como Evaluador ("${SESSION.evaluador}").`;}
  else if(carga==='sh'){desc=crit.sh.map(c=>c.label).join(' · ');scope=`Seguridad e Higiene: evaluás ${F.sh.label} del 100% de los participantes SPM activos.`;}
  else if(carga==='hs'){desc='Vacaciones · Horas esperadas · Horas reales';scope=`Gerente de Producción: cargás ${F.hs.label} (vacaciones y horas reales) del 100% de los participantes SPM activos.`;}
  document.getElementById('eval-desc').textContent=desc;document.getElementById('eval-scope').textContent=scope;
  document.getElementById('eval-legend').innerHTML=`<span><b>Niveles:</b> ${crit.niveles.map(l=>`${l.n} = ${esc(l.label)} (${l.pct}%)`).join(' · ')}</span>`;

  let base;
  try {
    const evalMap = await Api.getEvaluaciones(cfg.mes);
    base = Object.values(evalMap).map(mapEvalRow);
  } catch (err) { toast('No se pudo cargar las evaluaciones: ' + err.message, 'err'); return; }
  evalByLeg = {}; base.forEach(p => { evalByLeg[p.leg] = p; });

  const showEvFilter=!perm.onlyMine;
  document.getElementById('ef-evaluador').style.display=showEvFilter?'':'none';
  fillSelect('ef-sector',uniq(base,'sec'),'Sector (todos)');
  if(showEvFilter)fillSelect('ef-evaluador',uniq(base,'evaluador'),'Evaluador (todos)');
  const q=document.getElementById('ef-search').value,fs=document.getElementById('ef-sector').value,fe=showEvFilter?document.getElementById('ef-evaluador').value:'';
  const people=base.filter(p=>textMatch(p,q)&&(!fs||p.sec===fs)&&(!fe||p.evaluador===fe)).sort(ordNom);
  document.getElementById('eval-count').innerHTML=`<b>${people.length}</b> a evaluar`;
  document.getElementById('ev-horas-btns').innerHTML=(carga==='hs')?`<button class="btn-ghost" onclick="exportHoras()">↓ Maestro de horas (xlsx)</button><button class="btn-ghost" onclick="importHorasModal()">↑ Importar horas</button>`
    :(carga==='sh')?`<button class="btn-ghost" onclick="exportSH()">↓ Maestro S&H (xlsx)</button><button class="btn-ghost" onclick="importSHModal()">↑ Importar S&H</button>`:'';
  const emptyEl=document.getElementById('eval-empty');emptyEl.style.display=people.length?'none':'block';
  if(!people.length){
    emptyEl.innerHTML = (perm.onlyMine&&base.length===0)
      ? `No hay personal con <b>Evaluador = "${esc(SESSION.evaluador)}"</b> entre los participantes SPM activos.<br>Pedile al Administrador que te asigne personal: en <b>Personal</b>, cada persona tuya debe tener ese nombre en la columna Evaluador (o cargalo al importar la nómina).`
      : 'No hay personal para evaluar con este filtro.';
  }

  const showHs=(carga==='todo'||carga==='hs'),showPr=(carga==='todo'||carga==='pred'),showSh=(carga==='todo'||carga==='sh');
  const comGrp=(carga==='pred')?'pred':(carga==='sh')?'sh':null;
  let th='<tr><th class="l">Legajo</th><th class="l">Nombre</th><th class="l col-sec">Sector</th>';
  if(!perm.onlyMine)th+='<th class="col-ev">Evaluador</th>';
  if(showHs)th+='<th>Vac</th><th>Hs esp.</th><th>Hs reales</th><th>F.Hs</th>';
  if(showPr)th+=crit.pred.map(c=>`<th>${esc(c.label)}</th>`).join('')+'<th>F.Pred</th>';
  if(showSh)th+=crit.sh.map(c=>`<th>${esc(c.label)}</th>`).join('')+'<th>F.S&H</th>';
  th+='<th>Resultado</th>';
  if(comGrp)th+='<th class="l">Observaciones</th>';
  th+='</tr>';document.getElementById('th-eval').innerHTML=th;

  const tb=document.getElementById('tb-eval');tb.innerHTML='';
  people.forEach(p=>{
    const falta=comGrp&&faltaJustificar(p.leg,comGrp);
    let row=`<td class="l mono">${p.leg}</td><td class="l">${esc(p.nom)}</td><td class="l col-sec">${esc(p.sec)}</td>`;
    if(!perm.onlyMine)row+=`<td class="col-ev">${esc(p.evaluador)}</td>`;
    if(showHs)row+=`<td><input class="num" type="number" step="0.5" value="${p.vac||0}" oninput="onHoras('${p.leg}','vac',this.value)"></td>
      <td class="calc f" id="hse_${p.leg}">${p.hsEsp}</td><td><input class="num" type="number" step="0.5" value="${p.real||0}" oninput="onHoras('${p.leg}','real',this.value)"></td><td class="calc f" id="fhs_${p.leg}">${p.fHs.toFixed(3)}</td>`;
    if(showPr)row+=crit.pred.map(cc=>nivSel(p.leg,'pred',cc.id,p.pred?.[cc.id])).join('')+`<td class="calc f" id="fpr_${p.leg}">${p.fPr.toFixed(3)}</td>`;
    if(showSh)row+=crit.sh.map(cc=>nivSel(p.leg,'sh',cc.id,p.sh?.[cc.id])).join('')+`<td class="calc f" id="fsh_${p.leg}">${p.fSh.toFixed(3)}</td>`;
    row+=`<td id="resu_${p.leg}">${carga==='todo'?badge(p.res,p.real):factorBadge(resPropio(p,carga))}</td>`;
    if(comGrp){const com=esc(p.com&&p.com[comGrp]||'');
      row+=`<td class="l"><input class="txt" id="com_${p.leg}" style="min-width:180px${falta?';border-color:var(--amb)':''}" value="${com}" placeholder="${falta?'⚠ Justificá la nota ≠ Esperado':'Observaciones (opcional)'}" onchange="setCom('${p.leg}','${comGrp}',this.value);onComChange('${p.leg}','${comGrp}')"></td>`;}
    const tr=document.createElement('tr');tr.id='row_'+p.leg;if(falta)tr.style.background='rgba(244,169,0,.06)';tr.innerHTML=row;tb.appendChild(tr);
  });
  guiaInit(carga);renderFinEstado();
}
```

(`nivSel`, `guiaInit`, `onComChange` no cambian.)

- [ ] **Step 5: Reescribir `onHoras`, `onCritChange`, `setCom`**

```js
async function onHoras(leg,campo,val){
  const e=evalByLeg[leg];e[campo]=(val===''?0:+val);
  let c;
  try { c = await Api.saveEvaluacion(cfg.mes, leg, { [campo]: e[campo] }); }
  catch (err) { toast('No se pudo guardar: ' + err.message, 'err'); return; }
  Object.assign(e, c);
  const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
  set('hse_'+leg,c.hsEsp);set('fhs_'+leg,c.fHs.toFixed(3));
  const carga=ROLES[SESSION.role].carga;
  const resu=document.getElementById('resu_'+leg);if(resu)resu.innerHTML=carga==='todo'?badge(c.res,c.real):factorBadge(resPropio(c,carga));
}
async function onCritChange(leg,grp,cid,val){
  const e=evalByLeg[leg];e[grp][cid]=(val===''?0:+val);
  let c;
  try { c = await Api.saveEvaluacion(cfg.mes, leg, { [grp]: { [cid]: val } }); }
  catch (err) { toast('No se pudo guardar: ' + err.message, 'err'); return; }
  Object.assign(e, c);
  const carga=ROLES[SESSION.role].carga;
  const fEl=document.getElementById((grp==='pred'?'fpr_':'fsh_')+leg);if(fEl)fEl.textContent=(grp==='pred'?c.fPr:c.fSh).toFixed(3);
  const resu=document.getElementById('resu_'+leg);if(resu)resu.innerHTML=carga==='todo'?badge(c.res,c.real):factorBadge(resPropio(c,carga));
  const comGrp=(carga==='pred')?'pred':(carga==='sh')?'sh':null;
  if(comGrp===grp){const falta=faltaJustificar(leg,grp);const tr=document.getElementById('row_'+leg);if(tr)tr.style.background=falta?'rgba(244,169,0,.06)':'';
    const com=document.getElementById('com_'+leg);if(com){com.style.borderColor=falta?'var(--amb)':'';com.placeholder=falta?'⚠ Justificá la nota ≠ Esperado':'Observaciones (opcional)';}}
  guiaShow(grp,cid,val);
}
async function setCom(leg,grp,v){
  const e=evalByLeg[leg];e.com=e.com||{};e.com[grp]=v;
  try { await Api.saveEvaluacion(cfg.mes, leg, { com: { [grp]: v } }); }
  catch (err) { toast('No se pudo guardar la observación: ' + err.message, 'err'); }
}
```

(`onComChange` no cambia: solo repinta el estilo de la fila leyendo `faltaJustificar`.)

- [ ] **Step 6: Reescribir `finalizarEval` y `renderFinEstado`**

```js
async function finalizarEval(){
  try { await Api.finalizarEvaluacion(cfg.mes); }
  catch (err) { toast('No se pudo finalizar: ' + err.message, 'err'); return; }
  renderFinEstado();
  toast('Evaluación marcada como finalizada. Podés seguir editando si hace falta.');
}
async function renderFinEstado(){
  const btn=document.getElementById('btn-fin'),est=document.getElementById('fin-estado');
  if(ROLES[SESSION.role].carga==='todo'){if(btn)btn.style.display='none';if(est)est.textContent='';return;}
  if(btn)btn.style.display='';
  let f;
  try { f = await Api.getMiEstado(cfg.mes); } catch { f = { finalizado_at: null }; }
  if(f.finalizado_at){est.innerHTML=`<span class="badge b-ok">✓ Finalizada ${new Date(f.finalizado_at).toLocaleString('es-AR')}</span>`;btn.textContent='Re-finalizar';}
  else{est.textContent='';btn.textContent='✓ Finalizar mi evaluación';}
}
```

- [ ] **Step 7: Reescribir `exportHoras`, `exportSH`, `applyHoras`, `applySH`**

`exportHoras`/`exportSH` leen del cache local `evalByLeg` en vez de `evaluables()`+`evalData`:

```js
function exportHoras(){
  const people=Object.values(evalByLeg).slice().sort(ordNom);
  const rows=people.map(p=>({'Legajo':p.leg,'Apellido y Nombre':p.nom,'Vac':+p.vac||0,'Hs reales':+p.real||0}));
  const ws=XLSX.utils.json_to_sheet(rows);ws['!cols']=[{wch:8},{wch:30},{wch:8},{wch:10}];
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Horas');
  const help=[{Campo:'Legajo',Nota:'No lo cambies: identifica a la persona.'},
    {Campo:'Apellido y Nombre',Nota:'Referencia, no se reimporta.'},
    {Campo:'Vac',Nota:'Horas de vacaciones/licencia del mes (se restan a las esperadas).'},
    {Campo:'Hs reales',Nota:'Horas realmente trabajadas en el mes.'}];
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(help),'Instructivo');
  XLSX.writeFile(wb,`Horas_${cfg.mes}.xlsx`);toast('Maestro de horas exportado');
}
function exportSH(){
  const people=Object.values(evalByLeg).slice().sort(ordNom);
  const rows=people.map(p=>{
    const o={'Legajo':p.leg,'Apellido y Nombre':p.nom,'Sector':p.sec};
    crit.sh.forEach(c=>o[c.label]=(p.sh[c.id]===undefined||p.sh[c.id]==='')?'':p.sh[c.id]);
    o['Observaciones']=(p.com&&p.com.sh)||'';return o;});
  const ws=XLSX.utils.json_to_sheet(rows);
  ws['!cols']=[{wch:8},{wch:30},{wch:20},...crit.sh.map(()=>({wch:14})),{wch:40}];
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'S&H');
  const help=[{Campo:'Legajo',Nota:'No lo cambies: identifica a la persona.'},
    {Campo:'Apellido y Nombre / Sector',Nota:'Referencia, no se reimportan.'},
    ...crit.sh.map(c=>({Campo:c.label,Nota:'Puntuación 1 a 4 (1=0% · 2=50% · 3=100% · 4=125%). Vacío = sin evaluar.'})),
    {Campo:'Observaciones',Nota:'Obligatorio si alguna nota es distinta de 3 (Esperado).'}];
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(help),'Instructivo');
  XLSX.writeFile(wb,`SH_${cfg.mes}.xlsx`);toast('Maestro de S&H exportado');
}
```

`importHorasModal`/`onImportHoras`/`autoMapHoras`/`showHorasMapping`/`importSHModal`/`onImportSH`/`findColSH`/`showSHMapping`/`normNiv` NO cambian (arman `_hrRows`/`_shRows` a partir del Excel, sin tocar persistencia). Solo `applyHoras`/`applySH` cambian, porque son los que efectivamente guardan:

```js
async function applyHoras(){
  const g=f=>document.getElementById('hrmap-'+f).value;const map={leg:g('leg'),vac:g('vac'),real:g('real')};
  if(!map.leg){toast('Falta mapear el Legajo','err');return;}
  if(!map.vac&&!map.real){toast('Mapeá al menos Vac o Hs reales','err');return;}
  let n=0,noEnc=0;
  for (const r of _hrRows) {
    const leg=String(r[map.leg]).trim();if(!leg)continue;
    if(!evalByLeg[leg]){noEnc++;continue;}
    const patch={};
    if(map.vac!=='')patch.vac=parseMonto(r[map.vac]);
    if(map.real!=='')patch.real=parseMonto(r[map.real]);
    try { await Api.saveEvaluacion(cfg.mes, leg, patch); n++; }
    catch (err) { toast(`Error en legajo ${leg}: ${err.message}`, 'err'); }
  }
  closeModal();await rEval();toast(`Horas actualizadas: ${n} persona(s)`+(noEnc?` · ${noEnc} legajo(s) no encontrados`:''));
}
async function applySH(){
  const legCol=document.getElementById('shmap-leg').value;
  if(!legCol){toast('Falta mapear el Legajo','err');return;}
  const cMap=crit.sh.map((c,i)=>document.getElementById('shmap-c'+i).value);
  const obsCol=document.getElementById('shmap-obs').value;
  let n=0,noEnc=0;
  for (const r of _shRows) {
    const leg=String(r[legCol]).trim();if(!leg)continue;
    if(!evalByLeg[leg]){noEnc++;continue;}
    const patch={sh:{}};
    crit.sh.forEach((c,i)=>{if(cMap[i]!=='')patch.sh[c.id]=normNiv(r[cMap[i]]);});
    if(obsCol!=='')patch.com={sh:String(r[obsCol]||'')};
    try { await Api.saveEvaluacion(cfg.mes, leg, patch); n++; }
    catch (err) { toast(`Error en legajo ${leg}: ${err.message}`, 'err'); }
  }
  closeModal();await rEval();toast(`S&H actualizado: ${n} persona(s)`+(noEnc?` · ${noEnc} legajo(s) no encontrados`:''));
}
```

- [ ] **Step 8: Verificar sintaxis**

Run:
```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('frontend/public/index.html', 'utf8');
const parts = html.split('<script>');
const last = parts[parts.length - 1].split('</script>')[0];
new Function(last);
console.log('OK: inline script parses');
"
```
Expected: `OK: inline script parses`.

- [ ] **Step 9: Prueba manual**

Como `produccion`, cargar horas reales de un participante y ver que `F.Hs` y el badge de Resultado se actualizan al tipear (sin recargar la pagina). Como `foos` (supervisor), cargar niveles de Predisposición para su gente y ver el panel guía con la rúbrica del criterio enfocado. Como `schmidt` (syh), cargar S&H e importar un Excel de S&H de prueba. Confirmar en cada caso que recargando la página (F5) los valores cargados siguen ahí. Probar "Finalizar mi evaluación" y ver el badge de estado.

- [ ] **Step 10: Commit**

```bash
git add frontend/public/index.html
git commit -m "feat(frontend): wire Inicio and Evaluaciones sections to the REST API"
```

### Task 21: Frontend — Dashboard, Resultados e Historial

**Files:**
- Modify: `frontend/public/index.html`

**Interfaces:**
- Consumes: `Api.getResultados`, `Api.getHistorial`, `Api.cerrarPeriodo`, `Api.deleteHistorial` de Task 15.
- Produces: `mapResultado(r)`.

- [ ] **Step 1: Agregar el adaptador `mapResultado`**

```js
function mapResultado(r) {
  return {
    leg: r.legajo, nom: r.nombre, sec: r.sector, evaluador: r.evaluador,
    sueldo: r.sueldo_base, hsEsp: r.hsEsp, real: r.real,
    fHs: r.fHs, fPr: r.fPr, fSh: r.fSh, res: r.res, inc: r.inc,
  };
}
```

Nota: para los roles que no son admin, el backend no manda `sueldo_base` ni `inc` (decision de diseno #2); `mapResultado` deja esos campos en `undefined`, que es exactamente lo que hacia el chequeo `perm.money&&people.some(p=>+p.sueldo>0)` del original cuando no habia sueldo cargado — no hace falta ninguna rama especial para eso.

- [ ] **Step 2: Reescribir `rDash()`**

```js
let dashPeople = [];
let chDist, chSec;
async function rDash(){
  document.getElementById('pill-dash').textContent=mesTxt(cfg.mes);
  let all;
  try { all = (await Api.getResultados(cfg.mes)).map(mapResultado); }
  catch (err) { toast('No se pudieron cargar los resultados: ' + err.message, 'err'); return; }
  dashPeople = all;
  const people=all.filter(p=>p.real>0);let tRes=0,tMoney=0;
  const buckets={'Sin bono':0,'Bajo esperado':0,'Esperado':0,'Sobresaliente':0};const bySec={};const base=(+crit.base||0)/100;
  people.forEach(p=>{tRes+=p.res;tMoney+=p.inc||0;
    if(p.res===0)buckets['Sin bono']++;else if(p.res<base*0.95)buckets['Bajo esperado']++;else if(p.res<=base*1.02)buckets['Esperado']++;else buckets['Sobresaliente']++;
    bySec[p.sec]=bySec[p.sec]||{s:0,n:0};bySec[p.sec].s+=p.res;bySec[p.sec].n++;});
  const n=people.length;const haySueldos=people.some(p=>+p.sueldo>0);
  document.getElementById('dash-kpis').innerHTML=`<div class="kcard count"><div class="lbl">Evaluados</div><div class="val">${n}</div></div>
    <div class="kcard avg"><div class="lbl">Resultado prom.</div><div class="val">${n?(tRes/n*100).toFixed(1):0}%</div></div>`+
    (haySueldos?`<div class="kcard money"><div class="lbl">Simulación · total $</div><div class="val">${fmt$(tMoney)}</div></div>
    <div class="kcard money"><div class="lbl">Simulación · prom. $</div><div class="val">${fmt$(n?tMoney/n:0)}</div></div>`:'');
  const c1=document.getElementById('ch-dist').getContext('2d');if(chDist)chDist.destroy();
  chDist=new Chart(c1,{type:'doughnut',data:{labels:Object.keys(buckets),datasets:[{data:Object.values(buckets),backgroundColor:['#E53935','#F4A900','#2979FF','#1DB954'],borderColor:'#0E1824',borderWidth:2}]},options:{plugins:{legend:{labels:{color:'#657FA0',font:{size:11}}}}}});
  const sl=Object.keys(bySec),sv=sl.map(s=>bySec[s].s/bySec[s].n*100);const c2=document.getElementById('ch-sector').getContext('2d');if(chSec)chSec.destroy();
  chSec=new Chart(c2,{type:'bar',data:{labels:sl,datasets:[{data:sv,backgroundColor:'#2979FF',borderRadius:5}]},options:{plugins:{legend:{display:false}},scales:{x:{ticks:{color:'#657FA0',font:{size:9}},grid:{display:false}},y:{ticks:{color:'#657FA0',callback:v=>v+'%'},grid:{color:'#1C2E44'}}}}});
}
```

(Identico al original salvo la primera linea del `try`: antes filtraba `personal` local y llamaba `calcRow(p.leg)` por cada uno, ahora usa directamente lo que ya viene calculado de `/api/resultados/:mes`.)

- [ ] **Step 3: Reescribir `rRes()` y `exportXLSX()`**

`rRes()` tambien necesita refrescar `evalByLeg` (Task 20) para que `faltaJustificar` funcione aunque el usuario entre directo a Resultados sin haber pasado por Evaluaciones:

```js
let resPeopleAll = [];
async function rRes(){
  const perm=ROLES[SESSION.role];document.getElementById('pill-res').textContent=mesTxt(cfg.mes);
  document.getElementById('res-desc').textContent=perm.onlyMine?`Tus evaluados (${SESSION.evaluador})`:(perm.role==='syh'?'Todos los participantes SPM':'Consolidado del resultado (%). El $ es simulación opcional.');
  let base;
  try {
    base = (await Api.getResultados(cfg.mes)).map(mapResultado);
    const evalMap = await Api.getEvaluaciones(cfg.mes);
    evalByLeg = {}; Object.values(evalMap).map(mapEvalRow).forEach(p => { evalByLeg[p.leg] = p; });
  } catch (err) { toast('No se pudieron cargar los resultados: ' + err.message, 'err'); return; }
  resPeopleAll = base;
  document.getElementById('rf-evaluador').style.display=perm.onlyMine?'none':'';
  fillSelect('rf-sector',uniq(base,'sec'),'Sector (todos)');
  if(!perm.onlyMine)fillSelect('rf-evaluador',uniq(base,'evaluador'),'Evaluador (todos)');
  const q=document.getElementById('rf-search').value,fs=document.getElementById('rf-sector').value,fe=perm.onlyMine?'':document.getElementById('rf-evaluador').value;
  const people=base.filter(p=>textMatch(p,q)&&(!fs||p.sec===fs)&&(!fe||p.evaluador===fe)).sort(ordNom);
  const sinJust=people.filter(p=>faltaJustificar(p.leg,'pred')||faltaJustificar(p.leg,'sh')).length;
  document.getElementById('res-count').innerHTML=`<b>${people.length}</b> personas`+(sinJust?` · <span style="color:var(--amb)">${sinJust} sin justificar ⚠</span>`:'');
  const emptyR=document.getElementById('res-empty');emptyR.style.display=people.length?'none':'block';
  if(!people.length&&perm.onlyMine&&base.length===0)emptyR.innerHTML=`No tenés personal con Evaluador = "${esc(SESSION.evaluador)}". Pedile al Administrador que te lo asigne en Personal.`;
  const carga=perm.carga,esAdmin=(carga==='todo');
  const simMoney=perm.money&&people.some(p=>+p.sueldo>0);
  let th='<tr><th class="l">Legajo</th><th class="l">Nombre</th><th class="l col-sec">Sector</th>';
  if(esAdmin)th+='<th>F.Hs</th><th>F.Pred</th><th>F.S&H</th><th>Resultado</th>';
  else th+=`<th>${carga==='pred'?'F.Pred':carga==='sh'?'F.S&H':'F.Hs'}</th><th>Resultado</th>`;
  if(simMoney)th+='<th>Sueldo (sim.)</th><th>Incentivo $ (sim.)</th>';th+='</tr>';document.getElementById('th-res').innerHTML=th;
  const tb=document.getElementById('tb-res');tb.innerHTML='';
  people.forEach(p=>{
    let row=`<td class="l mono">${p.leg}</td><td class="l">${esc(p.nom)}</td><td class="l col-sec">${esc(p.sec)}</td>`;
    if(esAdmin)row+=`<td class="calc f">${p.fHs.toFixed(3)}</td><td class="calc f">${p.fPr.toFixed(3)}</td><td class="calc f">${p.fSh.toFixed(3)}</td><td>${badge(p.res,p.real)}</td>`;
    else{const f=resPropio(p,carga);row+=`<td class="calc f">${f.toFixed(3)}</td><td>${factorBadge(f)}</td>`;}
    if(simMoney)row+=`<td class="calc">${fmt$(p.sueldo)}</td><td class="calc" style="color:var(--grn);font-weight:600">${fmt$(p.inc)}</td>`;
    const tr=document.createElement('tr');tr.innerHTML=row;tb.appendChild(tr);
  });
}
function exportXLSX(){
  const perm=ROLES[SESSION.role],carga=perm.carga;
  const q=document.getElementById('rf-search').value,fs=document.getElementById('rf-sector').value,fe=perm.onlyMine?'':document.getElementById('rf-evaluador').value;
  const people=resPeopleAll.filter(p=>textMatch(p,q)&&(!fs||p.sec===fs)&&(!fe||p.evaluador===fe)).sort(ordNom);
  const data=people.map(p=>{
    const resVal=(carga==='todo'?p.res:resPropio(p,carga))*100;
    return {'Legajo':p.leg,'Apellido y Nombre':p.nom,'Resultado':resVal.toFixed(2).replace('.',',')};
  });
  const ws=XLSX.utils.json_to_sheet(data);ws['!cols']=[{wch:10},{wch:32},{wch:12}];
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Resultados '+cfg.mes);
  XLSX.writeFile(wb,`Resultados_Bono_${cfg.mes}.xlsx`);toast('Resultados exportados');
}
```

- [ ] **Step 4: Reescribir `rHist()`, `cerrarPeriodo()`, `delHist()`**

`cerrarPeriodo()` se simplifica mucho: el backend (Task 13) ya hace todo el calculo del snapshot, el cliente solo dispara el POST y refresca. `delHist` ahora recibe el `mes` directamente (string) en vez de un indice invertido sobre un array local — es mas simple y menos propenso a errores que la cuenta `hist.length-1-idx` del original:

```js
async function rHist(){
  const perm=ROLES[SESSION.role];
  let hist;
  try { hist = await Api.getHistorial(); }
  catch (err) { toast('No se pudo cargar el historial: ' + err.message, 'err'); return; }
  document.getElementById('th-hist-money').style.display=perm.money?'':'none';
  document.getElementById('hist-actions').innerHTML=(perm.role==='admin')?`<button class="btn-ok" onclick="cerrarPeriodo()">Cerrar período ${mesTxt(cfg.mes)}</button>`:'';
  const tb=document.getElementById('tb-hist');tb.innerHTML='';document.getElementById('hist-empty').style.display=hist.length?'none':'block';
  hist.slice().reverse().forEach(h=>{const tr=document.createElement('tr');
    tr.innerHTML=`<td class="l mono">${mesTxt(h.mes)}</td><td>${h.n}</td><td class="calc">${(h.avg*100).toFixed(1)}%</td>
      <td class="calc" style="${perm.money?'':'display:none'}">${perm.money?fmt$(h.money):''}</td>
      <td class="mono" style="font-size:11px;color:var(--t2)">${new Date(h.cerrado_at).toLocaleString('es-AR')}</td>
      <td>${perm.role==='admin'?`<button class="del" onclick="delHist('${h.mes}')">✕</button>`:''}</td>`;tb.appendChild(tr);});
}
async function cerrarPeriodo(){
  if(!confirm(`¿Cerrar y archivar ${mesTxt(cfg.mes)}?`))return;
  try { await Api.cerrarPeriodo(); }
  catch (err) { toast(err.message, 'err'); return; }
  await rHist();
  toast('Período archivado');
}
async function delHist(mes){
  if(!confirm('¿Eliminar del historial?'))return;
  try { await Api.deleteHistorial(mes); }
  catch (err) { toast(err.message, 'err'); return; }
  await rHist();
  toast('Eliminado','warn');
}
```

- [ ] **Step 5: Limpieza final de variables globales**

La variable `evalData` (el blob unico `{mes:{leg:{...}}}` de la version original) ya no se usa en ningun lado — todo pasa por `evalByLeg` (por seccion) o por las respuestas directas de `Api.getResultados`/`Api.getHistorial`. Quitarla de la declaracion de globales del Step 3 de Task 16:

```js
let SESSION=null,users=[],personal=[],cfg={},crit={},cal=defCalendarShape(),evalByLeg={};
```

Run: `grep -n "evalData" frontend/public/index.html` — debe devolver **cero coincidencias**. Si aparece alguna, es una referencia que quedo sin migrar; hay que ubicarla y corregirla antes de seguir.

- [ ] **Step 6: Verificar sintaxis**

Run:
```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('frontend/public/index.html', 'utf8');
const parts = html.split('<script>');
const last = parts[parts.length - 1].split('</script>')[0];
new Function(last);
console.log('OK: inline script parses');
"
```
Expected: `OK: inline script parses`.

- [ ] **Step 7: Prueba manual completa de punta a punta**

Con datos cargados en Personal, Evaluaciones (horas + predisposicion + S&H de al menos 2-3 personas): revisar Dashboard (graficos con datos), Resultados (filtros, badges, export a Excel), cerrar el periodo desde Historial y verificar que aparece en la lista con el promedio y el total en $ correctos, y despues eliminarlo. Confirmar que un usuario `supervisor`/`produccion`/`syh` NO ve la columna de sueldo/incentivo en Resultados ni en Historial.

- [ ] **Step 8: Commit**

```bash
git add frontend/public/index.html
git commit -m "feat(frontend): wire Dashboard, Resultados and Historial sections to the REST API"
```

### Task 22: Frontend Dockerfile y `nginx.conf`

**Files:**
- Create: `frontend/Dockerfile`
- Create: `frontend/nginx.conf`

**Interfaces:**
- Produces: imagen `frontend` del `docker-compose.yml` (Task 1), sirve `frontend/public/` como estatico y proxya `/api` hacia `sica_bonos_backend:3001` reenviando cookies.

- [ ] **Step 1: Crear `frontend/nginx.conf`** (tal como lo pide el spec)

```nginx
server {
  listen 80;
  root /usr/share/nginx/html;
  index index.html;
  location /api {
    proxy_pass http://sica_bonos_backend:3001;
    proxy_set_header Host $host;
    proxy_pass_header Set-Cookie;
    proxy_cookie_path / /;
  }
  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

- [ ] **Step 2: Crear `frontend/Dockerfile`**

```dockerfile
FROM nginx:1.27-alpine
COPY public/ /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

- [ ] **Step 3: Construir y levantar el frontend**

```bash
docker compose up -d --build frontend
docker compose logs frontend --tail 30
```
Expected: nginx arranca sin errores de configuracion (`nginx: configuration file /etc/nginx/nginx.conf test is successful` si se corre `nginx -t`, o simplemente sin lineas de error en el log).

- [ ] **Step 4: Verificar que el proxy a la API funciona desde adentro del contenedor de frontend**

```bash
docker compose exec frontend wget -qO- http://localhost/api/health 2>/dev/null || docker compose exec frontend sh -c "apk add --no-cache curl >/dev/null 2>&1; curl -s http://localhost/api/health"
```
Expected: `{"ok":true}` (el endpoint de salud de Task 3, todavia vivo en `server.js`).

- [ ] **Step 5: Verificar desde el host**

```bash
curl -s http://localhost:3000/api/health
```
Expected: `{"ok":true}`.

- [ ] **Step 6: Commit**

```bash
git add frontend/Dockerfile frontend/nginx.conf
git commit -m "feat: add frontend nginx image with api reverse proxy"
```

### Task 23: `README.md` con instrucciones de deploy

**Files:**
- Create: `README.md`

**Interfaces:**
- Ninguna — documentacion pura, pero es un entregable explicito del spec ("Incluir `.env.example` con todas las variables y `README.md` con instrucciones para levantar con `docker compose up -d`").

- [ ] **Step 1: Escribir `README.md`**

```markdown
# Bono de Producción — SICA Metalúrgica

Aplicación de gestión de bonos de producción: nómina, evaluaciones mensuales (horas, predisposición,
seguridad e higiene) y cálculo automático del incentivo. Corre 100% en red local, sin salida a
internet salvo para descargar las imágenes base de Docker la primera vez.

## Stack

- **Backend:** Node.js 22 + Express + PostgreSQL (`pg`)
- **Frontend:** HTML/CSS/JS estático servido por nginx, que proxya `/api` al backend
- **Auth:** bcrypt + JWT en cookie httpOnly
- **Base de datos:** PostgreSQL 16, datos persistidos en `./data/postgres`

## Requisitos

- Docker y Docker Compose (`docker compose version` debe funcionar)
- Ningún otro requisito: no hace falta Node ni Postgres instalados en el host

## Levantar el sistema

1. Copiar el archivo de variables de entorno y completar valores propios:

   ```bash
   cp .env.example .env
   ```

   Editar `.env`:
   - `DB_PASSWORD`: contraseña de la base de datos (elegir una propia, no dejar el valor de ejemplo)
   - `JWT_SECRET`: cadena aleatoria larga (32+ caracteres) para firmar las sesiones

2. Levantar los tres servicios:

   ```bash
   docker compose up -d --build
   ```

   Esto construye las imágenes de `backend` y `frontend`, y levanta `db` esperando a que el healthcheck
   de Postgres esté OK antes de arrancar el backend.

3. Sembrar los datos iniciales (usuarios, calendario 2026, factores, niveles, criterios):

   ```bash
   docker compose run --rm backend npm run seed
   ```

   Este paso deja la tabla `personal` **vacía a propósito** — la nómina real se carga después desde la
   sección "Personal" (alta manual o importando un Excel).

4. Abrir `http://localhost:3000` en el navegador.

## Usuarios iniciales (creados por el seed)

| Usuario      | Contraseña    | Rol                    |
|--------------|---------------|------------------------|
| `admin`      | `Admin1234!`  | Administrador (RRHH)   |
| `foos`       | `Foos1234!`   | Supervisor             |
| `produccion` | `Prod1234!`   | Gerente de Producción  |
| `schmidt`    | `Syh1234!`    | Seguridad e Higiene    |

**Cambiar estas contraseñas apenas se levante el sistema** (Usuarios y permisos → Editar, como `admin`).

## Primeros pasos como administrador

1. Iniciar sesión con `admin` / `Admin1234!` y cambiar la contraseña.
2. Ir a **Personal** → "↑ Importar nómina" (o dar de alta manualmente) para cargar la nómina real,
   incluyendo la columna **Evaluador** con el nombre exacto que va a usar cada supervisor.
3. Ir a **Usuarios y permisos** → "⚡ Generar supervisores desde la nómina" para crear un usuario por
   cada evaluador detectado en la columna Evaluador (o crearlos manualmente).
4. Ir a **Calendario laboral** para ajustar la jornada (horas por tipo de día) y los feriados si difieren
   de los feriados nacionales 2026 precargados.
5. Ir a **Configuración** para revisar el bono base, el peso de los tres factores (deben sumar 100%),
   los criterios de Predisposición/S&H con sus rúbricas, y la escala de niveles.

## Operación mensual

1. Cada evaluador (Producción, supervisores, Seg. e Higiene) carga su parte en **Evaluaciones** y
   opcionalmente marca "✓ Finalizar mi evaluación" cuando termina (no bloquea, es solo informativo
   para el admin en **Inicio**).
2. El administrador revisa **Resultados** y el **Dashboard**.
3. Al cierre del mes, el administrador va a **Historial** → "Cerrar período" para archivar el mes
   (esto no borra las evaluaciones, solo guarda una foto del resultado de ese mes).
4. Cambiar el mes en curso desde cualquiera de los selectores de mes (Personal, Evaluaciones,
   Calendario o Configuración) — es un valor global compartido por todo el sistema.

## Backups

Los datos viven en `./data/postgres` (montado como volumen de Docker). Para respaldar, basta con copiar
esa carpeta con los contenedores detenidos, o usar `pg_dump`:

```bash
docker compose exec db pg_dump -U sica sica_bonos > backup_$(date +%Y%m%d).sql
```

Para restaurar:

```bash
cat backup_20260101.sql | docker compose exec -T db psql -U sica sica_bonos
```

## Correr los tests del backend

```bash
docker compose up -d db
docker compose run --rm backend npm test
```

## Apagar el sistema

```bash
docker compose down
```

(Los datos de Postgres persisten en `./data/postgres` aunque se bajen los contenedores; `docker compose down -v`
NO borra ese volumen porque es un bind mount a una carpeta del host, no un volumen nombrado de Docker —
para borrar los datos hay que eliminar la carpeta `./data/postgres` manualmente.)

## Variables de entorno (`.env`)

| Variable      | Descripción                                              |
|---------------|-----------------------------------------------------------|
| `DB_PASSWORD` | Contraseña del usuario `sica` en Postgres                 |
| `JWT_SECRET`  | Secreto para firmar los JWT de sesión (cookie httpOnly)   |

## Estructura del repositorio

```
docker-compose.yml       Orquesta db + backend + frontend
db/init.sql              Esquema de Postgres (se corre automáticamente al crear el volumen)
backend/                 API REST (Express) + seed.js + tests (Jest/Supertest)
frontend/                HTML/CSS/JS estático + nginx.conf + Dockerfile
```
```

- [ ] **Step 2: Verificar que los comandos del README funcionan tal como estan escritos**

```bash
cp .env.example .env
docker compose up -d --build
docker compose run --rm backend npm run seed
curl -s http://localhost:3000/api/health
docker compose exec db pg_dump -U sica sica_bonos > /tmp/backup_test.sql
head -5 /tmp/backup_test.sql
```
Expected: el `curl` devuelve `{"ok":true}` y el dump tiene contenido SQL (no vacio ni error).

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add deployment and operations README"
```

### Task 24: Verificacion final de punta a punta

Ultima tarea: confirma que TODO el sistema (backend + frontend + Docker) funciona junto, desde cero, exactamente como lo va a usar SICA.

**Files:** ninguno nuevo — solo verificacion.

- [ ] **Step 1: Reconstruir todo desde cero**

```bash
docker compose down
rm -rf data/postgres
docker compose up -d --build
docker compose run --rm backend npm run seed
```
Expected: los tres contenedores quedan `Up` (`docker compose ps`), sin reinicios en loop.

- [ ] **Step 2: Correr toda la suite de tests del backend una vez mas**

Run: `docker compose run --rm backend npm test`
Expected: 0 failures en los 14 suites (`health, calendar, calc, auth, config, personal, users, criterios, factores, niveles, calendario, evaluaciones, resultados, historial, seed`).

- [ ] **Step 3: Checklist manual por rol (navegador, `http://localhost:3000`)**

**Admin** (`admin`/`Admin1234!`, cambiar contraseña primero):
- [ ] Inicio muestra los KPIs y el avance de evaluadores
- [ ] Personal: alta, edicion, baja, exportar/importar Excel
- [ ] Usuarios: crear supervisor manual + generar supervisores desde la nomina
- [ ] Calendario: cambiar regla de horas, agregar/quitar feriado, marcar un dia especial
- [ ] Configuracion: bono base, pesos de factores (Σ=100%), criterios/rubricas, escala de niveles
- [ ] Evaluaciones: carga completa (horas, predisposicion, S&H) de un participante, ver el Resultado recalcularse
- [ ] Dashboard: graficos con datos reales
- [ ] Resultados: filtros, columna de sueldo/incentivo visible, exportar Excel
- [ ] Historial: cerrar periodo, ver el resumen, eliminarlo

**Supervisor** (`foos`/`Foos1234!`, evaluador asignado en Personal):
- [ ] Solo ve Evaluaciones, Resultados, Historial en el menu
- [ ] En Evaluaciones ve unicamente a su gente (columna Evaluador coincide)
- [ ] Puede cargar Predisposicion y comentarios; el resto de columnas no aparece
- [ ] En Resultados NO ve columna de sueldo/incentivo
- [ ] "Finalizar mi evaluación" cambia el badge de estado

**Producción** (`produccion`/`Prod1234!`):
- [ ] Ve Evaluaciones, Resultados, Historial y Calendario
- [ ] Puede cargar vacaciones y horas reales de TODOS los participantes SPM
- [ ] Puede editar el Calendario laboral

**Seguridad e Higiene** (`schmidt`/`Syh1234!`):
- [ ] Ve Evaluaciones, Resultados, Historial (no Calendario)
- [ ] Carga S&H de TODOS los participantes SPM, con exportar/importar Excel de S&H

- [ ] **Step 4: Verificar persistencia real (no localStorage)**

```bash
docker compose restart backend frontend
```
Recargar el navegador e iniciar sesion de nuevo: todos los datos cargados en el Step 3 (personal, evaluaciones, calendario, config, historial) deben seguir ahi identicos — vienen de Postgres, no del navegador. Como prueba adicional, abrir la app en una ventana de incognito: debe pedir login (no hay sesion) pero, al loguearse, ver los MISMOS datos (prueba de que no dependen del localStorage de un navegador en particular).

- [ ] **Step 5: Verificar que localStorage del navegador esta practicamente vacio**

Con las DevTools abiertas (Application → Local Storage → `http://localhost:3000`), confirmar que la unica clave presente es `bp5_colview` (la preferencia de columnas visibles, decision de diseno #3) — ninguna clave `bp5_users`, `bp5_personal`, `bp5_eval`, etc. debe existir.

- [ ] **Step 6: Revision final del código contra el spec**

Repasar `prompt_bono_produccion.md` seccion por seccion y confirmar que cada endpoint de "API REST" tiene su ruta implementada y testeada (Tasks 6-13), que el modelo de datos de "Modelo de datos" esta completo en `db/init.sql` (Task 2, con las desviaciones documentadas en "Decisiones de diseno" al principio de este plan), y que el seed (Task 14) cumple exactamente lo pedido en "Seed inicial".

- [ ] **Step 7: Commit final (si quedo algo suelto) y cierre**

```bash
git status
```
Si hay cambios sin commitear de correcciones encontradas en este task, commitearlos con un mensaje descriptivo. Si no hay nada pendiente, el trabajo esta terminado: migracion completa de HTML+localStorage a fullstack Docker con Postgres, auth real, y paridad funcional con el original documentada explicitamente en cada desviacion.
