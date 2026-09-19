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
