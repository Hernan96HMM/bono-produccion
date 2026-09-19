const FERIADOS_2026 = {
  '2026-01-01': 'Año Nuevo',
  '2026-02-16': 'Carnaval',
  '2026-02-17': 'Carnaval',
  '2026-03-24': 'Día Nacional de la Memoria por la Verdad y la Justicia',
  '2026-04-02': 'Día del Veterano y de los Caídos en Malvinas',
  '2026-04-03': 'Viernes Santo',
  '2026-05-01': 'Día del Trabajador',
  '2026-05-25': 'Día de la Revolución de Mayo',
  '2026-06-15': 'Paso a la Inmortalidad del Gral. Güemes',
  '2026-06-20': 'Paso a la Inmortalidad del Gral. Belgrano',
  '2026-07-09': 'Día de la Independencia',
  '2026-08-17': 'Paso a la Inmortalidad del Gral. San Martín',
  '2026-10-12': 'Día del Respeto a la Diversidad Cultural',
  '2026-11-23': 'Día de la Soberanía Nacional',
  '2026-12-08': 'Inmaculada Concepción de María',
  '2026-12-25': 'Navidad',
};

const DEFAULT_RUB = {
  p1: {
    label: 'Iniciativa',
    desc: 'Actúa por cuenta propia, toma la iniciativa y aporta mejoras sin esperar instrucciones.',
    rub: {
      1: 'Requiere supervisión constante y espera instrucciones detalladas; rara vez aporta ideas o soluciones.',
      2: 'Competente pero espera instrucciones antes de actuar; muestra iniciativa en ocasiones y necesita recordatorios.',
      3: 'Toma la iniciativa en situaciones nuevas sin supervisión; aporta ideas y soluciones para mejorar los procesos.',
      4: 'Busca constantemente oportunidades de mejorar e innovar; soluciones creativas y alto grado de autonomía.',
    },
  },
  p2: {
    label: 'Conducta',
    desc: 'Interés y compromiso con la calidad del trabajo: presencia en el puesto, respeto y cuidado de herramientas.',
    rub: {
      1: 'Falta de interés y compromiso; fuera del puesto, uso de celular, no respeta a colegas ni cuida herramientas.',
      2: 'Interés moderado; su conducta a veces afecta la productividad, se ausenta del puesto o usa dispositivos personales.',
      3: 'Comprometido y puntual; siempre en su puesto, respetuoso con pares y supervisores, cuida herramientas y equipos.',
      4: 'Alto interés, compromiso y entusiasmo que contribuye significativamente a la productividad.',
    },
  },
  p3: {
    label: 'Colaboración',
    desc: 'Disposición a colaborar, comunicación y compromiso con el equipo y la empresa, incluso fuera del horario.',
    rub: {
      1: 'Falta de interés en colaborar; no se puede contar con él fuera de horario y su comunicación es mínima.',
      2: 'Colaboración ocasional, con dificultades o pasividad; baja disposición a participar más allá de su rol.',
      3: 'Colaboración constante y proactiva; comprometido con los valores de la empresa, se puede contar con él ante necesidad.',
      4: 'Colaborador destacado; soluciones creativas, siempre disponible, miembro muy valioso del equipo.',
    },
  },
  s1: {
    label: 'Disposición de Residuos',
    desc: 'Correcta gestión y disposición de los residuos en el sector.',
    rub: {
      1: 'No muestra preocupación por la gestión de residuos; requiere supervisión constante.',
      2: 'En ocasiones muestra interés y preocupación por la gestión de residuos.',
      3: 'Dispone los residuos de manera correcta y consistente en su sector.',
      4: 'Gestión de residuos ejemplar; promueve activamente buenas prácticas de disposición.',
    },
  },
  s2: {
    label: 'Uso de EPP',
    desc: 'Uso correcto y consistente de los elementos de protección personal.',
    rub: {
      1: 'No utiliza adecuadamente los EPP; ignora las normativas de seguridad.',
      2: 'Uso irregular de EPP; a veces sigue las normas pero en ocasiones se olvida.',
      3: 'Compromiso constante con las políticas de seguridad; participa en capacitación y concientización.',
      4: 'Contribuye a la prevención de incidentes y promueve una cultura de seguridad; incidentes muy bajos o nulos.',
    },
  },
  s3: {
    label: 'Orden y Limpieza',
    desc: 'Mantenimiento del orden y la limpieza del lugar de trabajo.',
    rub: {
      1: 'Lugar de trabajo en desorden y suciedad constante; no cumple las normas de limpieza y orden.',
      2: 'El lugar suele estar desordenado; cumple con limpieza y orden solo en algunas ocasiones.',
      3: 'Lugar generalmente limpio y organizado; cumple de manera consistente con las normas.',
      4: 'Lugar impecable y altamente organizado; promueve la limpieza y sirve de ejemplo para otros.',
    },
  },
};

const CRITERIOS_PRED = ['p1', 'p2', 'p3'];
const CRITERIOS_SH = ['s1', 's2', 's3'];

module.exports = { FERIADOS_2026, DEFAULT_RUB, CRITERIOS_PRED, CRITERIOS_SH };
