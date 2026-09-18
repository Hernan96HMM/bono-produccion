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
  expect(info).toEqual({ brutas: 9, desc: 1, netas: 8, tipo: 'Hábil', nombre: '' });
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
