import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

describe('AuthController session cookie', () => {
  const authService = {
    signIn: vi.fn().mockResolvedValue({
      usuario: {
        id: '497f6eca-6276-4993-bfeb-53cbbbba6f08',
        email: 'requester@example.org',
        nombre: 'Requester',
        roles: ['SOLICITANTE'],
      },
      sessionToken: 'opaque-session-token',
      csrfToken: 'csrf-token',
    }),
  };
  it.each([
    ['development', 'lax', false],
    ['development', 'none', true],
    ['production', 'lax', true],
  ] as const)(
    'sets cookie flags for NODE_ENV=%s and SameSite=%s (Secure=%s)',
    async (environment, sameSite, secure) => {
      vi.clearAllMocks();
      const options = {
        getOrThrow: (key: string) =>
          ({
            SESSION_COOKIE_NAME: 'ine_session',
            SESSION_TTL_SECONDS: 28_800,
          })[key],
        get: (key: string) =>
          ({
            NODE_ENV: environment,
            SESSION_COOKIE_SAME_SITE: sameSite,
            COOKIE_DOMAIN: '',
          })[key],
      };
      const moduleRef = await Test.createTestingModule({
        controllers: [AuthController],
        providers: [
          { provide: AuthService, useValue: authService },
          { provide: ConfigService, useValue: options },
        ],
      }).compile();
      const configuredController = moduleRef.get(AuthController);
      const setCookie = vi.fn();
      const response = { cookie: setCookie } as unknown as Response;

      await configuredController.signIn(
        { email: 'requester@example.org', password: 'pass' },
        response,
      );

      expect(setCookie).toHaveBeenCalledWith(
        'ine_session',
        'opaque-session-token',
        expect.objectContaining({
          secure,
          sameSite,
          httpOnly: true,
        }),
      );
    },
  );
});
