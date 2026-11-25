import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificacionesService } from './notificaciones.service.js';

const solicitante = {
  sessionId: 's1',
  csrfTokenHash: 'x',
  usuario: { id: 'u1', email: 'a@b.c', nombre: 'A', roles: ['SOLICITANTE'] },
  ownership: { usuarioId: 'u1', proveedorId: null, institucionId: 'inst-1' },
};

describe('NotificacionesService', () => {
  const prisma = {
    notificacion: {
      count: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      createMany: vi.fn(),
    },
  };
  const tx = { notificacion: { createMany: vi.fn() } };
  let servicio: NotificacionesService;

  beforeEach(() => {
    vi.clearAllMocks();
    servicio = new NotificacionesService(prisma as never);
  });

  it('lista solo los avisos de la persona y cuenta los no leídos', async () => {
    prisma.notificacion.count.mockResolvedValueOnce(2).mockResolvedValueOnce(1);
    prisma.notificacion.findMany.mockResolvedValue([]);

    await servicio.listar({ soloNoLeidas: true }, solicitante);

    expect(prisma.notificacion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { usuarioId: 'u1', leidaEn: null },
      }),
    );
  });

  it('no marca como leído un aviso de otra persona', async () => {
    prisma.notificacion.findFirst.mockResolvedValue(null);

    await expect(servicio.marcarLeida('aviso-1', solicitante)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('al avisar omite a quien hizo la acción y, si es nota interna, a quien creó el expediente', async () => {
    await servicio.avisar(tx as never, {
      solicitudId: 'sol-1',
      actorId: 'w1',
      creadaPorId: 'u1',
      asignadaAId: 'w1',
      titulo: 'Nota interna',
      detalle: 'Trabajo',
      incluirCreador: false,
    });

    expect(tx.notificacion.createMany).not.toHaveBeenCalled();

    await servicio.avisar(tx as never, {
      solicitudId: 'sol-1',
      actorId: 'w1',
      creadaPorId: 'u1',
      asignadaAId: 'w2',
      titulo: 'Expediente asignado',
      detalle: 'PR-2026-000001 quedó a cargo de Ana.',
    });

    const { data } = tx.notificacion.createMany.mock.calls[0][0];
    expect(data.map((fila: { usuarioId: string }) => fila.usuarioId).sort()).toEqual([
      'u1',
      'w2',
    ]);
  });
});
