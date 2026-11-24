import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { assertResourceOwnership } from './ownership.js';

describe('assertResourceOwnership', () => {
  const actor = {
    usuarioId: 'user-1',
    proveedorId: 'provider-1',
    institucionId: 'institution-1',
  };

  it.each([
    ['usuario', { usuarioId: 'user-1' }],
    ['proveedor', { proveedorId: 'provider-1' }],
    ['institucion', { institucionId: 'institution-1' }],
  ] as const)('allows the matching %s owner', (scope, resource) => {
    expect(() =>
      assertResourceOwnership(actor, resource, scope),
    ).not.toThrow();
  });

  it('denies mismatched or missing ownership values', () => {
    expect(() =>
      assertResourceOwnership(
        actor,
        { proveedorId: 'another-provider' },
        'proveedor',
      ),
    ).toThrow(ForbiddenException);
    expect(() =>
      assertResourceOwnership(actor, {}, 'institucion'),
    ).toThrow(ForbiddenException);
  });
});
