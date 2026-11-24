import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import argon2 from 'argon2';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import type { LoginDto } from './dto/login.dto.js';
import type { AccessTokenPayload, AuthPrincipal, RolCodigo } from './auth.types.js';

type UsuarioConRoles = {
  id: string;
  email: string;
  nombre: string;
  proveedorId: string | null;
  estado: string;
  roles: Array<{ rol: { codigo: string } }>;
};

type SesionTokens = {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async iniciarSesion(dto: LoginDto, ip?: string) {
    const email = dto.email.trim().toLowerCase();
    const usuario = await this.prisma.usuario.findUnique({
      where: { email },
      include: { roles: { include: { rol: true } } },
    });

    if (
      !usuario ||
      usuario.estado !== 'ACTIVO' ||
      !(await argon2.verify(usuario.passwordHash, dto.password))
    ) {
      throw this.credencialesInvalidas();
    }

    const principal = this.aPrincipal(usuario);
    const tokens = await this.crearSesion(principal);

    await this.prisma.$transaction([
      this.prisma.usuario.update({
        where: { id: usuario.id },
        data: { ultimoAccesoEn: new Date() },
      }),
      this.prisma.eventoAuditoria.create({
        data: {
          actorId: usuario.id,
          accion: 'AUTH_LOGIN',
          recurso: 'sesion',
          recursoId: usuario.id,
          ip: this.ipAuditable(ip),
        },
      }),
    ]);

    return { principal, tokens };
  }

  async refrescarSesion(
    refreshToken: string,
    csrfToken: string,
    ip?: string,
  ) {
    const session = await this.prisma.sesionAutenticacion.findUnique({
      where: { tokenHash: this.hash(refreshToken) },
      include: { usuario: { include: { roles: { include: { rol: true } } } } },
    });

    if (!session) {
      throw this.sesionNoAutenticada();
    }

    if (session.rotadaEn || session.revocadaEn) {
      await this.revocarSesionesActivas(session.usuarioId);
      throw this.sesionNoAutenticada();
    }

    if (
      session.venceEn <= new Date() ||
      session.usuario.estado !== 'ACTIVO' ||
      !this.compararHash(csrfToken, session.csrfTokenHash)
    ) {
      throw this.sesionNoAutenticada();
    }

    const rotacion = await this.prisma.sesionAutenticacion.updateMany({
      where: {
        id: session.id,
        revocadaEn: null,
        rotadaEn: null,
        venceEn: { gt: new Date() },
      },
      data: { rotadaEn: new Date(), ultimoUsoEn: new Date() },
    });

    if (rotacion.count !== 1) {
      await this.revocarSesionesActivas(session.usuarioId);
      throw this.sesionNoAutenticada();
    }

    const principal = this.aPrincipal(session.usuario);
    const tokens = await this.crearSesion(principal);

    await this.prisma.eventoAuditoria.create({
      data: {
        actorId: principal.id,
        accion: 'AUTH_REFRESH',
        recurso: 'sesion',
        recursoId: session.id,
        ip: this.ipAuditable(ip),
      },
    });

    return { principal, tokens };
  }

  async cerrarSesion(refreshToken: string | undefined, ip?: string) {
    if (!refreshToken) {
      return;
    }

    const session = await this.prisma.sesionAutenticacion.findUnique({
      where: { tokenHash: this.hash(refreshToken) },
      select: { id: true, usuarioId: true, revocadaEn: true },
    });

    if (!session || session.revocadaEn) {
      return;
    }

    await this.prisma.$transaction([
      this.prisma.sesionAutenticacion.update({
        where: { id: session.id },
        data: { revocadaEn: new Date(), ultimoUsoEn: new Date() },
      }),
      this.prisma.eventoAuditoria.create({
        data: {
          actorId: session.usuarioId,
          accion: 'AUTH_LOGOUT',
          recurso: 'sesion',
          recursoId: session.id,
          ip: this.ipAuditable(ip),
        },
      }),
    ]);
  }

  async obtenerPrincipalActivo(usuarioId: string): Promise<AuthPrincipal | null> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      include: { roles: { include: { rol: true } } },
    });

    return usuario?.estado === 'ACTIVO' ? this.aPrincipal(usuario) : null;
  }

  async validarCsrf(refreshToken: string, csrfToken: string) {
    const session = await this.prisma.sesionAutenticacion.findUnique({
      where: { tokenHash: this.hash(refreshToken) },
      select: {
        csrfTokenHash: true,
        venceEn: true,
        revocadaEn: true,
        rotadaEn: true,
      },
    });

    return Boolean(
      session &&
        !session.revocadaEn &&
        !session.rotadaEn &&
        session.venceEn > new Date() &&
        this.compararHash(csrfToken, session.csrfTokenHash),
    );
  }

  async renovarCsrf(refreshToken: string) {
    const session = await this.prisma.sesionAutenticacion.findUnique({
      where: { tokenHash: this.hash(refreshToken) },
      select: { id: true, venceEn: true, revocadaEn: true, rotadaEn: true },
    });

    if (
      !session ||
      session.revocadaEn ||
      session.rotadaEn ||
      session.venceEn <= new Date()
    ) {
      throw this.sesionNoAutenticada();
    }

    const csrfToken = this.crearTokenAleatorio(32);
    await this.prisma.sesionAutenticacion.update({
      where: { id: session.id },
      data: { csrfTokenHash: this.hash(csrfToken), ultimoUsoEn: new Date() },
    });

    return csrfToken;
  }

  private async crearSesion(principal: AuthPrincipal): Promise<SesionTokens> {
    const refreshToken = this.crearTokenAleatorio(48);
    const csrfToken = this.crearTokenAleatorio(32);
    const refreshTtlDays = this.config.getOrThrow<number>('AUTH_REFRESH_TTL_DAYS');
    const venceEn = new Date(Date.now() + refreshTtlDays * 24 * 60 * 60 * 1000);
    const payload: AccessTokenPayload = { sub: principal.id, email: principal.email };
    const accessToken = await this.jwt.signAsync(payload);

    await this.prisma.sesionAutenticacion.create({
      data: {
        usuarioId: principal.id,
        tokenHash: this.hash(refreshToken),
        csrfTokenHash: this.hash(csrfToken),
        venceEn,
      },
    });

    return { accessToken, refreshToken, csrfToken };
  }

  private aPrincipal(usuario: UsuarioConRoles): AuthPrincipal {
    return {
      id: usuario.id,
      email: usuario.email,
      nombre: usuario.nombre,
      proveedorId: usuario.proveedorId,
      roles: usuario.roles
        .map(({ rol }) => rol.codigo)
        .filter((codigo): codigo is RolCodigo =>
          ['ADMIN', 'TRABAJADOR_INE', 'PROVEEDOR', 'USUARIO'].includes(codigo),
        ),
    };
  }

  private async revocarSesionesActivas(usuarioId: string) {
    await this.prisma.sesionAutenticacion.updateMany({
      where: { usuarioId, revocadaEn: null },
      data: { revocadaEn: new Date() },
    });
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private compararHash(value: string, expectedHash: string) {
    const received = Buffer.from(this.hash(value), 'hex');
    const expected = Buffer.from(expectedHash, 'hex');
    return received.length === expected.length && timingSafeEqual(received, expected);
  }

  private crearTokenAleatorio(bytes: number) {
    return randomBytes(bytes).toString('base64url');
  }

  private ipAuditable(ip: string | undefined) {
    return ip && ip.length <= 45 ? ip : null;
  }

  private credencialesInvalidas() {
    return new UnauthorizedException({
      code: 'CREDENCIALES_INVALIDAS',
      detail: 'El correo o la contraseña no son válidos.',
    });
  }

  private sesionNoAutenticada() {
    return new UnauthorizedException({
      code: 'SESION_NO_AUTENTICADA',
      detail: 'La sesión de actualización no es válida.',
    });
  }
}
