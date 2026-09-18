# Prompt — Migración Bono de Producción a Fullstack Docker

Tengo una aplicación web de gestión de bonos de producción que actualmente corre como un único archivo HTML con localStorage. Necesito convertirla en una aplicación fullstack dockerizada donde los datos se persistan en PostgreSQL en lugar del navegador.

Te adjunto el archivo HTML original (Bono_Produccion_v22.html). Leelo completo antes de empezar — contiene toda la lógica de negocio, los roles, los cálculos y la UI que hay que preservar.

## Objetivo

Mantener EXACTAMENTE la misma lógica, estructura visual y funcionalidad del HTML original, pero:
1. Reemplazar localStorage por una API REST + PostgreSQL
2. Agregar autenticación real con bcrypt + JWT (httpOnly cookie)
3. Dockerizar todo para correr en red local (sin internet)

## Stack

- **Backend:** Node.js + Express + PostgreSQL (pg)
- **Frontend:** El mismo HTML/CSS/JS del archivo original, adaptado para llamar a la API en lugar de localStorage
- **Auth:** bcrypt + JWT en httpOnly cookie
- **Deploy:** Docker Compose con 3 servicios: db, backend, frontend (nginx)

## Estructura Docker Compose

```yaml
services:
  db:
    image: postgres:16
    container_name: sica_bonobd
    volumes:
      - ./data/postgres:/var/lib/postgresql/data
    environment:
      POSTGRES_DB: sica_bonos
      POSTGRES_USER: sica
      POSTGRES_PASSWORD: ${DB_PASSWORD}
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

Incluir `.env.example` con todas las variables y `README.md` con instrucciones para levantar con `docker compose up -d`.

## Modelo de datos

```sql
-- Usuarios del sistema
users (id, username, password_hash, name, role, evaluador_nombre, created_at)
-- roles: admin | supervisor | produccion | syh

-- Nómina de empleados
personal (id, legajo VARCHAR UNIQUE, nombre, sector, puesto, evaluador, tipo, spm BOOLEAN, estado, acceso, sueldo_base, created_at)

-- Configuración global del sistema (un solo registro)
config (id, mes VARCHAR, horas_normales INT, descuento INT, updated_at)

-- Criterios de evaluación (Predisposición y S&H)
criterios (id, grupo VARCHAR, criterio_id VARCHAR, label, descripcion, orden)
-- rúbricas por nivel
criterio_rubricas (id, criterio_id_ref INT REFERENCES criterios, nivel INT, texto)

-- Factores ponderados (hs, pred, sh con sus pesos)
factores (id, factor_key VARCHAR UNIQUE, icono, label, peso INT)

-- Niveles de evaluación
niveles (id, numero INT UNIQUE, label, porcentaje INT)

-- Calendario laboral
calendario_reglas (id, lun_jue NUMERIC, vie NUMERIC, sab NUMERIC, dom NUMERIC, descanso NUMERIC)
calendario_feriados (id, fecha DATE UNIQUE, nombre)
calendario_dias_especiales (id, fecha DATE UNIQUE, horas_brutas NUMERIC, descuento NUMERIC, nombre)

-- Evaluaciones mensuales
evaluaciones (id, legajo VARCHAR, mes VARCHAR, vac_horas NUMERIC DEFAULT 0, horas_reales NUMERIC DEFAULT 0, updated_at)
-- Sub-evaluaciones por criterio (pred y sh)
evaluaciones_criterios (id, evaluacion_id INT REFERENCES evaluaciones, grupo VARCHAR, criterio_id VARCHAR, nivel INT)
-- Comentarios/justificaciones
evaluaciones_comentarios (id, evaluacion_id INT REFERENCES evaluaciones, grupo VARCHAR, texto)

-- Estado de finalización por evaluador/mes
evaluaciones_finalizadas (id, mes VARCHAR, user_id INT REFERENCES users, finalizado_at TIMESTAMP)

-- Historial de períodos cerrados
historial (id, mes VARCHAR, datos JSONB, cerrado_at TIMESTAMP)

UNIQUE constraint en evaluaciones(legajo, mes)
```

## API REST

```
POST   /api/auth/login          → { username, password } → JWT cookie
POST   /api/auth/logout         → limpia cookie
GET    /api/auth/me             → usuario actual

GET    /api/config              → config global
PUT    /api/config              → actualizar config (solo admin)

GET    /api/personal            → lista completa con filtros ?sector=&evaluador=&estado=&spm=&q=
POST   /api/personal            → crear persona
PUT    /api/personal/:legajo    → actualizar
DELETE /api/personal/:legajo    → dar de baja

GET    /api/users               → lista usuarios (solo admin)
POST   /api/users               → crear usuario
PUT    /api/users/:id           → actualizar
DELETE /api/users/:id           → eliminar

GET    /api/criterios           → todos los criterios con rúbricas
PUT    /api/criterios           → guardar criterios editados (solo admin)
GET    /api/factores            → pesos de los factores
PUT    /api/factores            → actualizar pesos (solo admin)
GET    /api/niveles             → escala de niveles
PUT    /api/niveles             → actualizar escala (solo admin)

GET    /api/calendario/:mes     → reglas + feriados + días especiales
PUT    /api/calendario/reglas   → actualizar reglas
PUT    /api/calendario/feriados → agregar/quitar feriado
PUT    /api/calendario/dia/:fecha → sobreescribir día específico

GET    /api/evaluaciones/:mes                     → todas las evaluaciones del mes
GET    /api/evaluaciones/:mes/:legajo             → evaluación individual
PUT    /api/evaluaciones/:mes/:legajo             → guardar horas, niveles, comentarios
POST   /api/evaluaciones/:mes/finalizar           → marcar evaluación como finalizada
GET    /api/evaluaciones/:mes/estado-evaluadores  → quién finalizó y quién no

GET    /api/resultados/:mes     → cálculos completos de todos los participantes SPM
GET    /api/historial           → lista de períodos cerrados
POST   /api/historial/cerrar    → cerrar período actual (solo admin)
DELETE /api/historial/:mes      → eliminar período del historial (solo admin)
```

## Lógica de cálculo (preservar exactamente del HTML)

La función `calcRow` del HTML es la lógica central. Debe vivir en el **backend**, no en el frontend:

- `hsEsp = hsBase - vacaciones` (horas esperadas ajustadas)
- `fHs = min(horasReales / hsEsp, 1.25)` (factor horas, máx 125%)
- `fPr = promedio de niveles de Predisposición` convertidos a factor según tabla de niveles
- `fSh = promedio de niveles de S&H` convertidos a factor
- `resultado = base% × (pesoHs×fHs + pesoPred×fPr + pesoSh×fSh)`
- `incentivo = sueldo_base × resultado`

El endpoint `/api/resultados/:mes` ejecuta este cálculo y lo devuelve listo para renderizar.

## Roles y permisos (preservar del HTML)

- **admin:** ve todo, puede cerrar períodos, gestiona usuarios y config
- **supervisor:** ve solo `eval`, `res`, `hist` — y solo sus empleados (por campo evaluador)
- **produccion:** ve `eval`, `res`, `hist`, `cal` — ve todos los empleados SPM
- **syh:** ve `eval`, `res`, `hist` — ve todos los empleados SPM, carga solo criterios S&H

## Frontend

Tomar el HTML original como base visual completa. Hacer **únicamente** estos cambios:

1. **Reemplazar todas las funciones de localStorage** (`DB.save`, `DB.load`) por llamadas `fetch` a la API con `credentials: 'include'`
2. **Reemplazar el hash de contraseña client-side** por autenticación real contra la API
3. **El resto del HTML, CSS y JS queda igual** — no cambiar la lógica de render, los filtros, los modales, las tablas ni el diseño

## Frontend nginx.conf interno

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

## Seed inicial

El script `seed.js` debe crear:

- Usuario admin: `admin` / `Admin1234!`
- Usuarios de ejemplo: `foos` / `Foos1234!` (supervisor), `produccion` / `Prod1234!`, `schmidt` / `Syh1234!` (syh)
- Configuración inicial: mes actual, horas normales según calendario
- Feriados 2026 (están hardcodeados en el HTML como `FERIADOS_2026`, extraerlos)
- Factores: hs=25%, pred=50%, sh=25%
- Niveles: 1=0%, 2=50%, 3=100%, 4=125%
- Criterios de Predisposición y S&H con sus rúbricas (están en `DEFAULT_RUB` del HTML)
- **NO generar nómina demo** — dejar tabla `personal` vacía para que RRHH importe la real

## Orden de construcción

1. Estructura de carpetas y `docker-compose.yml`
2. Migraciones SQL (`init.sql` que corre automático al levantar el contenedor db)
3. Backend: conexión DB, middlewares, auth, todas las rutas
4. `seed.js`
5. Frontend: adaptar el HTML original reemplazando localStorage por fetch a la API
6. Dockerfiles de backend y frontend
7. `README.md` con instrucciones de deploy
