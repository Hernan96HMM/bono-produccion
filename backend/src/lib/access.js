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
