import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { createHash, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { hashToken } from './auth.service.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import type { AuthenticatedRequest } from './auth.types.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const cookieName = this.config.getOrThrow<string>('SESSION_COOKIE_NAME');
    const sessionToken = request.cookies?.[cookieName];
    if (typeof sessionToken !== 'string' || sessionToken.length === 0) {
      throw new UnauthorizedException();
    }

    const session = await this.prisma.sesionUsuario.findUnique({
      where: { tokenHash: hashToken(sessionToken) },
      select: {
        id: true,
        csrfTokenHash: true,
        venceEn: true,
        revocadaEn: true,
        usuario: {
          select: {
            id: true,
            email: true,
            nombre: true,
            estado: true,
            emailVerificadoEn: true,
            roles: {
              select: {
                rol: { select: { codigo: true } },
              },
            },
          },
        },
      },
    });

    if (
      !session ||
      session.revocadaEn ||
      session.venceEn.getTime() <= Date.now() ||
      session.usuario.estado !== 'ACTIVO' ||
      !session.usuario.emailVerificadoEn
    ) {
      throw new UnauthorizedException();
    }

    request.auth = {
      sessionId: session.id,
      csrfTokenHash: session.csrfTokenHash,
      usuario: {
        id: session.usuario.id,
        email: session.usuario.email,
        nombre: session.usuario.nombre,
        roles: session.usuario.roles.map(({ rol }) => rol.codigo),
      },
    };

    if (!SAFE_METHODS.has(request.method.toUpperCase())) {
      this.assertValidCsrfToken(
        request.headers['x-csrf-token'],
        session.csrfTokenHash,
      );
    }
    return true;
  }

  private assertValidCsrfToken(
    providedToken: string | string[] | undefined,
    expectedHash: string,
  ) {
    if (typeof providedToken !== 'string') {
      throw new ForbiddenException('Token CSRF no válido.');
    }

    const providedHash = createHash('sha256').update(providedToken).digest();
    const expected = Buffer.from(expectedHash, 'hex');
    if (
      providedHash.length !== expected.length ||
      !timingSafeEqual(providedHash, expected)
    ) {
      throw new ForbiddenException('Token CSRF no válido.');
    }
  }
}
