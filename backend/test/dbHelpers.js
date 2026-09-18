const { pool } = require('../src/db');

async function resetDb() {
  await pool.query(`TRUNCATE TABLE
    evaluaciones_finalizadas, evaluaciones_comentarios, evaluaciones_criterios, evaluaciones,
    historial, calendario_dias_especiales, calendario_feriados, calendario_reglas,
    niveles, factores, criterio_rubricas, criterios, config, personal, users
    RESTART IDENTITY CASCADE`);
}

module.exports = { resetDb };
