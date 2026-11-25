import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';

export type DecisionRevision = 'APROBAR' | 'RECHAZAR';

@Injectable()
export class SolicitantesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async listarPendientes() {
    const perfiles = await this.prisma.perfilSolicitante.findMany({
      where: {
        estadoRevision: 'PENDIENTE',
        usuario: { estado: 'PENDIENTE_APROBACION' },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        cargo: true,
        createdAt: true,
        usuario: { select: { id: true, email: true, nombre: true } },
        institucion: { select: { id: true, nombreOficial: true, nit: true } },
      },
    });

    return perfiles.map((perfil) => ({
      usuarioId: perfil.usuario.id,
      email: perfil.usuario.email,
      nombre: perfil.usuario.nombre,
      cargo: perfil.cargo,
      institucion: perfil.institucion,
      solicitadoEn: perfil.createdAt,
    }));
  }

  async revisar(
    usuarioId: string,
    decision: DecisionRevision,
    revisorId: string,
    ip?: string,
  ) {
    const aprobar = decision === 'APROBAR';
    await this.prisma.$transaction(async (tx) => {
      const ahora = new Date();
      // Solo se revisa un perfil pendiente cuyo correo ya fue verificado.
      const actualizado = await tx.perfilSolicitante.updateMany({
        where: {
          usuarioId,
          estadoRevision: 'PENDIENTE',
          usuario: { estado: 'PENDIENTE_APROBACION' },
        },
        data: {
          estadoRevision: aprobar ? 'VERIFICADO' : 'RECHAZADO',
          revisadoPorId: revisorId,
          revisadoEn: ahora,
        },
      });
      if (actualizado.count !== 1) {
        throw new ConflictException({
          code: 'REVISION_NO_APLICABLE',
          detail:
            'El solicitante no existe o no está pendiente de revisión con correo verificado.',
        });
      }
      await tx.usuario.update({
        where: { id: usuarioId },
        data: { estado: aprobar ? 'ACTIVO' : 'DESACTIVADO' },
      });
      await this.auditoria.registrarEn(tx, {
        actorId: revisorId,
        accion: aprobar ? 'SOLICITANTE_APROBADO' : 'SOLICITANTE_RECHAZADO',
        recurso: 'usuario',
        recursoId: usuarioId,
        ip,
      });
    });

    return { usuarioId, estado: aprobar ? 'ACTIVO' : 'DESACTIVADO' };
  }
}
