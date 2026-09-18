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
