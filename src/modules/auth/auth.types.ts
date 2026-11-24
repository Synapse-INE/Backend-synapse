import type { Request } from 'express';

export interface AuthenticatedUser {
  id: string;
  email: string;
  nombre: string;
  roles: string[];
}

export interface AuthenticatedRequest extends Request {
  auth: {
    sessionId: string;
    csrfTokenHash: string;
    usuario: AuthenticatedUser;
  };
}
