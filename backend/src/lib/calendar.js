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
