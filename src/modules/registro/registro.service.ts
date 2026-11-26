import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import argon2 from 'argon2';
import {
  esErrorUnico,
  generarToken,
  hashToken,
} from '../../common/security/tokens.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { MailService } from '../../infrastructure/mail/mail.service.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { correoVerificacion } from './correo-verificacion.js';
import type {
  AceptarInvitacionDto,
  RegistroSolicitanteDto,
} from './registro.dto.js';

const TOKEN_INVALIDO = {
  code: 'TOKEN_INVALIDO',
  detail: 'El enlace no es válido o ya venció.',
};

@Injectable()
export class RegistroService {
  private readonly logger = new Logger(RegistroService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** Responde igual si el correo ya existe, para no revelar qué cuentas hay. */
  async registrarSolicitante(dto: RegistroSolicitanteDto, ip?: string) {
    const email = dto.email.trim().toLowerCase();
    this.validarDominio(email);

    // El hash se calcula siempre para que la duración no delate si el correo existe.
    const passwordHash = await argon2.hash(dto.password);
    const existente = await this.prisma.usuario.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existente) {
      await this.auditoria.registrar({
        accion: 'REGISTRO_SOLICITANTE_DUPLICADO',
        recurso: 'usuario',
        recursoId: existente.id,
        ip,
      });
      return;
    }

    const { token, hash } = generarToken();
    try {
      const rol = await this.prisma.rol.findUniqueOrThrow({
        where: { codigo: 'SOLICITANTE' },
      });
      await this.prisma.$transaction(async (tx) => {
        const nit = dto.institucion.nit?.trim() || null;
        const nombreOficial = dto.institucion.nombreOficial;
        const institucion =
          (nit
            ? await tx.institucionSolicitante.findUnique({ where: { nit } })
            : await tx.institucionSolicitante.findFirst({
                where: {
                  nit: null,
                  nombreOficial: { equals: nombreOficial, mode: 'insensitive' },
                },
              })) ??
          (await tx.institucionSolicitante.create({
            data: { nombreOficial, nit },
          }));
        const usuario = await tx.usuario.create({
          data: {
            email,
            passwordHash,
            nombre: dto.nombre,
            roles: { create: [{ rolId: rol.id }] },
            perfilSolicitante: {
              create: {
                institucionId: institucion.id,
                cargo: dto.cargo ?? null,
              },
            },
            tokensVerificacion: {
              create: {
                tokenHash: hash,
                venceEn: this.vencimiento('EMAIL_TOKEN_TTL_HOURS'),
              },
            },
          },
        });
        await this.auditoria.registrarEn(tx, {
          actorId: usuario.id,
          accion: 'REGISTRO_SOLICITANTE',
          recurso: 'usuario',
          recursoId: usuario.id,
          ip,
        });
      });
    } catch (error) {
      // Carrera con otro registro del mismo correo: misma respuesta genérica.
      if (esErrorUnico(error)) {
        return;
      }
      throw error;
    }

    await this.enviarVerificacion(email, dto.nombre, token);
  }

  async verificarCorreo(token: string, ip?: string) {
    const tokenHash = hashToken(token);
    await this.prisma.$transaction(async (tx) => {
      const ahora = new Date();
      const consumido = await tx.tokenVerificacionCorreo.updateMany({
        where: { tokenHash, consumidoEn: null, venceEn: { gt: ahora } },
        data: { consumidoEn: ahora },
      });
      if (consumido.count !== 1) {
        throw new BadRequestException(TOKEN_INVALIDO);
      }
      const registro = await tx.tokenVerificacionCorreo.findUniqueOrThrow({
        where: { tokenHash },
        select: { usuarioId: true },
      });
      await tx.usuario.update({
        where: { id: registro.usuarioId },
        data: { emailVerificadoEn: ahora },
      });
      // Solo avanza una cuenta que esperaba verificación; no reactiva bloqueadas.
      await tx.usuario.updateMany({
        where: { id: registro.usuarioId, estado: 'PENDIENTE_VERIFICACION' },
        data: { estado: 'PENDIENTE_APROBACION' },
      });
      await this.auditoria.registrarEn(tx, {
        actorId: registro.usuarioId,
        accion: 'CORREO_VERIFICADO',
        recurso: 'usuario',
        recursoId: registro.usuarioId,
        ip,
      });
    });
  }

  async reenviarVerificacion(emailEntrada: string) {
    const email = emailEntrada.trim().toLowerCase();
    const usuario = await this.prisma.usuario.findUnique({
      where: { email },
      select: { id: true, nombre: true, estado: true },
    });
    if (!usuario || usuario.estado !== 'PENDIENTE_VERIFICACION') {
      return;
    }

    const { token, hash } = generarToken();
    await this.prisma.$transaction(async (tx) => {
      await tx.tokenVerificacionCorreo.updateMany({
        where: { usuarioId: usuario.id, consumidoEn: null },
        data: { consumidoEn: new Date() },
      });
      await tx.tokenVerificacionCorreo.create({
        data: {
          usuarioId: usuario.id,
          tokenHash: hash,
          venceEn: this.vencimiento('EMAIL_TOKEN_TTL_HOURS'),
        },
      });
    });
    await this.enviarVerificacion(email, usuario.nombre, token);
  }

  async aceptarInvitacion(dto: AceptarInvitacionDto, ip?: string) {
    const tokenHash = hashToken(dto.token);
    const passwordHash = await argon2.hash(dto.password);
    const rol = await this.prisma.rol.findUniqueOrThrow({
      where: { codigo: 'PROVEEDOR' },
    });

    try {
      return await this.prisma.$transaction(async (tx) => {
        const ahora = new Date();
        const reclamada = await tx.invitacionProveedor.updateMany({
          where: { tokenHash, aceptadaEn: null, venceEn: { gt: ahora } },
          data: { aceptadaEn: ahora },
        });
        if (reclamada.count !== 1) {
          throw new BadRequestException(TOKEN_INVALIDO);
        }
        const invitacion = await tx.invitacionProveedor.findUniqueOrThrow({
          where: { tokenHash },
        });
        if (!invitacion.proveedorId) {
          throw new BadRequestException(TOKEN_INVALIDO);
        }
        const usuario = await tx.usuario.create({
          data: {
            email: invitacion.email.trim().toLowerCase(),
            passwordHash,
            nombre: dto.nombre,
            estado: 'ACTIVO',
            // El enlace llegó al correo invitado: eso verifica su control.
            emailVerificadoEn: ahora,
            proveedorId: invitacion.proveedorId,
            roles: { create: [{ rolId: rol.id }] },
          },
        });
        await this.auditoria.registrarEn(tx, {
          actorId: usuario.id,
          accion: 'INVITACION_ACEPTADA',
          recurso: 'invitacion_proveedor',
          recursoId: invitacion.id,
          ip,
        });
        return { id: usuario.id, email: usuario.email, nombre: usuario.nombre };
      });
    } catch (error) {
      if (esErrorUnico(error)) {
        throw new ConflictException({
          code: 'CUENTA_EXISTENTE',
          detail: 'No se pudo completar la invitación.',
        });
      }
      throw error;
    }
  }

  private validarDominio(email: string) {
    const permitidos = (
      this.config.get<string>('REGISTRO_DOMINIOS_PERMITIDOS') ?? ''
    )
      .split(',')
      .map((dominio) => dominio.trim().toLowerCase())
      .filter(Boolean);
    if (permitidos.length === 0) {
      return;
    }
    const dominio = email.split('@')[1] ?? '';
    const coincide = permitidos.some(
      (permitido) => dominio === permitido || dominio.endsWith(`.${permitido}`),
    );
    if (!coincide) {
      throw new BadRequestException({
        code: 'DOMINIO_NO_PERMITIDO',
        detail: 'Usa el correo institucional de tu entidad.',
      });
    }
  }

  private vencimiento(clave: string) {
    return new Date(
      Date.now() + this.config.getOrThrow<number>(clave) * 3_600_000,
    );
  }

  private async enviarVerificacion(
    email: string,
    nombre: string,
    token: string,
  ) {
    const base = this.config.getOrThrow<string>('FRONTEND_URL');
    const enlace = `${base}/verificar-correo?token=${encodeURIComponent(token)}`;
    const horas = this.config.getOrThrow<number>('EMAIL_TOKEN_TTL_HOURS');
    const mensaje = correoVerificacion({
      nombre,
      enlace,
      horas,
    });
    try {
      await this.mail.send({
        to: email,
        subject: 'Verifica tu correo en el Portal de Precios de Referencia',
        text: mensaje.text,
        html: mensaje.html,
      });
    } catch (error) {
      // Nunca se registra el token ni el enlace.
      this.logger.error(
        'No se pudo enviar el correo de verificación.',
        error instanceof Error ? error.message : undefined,
      );
    }
  }
}
