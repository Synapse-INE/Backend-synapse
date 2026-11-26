import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { generarExcel, generarPdf, type MetaExportacion } from './exportacion.archivos.js';
import {
  COLUMNAS,
  describirFiltros,
  dondeExportacion,
  LIMITE_DATOS,
  LIMITE_EXCEL,
  LIMITE_PDF,
  presentarFila,
  SELECCION_EXPORTACION,
  type FiltroExportacion,
} from './exportacion.filas.js';

export type FormatoExportacion = 'datos' | 'excel' | 'pdf';

const LIMITES: Record<FormatoExportacion, number> = {
  datos: LIMITE_DATOS,
  excel: LIMITE_EXCEL,
  pdf: LIMITE_PDF,
};

const FECHA_LEGIBLE = new Intl.DateTimeFormat('es-GT', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Guatemala',
});

interface Contexto {
  actorId: string;
  ip?: string;
}

@Injectable()
export class ExportacionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** JSON con las filas y las columnas, para que el frontend genere su propio PDF. */
  async datos(filtro: FiltroExportacion, contexto: Contexto) {
    const { filas, total } = await this.consultar(filtro, 'datos');
    const generadoEn = new Date();
    await this.registrar('datos', filtro, total, contexto);
    return {
      generadoEn: generadoEn.toISOString(),
      total,
      filtros: Object.fromEntries(describirFiltros(filtro)),
      columnas: COLUMNAS.map(({ clave, titulo }) => ({ clave, titulo })),
      filas,
    };
  }

  async excel(filtro: FiltroExportacion, contexto: Contexto) {
    const { filas, total } = await this.consultar(filtro, 'excel');
    const archivo = await generarExcel(filas, this.meta(filtro, total));
    await this.registrar('excel', filtro, total, contexto);
    return archivo;
  }

  async pdf(filtro: FiltroExportacion, contexto: Contexto) {
    const { filas, total } = await this.consultar(filtro, 'pdf');
    const archivo = await generarPdf(filas, this.meta(filtro, total));
    await this.registrar('pdf', filtro, total, contexto);
    return archivo;
  }

  private async consultar(filtro: FiltroExportacion, formato: FormatoExportacion) {
    this.validar(filtro);
    const where = dondeExportacion(filtro);
    const total = await this.prisma.referenciaINE.count({ where });
    const limite = LIMITES[formato];
    if (total > limite) {
      throw new UnprocessableEntityException({
        code: 'EXPORTACION_DEMASIADO_GRANDE',
        detail: `La consulta tiene ${total} filas y el máximo para este formato es ${limite}. Acota los filtros (fechas, categoría, texto).`,
      });
    }
    const filas = await this.prisma.referenciaINE.findMany({
      where,
      orderBy: [
        { fechaPublicacion: { sort: 'desc', nulls: 'last' } },
        { producto: 'asc' },
        { id: 'asc' },
      ],
      take: limite,
      select: SELECCION_EXPORTACION,
    });
    return { total, filas: filas.map((fila) => presentarFila(fila)) };
  }

  private validar(filtro: FiltroExportacion) {
    if (filtro.fecha && (filtro.desde || filtro.hasta)) {
      throw new UnprocessableEntityException({
        code: 'VALIDACION_FALLIDA',
        detail: 'Usa `fecha` o el rango `desde`/`hasta`, no ambos.',
        errors: [{ field: 'fecha', message: 'No se combina con desde ni hasta' }],
      });
    }
    if (filtro.desde && filtro.hasta && filtro.desde > filtro.hasta) {
      throw new UnprocessableEntityException({
        code: 'VALIDACION_FALLIDA',
        detail: 'El rango de fechas está invertido.',
        errors: [{ field: 'desde', message: 'Debe ser anterior o igual a hasta' }],
      });
    }
  }

  private meta(filtro: FiltroExportacion, total: number): MetaExportacion {
    return {
      generadoEn: FECHA_LEGIBLE.format(new Date()),
      total,
      filtros: describirFiltros(filtro),
    };
  }

  private registrar(
    formato: FormatoExportacion,
    filtro: FiltroExportacion,
    filas: number,
    contexto: Contexto,
  ) {
    return this.auditoria.registrar({
      actorId: contexto.actorId,
      accion: 'EXPORTACION_PRECIOS',
      recurso: 'referencia_ine',
      ip: contexto.ip,
      metadatos: { formato, filas, filtros: Object.fromEntries(describirFiltros(filtro)) },
    });
  }
}
