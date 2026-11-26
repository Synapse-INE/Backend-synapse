/** Tiempo máximo de atención del expediente. No es una meta: al cumplirse, la solicitud ya venció. */
export const DIAS_ATENCION = 15;

const ZONA = 'America/Guatemala';
const MS_DIA = 86_400_000;
const CERRADOS = new Set(['COMPLETADA', 'RECHAZADA', 'CANCELADA']);

export type SituacionAtencion =
  | 'EN_PLAZO'
  | 'VENCE_HOY'
  | 'VENCIDA'
  | 'EN_SUBSANACION'
  | 'ATENDIDA'
  | 'ATENDIDA_FUERA_DE_PLAZO';

export type AtencionExpediente = {
  dias: number;
  venceEn: string;
  diasRestantes: number;
  situacion: SituacionAtencion;
};

type EventoAtencion = {
  estadoNuevo?: string | null;
  createdAt: Date | string;
};

export function medirAtencion(
  solicitud: {
    estado?: string | null;
    enviadaEn?: Date | string | null;
    updatedAt?: Date | string | null;
    historial?: EventoAtencion[] | null;
  },
  ahora: Date = new Date(),
): AtencionExpediente | null {
  if (!solicitud.enviadaEn || !solicitud.estado || solicitud.estado === 'BORRADOR') {
    return null;
  }

  const enviada = new Date(solicitud.enviadaEn);
  const cierre = fechaCierre(solicitud, ahora);
  const hasta = cierre ?? ahora;
  const pausados = diasEnSubsanacion(
    solicitud.historial ?? [],
    hasta,
    solicitud.estado,
    cierre !== null,
  );
  const diasRestantes = DIAS_ATENCION + pausados - diasEntre(enviada, hasta);
  const vence = new Date(diaUtc(enviada) + (DIAS_ATENCION + pausados) * MS_DIA);

  return {
    dias: DIAS_ATENCION,
    venceEn: vence.toISOString().slice(0, 10),
    diasRestantes,
    situacion: situacion(solicitud.estado, diasRestantes, cierre !== null),
  };
}

function situacion(
  estado: string,
  diasRestantes: number,
  cerrado: boolean,
): SituacionAtencion {
  if (cerrado) {
    return diasRestantes >= 0 ? 'ATENDIDA' : 'ATENDIDA_FUERA_DE_PLAZO';
  }
  if (estado === 'PENDIENTE_SUBSANACION') return 'EN_SUBSANACION';
  if (diasRestantes < 0) return 'VENCIDA';
  if (diasRestantes === 0) return 'VENCE_HOY';
  return 'EN_PLAZO';
}

function fechaCierre(
  solicitud: {
    estado?: string | null;
    updatedAt?: Date | string | null;
    historial?: EventoAtencion[] | null;
  },
  ahora: Date,
): Date | null {
  if (!solicitud.estado || !CERRADOS.has(solicitud.estado)) return null;
  const cierre = [...(solicitud.historial ?? [])]
    .filter((evento) => evento.estadoNuevo === solicitud.estado)
    .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))
    .at(-1);
  if (cierre) return new Date(cierre.createdAt);
  if (solicitud.updatedAt) return new Date(solicitud.updatedAt);
  return ahora;
}

/** Los días en corrección de la entidad no consumen el tiempo de atención. La espera interna del INE sí. */
function diasEnSubsanacion(
  historial: EventoAtencion[],
  hasta: Date,
  estado: string,
  cerrado: boolean,
): number {
  const eventos = [...historial].sort(
    (a, b) => +new Date(a.createdAt) - +new Date(b.createdAt),
  );
  let pausa = 0;
  let inicio: Date | null = null;
  for (const evento of eventos) {
    const cuando = new Date(evento.createdAt);
    if (cuando > hasta) break;
    if (evento.estadoNuevo === 'PENDIENTE_SUBSANACION') {
      inicio = cuando;
    } else if (inicio && evento.estadoNuevo && evento.estadoNuevo !== 'PENDIENTE_SUBSANACION') {
      pausa += diasEntre(inicio, cuando);
      inicio = null;
    }
  }
  if (inicio && (estado === 'PENDIENTE_SUBSANACION' || cerrado)) {
    pausa += diasEntre(inicio, hasta);
  }
  return pausa;
}

function diaUtc(fecha: Date): number {
  const texto = fecha.toLocaleDateString('en-CA', { timeZone: ZONA });
  return Date.parse(`${texto}T00:00:00.000Z`);
}

function diasEntre(desde: Date, hasta: Date): number {
  return Math.round((diaUtc(hasta) - diaUtc(desde)) / MS_DIA);
}
