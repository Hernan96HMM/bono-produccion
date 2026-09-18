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
