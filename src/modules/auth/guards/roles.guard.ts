import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ROLES_KEY, type AuthPrincipal, type RolCodigo } from '../auth.types.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const requiredRoles = this.reflector.getAllAndOverride<RolCodigo[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const principal = (request as Request & { user?: AuthPrincipal }).user;

    if (principal && requiredRoles.some((role) => principal.roles.includes(role))) {
      return true;
    }

    throw new ForbiddenException({
      code: 'ROL_INSUFICIENTE',
      detail: 'La cuenta no tiene un rol autorizado para esta operación.',
    });
  }
}
