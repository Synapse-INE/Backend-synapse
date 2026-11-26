import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { corteDe, dondePublicacion, dondeVigentes, paginasDe, type FiltroPublicacion } from './publicacion.consulta.js';
import { armarResumen, presentarReciente, type FilaConteo, type FilaMes, type RecientePublicado } from './publicacion.resumen.js';

type Totales = { total: number; vigentes: number; ultima: Date | null };

@Injectable()
export class PublicacionService {
  constructor(private readonly prisma: PrismaService) {}

  async resumen() {
    const [totales, modalidades, categorias, meses, recientes] = await Promise.all([
      this.prisma.$queryRaw<Totales[]>`
        SELECT
          count(*)::int AS total,
          count(*) FILTER (
            WHERE vigencia_hasta >= (timezone('America/Guatemala', now()))::date
          )::int AS vigentes,
          max(fecha_publicacion) AS ultima
        FROM referencias_ine
      `,
      this.prisma.$queryRaw<FilaConteo[]>`
        SELECT coalesce(t.nombre, 'Sin tipo') AS etiqueta, count(*)::int AS n
        FROM referencias_ine r
        LEFT JOIN tipos_modalidad t ON t.id = r.tipo_modalidad_id
        GROUP BY 1
        ORDER BY n DESC
      `,
      this.prisma.$queryRaw<FilaConteo[]>`
        SELECT coalesce(nullif(trim(categoria_original), ''), 'Sin categoría') AS etiqueta,
               count(*)::int AS n
        FROM referencias_ine
        GROUP BY 1
        ORDER BY n DESC
        LIMIT 5
      `,
      this.prisma.$queryRaw<FilaMes[]>`
        SELECT to_char(fecha_publicacion, 'YYYY-MM') AS mes, count(*)::int AS n
        FROM referencias_ine
        WHERE fecha_publicacion IS NOT NULL
          AND fecha_publicacion >= (date_trunc('month', timezone('America/Guatemala', now())) - interval '11 months')::date
        GROUP BY 1
        ORDER BY 1
      `,
      this.prisma.referenciaINE.findMany({
        where: { precioReferencia: { not: null } },
        orderBy: [{ fechaPublicacion: { sort: 'desc', nulls: 'last' } }, { producto: 'asc' }],
        take: 8,
        select: {
          id: true,
          producto: true,
          caracteristicas: true,
          presentacion: true,
          precioReferencia: true,
          fechaPublicacion: true,
          vigenciaHasta: true,
          nog: true,
          correlativo: true,
          eventoOriginal: true,
          categoriaOriginal: true,
          tipoModalidad: { select: { nombre: true } },
        },
      }),
    ]);

    const fila = totales[0] ?? { total: 0, vigentes: 0, ultima: null };
    return armarResumen({
      total: fila.total,
      vigentes: fila.vigentes,
      ultimaPublicacion: fila.ultima,
      modalidades,
      categorias,
      meses,
      recientes: recientes as RecientePublicado[],
    });
  }

  async categorias() {
    const filas = await this.prisma.$queryRaw<FilaConteo[]>`
      SELECT coalesce(nullif(trim(categoria_original), ''), 'Sin categoría') AS etiqueta,
             count(*)::int AS n
      FROM referencias_ine
      WHERE precio_referencia IS NOT NULL
      GROUP BY 1
      ORDER BY n DESC, etiqueta ASC
    `;
    return { categorias: filas };
  }

  async renglones(filtro: FiltroPublicacion) {
    const corte = corteDe(filtro);
    const { donde } = dondePublicacion(filtro);
    const vigentesDonde = dondeVigentes(filtro);
    const [total, vigentes, filas] = await Promise.all([
      this.prisma.referenciaINE.count({ where: donde }),
      this.prisma.referenciaINE.count({ where: vigentesDonde }),
      this.prisma.referenciaINE.findMany({
        where: donde,
        orderBy: [{ fechaPublicacion: { sort: 'desc', nulls: 'last' } }, { producto: 'asc' }, { id: 'asc' }],
        skip: corte.salto,
        take: corte.limite,
        select: {
          id: true,
          producto: true,
          caracteristicas: true,
          presentacion: true,
          precioReferencia: true,
          fechaPublicacion: true,
          vigenciaHasta: true,
          nog: true,
          correlativo: true,
          eventoOriginal: true,
          categoriaOriginal: true,
          tipoModalidad: { select: { nombre: true } },
        },
      }),
    ]);

    return {
      total,
      vigentes,
      pagina: corte.pagina,
      paginas: paginasDe(total, corte.limite),
      limite: corte.limite,
      renglones: (filas as RecientePublicado[]).map(presentarReciente),
    };
  }
}
