import type { Prisma } from '../../infrastructure/database/generated/client.js';
import {
  dondePublicacion,
  dondeVigentes,
  hoyGuatemala,
} from '../referencias-ine/publicacion.consulta.js';

export const LIMITE_DATOS = 20_000;
export const LIMITE_EXCEL = 50_000;
export const LIMITE_PDF = 3_000;

export type FiltroExportacion = {
  categoria?: string;
  producto?: string;
  nog?: string;
  texto?: string;
  fecha?: string;
  desde?: string;
  hasta?: string;
  soloVigentes?: boolean;
};

export const COLUMNAS = [
  { clave: 'nog', titulo: 'NOG', ancho: 14 },
  { clave: 'correlativo', titulo: 'Correlativo', ancho: 14 },
  { clave: 'evento', titulo: 'Evento', ancho: 28 },
  { clave: 'modalidad', titulo: 'Modalidad', ancho: 24 },
  { clave: 'categoria', titulo: 'Categoría', ancho: 26 },
  { clave: 'producto', titulo: 'Producto', ancho: 44 },
  { clave: 'caracteristicas', titulo: 'Características', ancho: 52 },
  { clave: 'presentacion', titulo: 'Presentación', ancho: 20 },
  { clave: 'precioReferencia', titulo: 'Precio de referencia', ancho: 20 },
  { clave: 'moneda', titulo: 'Moneda', ancho: 9 },
  { clave: 'fechaPublicacion', titulo: 'Fecha de publicación', ancho: 18 },
  { clave: 'vigenciaHasta', titulo: 'Vigente hasta', ancho: 14 },
  { clave: 'vigente', titulo: 'Vigente', ancho: 9 },
] as const;

export type FilaExportada = {
  nog: string | null;
  correlativo: string | null;
  evento: string | null;
  modalidad: string | null;
  categoria: string | null;
  producto: string | null;
  caracteristicas: string | null;
  presentacion: string | null;
  /** Cadena decimal con tres decimales: nunca un número flotante. */
  precioReferencia: string | null;
  moneda: string;
  fechaPublicacion: string | null;
  vigenciaHasta: string | null;
  vigente: boolean;
};

export const SELECCION_EXPORTACION = {
  nog: true,
  correlativo: true,
  eventoOriginal: true,
  modalidadOriginal: true,
  tipoModalidad: { select: { nombre: true } },
  categoriaOriginal: true,
  producto: true,
  caracteristicas: true,
  presentacion: true,
  precioReferencia: true,
  moneda: true,
  fechaPublicacion: true,
  vigenciaHasta: true,
} satisfies Prisma.ReferenciaINESelect;

export type FilaBase = Prisma.ReferenciaINEGetPayload<{
  select: typeof SELECCION_EXPORTACION;
}>;

const soloFecha = (fecha: Date | null) => (fecha ? fecha.toISOString().slice(0, 10) : null);

export function presentarFila(fila: FilaBase, hoy = hoyGuatemala()): FilaExportada {
  return {
    nog: fila.nog,
    correlativo: fila.correlativo,
    evento: fila.eventoOriginal,
    modalidad: fila.tipoModalidad?.nombre ?? fila.modalidadOriginal,
    categoria: fila.categoriaOriginal,
    producto: fila.producto,
    caracteristicas: fila.caracteristicas,
    presentacion: fila.presentacion,
    precioReferencia: fila.precioReferencia ? fila.precioReferencia.toFixed(3) : null,
    moneda: fila.moneda,
    fechaPublicacion: soloFecha(fila.fechaPublicacion),
    vigenciaHasta: soloFecha(fila.vigenciaHasta),
    vigente: fila.vigenciaHasta !== null && fila.vigenciaHasta >= hoy,
  };
}

/** Condición de Prisma para un filtro de exportación; reutiliza la de la publicación. */
export function dondeExportacion(
  filtro: FiltroExportacion,
  hoy = hoyGuatemala(),
): Prisma.ReferenciaINEWhereInput {
  const base = filtro.soloVigentes
    ? dondeVigentes(filtro, hoy)
    : dondePublicacion(filtro, hoy).donde;
  if (!filtro.fecha && (filtro.desde || filtro.hasta)) {
    return {
      ...base,
      fechaPublicacion: {
        ...(filtro.desde ? { gte: new Date(`${filtro.desde}T00:00:00.000Z`) } : {}),
        ...(filtro.hasta ? { lte: new Date(`${filtro.hasta}T00:00:00.000Z`) } : {}),
      },
    };
  }
  return base;
}

/**
 * Una celda de Excel que empieza por `=`, `+`, `-`, `@` o un control se
 * interpreta como fórmula al abrirla. Se antepone un apóstrofo para que sea
 * texto (inyección de fórmulas).
 */
export function celdaSegura(valor: string | null): string | null {
  if (valor === null) return null;
  return /^[=+\-@\t\r]/.test(valor) ? `'${valor}` : valor;
}

export function describirFiltros(filtro: FiltroExportacion): Array<[string, string]> {
  const etiquetas: Array<[keyof FiltroExportacion, string]> = [
    ['texto', 'Texto'],
    ['categoria', 'Categoría'],
    ['producto', 'Producto'],
    ['nog', 'NOG'],
    ['fecha', 'Fecha de publicación'],
    ['desde', 'Publicado desde'],
    ['hasta', 'Publicado hasta'],
  ];
  const lineas = etiquetas
    .filter(([clave]) => filtro[clave] !== undefined && filtro[clave] !== '')
    .map(([clave, etiqueta]) => [etiqueta, String(filtro[clave])] as [string, string]);
  if (filtro.soloVigentes) lineas.push(['Solo vigentes', 'Sí']);
  return lineas;
}

export function nombreArchivo(extension: 'xlsx' | 'pdf', ahora = new Date()) {
  const dia = hoyGuatemala(ahora).toISOString().slice(0, 10);
  return `precios-referencia-${dia}.${extension}`;
}
