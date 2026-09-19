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
     ('pred','🤝','Predisposición con la empresa',50),
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
