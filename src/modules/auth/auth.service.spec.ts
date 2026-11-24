import { UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { AuthService } from './auth.service.js';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');

function sesionActiva() {
  return {
    id: '00000000-0000-4000-8000-000000000010',
    usuarioId: '00000000-0000-4000-8000-000000000011',
    csrfTokenHash: hash('csrf-prueba'),
    venceEn: new Date(Date.now() + 60_000),
    revocadaEn: null,
    rotadaEn: null,
    usuario: {
      id: '00000000-0000-4000-8000-000000000011',
      email: 'admin@ine.gob.gt',
      nombre: 'Administrador',
      proveedorId: null,
      estado: 'ACTIVO',
      roles: [{ rol: { codigo: 'ADMIN' } }],
    },
  };
}

describe('AuthService', () => {
  it('rota una sesión activa sin almacenar los tokens en claro', async () => {
    const session = sesionActiva();
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const create = vi.fn().mockResolvedValue({ id: 'nueva-sesion' });
    const prisma = {
      sesionAutenticacion: {
        findUnique: vi.fn().mockResolvedValue(session),
        updateMany,
        create,
      },
      eventoAuditoria: { create: vi.fn().mockResolvedValue({}) },
    } as unknown as PrismaService;
    const jwt = { signAsync: vi.fn().mockResolvedValue('access-token') };
    const config = { getOrThrow: vi.fn().mockReturnValue(7) };
    const service = new AuthService(prisma, jwt as never, config as never);

    const resultado = await service.refrescarSesion(
      'refresh-prueba',
      'csrf-prueba',
    );

    expect(resultado.principal).toMatchObject({
      id: session.usuarioId,
      roles: ['ADMIN'],
    });
    expect(resultado.tokens.accessToken).toBe('access-token');
    expect(resultado.tokens.refreshToken).not.toBe('refresh-prueba');
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ rotadaEn: expect.any(Date) }) }),
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tokenHash: expect.not.stringContaining('refresh-prueba'),
          csrfTokenHash: expect.not.stringContaining('csrf-prueba'),
        }),
      }),
    );
  });

  it('revoca las sesiones activas cuando detecta reutilización de un refresh token', async () => {
    const session = { ...sesionActiva(), rotadaEn: new Date() };
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      sesionAutenticacion: {
        findUnique: vi.fn().mockResolvedValue(session),
        updateMany,
      },
    } as unknown as PrismaService;
    const service = new AuthService(
      prisma,
      { signAsync: vi.fn() } as never,
      { getOrThrow: vi.fn() } as never,
    );

    await expect(
      service.refrescarSesion('refresh-reutilizado', 'csrf-prueba'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(updateMany).toHaveBeenCalledWith({
      where: { usuarioId: session.usuarioId, revocadaEn: null },
      data: { revocadaEn: expect.any(Date) },
    });
  });
});
