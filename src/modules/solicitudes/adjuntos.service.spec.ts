import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { UnprocessableEntityException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdjuntosService } from './adjuntos.service.js';

const autor = {
  sessionId: 's1',
  csrfTokenHash: 'x',
  usuario: { id: 'u1', email: 'a@b.c', nombre: 'A', roles: ['SOLICITANTE'] },
  ownership: { usuarioId: 'u1', proveedorId: null, institucionId: 'inst-1' },
};

describe('AdjuntosService', () => {
  let directorio = '';
  const prisma = {
    solicitudPrecio: { findFirst: vi.fn() },
    solicitudAdjunto: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), delete: vi.fn() },
    consultaMercado: { findFirst: vi.fn() },
    entregaSolicitud: { findFirst: vi.fn() },
  };
  const config = { get: vi.fn() };
  let servicio: AdjuntosService;

  beforeEach(async () => {
    directorio = await mkdtemp(path.join(tmpdir(), 'expediente-'));
    vi.clearAllMocks();
    config.get.mockReturnValue(directorio);
    prisma.solicitudPrecio.findFirst.mockResolvedValue({
      id: 'sol-1',
      estado: 'BORRADOR',
      creadaPorId: 'u1',
    });
    prisma.solicitudAdjunto.create.mockImplementation(async ({ data }) => ({
      id: 'adj-1',
      nombreOriginal: data.nombreOriginal,
      tamanoBytes: data.tamanoBytes,
      consultaId: data.consultaId,
      entregaId: data.entregaId,
    }));
    servicio = new AdjuntosService(prisma as never, config as never);
  });

  afterEach(async () => {
    await rm(directorio, { recursive: true, force: true });
  });

  it('guarda un PDF del borrador y rechaza lo que no es PDF', async () => {
    const pdf = Buffer.from('%PDF-1.4 contenido');
    const guardado = await servicio.guardar(
      'sol-1',
      { buffer: pdf, size: pdf.length, originalname: 'anexo.pdf' },
      {},
      autor,
    );

    expect(guardado.nombreOriginal).toBe('anexo.pdf');
    const escrito = await readFile(path.join(directorio, prisma.solicitudAdjunto.create.mock.calls[0][0].data.objectKey));
    expect(escrito.subarray(0, 4).toString()).toBe('%PDF');

    await expect(
      servicio.guardar('sol-1', { buffer: Buffer.from('no es pdf'), size: 9, originalname: 'nota.txt' }, {}, autor),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('no deja quitar el PDF de la solicitud después de enviarla', async () => {
    prisma.solicitudPrecio.findFirst.mockResolvedValue({
      id: 'sol-1',
      estado: 'RECIBIDA',
      creadaPorId: 'u1',
    });

    await expect(servicio.quitar('sol-1', 'adj-1', autor)).rejects.toMatchObject({
      response: { code: 'ARCHIVO_NO_EDITABLE' },
    });
  });
});
