import { SetMetadata } from '@nestjs/common';

export const ROLE_CODES = [
  'ADMIN',
  'JEFE',
  'TRABAJADOR_INE',
  'PROVEEDOR',
  'SOLICITANTE',
] as const;

export type RoleCode = (typeof ROLE_CODES)[number];
export const REQUIRED_ROLES_KEY = 'required_roles';

export const Roles = (...roles: RoleCode[]) =>
  SetMetadata(REQUIRED_ROLES_KEY, roles);
