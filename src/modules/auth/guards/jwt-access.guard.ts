import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { AuthService } from '../auth.service.js';
import type { AccessTokenPayload, AuthPrincipal } from '../auth.types.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';

@Injectable()
export class JwtAccessGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly authService: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const cookieName = this.config.getOrThrow<string>('AUTH_ACCESS_COOKIE_NAME');
    const token = request.cookies?.[cookieName] as string | undefined;

    if (!token) {
      throw new UnauthorizedException({
        code: 'SESION_NO_AUTENTICADA',
        detail: 'No existe una sesión de acceso válida.',
      });
    }

    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
      const principal = await this.authService.obtenerPrincipalActivo(payload.sub);

      if (!principal) {
        throw new UnauthorizedException({
          code: 'SESION_NO_AUTENTICADA',
          detail: 'La cuenta no puede usar esta sesión.',
        });
      }

      (request as Request & { user: AuthPrincipal }).user = principal;
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException({
        code: 'SESION_NO_AUTENTICADA',
        detail: 'La sesión de acceso expiró o no es válida.',
      });
    }
  }
}
