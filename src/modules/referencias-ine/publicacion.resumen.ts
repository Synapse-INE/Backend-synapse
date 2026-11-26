const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export type FilaConteo = { etiqueta: string; n: number };
export type FilaMes = { mes: string; n: number };

export type RecientePublicado = {
  id: string;
  producto: string | null;
  caracteristicas: string | null;
  presentacion: string | null;
  precioReferencia: { toString(): string } | null;
  fechaPublicacion: Date | null;
  vigenciaHasta: Date | null;
  nog: string | null;
  correlativo?: string | null;
  eventoOriginal: string | null;
  categoriaOriginal: string | null;
  tipoModalidad: { nombre: string } | null;
};

export type EntradaResumen = {
  total: number;
  vigentes: number;
  ultimaPublicacion: Date | null;
  modalidades: FilaConteo[];
  categorias: FilaConteo[];
  meses: FilaMes[];
  recientes: RecientePublicado[];
  hoy?: Date;
};

export function armarResumen(entrada: EntradaResumen) {
  const total = entrada.total;
  const modalidades = entrada.modalidades
    .filter((fila) => fila.etiqueta !== 'Sin tipo' && fila.n > 0)
    .map((fila) => ({
      etiqueta: fila.etiqueta,
      n: fila.n,
      porcentaje: porcentajeDe(fila.n, total),
    }));

  const categorias = entrada.categorias
    .filter((fila) => fila.n > 0)
    .slice(0, 5)
    .map((fila) => ({
      etiqueta: fila.etiqueta,
      n: fila.n,
      porcentaje: porcentajeDe(fila.n, total),
    }));

  const serie = serieDeDoceMeses(entrada.hoy ?? new Date(), entrada.meses);
  const ultimo = serie.at(-1);
  const previo = serie.at(-2);
  let tendencia = '—';
  if (ultimo && ultimo.n === 0) tendencia = 'Sin publicación';
  else if (ultimo && previo) {
    if (ultimo.n > previo.n) tendencia = '↑ alza';
    else if (ultimo.n < previo.n) tendencia = '↓ baja';
    else tendencia = '= igual';
  }

  return {
    total,
    vigentes: entrada.vigentes,
    ultimaPublicacion: fechaIso(entrada.ultimaPublicacion),
    modalidadPrincipal: modalidades[0] ?? null,
    modalidades,
    categorias,
    meses: serie,
    tendencia,
    recientes: entrada.recientes.map(presentarReciente),
  };
}

export function presentarReciente(fila: RecientePublicado) {
  return {
    id: fila.id,
    producto: texto(fila.producto) || 'Producto sin nombre',
    caracteristicas: texto(fila.caracteristicas),
    presentacion: texto(fila.presentacion),
    precio: fila.precioReferencia ? Number(fila.precioReferencia.toString()) : 0,
    fechaPublicacion: fechaIso(fila.fechaPublicacion),
    vigenciaHasta: fechaIso(fila.vigenciaHasta),
    modalidad: fila.tipoModalidad?.nombre ?? null,
    nog: fila.nog,
    correlativo: texto(fila.correlativo ?? null),
    evento: texto(fila.eventoOriginal),
    categoria: texto(fila.categoriaOriginal),
  };
}

function texto(valor: string | null) {
  const limpio = String(valor ?? '').trim().replace(/^"+|"+$/g, '').trim();
  return limpio || null;
}

function porcentajeDe(n: number, total: number) {
  if (!total || !n) return 0;
  const valor = (n / total) * 100;
  if (valor >= 10) return Math.round(valor);
  return Math.round(valor * 10) / 10;
}

function fechaIso(valor: Date | null) {
  if (!valor) return null;
  return valor.toISOString().slice(0, 10);
}

function serieDeDoceMeses(hoy: Date, conteo: FilaMes[]) {
  const mapa = new Map(conteo.map((fila) => [fila.mes, fila.n]));
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guatemala',
    year: 'numeric',
    month: '2-digit',
  }).format(hoy);
  const [anioTexto, mesTexto] = partes.split('-');
  let anio = Number(anioTexto);
  let mes = Number(mesTexto);
  const serie: Array<{ clave: string; etiqueta: string; n: number }> = [];
  for (let i = 0; i < 12; i += 1) {
    const clave = `${anio}-${String(mes).padStart(2, '0')}`;
    serie.push({ clave, etiqueta: MESES[mes - 1] || clave, n: mapa.get(clave) ?? 0 });
    mes -= 1;
    if (mes === 0) {
      mes = 12;
      anio -= 1;
    }
  }
  return serie.reverse();
}
