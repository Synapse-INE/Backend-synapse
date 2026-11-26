import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdministracionService } from './administracion.service.js';

describe('AdministracionService', () => {
  const tx = { tipoModalidad: { update: vi.fn() } };
  const prisma = {
    tipoModalidad: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  };
  const auditoria = { registrarEn: vi.fn() };
  let servicio: AdministracionService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(
      (operacion: (cliente: typeof tx) => Promise<unknown>) => operacion(tx),
    );
    servicio = new AdministracionService(prisma as never, auditoria as never);
  });

  it('registra el cambio de uso de una modalidad', async () => {
    prisma.tipoModalidad.findUnique.mockResolvedValue({
      id: 'm1',
      nombre: 'Contrato Abierto',
      activo: true,
    });
    tx.tipoModalidad.update.mockResolvedValue({
      id: 'm1',
      codigo: 'CONTRATO_ABIERTO',
      nombre: 'Contrato Abierto',
      activo: false,
    });

    const resultado = await servicio.cambiarModalidad('m1', false, 'admin-1');

    expect(resultado.activo).toBe(false);
    expect(auditoria.registrarEn).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ accion: 'MODALIDAD_INACTIVA', recursoId: 'm1' }),
    );
  });

  it('no altera una modalidad inexistente', async () => {
    prisma.tipoModalidad.findUnique.mockResolvedValue(null);
    await expect(servicio.cambiarModalidad('m1', false, 'admin-1')).rejects.toThrow(
      NotFoundException,
    );
  });
});