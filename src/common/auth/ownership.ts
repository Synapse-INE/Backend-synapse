import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedOwnership } from './auth-context.js';

export type OwnershipScope = 'usuario' | 'proveedor' | 'institucion';

export type ResourceOwnership = Partial<
  Record<'usuarioId' | 'proveedorId' | 'institucionId', string | null>
>;

const OWNER_FIELDS: Record<OwnershipScope, keyof ResourceOwnership> = {
  usuario: 'usuarioId',
  proveedor: 'proveedorId',
  institucion: 'institucionId',
};

const ACTOR_FIELDS: Record<OwnershipScope, keyof AuthenticatedOwnership> = {
  usuario: 'usuarioId',
  proveedor: 'proveedorId',
  institucion: 'institucionId',
};

export function assertResourceOwnership(
  actor: AuthenticatedOwnership,
  resource: ResourceOwnership,
  scope: OwnershipScope,
): void {
  const actorId = actor[ACTOR_FIELDS[scope]];
  const ownerId = resource[OWNER_FIELDS[scope]];
  if (!actorId || !ownerId || actorId !== ownerId) {
    throw new ForbiddenException();
  }
}
