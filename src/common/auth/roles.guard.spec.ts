import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { RolesGuard } from './roles.guard.js';

describe('RolesGuard', () => {
  it('allows routes without role metadata', () => {
    const guard = new RolesGuard({
      getAllAndOverride: () => undefined,
    } as unknown as Reflector);

    expect(guard.canActivate(createContext({}))).toBe(true);
  });

  it('requires an authenticated user when roles are specified', () => {
    const guard = createGuard(['ADMIN']);

    expect(() => guard.canActivate(createContext({}))).toThrow(
      UnauthorizedException,
    );
  });

  it('denies role metadata that declares no allowed role', () => {
    const guard = createGuard([]);

    expect(() => guard.canActivate(createContext({}))).toThrow(
      ForbiddenException,
    );
  });

  it('denies users without a required role and allows a matching role', () => {
    const guard = createGuard(['ADMIN', 'TRABAJADOR_INE']);

    expect(() =>
      guard.canActivate(
        createContext({
          auth: { usuario: { roles: ['PROVEEDOR'] } },
        }),
      ),
    ).toThrow(ForbiddenException);
    expect(
      guard.canActivate(
        createContext({
          auth: { usuario: { roles: ['TRABAJADOR_INE'] } },
        }),
      ),
    ).toBe(true);
  });
});

function createGuard(roles: string[]) {
  return new RolesGuard({
    getAllAndOverride: vi.fn(() => roles),
  } as unknown as Reflector);
}

function createContext(request: object) {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}
