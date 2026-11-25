import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import argon2 from 'argon2';
import { createHash } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { AuthService } from './auth.service.js';

describe('AuthService', () => {
  const prisma = {
    usuario: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    sesionUsuario: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  let authService: AuthService;

  beforeEach(async () => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(
      (operation: (transaction: typeof prisma) => Promise<unknown>) =>
        operation(prisma),
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (key: string) =>
              key === 'SESSION_TTL_SECONDS' ? 28_800 : undefined,
          },
        },
      ],
    }).compile();

    authService = moduleRef.get(AuthService);
  });

  it('creates a hashed, expiring session for an active verified user', async () => {
    const password = 'correct horse battery staple';
    const user = {
      id: '497f6eca-6276-4993-bfeb-53cbbbba6f08',
      email: 'requester@example.org',
      passwordHash: await argon2.hash(password),
      nombre: 'Requester',
      estado: 'ACTIVO',
      emailVerificadoEn: new Date(),
      proveedorId: null,
      roles: [{ rol: { codigo: 'SOLICITANTE' } }],
    };
    prisma.usuario.findUnique.mockResolvedValue(user);
    prisma.usuario.update.mockResolvedValue(user);
    prisma.sesionUsuario.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: 'session-id', ...data }),
    );

    const result = await authService.signIn(
      ' REQUESTER@example.org ',
      password,
    );

    expect(result.usuario).toEqual({
      id: user.id,
      email: user.email,
      nombre: user.nombre,
      roles: ['SOLICITANTE'],
    });
    expect(result.sessionToken).toBeTruthy();
    expect(result.csrfToken).toBeTruthy();
    expect(prisma.usuario.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'requester@example.org' } }),
    );

    const createdSession = prisma.sesionUsuario.create.mock.calls[0][0].data;
    expect(createdSession.tokenHash).toBe(
      createHash('sha256').update(result.sessionToken).digest('hex'),
    );
    expect(createdSession.csrfTokenHash).toBe(
      createHash('sha256').update(result.csrfToken).digest('hex'),
    );
    expect(createdSession.tokenHash).not.toBe(result.sessionToken);
    expect(createdSession.venceEn.getTime()).toBeGreaterThan(Date.now());
  });

  it('returns the same authentication error for an unknown email and a bad password', async () => {
    prisma.usuario.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: '497f6eca-6276-4993-bfeb-53cbbbba6f08',
        email: 'requester@example.org',
        passwordHash: await argon2.hash('the correct password'),
        estado: 'ACTIVO',
        emailVerificadoEn: new Date(),
        roles: [],
      });

    const unknownEmail = authService.signIn('missing@example.org', 'anything');
    const wrongPassword = authService.signIn(
      'requester@example.org',
      'incorrect password',
    );

    const [unknownResult, wrongResult] = await Promise.allSettled([
      unknownEmail,
      wrongPassword,
    ]);

    for (const result of [unknownResult, wrongResult]) {
      expect(result.status).toBe('rejected');
      const reason = (result as PromiseRejectedResult).reason;
      expect(reason).toBeInstanceOf(UnauthorizedException);
      expect(reason.message).toBe('Credenciales no válidas.');
    }
  });

  it('does not create sessions for accounts without verified email or active status', async () => {
    prisma.usuario.findUnique.mockResolvedValue({
      id: '497f6eca-6276-4993-bfeb-53cbbbba6f08',
      email: 'requester@example.org',
      passwordHash: await argon2.hash('correct horse battery staple'),
      estado: 'PENDIENTE_APROBACION',
      emailVerificadoEn: new Date(),
      roles: [{ rol: { codigo: 'SOLICITANTE' } }],
    });

    await expect(
      authService.signIn(
        'requester@example.org',
        'correct horse battery staple',
      ),
    ).rejects.toThrow('Credenciales no válidas.');
    expect(prisma.sesionUsuario.create).not.toHaveBeenCalled();
  });
});
