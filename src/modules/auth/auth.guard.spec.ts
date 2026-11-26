import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { AuthGuard } from './auth.guard.js';
import { Public } from './public.decorator.js';

describe('AuthGuard', () => {
  const prisma = {
    sesionUsuario: {
      findUnique: vi.fn(),
    },
  };
  let guard: AuthGuard;

  beforeEach(async () => {
    vi.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthGuard,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (key: string) =>
              key === 'SESSION_COOKIE_NAME' ? 'ine_session' : undefined,
          },
        },
      ],
    }).compile();

    guard = moduleRef.get(AuthGuard);
  });

  it('allows explicitly public routes without a session', async () => {
    const handler = () => undefined;
    Public()(handler);
    const context = createContext({ method: 'GET', cookies: {} }, handler);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(prisma.sesionUsuario.findUnique).not.toHaveBeenCalled();
  });

  it('rejects requests without a session cookie', async () => {
    await expect(
      guard.canActivate(createContext({ method: 'GET', cookies: {} })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it.each([
    ['expired', new Date(Date.now() - 60_000), null],
    ['revoked', new Date(Date.now() + 60_000), new Date()],
  ])('rejects a %s session', async (_label, expiresAt, revokedAt) => {
    prisma.sesionUsuario.findUnique.mockResolvedValue({
      id: 'session-id',
      csrfTokenHash: hash('csrf-token'),
      venceEn: expiresAt,
      revocadaEn: revokedAt,
      usuario: {
        id: '497f6eca-6276-4993-bfeb-53cbbbba6f08',
        email: 'requester@example.org',
        nombre: 'Requester',
        estado: 'ACTIVO',
        emailVerificadoEn: new Date(),
        roles: [],
      },
    });

    await expect(
      guard.canActivate(
        createContext({
          method: 'GET',
          cookies: { ine_session: 'opaque-session-token' },
        }),
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('attaches the user for a valid session and requires CSRF on writes', async () => {
    const sessionToken = 'opaque-session-token';
    const csrfToken = 'session-bound-csrf-token';
    const user = {
      id: '497f6eca-6276-4993-bfeb-53cbbbba6f08',
      email: 'requester@example.org',
      nombre: 'Requester',
      estado: 'ACTIVO',
      emailVerificadoEn: new Date(),
      proveedorId: null,
      perfilSolicitante: { institucionId: 'institution-id' },
      roles: [{ rol: { codigo: 'SOLICITANTE' } }],
    };
    prisma.sesionUsuario.findUnique.mockResolvedValue({
      id: 'session-id',
      csrfTokenHash: hash(csrfToken),
      venceEn: new Date(Date.now() + 60_000),
      revocadaEn: null,
      usuario: user,
    });

    const readRequest = {
      method: 'GET',
      cookies: { ine_session: sessionToken },
      headers: {},
    };
    const readContext = createContext(readRequest);

    await expect(guard.canActivate(readContext)).resolves.toBe(true);
    expect(readRequest).toMatchObject({
      auth: {
        usuario: {
          id: user.id,
          email: user.email,
          roles: ['SOLICITANTE'],
          proveedorId: null,
        },
        ownership: {
          usuarioId: user.id,
          proveedorId: null,
          institucionId: 'institution-id',
        },
      },
    });

    const writeContext = createContext({
      method: 'POST',
      cookies: { ine_session: sessionToken },
      headers: { 'x-csrf-token': csrfToken },
    });
    await expect(guard.canActivate(writeContext)).resolves.toBe(true);
    expect(prisma.sesionUsuario.findUnique).toHaveBeenLastCalledWith({
      where: { tokenHash: hash(sessionToken) },
      select: {
        id: true,
        csrfTokenHash: true,
        venceEn: true,
        revocadaEn: true,
        usuario: {
          select: {
            id: true,
            email: true,
            nombre: true,
            estado: true,
            emailVerificadoEn: true,
            proveedorId: true,
            perfilSolicitante: { select: { institucionId: true } },
            roles: { select: { rol: { select: { codigo: true } } } },
          },
        },
      },
    });

    await expect(
      guard.canActivate(
        createContext({
          method: 'POST',
          cookies: { ine_session: sessionToken },
          headers: {},
        }),
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function createContext(request: object, handler = () => undefined) {
  return {
    getHandler: () => handler,
    getClass: () => class TestController {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}
