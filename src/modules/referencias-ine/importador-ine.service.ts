import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import ExcelJS from 'exceljs';
import { Prisma as PrismaNamespace } from '../../infrastructure/database/generated/client.js';
import type { Prisma } from '../../infrastructure/database/generated/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import {
  claveModalidad,
  normalizarFilaINE,
  type ValoresFilaINE,
} from './normalizador-ine.js';

const FILA_TITULO = 1;
const FILA_ENCABEZADOS = 2;
const PRIMERA_FILA_DATOS = 3;
const TAMANO_LOTE = 100;

const MODALIDADES = [
  { codigo: 'CONTRATO_ABIERTO', nombre: 'Contrato Abierto' },
  { codigo: 'SUBASTA_ELECTRONICA_INVERSA', nombre: 'Subasta Electrónica Inversa' },
  {
    codigo: 'BIENES_SUMINISTROS_IMPORTADOS',
    nombre: 'Bienes y Suministros Importados',
  },
] as const;

type ColumnaMapeada = {
  clave: keyof ValoresFilaINE;
  encabezado: string;
  columna: number;
};

type FilaFuente = {
  numeroFila: number;
  datosOriginales: Prisma.InputJsonValue;
  valores: ValoresFilaINE;
};

export type ResultadoImportacionINE = {
  importacionId: string;
  yaExistia: boolean;
  estado: 'COMPLETADA' | 'PARCIAL' | 'FALLIDA' | 'EN_PROCESO';
  filasLeidas: number;
  filasAceptadas: number;
  filasConObservaciones: number;
  filasRechazadas: number;
};

@Injectable()
export class ImportadorINEService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async importar({
    archivo,
    usuarioId,
  }: {
    archivo: string;
    usuarioId?: string;
  }): Promise<ResultadoImportacionINE> {
    this.validarExtension(archivo);
    const metadatos = await stat(archivo);
    const maximo = this.config.getOrThrow<number>('IMPORT_INE_MAX_FILE_BYTES');

    if (metadatos.size > maximo) {
      throw new Error(`El archivo supera el máximo configurado de ${maximo} bytes.`);
    }

    const contenido = await readFile(archivo);
    this.validarFirmaXlsx(contenido);
    const sha256 = createHash('sha256').update(contenido).digest('hex');
    const existente = await this.prisma.importacionINE.findUnique({
      where: { sha256 },
    });

    if (existente) {
      return this.aResultado(existente, true);
    }

    const workbook = new ExcelJS.Workbook();
    // ExcelJS aún declara Buffer con tipos anteriores a Node 24.
    await workbook.xlsx.load(Buffer.from(contenido) as never);
    const hoja = workbook.worksheets[0];
    if (!hoja) {
      throw new Error('El libro no contiene una hoja de trabajo.');
    }

    const columnas = this.obtenerColumnas(hoja);
    const encabezadosOriginales = Array.from(
      { length: hoja.columnCount },
      (_, indice) => ({
        columna: indice + 1,
        encabezado: hoja.getRow(FILA_ENCABEZADOS).getCell(indice + 1).text,
      }),
    );
    const filas = this.leerFilas(hoja, columnas);

    let importacionId: string | undefined;
    try {
      const importacion = await this.prisma.importacionINE.create({
        data: {
          nombreArchivo: basename(archivo),
          sha256,
          formato: 'XLSX',
          usuarioId,
          encabezadosOriginales: encabezadosOriginales as Prisma.InputJsonValue,
        },
      });
      const idImportacion = importacion.id;
      importacionId = idImportacion;

      const tiposModalidad = await this.obtenerTiposModalidad();
      let filasAceptadas = 0;
      let filasConObservaciones = 0;
      let filasRechazadas = 0;

      for (let inicio = 0; inicio < filas.length; inicio += TAMANO_LOTE) {
        const lote = filas.slice(inicio, inicio + TAMANO_LOTE);
        const resumenLote = await this.prisma.$transaction(async (tx) => {
          let aceptadas = 0;
          let observaciones = 0;
          let rechazadas = 0;

          for (const fila of lote) {
            const normalizada = normalizarFilaINE(fila.valores);
            const tipoModalidadId = await this.resolverAliasModalidad(
              tx,
              normalizada.datos.modalidadOriginal,
              normalizada.datos.tipoModalidadCodigo,
              tiposModalidad,
            );
            const estado = normalizada.errores.length ? 'REVISAR' : 'NORMALIZADA';
            const filaStaging = await tx.filaImportacionINE.create({
              data: {
                importacionId: idImportacion,
                numeroFila: fila.numeroFila,
                datosOriginales: fila.datosOriginales,
                estado,
                ...(normalizada.errores.length
                  ? { errores: normalizada.errores as Prisma.InputJsonValue }
                  : {}),
              },
            });

            await tx.referenciaINE.create({
              data: {
                filaImportacionId: filaStaging.id,
                tipoModalidadId,
                modalidadOriginal: normalizada.datos.modalidadOriginal,
                referenciaContrato: normalizada.datos.referenciaContrato,
                nog: normalizada.datos.nog,
                eventoOriginal: normalizada.datos.eventoOriginal,
                correlativo: normalizada.datos.correlativo,
                producto: normalizada.datos.producto,
                caracteristicas: normalizada.datos.caracteristicas,
                presentacion: normalizada.datos.presentacion,
                precioReferencia: normalizada.datos.precioReferencia,
                fechaPublicacion: normalizada.datos.fechaPublicacion,
                vigenciaHasta: normalizada.datos.vigenciaHasta,
                categoriaOriginal: normalizada.datos.categoriaOriginal,
              },
            });

            if (estado === 'NORMALIZADA') {
              aceptadas += 1;
            } else if (estado === 'REVISAR') {
              observaciones += 1;
            } else {
              rechazadas += 1;
            }
          }

          return { aceptadas, observaciones, rechazadas };
        });

        filasAceptadas += resumenLote.aceptadas;
        filasConObservaciones += resumenLote.observaciones;
        filasRechazadas += resumenLote.rechazadas;
      }

      const estado =
        filasConObservaciones || filasRechazadas ? 'PARCIAL' : 'COMPLETADA';
      const completada = await this.prisma.$transaction(async (tx) => {
        const actualizada = await tx.importacionINE.update({
          where: { id: importacion.id },
          data: {
            estado,
            filasLeidas: filas.length,
            filasAceptadas,
            filasConObservaciones,
            filasRechazadas,
            completadaEn: new Date(),
          },
        });

        if (usuarioId) {
          await tx.eventoAuditoria.create({
            data: {
              actorId: usuarioId,
              accion: 'IMPORTACION_INE_COMPLETADA',
              recurso: 'importacion_ine',
              recursoId: importacion.id,
              metadatos: {
                filasLeidas: filas.length,
                filasAceptadas,
                filasConObservaciones,
                filasRechazadas,
              },
            },
          });
        }

        return actualizada;
      });

      return this.aResultado(completada, false);
    } catch (error) {
      if (importacionId) {
        await this.prisma.importacionINE.update({
          where: { id: importacionId },
          data: { estado: 'FALLIDA', completadaEn: new Date() },
        });
      }
      throw error;
    }
  }

  /**
   * Reaplica la normalización vigente a las filas ya almacenadas, a partir de
   * sus datos originales, sin volver a leer el libro. Conserva el staging y
   * actualiza estado, observaciones, modalidad y fechas de cada referencia.
   */
  async reprocesar({
    importacionId,
    usuarioId,
  }: {
    importacionId?: string;
    usuarioId?: string;
  } = {}) {
    const importaciones = await this.prisma.importacionINE.findMany({
      where: importacionId ? { id: importacionId } : {},
      select: { id: true },
    });
    if (importacionId && importaciones.length === 0) {
      throw new Error('No existe la importación indicada.');
    }

    const tiposModalidad = await this.obtenerTiposModalidad();
    const resultados: ResultadoImportacionINE[] = [];

    for (const { id } of importaciones) {
      let aceptadas = 0;
      let observaciones = 0;
      let cursor: string | undefined;

      for (;;) {
        const filas = await this.prisma.filaImportacionINE.findMany({
          where: { importacionId: id },
          orderBy: { id: 'asc' },
          take: TAMANO_LOTE,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        });
        if (filas.length === 0) {
          break;
        }
        cursor = filas[filas.length - 1].id;

        await this.prisma.$transaction(async (tx) => {
          for (const fila of filas) {
            const celdas = (
              fila.datosOriginales as {
                celdas: Array<{
                  columna: number;
                  encabezado: string;
                  valor: string | null;
                }>;
              }
            ).celdas;
            const columnas = this.mapearColumnas(celdas);
            const valores = Object.fromEntries(
              columnas.map((columna) => [
                columna.clave,
                celdas.find((celda) => celda.columna === columna.columna)
                  ?.valor ?? null,
              ]),
            ) as ValoresFilaINE;
            const normalizada = normalizarFilaINE(valores);
            const tipoModalidadId = await this.resolverAliasModalidad(
              tx,
              normalizada.datos.modalidadOriginal,
              normalizada.datos.tipoModalidadCodigo,
              tiposModalidad,
            );
            const estado = normalizada.errores.length ? 'REVISAR' : 'NORMALIZADA';

            await tx.filaImportacionINE.update({
              where: { id: fila.id },
              data: {
                estado,
                errores: normalizada.errores.length
                  ? (normalizada.errores as Prisma.InputJsonValue)
                  : PrismaNamespace.DbNull,
              },
            });
            await tx.referenciaINE.update({
              where: { filaImportacionId: fila.id },
              data: {
                tipoModalidadId,
                modalidadOriginal: normalizada.datos.modalidadOriginal,
                referenciaContrato: normalizada.datos.referenciaContrato,
                nog: normalizada.datos.nog,
                eventoOriginal: normalizada.datos.eventoOriginal,
                correlativo: normalizada.datos.correlativo,
                producto: normalizada.datos.producto,
                caracteristicas: normalizada.datos.caracteristicas,
                presentacion: normalizada.datos.presentacion,
                precioReferencia: normalizada.datos.precioReferencia,
                fechaPublicacion: normalizada.datos.fechaPublicacion,
                vigenciaHasta: normalizada.datos.vigenciaHasta,
                categoriaOriginal: normalizada.datos.categoriaOriginal,
              },
            });

            if (estado === 'NORMALIZADA') {
              aceptadas += 1;
            } else {
              observaciones += 1;
            }
          }
        });
      }

      const actualizada = await this.prisma.$transaction(async (tx) => {
        const importacion = await tx.importacionINE.update({
          where: { id },
          data: {
            estado: observaciones ? 'PARCIAL' : 'COMPLETADA',
            filasAceptadas: aceptadas,
            filasConObservaciones: observaciones,
          },
        });
        if (usuarioId) {
          await tx.eventoAuditoria.create({
            data: {
              actorId: usuarioId,
              accion: 'IMPORTACION_INE_REPROCESADA',
              recurso: 'importacion_ine',
              recursoId: id,
              metadatos: {
                filasAceptadas: aceptadas,
                filasConObservaciones: observaciones,
              },
            },
          });
        }
        return importacion;
      });
      resultados.push(this.aResultado(actualizada, true));
    }

    return resultados;
  }

  private obtenerColumnas(hoja: ExcelJS.Worksheet): ColumnaMapeada[] {
    const encabezados = hoja.getRow(FILA_ENCABEZADOS);
    const disponibles = Array.from({ length: hoja.columnCount }, (_, indice) => ({
      columna: indice + 1,
      encabezado: encabezados.getCell(indice + 1).text,
    }));
    return this.mapearColumnas(disponibles);
  }

  private mapearColumnas(
    columnasFuente: Array<{ columna: number; encabezado: string }>,
  ): ColumnaMapeada[] {
    const requeridas: Array<{ clave: keyof ValoresFilaINE; encabezado: string }> = [
      { clave: 'correlativo', encabezado: 'correlativo' },
      { clave: 'modalidadPrincipal', encabezado: 'modalidad' },
      { clave: 'nog', encabezado: 'nog' },
      { clave: 'eventoOriginal', encabezado: 'evento' },
      { clave: 'modalidadRepetida', encabezado: 'modalidad' },
      { clave: 'producto', encabezado: 'producto' },
      { clave: 'caracteristicas', encabezado: 'caracteristicas' },
      { clave: 'presentacion', encabezado: 'presentacion' },
      { clave: 'precioReferencia', encabezado: 'precio de referencia q' },
      { clave: 'fechaPublicacion', encabezado: 'fecha de publicacion' },
      { clave: 'categoriaOriginal', encabezado: 'categoria' },
      { clave: 'vigenciaHasta', encabezado: 'vigencia hasta' },
    ];
    const disponibles = columnasFuente.map((columna) => ({
      ...columna,
      claveComparacion: this.claveEncabezado(columna.encabezado),
    }));
    const usados = new Set<number>();

    return requeridas.map((requerida) => {
      const encontrada = disponibles.find(
        (columna) =>
          !usados.has(columna.columna) &&
          columna.claveComparacion === requerida.encabezado,
      );

      if (!encontrada) {
        throw new Error(
          `Falta la columna obligatoria «${requerida.encabezado}» en la fila ${FILA_ENCABEZADOS}.`,
        );
      }

      usados.add(encontrada.columna);
      return {
        clave: requerida.clave,
        encabezado: encontrada.encabezado,
        columna: encontrada.columna,
      };
    });
  }

  private leerFilas(hoja: ExcelJS.Worksheet, columnas: ColumnaMapeada[]): FilaFuente[] {
    const filas: FilaFuente[] = [];

    for (let numeroFila = PRIMERA_FILA_DATOS; numeroFila <= hoja.rowCount; numeroFila += 1) {
      const fila = hoja.getRow(numeroFila);
      const celdas = Array.from({ length: hoja.columnCount }, (_, indice) => ({
        columna: indice + 1,
        encabezado: hoja.getRow(FILA_ENCABEZADOS).getCell(indice + 1).text,
        valor: this.valorCelda(fila.getCell(indice + 1)),
      }));
      if (celdas.every((celda) => celda.valor === null)) {
        continue;
      }

      const valores = Object.fromEntries(
        columnas.map((columna) => {
          return [
            columna.clave,
            this.valorCelda(fila.getCell(columna.columna)),
          ];
        }),
      ) as ValoresFilaINE;

      filas.push({
        numeroFila,
        datosOriginales: {
          hoja: hoja.name,
          fila: numeroFila,
          titulo: hoja.getRow(FILA_TITULO).getCell(2).text || null,
          celdas,
        } as Prisma.InputJsonValue,
        valores,
      });
    }

    return filas;
  }

  private async obtenerTiposModalidad() {
    const tipos = await Promise.all(
      MODALIDADES.map(({ codigo, nombre }) =>
        this.prisma.tipoModalidad.upsert({
          where: { codigo },
          create: { codigo, nombre },
          update: { nombre, activo: true },
        }),
      ),
    );

    return new Map(tipos.map((tipo) => [tipo.codigo, tipo.id]));
  }

  private async resolverAliasModalidad(
    tx: Prisma.TransactionClient,
    valorOriginal: string | null,
    codigoConocido: string | null,
    tiposModalidad: Map<string, string>,
  ) {
    if (!valorOriginal) {
      return null;
    }

    const claveNormalizada = claveModalidad(valorOriginal).slice(0, 240);
    const tipoModalidadId = codigoConocido
      ? (tiposModalidad.get(codigoConocido) ?? null)
      : null;
    const alias = await tx.aliasModalidad.upsert({
      where: { claveNormalizada },
      create: {
        valorOriginal,
        claveNormalizada,
        tipoModalidadId,
        estado: tipoModalidadId ? 'CONFIRMADO' : 'PENDIENTE',
      },
      update: tipoModalidadId
        ? { tipoModalidadId, estado: 'CONFIRMADO' }
        : {},
    });

    return alias.estado === 'CONFIRMADO' ? alias.tipoModalidadId : null;
  }

  private validarExtension(archivo: string) {
    if (extname(archivo).toLowerCase() !== '.xlsx') {
      throw new Error('El importador del INE solo acepta archivos .xlsx.');
    }
  }

  private validarFirmaXlsx(contenido: Buffer) {
    if (
      contenido.length < 4 ||
      contenido[0] !== 0x50 ||
      contenido[1] !== 0x4b ||
      !(
        (contenido[2] === 0x03 && contenido[3] === 0x04) ||
        (contenido[2] === 0x05 && contenido[3] === 0x06) ||
        (contenido[2] === 0x07 && contenido[3] === 0x08)
      )
    ) {
      throw new Error('El contenido no corresponde a un libro XLSX válido.');
    }
  }

  private claveEncabezado(valor: string) {
    return valor
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private valorCelda(celda: ExcelJS.Cell) {
    const valor = celda.text.trim();
    return valor === '' ? null : valor;
  }

  private aResultado(
    importacion: {
      id: string;
      estado: 'COMPLETADA' | 'PARCIAL' | 'FALLIDA' | 'EN_PROCESO';
      filasLeidas: number;
      filasAceptadas: number;
      filasConObservaciones: number;
      filasRechazadas: number;
    },
    yaExistia: boolean,
  ): ResultadoImportacionINE {
    return {
      importacionId: importacion.id,
      yaExistia,
      estado: importacion.estado,
      filasLeidas: importacion.filasLeidas,
      filasAceptadas: importacion.filasAceptadas,
      filasConObservaciones: importacion.filasConObservaciones,
      filasRechazadas: importacion.filasRechazadas,
    };
  }
}
