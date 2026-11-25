import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '../../infrastructure/database/generated/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';

export interface EventoAuditable {
  actorId?: string | null;
  accion: string;
  recurso: string;
  recursoId?: string | null;
  ip?: string | null;
  metadatos?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditoriaService {
  private readonly logger = new Logger(AuditoriaService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Registra dentro de una transacción: si falla, falla la operación completa. */
  registrarEn(tx: Prisma.TransactionClient, evento: EventoAuditable) {
    return tx.eventoAuditoria.create({ data: this.datos(evento) });
  }

  /** Mejor esfuerzo: un fallo de auditoría no impide responder. */
  async registrar(evento: EventoAuditable) {
    try {
      await this.prisma.eventoAuditoria.create({ data: this.datos(evento) });
    } catch (error) {
      this.logger.error(
        `No se pudo registrar el evento ${evento.accion}.`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private datos(evento: EventoAuditable) {
    return {
      actorId: evento.actorId ?? null,
      accion: evento.accion,
      recurso: evento.recurso,
      recursoId: evento.recursoId ?? null,
      ip: evento.ip ?? null,
      ...(evento.metadatos ? { metadatos: evento.metadatos } : {}),
    };
  }
}
