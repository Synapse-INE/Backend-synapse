import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedRequest } from '../../common/auth/auth-context.js';
import { Prisma } from '../../infrastructure/database/generated/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import type { ListarNotificacionesDto } from './notificaciones.dto.js';

type Actor = AuthenticatedRequest['auth'];

const AVISO = {
  id: true,
  titulo: true,
  detalle: true,
  leidaEn: true,
  createdAt: true,
  solicitud: { select: { id: true, codigo: true, titulo: true } },
} satisfies Prisma.NotificacionSelect;

export type Aviso = {
  solicitudId: string;
  actorId: string;
  creadaPorId?: string | null;
  asignadaAId?: string | null;
  titulo: string;
  detalle: string;
  /** Una nota interna no llega a quien creó el expediente. */
  incluirCreador?: boolean;
};

@Injectable()
export class NotificacionesService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(filtros: ListarNotificacionesDto, actor: Actor) {
    const where: Prisma.NotificacionWhereInput = {
      usuarioId: actor.usuario.id,
      ...(filtros.soloNoLeidas ? { leidaEn: null } : {}),
    };
    const limite = filtros.limite ?? 25;
    const desplazamiento = filtros.desplazamiento ?? 0;
    const [total, noLeidas, notificaciones] = await Promise.all([
      this.prisma.notificacion.count({ where }),
      this.prisma.notificacion.count({
        where: { usuarioId: actor.usuario.id, leidaEn: null },
      }),
      this.prisma.notificacion.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: desplazamiento,
        take: limite,
        select: AVISO,
      }),
    ]);
    return { total, noLeidas, notificaciones };
  }

  async marcarLeida(id: string, actor: Actor) {
    const aviso = await this.prisma.notificacion.findFirst({
      where: { id, usuarioId: actor.usuario.id },
      select: AVISO,
    });
    if (!aviso) {
      throw new NotFoundException({
        code: 'NOTIFICACION_NO_ENCONTRADA',
        detail: 'El aviso no existe.',
      });
    }
    if (aviso.leidaEn) return aviso;
    return this.prisma.notificacion.update({
      where: { id },
      data: { leidaEn: new Date() },
      select: AVISO,
    });
  }

  async marcarTodasLeidas(actor: Actor) {
    const cambio = await this.prisma.notificacion.updateMany({
      where: { usuarioId: actor.usuario.id, leidaEn: null },
      data: { leidaEn: new Date() },
    });
    return { actualizadas: cambio.count };
  }

  /** Bandeja del jefe: nueva solicitud en estado RECIBIDA (sin responsable aún). */
  async avisarJefesNuevaRecepcion(
    tx: Prisma.TransactionClient,
    datos: {
      solicitudId: string;
      actorId: string;
      codigo: string;
      tituloExpediente?: string | null;
      reenvio?: boolean;
    },
  ) {
    const jefes = await tx.usuario.findMany({
      where: {
        estado: 'ACTIVO',
        roles: { some: { rol: { codigo: 'JEFE' } } },
      },
      select: { id: true },
    });
    const destinatarios = [
      ...new Set(jefes.map((persona) => persona.id).filter((id) => id !== datos.actorId)),
    ];
    if (destinatarios.length === 0) return;
    const asunto = datos.reenvio ? 'Expediente reenviado' : 'Nueva solicitud recibida';
    const detalle = datos.reenvio
      ? `${datos.codigo} fue corregido y volvió a bandeja.`
      : `${datos.codigo}${datos.tituloExpediente ? `: ${datos.tituloExpediente}` : ''} espera revisión en bandeja.`;
    return tx.notificacion.createMany({
      data: destinatarios.map((usuarioId) => ({
        usuarioId,
        solicitudId: datos.solicitudId,
        titulo: asunto.slice(0, 160),
        detalle: detalle.slice(0, 500),
      })),
    });
  }

  /** Quien hizo la acción no se avisa a sí mismo. */
  avisar(tx: Prisma.TransactionClient, aviso: Aviso) {
    const destinatarios = new Set<string>();
    if (aviso.incluirCreador !== false && aviso.creadaPorId) {
      destinatarios.add(aviso.creadaPorId);
    }
    if (aviso.asignadaAId) destinatarios.add(aviso.asignadaAId);
    destinatarios.delete(aviso.actorId);
    if (destinatarios.size === 0) return Promise.resolve();
    return tx.notificacion.createMany({
      data: [...destinatarios].map((usuarioId) => ({
        usuarioId,
        solicitudId: aviso.solicitudId,
        titulo: aviso.titulo.slice(0, 160),
        detalle: aviso.detalle.slice(0, 500),
      })),
    });
  }
}
