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
