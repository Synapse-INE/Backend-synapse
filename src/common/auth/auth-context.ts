import type { Request } from 'express';

export interface AuthenticatedUser {
  id: string;
  email: string;
  nombre: string;
  roles: string[];
  proveedorId: string | null;
}

export interface AuthenticatedOwnership {
  usuarioId: string;
  proveedorId: string | null;
  institucionId: string | null;
}

export interface AuthenticatedRequest extends Request {
  auth: {
    sessionId: string;
    csrfTokenHash: string;
    usuario: AuthenticatedUser;
    ownership: AuthenticatedOwnership;
  };
}
