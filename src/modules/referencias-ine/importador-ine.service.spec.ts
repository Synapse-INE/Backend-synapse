import ExcelJS from 'exceljs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { ImportadorINEService } from './importador-ine.service.js';

describe('ImportadorINEService', () => {
  it('preserva las doce columnas fuente y las modalidades duplicadas', async () => {
    let secuenciaFila = 0;
    const filasStaging: Array<Record<string, unknown>> = [];
    const referencias: Array<Record<string, unknown>> = [];
    const alias = new Map<
      string,
      { estado: string; tipoModalidadId: string | null }
    >();
    const tipos = new Map<string, string>();
    const transactionClient = {
      filaImportacionINE: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          filasStaging.push(data);
          secuenciaFila += 1;
          return { id: `fila-${secuenciaFila}` };
        }),
      },
      referenciaINE: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          referencias.push(data);
          return { id: `referencia-${referencias.length}` };
        }),
      },
      aliasModalidad: {
        upsert: vi.fn(async ({ where, create }: Record<string, any>) => {
          const clave = where.claveNormalizada as string;
          const existente = alias.get(clave);
          if (existente) {
            return existente;
          }
          const nuevo = {
            estado: create.estado as string,
            tipoModalidadId: (create.tipoModalidadId as string | null) ?? null,
          };
          alias.set(clave, nuevo);
          return nuevo;
        }),
      },
      importacionINE: {
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'importacion-prueba',
          ...data,
        })),
      },
      eventoAuditoria: { create: vi.fn() },
    };
    const prisma = {
      importacionINE: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'importacion-prueba' }),
        update: vi.fn(),
      },
      tipoModalidad: {
        upsert: vi.fn(async ({ where }: Record<string, any>) => {
          const codigo = where.codigo as string;
          const tipo = { id: `tipo-${codigo}`, codigo };
          tipos.set(codigo, tipo.id);
          return tipo;
        }),
      },
      $transaction: vi.fn(async (operation: any) =>
        operation(transactionClient),
      ),
    } as unknown as PrismaService;
    const config = {
      getOrThrow: vi.fn().mockReturnValue(52_428_800),
    };
    const service = new ImportadorINEService(prisma, config as never);

    const directorioTemporal = await mkdtemp(join(tmpdir(), 'ine-import-'));
    const archivo = join(directorioTemporal, 'catalogo.xlsx');
    const workbook = new ExcelJS.Workbook();
    const hoja = workbook.addWorksheet('Referencias');
    hoja.addRow(['Catálogo de precios']);
    hoja.addRow([
      'Correlativo',
      'Modalidad',
      'NOG',
      'Evento',
      'Modalidad',
      'Producto',
      'Características',
      'Presentación',
      'Precio de referencia Q',
      'Fecha de publicación',
      'Categoría',
      'Vigencia hasta',
    ]);
    hoja.addRow([
      '1',
      'Contrato Abierto',
      '12345678',
      'Evento de prueba',
      'Contrato Abierto',
      'Guantes de nitrilo',
      'Talla mediana',
      'Caja',
      '1,347.990',
      '15/01/2025',
      'Suministros',
      '15/01/2026',
    ]);

    try {
      await workbook.xlsx.writeFile(archivo);
      const resultado = await service.importar({ archivo });

      expect(resultado).toMatchObject({
        importacionId: 'importacion-prueba',
        yaExistia: false,
        filasLeidas: 1,
        filasRechazadas: 0,
      });
      expect(filasStaging).toHaveLength(1);
      expect(referencias).toHaveLength(1);

      const primeraFila = filasStaging[0];
      const datosOriginales = primeraFila?.datosOriginales as {
        celdas: Array<{ encabezado: string }>;
      };
      expect(datosOriginales.celdas).toHaveLength(12);
      expect(datosOriginales.celdas[1]?.encabezado).toBe('Modalidad');
      expect(datosOriginales.celdas[4]?.encabezado).toBe('Modalidad');
      expect(referencias[0]).toMatchObject({
        precioReferencia: '1347.990',
      });
    } finally {
      await rm(directorioTemporal, { recursive: true, force: true });
    }
  });
});
