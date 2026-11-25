import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from './auth-context.js';
import {
  REQUIRED_ROLES_KEY,
  type RoleCode,
} from './roles.decorator.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<RoleCode[]>(
      REQUIRED_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (requiredRoles === undefined) return true;
    if (requiredRoles.length === 0) throw new ForbiddenException();

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.auth) throw new UnauthorizedException();

    if (
      !request.auth.usuario.roles.some((role) =>
        requiredRoles.some((requiredRole) => requiredRole === role),
      )
    ) {
      throw new ForbiddenException();
    }
    return true;
  }
}
