import { ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SolicitantesService } from './solicitantes.service.js';

describe('SolicitantesService', () => {
  const tx = {
    perfilSolicitante: { updateMany: vi.fn() },
    usuario: { update: vi.fn() },
  };
  const prisma = {
    perfilSolicitante: { findMany: vi.fn() },
    $transaction: vi.fn(),
  };
  const auditoria = { registrarEn: vi.fn() };
  let servicio: SolicitantesService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(
      (operacion: (cliente: typeof tx) => Promise<unknown>) => operacion(tx),
    );
    servicio = new SolicitantesService(prisma as never, auditoria as never);
  });

  it('aprueba un perfil pendiente, activa la cuenta y audita al revisor', async () => {
    tx.perfilSolicitante.updateMany.mockResolvedValue({ count: 1 });

    const resultado = await servicio.revisar('u1', 'APROBAR', 'admin-1', '203.0.113.5');

    expect(resultado).toEqual({ usuarioId: 'u1', estado: 'ACTIVO' });
    expect(tx.usuario.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { estado: 'ACTIVO' },
    });
    expect(auditoria.registrarEn).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        actorId: 'admin-1',
        accion: 'SOLICITANTE_APROBADO',
        recursoId: 'u1',
        ip: '203.0.113.5',
      }),
    );
  });

  it('rechaza el perfil y desactiva la cuenta', async () => {
    tx.perfilSolicitante.updateMany.mockResolvedValue({ count: 1 });

    const resultado = await servicio.revisar('u1', 'RECHAZAR', 'admin-1');

    expect(resultado.estado).toBe('DESACTIVADO');
  });

  it('no permite revisar dos veces ni a quien no verificó su correo', async () => {
    tx.perfilSolicitante.updateMany.mockResolvedValue({ count: 0 });

    await expect(servicio.revisar('u1', 'APROBAR', 'admin-1')).rejects.toThrow(
      ConflictException,
    );
    expect(tx.usuario.update).not.toHaveBeenCalled();
    expect(auditoria.registrarEn).not.toHaveBeenCalled();
  });
});
