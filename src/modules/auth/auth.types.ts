export const ROLES_KEY = 'roles';

export type RolCodigo = 'ADMIN' | 'TRABAJADOR_INE' | 'PROVEEDOR' | 'USUARIO';

export interface AuthPrincipal {
  id: string;
  email: string;
  nombre: string;
  roles: RolCodigo[];
  proveedorId: string | null;
}

export interface AccessTokenPayload {
  sub: string;
  email: string;
}
