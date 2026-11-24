import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthService } from '../auth.service.js';
import { SKIP_CSRF_KEY } from '../decorators/skip-csrf.decorator.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly authService: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();

    const skipCsrf = this.reflector.getAllAndOverride<boolean>(SKIP_CSRF_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skipCsrf || SAFE_METHODS.has(request.method)) {
      return true;
    }

    const csrfCookieName = this.config.getOrThrow<string>('AUTH_CSRF_COOKIE_NAME');
    const refreshCookieName = this.config.getOrThrow<string>('AUTH_REFRESH_COOKIE_NAME');
    const csrfHeaderName = this.config
      .getOrThrow<string>('AUTH_CSRF_HEADER_NAME')
      .toLowerCase();
    const csrfToken = request.headers[csrfHeaderName] as string | undefined;
    const csrfCookie = request.cookies?.[csrfCookieName] as string | undefined;
    const refreshToken = request.cookies?.[refreshCookieName] as string | undefined;

    if (
      !csrfToken ||
      !csrfCookie ||
      !refreshToken ||
      csrfToken !== csrfCookie ||
      !(await this.authService.validarCsrf(refreshToken, csrfToken))
    ) {
      throw new ForbiddenException({
        code: 'CSRF_INVALIDO',
        detail: 'La solicitud no contiene un token CSRF válido.',
      });
    }

    return true;
  }
}
