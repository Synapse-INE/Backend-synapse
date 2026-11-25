import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ProblemDetailsFilter } from './problem-details.filter.js';

function ejecutar(exception: Parameters<ProblemDetailsFilter['catch']>[0]) {
  const json = vi.fn();
  const type = vi.fn().mockReturnValue({ json });
  const status = vi.fn().mockReturnValue({ type });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ originalUrl: '/api/v1/prueba' }),
    }),
  } as unknown as ArgumentsHost;

  new ProblemDetailsFilter().catch(exception, host);

  return { status, type, cuerpo: json.mock.calls[0][0] };
}

describe('ProblemDetailsFilter', () => {
  it('responde RFC 7807 con código estable según el estado', () => {
    const { status, type, cuerpo } = ejecutar(
      new UnauthorizedException('Credenciales no válidas.'),
    );

    expect(status).toHaveBeenCalledWith(401);
    expect(type).toHaveBeenCalledWith('application/problem+json');
    expect(cuerpo).toMatchObject({
      status: 401,
      code: 'NO_AUTENTICADO',
      detail: 'Credenciales no válidas.',
      instance: '/api/v1/prueba',
    });
  });

  it('respeta el código y los errores de campo enviados por la aplicación', () => {
    const { cuerpo } = ejecutar(
      new BadRequestException({
        code: 'VALIDACION_FALLIDA',
        detail: 'Uno o más campos no cumplen el contrato.',
        errors: [{ field: 'email', message: 'email inválido' }],
      }),
    );

    expect(cuerpo.code).toBe('VALIDACION_FALLIDA');
    expect(cuerpo.errors).toEqual([{ field: 'email', message: 'email inválido' }]);
  });

  it('usa SIN_PERMISO para 403', () => {
    expect(ejecutar(new ForbiddenException()).cuerpo.code).toBe('SIN_PERMISO');
  });
});
