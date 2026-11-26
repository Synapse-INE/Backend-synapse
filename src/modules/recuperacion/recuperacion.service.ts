import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import argon2 from 'argon2';
import { generarToken, hashToken } from '../../common/security/tokens.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { MailService } from '../../infrastructure/mail/mail.service.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { correoRestablecimiento } from './correo-restablecimiento.js';

const TOKEN_INVALIDO = {
  code: 'TOKEN_INVALIDO',
  detail: 'El enlace no es válido o ya venció.',
};

@Injectable()
export class RecuperacionService {
  private readonly logger = new Logger(RecuperacionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** Responde igual exista o no la cuenta; solo las cuentas activas reciben enlace. */
  async solicitarRestablecimiento(emailEntrada: string, ip?: string) {
    const email = emailEntrada.trim().toLowerCase();
    const usuario = await this.prisma.usuario.findUnique({
      where: { email },
      select: { id: true, nombre: true, estado: true },
    });
    if (!usuario || usuario.estado !== 'ACTIVO') {
      return;
    }

    await this.emitir(usuario, email, 'RESTABLECIMIENTO', ip);
  }

  /** Cuenta creada por un administrador: el enlace permite elegir la primera contraseña. */
  async enviarActivacion(
    usuario: { id: string; nombre: string; email: string },
    ip?: string,
    actorId?: string,
  ) {
    await this.emitir(usuario, usuario.email, 'ACTIVACION', ip, actorId);
  }

  private async emitir(
    usuario: { id: string; nombre: string },
    email: string,
    tipo: 'ACTIVACION' | 'RESTABLECIMIENTO',
    ip?: string,
    actorId?: string,
  ) {
    const { token, hash } = generarToken();
    const horas = this.config.getOrThrow<number>(
      tipo === 'ACTIVACION' ? 'INVITATION_TTL_HOURS' : 'RESET_TOKEN_TTL_HOURS',
    );
    await this.prisma.$transaction(async (tx) => {
      // Un enlace nuevo invalida los anteriores.
      await tx.tokenRestablecimientoContrasena.updateMany({
        where: { usuarioId: usuario.id, consumidoEn: null },
        data: { consumidoEn: new Date() },
      });
      await tx.tokenRestablecimientoContrasena.create({
        data: {
          usuarioId: usuario.id,
          tokenHash: hash,
          venceEn: new Date(Date.now() + horas * 3_600_000),
        },
      });
      await this.auditoria.registrarEn(tx, {
        actorId: actorId ?? usuario.id,
        accion:
          tipo === 'ACTIVACION'
            ? 'ENLACE_ACTIVACION_EMITIDO'
            : 'RESTABLECIMIENTO_SOLICITADO',
        recurso: 'usuario',
        recursoId: usuario.id,
        ip,
      });
    });

    const base = this.config.getOrThrow<string>('FRONTEND_URL');
    const mensaje = correoRestablecimiento({
      nombre: usuario.nombre,
      enlace: `${base}/restablecer-contrasena?token=${encodeURIComponent(token)}`,
      horas,
      tipo,
    });
    try {
      await this.mail.send({
        to: email,
        subject:
          tipo === 'ACTIVACION'
            ? 'Activa tu cuenta del Portal de Precios de Referencia'
            : 'Restablece tu contraseña del Portal de Precios de Referencia',
        text: mensaje.text,
        html: mensaje.html,
      });
    } catch (error) {
      // Nunca se registra el token ni el enlace.
      this.logger.error(
        'No se pudo enviar el correo de acceso.',
        error instanceof Error ? error.message : undefined,
      );
    }
  }

  async restablecer(token: string, password: string, ip?: string) {
    const tokenHash = hashToken(token);
    const passwordHash = await argon2.hash(password);
    await this.prisma.$transaction(async (tx) => {
      const ahora = new Date();
      const consumido = await tx.tokenRestablecimientoContrasena.updateMany({
        where: { tokenHash, consumidoEn: null, venceEn: { gt: ahora } },
        data: { consumidoEn: ahora },
      });
      if (consumido.count !== 1) {
        throw new BadRequestException(TOKEN_INVALIDO);
      }
      const registro = await tx.tokenRestablecimientoContrasena.findUniqueOrThrow({
        where: { tokenHash },
        select: { usuarioId: true },
      });
      // Solo una cuenta activa puede recuperar acceso por este medio.
      const actualizado = await tx.usuario.updateMany({
        where: { id: registro.usuarioId, estado: 'ACTIVO' },
        data: { passwordHash },
      });
      if (actualizado.count !== 1) {
        throw new BadRequestException(TOKEN_INVALIDO);
      }
      await tx.sesionUsuario.updateMany({
        where: { usuarioId: registro.usuarioId, revocadaEn: null },
        data: { revocadaEn: ahora },
      });
      await this.auditoria.registrarEn(tx, {
        actorId: registro.usuarioId,
        accion: 'CONTRASENA_RESTABLECIDA',
        recurso: 'usuario',
        recursoId: registro.usuarioId,
        ip,
      });
    });
  }

  async cambiar(
    usuarioId: string,
    sesionActualId: string,
    passwordActual: string,
    passwordNueva: string,
    ip?: string,
  ) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { passwordHash: true },
    });
    const correcta =
      usuario !== null && (await argon2.verify(usuario.passwordHash, passwordActual));
    if (!correcta) {
      await this.auditoria.registrar({
        actorId: usuarioId,
        accion: 'CAMBIO_CONTRASENA_FALLIDO',
        recurso: 'usuario',
        recursoId: usuarioId,
        ip,
      });
      throw new UnauthorizedException({
        code: 'CONTRASENA_ACTUAL_INCORRECTA',
        detail: 'La contraseña actual no es correcta.',
      });
    }
    if (passwordActual === passwordNueva) {
      throw new BadRequestException({
        code: 'CONTRASENA_REPETIDA',
        detail: 'La contraseña nueva debe ser distinta de la actual.',
      });
    }

    const passwordHash = await argon2.hash(passwordNueva);
    const ahora = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.usuario.update({
        where: { id: usuarioId },
        data: { passwordHash },
      });
      // Se conserva la sesión desde la que se cambió; las demás se cierran.
      await tx.sesionUsuario.updateMany({
        where: { usuarioId, revocadaEn: null, id: { not: sesionActualId } },
        data: { revocadaEn: ahora },
      });
      await this.auditoria.registrarEn(tx, {
        actorId: usuarioId,
        accion: 'CONTRASENA_CAMBIADA',
        recurso: 'usuario',
        recursoId: usuarioId,
        ip,
      });
    });
  }
}
