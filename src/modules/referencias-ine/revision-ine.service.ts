import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '../../infrastructure/database/generated/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { ImportadorINEService } from './importador-ine.service.js';
import type {
  ConsultaAliasDto,
  ConsultaFilasDto,
  ConsultaPaginadaDto,
  RevisarAliasDto,
} from './revision-ine.dto.js';

export interface ArchivoCargado {
  originalname: string;
  buffer: Buffer;
  size: number;
}

@Injectable()
export class RevisionIneService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    private readonly importador: ImportadorINEService,
  ) {}

  async listarImportaciones(consulta: ConsultaPaginadaDto) {
    const [total, importaciones] = await Promise.all([
      this.prisma.importacionINE.count(),
      this.prisma.importacionINE.findMany({
        orderBy: { iniciadaEn: 'desc' },
        skip: (consulta.pagina - 1) * consulta.limite,
        take: consulta.limite,
        select: {
          id: true,
          nombreArchivo: true,
          sha256: true,
          estado: true,
          filasLeidas: true,
          filasAceptadas: true,
          filasConObservaciones: true,
          filasRechazadas: true,
          iniciadaEn: true,
          completadaEn: true,
        },
      }),
    ]);
    return this.pagina(total, consulta, { importaciones });
  }

  async listarFilas(importacionId: string, consulta: ConsultaFilasDto) {
    await this.exigirImportacion(importacionId);
    const where: Prisma.FilaImportacionINEWhereInput = {
      importacionId,
      ...(consulta.estado ? { estado: consulta.estado } : {}),
    };
    const [total, filas] = await Promise.all([
      this.prisma.filaImportacionINE.count({ where }),
      this.prisma.filaImportacionINE.findMany({
        where,
        orderBy: { numeroFila: 'asc' },
        skip: (consulta.pagina - 1) * consulta.limite,
        take: consulta.limite,
        select: {
          id: true,
          numeroFila: true,
          estado: true,
          errores: true,
          datosOriginales: true,
        },
      }),
    ]);
    return this.pagina(total, consulta, { filas });
  }

  async listarAlias(consulta: ConsultaAliasDto) {
    const where: Prisma.AliasModalidadWhereInput = consulta.estado
      ? { estado: consulta.estado }
      : {};
    const [total, alias] = await Promise.all([
      this.prisma.aliasModalidad.count({ where }),
      this.prisma.aliasModalidad.findMany({
        where,
        orderBy: [{ estado: 'asc' }, { createdAt: 'desc' }],
        skip: (consulta.pagina - 1) * consulta.limite,
        take: consulta.limite,
        select: {
          id: true,
          valorOriginal: true,
          estado: true,
          createdAt: true,
          tipoModalidad: { select: { id: true, codigo: true, nombre: true } },
          revisadoPor: { select: { id: true, nombre: true } },
        },
      }),
    ]);
    return this.pagina(total, consulta, { alias });
  }

  /** Confirmar liga el alias a una modalidad oficial activa; descartar lo deja sin efecto. */
  async revisarAlias(id: string, dto: RevisarAliasDto, actorId: string, ip?: string) {
    if (dto.estado === 'CONFIRMADO' && !dto.tipoModalidadId) {
      throw new UnprocessableEntityException({
        code: 'VALIDACION_FALLIDA',
        detail: 'Para confirmar un alias indica a qué modalidad corresponde.',
        errors: [{ field: 'tipoModalidadId', message: 'Es obligatorio al confirmar' }],
      });
    }
    return this.prisma.$transaction(async (tx) => {
      const alias = await tx.aliasModalidad.findUnique({
        where: { id },
        select: { id: true, estado: true },
      });
      if (!alias) {
        throw new NotFoundException({
          code: 'ALIAS_NO_ENCONTRADO',
          detail: 'El alias no existe.',
        });
      }
      if (dto.estado === 'CONFIRMADO') {
        const modalidad = await tx.tipoModalidad.findUnique({
          where: { id: dto.tipoModalidadId },
          select: { activo: true },
        });
        if (!modalidad?.activo) {
          throw new UnprocessableEntityException({
            code: 'MODALIDAD_NO_VALIDA',
            detail: 'La modalidad indicada no existe o está inactiva.',
          });
        }
      }
      const actualizado = await tx.aliasModalidad.update({
        where: { id },
        data: {
          estado: dto.estado,
          tipoModalidadId: dto.estado === 'CONFIRMADO' ? dto.tipoModalidadId : null,
          revisadoPorId: actorId,
        },
        select: { id: true, valorOriginal: true, estado: true, tipoModalidadId: true },
      });
      await this.auditoria.registrarEn(tx, {
        actorId,
        accion: dto.estado === 'CONFIRMADO' ? 'ALIAS_MODALIDAD_CONFIRMADO' : 'ALIAS_MODALIDAD_DESCARTADO',
        recurso: 'alias_modalidad',
        recursoId: id,
        ip,
        metadatos: { estadoAnterior: alias.estado },
      });
      return actualizado;
    });
  }

  /** Vuelve a normalizar las filas de una importación con los alias ya confirmados. */
  async reprocesar(importacionId: string, actorId: string, ip?: string) {
    await this.exigirImportacion(importacionId);
    const resultados = await this.importador.reprocesar({
      importacionId,
      usuarioId: actorId,
    });
    await this.auditoria.registrar({
      actorId,
      accion: 'IMPORTACION_INE_REPROCESADA',
      recurso: 'importacion_ine',
      recursoId: importacionId,
      ip,
    });
    return { resultados };
  }

  /**
   * Carga un libro por HTTP. Reutiliza el importador del CLI: se guarda en una
   * carpeta temporal propia, se importa y se borra, sin conservar el archivo.
   */
  async importar(archivo: ArchivoCargado, actorId: string, ip?: string) {
    const nombre = archivo.originalname
      .replace(/[^A-Za-z0-9._ -]/g, '_')
      .slice(-120);
    const carpeta = await mkdtemp(join(tmpdir(), 'importacion-ine-'));
    try {
      const ruta = join(carpeta, nombre || 'libro.xlsx');
      await writeFile(ruta, archivo.buffer);
      let resultado;
      try {
        resultado = await this.importador.importar({ archivo: ruta, usuarioId: actorId });
      } catch (error) {
        throw new UnprocessableEntityException({
          code: 'ARCHIVO_NO_VALIDO',
          detail: error instanceof Error ? error.message : 'No se pudo leer el libro.',
        });
      }
      await this.auditoria.registrar({
        actorId,
        accion: 'IMPORTACION_INE_CARGADA',
        recurso: 'importacion_ine',
        recursoId: resultado.importacionId,
        ip,
      });
      return resultado;
    } finally {
      await rm(carpeta, { recursive: true, force: true });
    }
  }

  private async exigirImportacion(id: string) {
    const existe = await this.prisma.importacionINE.count({ where: { id } });
    if (existe < 1) {
      throw new NotFoundException({
        code: 'IMPORTACION_NO_ENCONTRADA',
        detail: 'La importación no existe.',
      });
    }
  }

  private pagina<T extends object>(
    total: number,
    consulta: ConsultaPaginadaDto,
    datos: T,
  ) {
    return {
      total,
      pagina: consulta.pagina,
      paginas: Math.max(1, Math.ceil(total / consulta.limite)),
      limite: consulta.limite,
      ...datos,
    };
  }
}
