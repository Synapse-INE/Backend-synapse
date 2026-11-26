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
  const tx = {
    notificacion: { createMany: vi.fn(), create: vi.fn() },
    usuario: { findMany: vi.fn() },
    avisoPrecioProveedor: { upsert: vi.fn() },
    referenciaINE: { findMany: vi.fn() },
    productoProveedor: { findMany: vi.fn() },
  };
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

  it('avisa a proveedores activos para actualizar precios al recibir una solicitud', async () => {
    tx.referenciaINE.findMany.mockResolvedValue([{ categoriaOriginal: 'Útiles escolares' }]);
    tx.productoProveedor.findMany.mockResolvedValue([{ proveedorId: 'p1' }]);
    tx.usuario.findMany.mockResolvedValue([
      { id: 'prov-u1', proveedorId: 'p1' },
      { id: 'prov-u2', proveedorId: 'p1' },
    ]);

    await servicio.avisarProveedoresActualizarPrecios(tx as never, {
      solicitudId: 'sol-1',
      codigo: 'PR-2026-000001',
      tituloExpediente: 'Útiles',
      nombresProducto: ['Lápiz', 'Papel'],
    });

    expect(tx.usuario.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          proveedorId: { in: ['p1'] },
          roles: { some: { rol: { codigo: 'PROVEEDOR' } } },
        }),
      }),
    );
    const { data } = tx.notificacion.createMany.mock.calls[0][0];
    expect(data.map((fila: { usuarioId: string }) => fila.usuarioId).sort()).toEqual([
      'prov-u1',
      'prov-u2',
    ]);
    expect(data[0].titulo).toBe('Actualiza tus precios de referencia');
    expect(data[0].detalle).toContain('Lápiz');
    expect(tx.avisoPrecioProveedor.upsert).toHaveBeenCalledTimes(1);
    const { create } = tx.avisoPrecioProveedor.upsert.mock.calls[0][0];
    expect(create.venceEn.getTime() - create.avisadoEn.getTime()).toBe(2 * 24 * 60 * 60 * 1000);
  });

  it('no avisa a proveedores sin productos relacionados con la solicitud', async () => {
    tx.referenciaINE.findMany.mockResolvedValue([{ categoriaOriginal: 'Equipo de cómputo' }]);
    tx.productoProveedor.findMany.mockResolvedValue([{ proveedorId: 'tecnologia-1' }]);
    tx.usuario.findMany.mockResolvedValue([{ id: 'prov-tec', proveedorId: 'tecnologia-1' }]);

    await servicio.avisarProveedoresActualizarPrecios(tx as never, {
      solicitudId: 'sol-1',
      codigo: 'PR-2026-000001',
      nombresProducto: ['Laptop'],
    });

    expect(tx.usuario.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ proveedorId: { in: ['tecnologia-1'] } }) }),
    );
    expect(tx.notificacion.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: [expect.objectContaining({ usuarioId: 'prov-tec' })] }),
    );
  });

  it('avisa a los jefes activos cuando entra una solicitud nueva', async () => {
    tx.usuario.findMany.mockResolvedValue([{ id: 'jefe-1' }, { id: 'jefe-2' }]);

    await servicio.avisarJefesNuevaRecepcion(tx as never, {
      solicitudId: 'sol-1',
      actorId: 'u1',
      codigo: 'PR-2026-000001',
      tituloExpediente: 'Laptops',
    });

    expect(tx.usuario.findMany).toHaveBeenCalled();
    const { data } = tx.notificacion.createMany.mock.calls[0][0];
    expect(data.map((fila: { usuarioId: string }) => fila.usuarioId).sort()).toEqual([
      'jefe-1',
      'jefe-2',
    ]);
    expect(data[0].titulo).toBe('Nueva solicitud recibida');
  });

  it('avisarAsignacion notifica solo al nuevo responsable', async () => {
    tx.notificacion.create.mockResolvedValue({ id: 'n1' });

    await servicio.avisarAsignacion(tx as never, {
      solicitudId: 'sol-1',
      actorId: 'jefe-1',
      asignadoId: 'w2',
      codigo: 'PR-2026-000001',
      tituloExpediente: 'Laptops',
    });

    expect(tx.notificacion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ usuarioId: 'w2', titulo: 'Te asignaron un expediente' }),
      }),
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
