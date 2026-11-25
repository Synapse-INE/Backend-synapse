import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generarToken } from '../../common/security/tokens.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { MailService } from '../../infrastructure/mail/mail.service.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { CrearInvitacionDto } from './invitaciones.dto.js';

@Injectable()
export class InvitacionesService {
  private readonly logger = new Logger(InvitacionesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async crear(dto: CrearInvitacionDto, actorId: string, ip?: string) {
    if (Boolean(dto.proveedorId) === Boolean(dto.nuevoProveedor)) {
      throw new BadRequestException({
        code: 'PROVEEDOR_REQUERIDO',
        detail: 'Indica proveedorId o nuevoProveedor, pero no ambos.',
      });
    }

    const email = dto.email.trim().toLowerCase();
    if (await this.prisma.usuario.findUnique({ where: { email } })) {
      throw new ConflictException({
        code: 'CORREO_YA_REGISTRADO',
        detail: 'Ya existe una cuenta con ese correo.',
      });
    }
    if (dto.proveedorId) {
      const proveedor = await this.prisma.proveedor.findUnique({
        where: { id: dto.proveedorId },
        select: { id: true },
      });
      if (!proveedor) {
        throw new NotFoundException({
          code: 'PROVEEDOR_NO_ENCONTRADO',
          detail: 'El proveedor indicado no existe.',
        });
      }
    }

    const { token, hash } = generarToken();
    const horas = this.config.getOrThrow<number>('INVITATION_TTL_HOURS');
    const invitacion = await this.prisma.$transaction(async (tx) => {
      // Una invitación vigente anterior para el mismo correo deja de servir.
      await tx.invitacionProveedor.updateMany({
        where: { email, aceptadaEn: null, venceEn: { gt: new Date() } },
        data: { venceEn: new Date() },
      });
      const proveedorId =
        dto.proveedorId ??
        (
          await tx.proveedor.create({
            data: {
              nombreComercial: dto.nuevoProveedor!.nombreComercial,
              razonSocial: dto.nuevoProveedor!.razonSocial ?? null,
              correoContacto: email,
            },
          })
        ).id;
      const creada = await tx.invitacionProveedor.create({
        data: {
          proveedorId,
          email,
          tokenHash: hash,
          venceEn: new Date(Date.now() + horas * 3_600_000),
          creadaPorId: actorId,
        },
      });
      await this.auditoria.registrarEn(tx, {
        actorId,
        accion: 'INVITACION_CREADA',
        recurso: 'invitacion_proveedor',
        recursoId: creada.id,
        ip,
        metadatos: { proveedorId },
      });
      return creada;
    });

    const correoEnviado = await this.enviar(email, token, horas);
    return {
      id: invitacion.id,
      email,
      proveedorId: invitacion.proveedorId,
      venceEn: invitacion.venceEn,
      correoEnviado,
    };
  }

  private async enviar(email: string, token: string, horas: number) {
    const base = this.config.getOrThrow<string>('FRONTEND_URL');
    const enlace = `${base}/aceptar-invitacion?token=${encodeURIComponent(token)}`;
    try {
      await this.mail.send({
        to: email,
        subject: 'Invitación al Portal de Precios de Referencia del INE',
        text: `El INE te invita a crear una cuenta de proveedor.\n\nUsa este enlace de un solo uso (vence en ${horas} horas):\n${enlace}\n\nSi no esperabas esta invitación, ignora este mensaje.`,
      });
      return true;
    } catch (error) {
      // El administrador ve correoEnviado=false; el token no se registra.
      this.logger.error(
        'No se pudo enviar el correo de invitación.',
        error instanceof Error ? error.message : undefined,
      );
      return false;
    }
  }
}
