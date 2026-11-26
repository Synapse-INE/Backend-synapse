import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import type { Prisma } from '../../infrastructure/database/generated/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import type { AuthenticatedUser } from '../../common/auth/auth-context.js';

const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$53PUPCI+M/TtKjVnO5JRpA$ko/LbHtOTytiF++bA/fQFp27BMb2iOQzQzcsuZ3N9lk';

export type ContextoSolicitud = { ip?: string };

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async signIn(
    email: string,
    password: string,
    contexto: ContextoSolicitud = {},
  ) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.usuario.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        nombre: true,
        proveedorId: true,
        estado: true,
        emailVerificadoEn: true,
        roles: {
          select: {
            rol: { select: { codigo: true } },
          },
        },
      },
    });

    const passwordMatches = await argon2.verify(
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
      password,
    );

    if (!user || !passwordMatches) {
      return this.rechazar(user?.id ?? null, contexto, normalizedEmail);
    }

    if (user.estado === 'PENDIENTE_APROBACION' && user.emailVerificadoEn) {
      return this.rechazar(user.id, contexto, normalizedEmail, {
        code: 'CUENTA_PENDIENTE_APROBACION',
        detail:
          'Tu correo ya está verificado. Un administrador del INE todavía tiene que aprobar la cuenta.',
      });
    }

    if (user.estado !== 'ACTIVO' || !user.emailVerificadoEn) {
      return this.rechazar(user.id, contexto, normalizedEmail);
    }

    const sessionToken = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(
      Date.now() + this.config.getOrThrow<number>('SESSION_TTL_SECONDS') * 1000,
    );

    await this.prisma.$transaction(async (transaction) => {
      await transaction.sesionUsuario.create({
        data: {
          usuarioId: user.id,
          tokenHash: hashToken(sessionToken),
          csrfTokenHash: hashToken(csrfToken),
          venceEn: expiresAt,
        },
      });
      await transaction.usuario.update({
        where: { id: user.id },
        data: { ultimoAccesoEn: new Date() },
      });
      await transaction.eventoAuditoria.create({
        data: {
          actorId: user.id,
          accion: 'INICIO_SESION',
          recurso: 'sesion_usuario',
          ip: contexto.ip ?? null,
        },
      });
    });

    return {
      usuario: toAuthenticatedUser(user),
      sessionToken,
      csrfToken,
    };
  }

  async rotateCsrfToken(sessionId: string) {
    const csrfToken = randomBytes(32).toString('base64url');
    await this.prisma.sesionUsuario.update({
      where: { id: sessionId },
      data: { csrfTokenHash: hashToken(csrfToken) },
    });
    return csrfToken;
  }

  async revokeSession(
    sessionId: string,
    actorId?: string,
    contexto: ContextoSolicitud = {},
  ) {
    await this.prisma.sesionUsuario.updateMany({
      where: { id: sessionId, revocadaEn: null },
      data: { revocadaEn: new Date() },
    });
    await this.auditar({
      actorId: actorId ?? null,
      accion: 'CIERRE_SESION',
      recursoId: sessionId,
      ip: contexto.ip,
    });
  }

  private async rechazar(
    actorId: string | null,
    contexto: ContextoSolicitud,
    email: string,
    respuesta: string | { code: string; detail: string } = 'Credenciales no válidas.',
  ): Promise<never> {
    await this.auditar({
      actorId,
      accion: 'INICIO_SESION_FALLIDO',
      ip: contexto.ip,
      metadatos: { emailHash: hashToken(email) },
    });
    throw new UnauthorizedException(respuesta);
  }

  // La auditoría de un intento fallido o de un cierre no debe impedir la respuesta.
  private async auditar(evento: {
    actorId: string | null;
    accion: string;
    recursoId?: string;
    ip?: string;
    metadatos?: Prisma.InputJsonValue;
  }) {
    try {
      await this.prisma.eventoAuditoria.create({
        data: {
          actorId: evento.actorId,
          accion: evento.accion,
          recurso: 'sesion_usuario',
          recursoId: evento.recursoId ?? null,
          ip: evento.ip ?? null,
          ...(evento.metadatos ? { metadatos: evento.metadatos } : {}),
        },
      });
    } catch (error) {
      this.logger.error(
        `No se pudo registrar el evento ${evento.accion}.`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function toAuthenticatedUser(user: {
  id: string;
  email: string;
  nombre: string;
  proveedorId?: string | null;
  roles: { rol: { codigo: string } }[];
}): AuthenticatedUser {
  return {
    id: user.id,
    email: user.email,
    nombre: user.nombre,
    roles: user.roles.map(({ rol }) => rol.codigo),
    proveedorId: user.proveedorId ?? null,
  };
}
