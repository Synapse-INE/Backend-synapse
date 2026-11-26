import type { Prisma } from '../../infrastructure/database/generated/client.js';

export const SIN_CATEGORIA = 'Sin categoría';

export type FiltroPublicacion = {
  categoria?: string;
  producto?: string;
  nog?: string;
  texto?: string;
  fecha?: string;
  limite?: number;
  pagina?: number;
};

export function corteDe(filtro: FiltroPublicacion) {
  const limite = filtro.limite ?? 20;
  const pagina = filtro.pagina ?? 1;
  return { limite, pagina, salto: (pagina - 1) * limite };
}

export function paginasDe(total: number, limite: number) {
  if (total <= 0) return 1;
  return Math.ceil(total / limite);
}

export function hoyGuatemala(ahora = new Date()) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guatemala',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora);
  return new Date(`${partes}T00:00:00.000Z`);
}

export function dondePublicacion(
  filtro: FiltroPublicacion,
  hoy = hoyGuatemala(),
): { donde: Prisma.ReferenciaINEWhereInput; hoy: Date } {
  const donde: Prisma.ReferenciaINEWhereInput = { precioReferencia: { not: null } };
  if (filtro.categoria === SIN_CATEGORIA) {
    donde.OR = [{ categoriaOriginal: null }, { categoriaOriginal: '' }];
  } else if (filtro.categoria) {
    donde.categoriaOriginal = filtro.categoria;
  }
  if (filtro.producto) donde.producto = { contains: filtro.producto, mode: 'insensitive' };
  if (filtro.nog) donde.nog = { equals: filtro.nog, mode: 'insensitive' };
  if (filtro.fecha) donde.fechaPublicacion = new Date(`${filtro.fecha}T00:00:00.000Z`);
  if (filtro.texto) {
    const contiene = { contains: filtro.texto, mode: 'insensitive' as const };
    donde.AND = [
      {
        OR: [
          { producto: contiene },
          { caracteristicas: contiene },
          { presentacion: contiene },
          { nog: contiene },
          { categoriaOriginal: contiene },
        ],
      },
    ];
  }
  return { donde, hoy };
}

export function dondeVigentes(filtro: FiltroPublicacion, hoy = hoyGuatemala()): Prisma.ReferenciaINEWhereInput {
  const { donde } = dondePublicacion(filtro, hoy);
  return { ...donde, vigenciaHasta: { gte: hoy } };
}
