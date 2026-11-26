import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/infrastructure/database/prisma.service.js';
import { AuditoriaService } from '../src/modules/auditoria/auditoria.service.js';
import { COLUMNAS } from '../src/modules/exportacion/exportacion.filas.js';
import { ExportacionService } from '../src/modules/exportacion/exportacion.service.js';

loadEnv({ path: resolve(import.meta.dirname, '../.env') });

describe('Exportación de precios contra PostgreSQL', () => {
  const marca = `EXP${randomUUID().slice(0, 8).toUpperCase()}`;
  const hoy = new Date();
  const enDiasUTC = (dias: number) =>
    new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate() + dias));
  let prisma: PrismaService;
  let servicio: ExportacionService;
  let importacionId = '';
  let actorId = '';

  beforeAll(async () => {
    prisma = new PrismaService({
      getOrThrow: (clave: string) => {
        const valor = process.env[clave];
        if (!valor) throw new Error(`Falta ${clave}`);
        return valor;
      },
    } as never);
    servicio = new ExportacionService(prisma, new AuditoriaService(prisma));

    const usuario = await prisma.usuario.create({
      data: {
        email: `exportacion-${marca}@example.test`,
        passwordHash: 'hash-de-prueba',
        nombre: 'Exportación',
        estado: 'ACTIVO',
      },
    });
    actorId = usuario.id;

    const importacion = await prisma.importacionINE.create({
      data: {
        nombreArchivo: `${marca}.xlsx`,
        sha256: createHash('sha256').update(marca).digest('hex'),
        formato: 'XLSX',
      },
    });
    importacionId = importacion.id;

    const filas = [
      {
        producto: 'Guantes de nitrilo',
        caracteristicas: 'Talla M',
        precio: '42.5',
        publicado: enDiasUTC(-10),
        vigente: enDiasUTC(30),
        nog: `${marca}-1`,
      },
      {
        producto: '=HYPERLINK("http://malo.example","clic")',
        caracteristicas: null,
        precio: '1234567.125',
        publicado: enDiasUTC(-400),
        vigente: enDiasUTC(-300),
        nog: `${marca}-2`,
      },
      {
        producto: 'Sin precio',
        caracteristicas: null,
        precio: null,
        publicado: enDiasUTC(-5),
        vigente: enDiasUTC(60),
        nog: `${marca}-3`,
      },
    ];
    for (const [indice, fila] of filas.entries()) {
      const origen = await prisma.filaImportacionINE.create({
        data: { importacionId, numeroFila: indice + 1, datosOriginales: {} },
      });
      await prisma.referenciaINE.create({
        data: {
          filaImportacionId: origen.id,
          nog: fila.nog,
          producto: fila.producto,
          caracteristicas: fila.caracteristicas,
          presentacion: 'Caja',
          precioReferencia: fila.precio,
          fechaPublicacion: fila.publicado,
          vigenciaHasta: fila.vigente,
          categoriaOriginal: `Categoría ${marca}`,
        },
      });
    }
  }, 30_000);

  afterAll(async () => {
    if (!prisma) return;
    await prisma.eventoAuditoria.deleteMany({ where: { actorId } });
    await prisma.referenciaINE.deleteMany({ where: { filaImportacion: { importacionId } } });
    await prisma.importacionINE.delete({ where: { id: importacionId } });
    await prisma.usuario.delete({ where: { id: actorId } });
    await prisma.$disconnect();
  }, 30_000);

  const contexto = () => ({ actorId, ip: '203.0.113.9' });
  const filtro = (extra = {}) => ({ categoria: `Categoría ${marca}`, ...extra });

  it('datos: devuelve solo filas con precio, precios como cadena y columnas', async () => {
    const resultado = await servicio.datos(filtro(), contexto());

    expect(resultado.total).toBe(2);
    expect(resultado.columnas.map((c) => c.clave)).toContain('precioReferencia');
    const grande = resultado.filas.find((f) => f.nog === `${marca}-2`);
    expect(grande).toMatchObject({ precioReferencia: '1234567.125', vigente: false });
    const vigente = resultado.filas.find((f) => f.nog === `${marca}-1`);
    expect(vigente).toMatchObject({ precioReferencia: '42.500', moneda: 'GTQ', vigente: true });
    expect(resultado.filas.some((f) => f.nog === `${marca}-3`)).toBe(false);
    // Más reciente primero.
    expect(resultado.filas[0].nog).toBe(`${marca}-1`);
  });

  it('filtra por vigencia y por rango de fechas', async () => {
    const vigentes = await servicio.datos(filtro({ soloVigentes: true }), contexto());
    expect(vigentes.filas.map((f) => f.nog)).toEqual([`${marca}-1`]);

    const desde = enDiasUTC(-20).toISOString().slice(0, 10);
    const rango = await servicio.datos(filtro({ desde }), contexto());
    expect(rango.filas.map((f) => f.nog)).toEqual([`${marca}-1`]);
  });

  it('rechaza filtros incompatibles', async () => {
    await expect(
      servicio.datos(filtro({ fecha: '2026-01-01', desde: '2026-01-01' }), contexto()),
    ).rejects.toMatchObject({ response: { code: 'VALIDACION_FALLIDA' } });
    await expect(
      servicio.datos(filtro({ desde: '2026-02-01', hasta: '2026-01-01' }), contexto()),
    ).rejects.toMatchObject({ response: { code: 'VALIDACION_FALLIDA' } });
  });

  it('excel: genera un libro legible con números reales y sin fórmulas inyectadas', async () => {
    const archivo = await servicio.excel(filtro(), contexto());

    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(archivo as never);
    const hoja = libro.getWorksheet('Precios');
    expect(hoja?.rowCount).toBe(3);
    const columna = (clave: string) => COLUMNAS.findIndex((c) => c.clave === clave) + 1;
    const filas = [2, 3].map((n) => hoja!.getRow(n));
    const peligrosa = filas.find((fila) => String(fila.getCell(columna('producto')).value).includes('HYPERLINK'));
    expect(String(peligrosa?.getCell(columna('producto')).value).startsWith("'=")).toBe(true);
    expect(typeof peligrosa?.getCell(columna('precioReferencia')).value).toBe('number');
    expect(peligrosa?.getCell(columna('precioReferencia')).value).toBeCloseTo(1234567.125, 3);
    expect(libro.getWorksheet('Información')).toBeDefined();
  });

  it('pdf: genera un documento PDF válido', async () => {
    const archivo = await servicio.pdf(filtro(), contexto());

    expect(archivo.subarray(0, 5).toString()).toBe('%PDF-');
    expect(archivo.length).toBeGreaterThan(1_000);
    expect(archivo.subarray(-8).toString()).toContain('%%EOF');
  });

  it('audita cada exportación con formato, filas e IP', async () => {
    await servicio.datos(filtro(), contexto());

    const evento = await prisma.eventoAuditoria.findFirst({
      where: { actorId, accion: 'EXPORTACION_PRECIOS' },
      orderBy: { creadoEn: 'desc' },
    });
    expect(evento?.ip).toBe('203.0.113.9');
    expect(evento?.metadatos).toMatchObject({ formato: 'datos', filas: 2 });
  });
});
