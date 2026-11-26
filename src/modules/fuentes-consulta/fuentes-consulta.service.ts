import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../../common/auth/auth-context.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { ActualizarFuenteDto, CrearFuenteDto, ListarFuentesDto } from './fuentes-consulta.dto.js';

type Actor = AuthenticatedRequest['auth'];

const DOMINIO_GT = /^(?:[a-z0-9-]+\.)+gt$/;

const CAMPOS = {
  id: true,
  nombre: true,
  tipo: true,
  pais: true,
  dominio: true,
  activa: true,
  nota: true,
} as const;

@Injectable()
export class FuentesConsultaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  listar(filtros: ListarFuentesDto) {
    return this.prisma.fuenteConsulta.findMany({
      where: filtros.soloActivas ? { activa: true } : {},
      orderBy: [{ activa: 'desc' }, { nombre: 'asc' }],
      select: CAMPOS,
    });
  }

  async crear(dto: CrearFuenteDto, actor: Actor, ip?: string) {
    const fuente = await this.prisma.fuenteConsulta.create({
      data: {
        nombre: dto.nombre,
        tipo: dto.tipo,
        pais: 'GT',
        dominio: this.dominio(dto.dominio),
        nota: dto.nota ?? null,
      },
      select: CAMPOS,
    });
    await this.auditoria.registrar({
      actorId: actor.usuario.id,
      accion: 'FUENTE_REGISTRADA',
      recurso: 'fuente_consulta',
      recursoId: fuente.id,
      ip,
    });
    return fuente;
  }

  async actualizar(id: string, dto: ActualizarFuenteDto, actor: Actor, ip?: string) {
    if (
      dto.nombre === undefined &&
      dto.activa === undefined &&
      dto.dominio === undefined &&
      dto.nota === undefined
    ) {
      throw new UnprocessableEntityException({
        code: 'VALIDACION_FALLIDA',
        detail: 'Indica qué dato de la fuente quieres cambiar.',
      });
    }
    const existe = await this.prisma.fuenteConsulta.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existe) {
      throw new NotFoundException({
        code: 'FUENTE_NO_ENCONTRADA',
        detail: 'La fuente no existe.',
      });
    }
    const fuente = await this.prisma.fuenteConsulta.update({
      where: { id },
      data: {
        ...(dto.nombre !== undefined ? { nombre: dto.nombre } : {}),
        ...(dto.activa !== undefined ? { activa: dto.activa } : {}),
        ...(dto.dominio !== undefined ? { dominio: this.dominio(dto.dominio) } : {}),
        ...(dto.nota !== undefined ? { nota: dto.nota } : {}),
      },
      select: CAMPOS,
    });
    await this.auditoria.registrar({
      actorId: actor.usuario.id,
      accion: 'FUENTE_ACTUALIZADA',
      recurso: 'fuente_consulta',
      recursoId: id,
      ip,
      metadatos: { activa: fuente.activa },
    });
    return fuente;
  }

  private dominio(valor?: string) {
    if (!valor) return null;
    const limpio = valor.trim().toLowerCase().replace(/\.$/, '');
    if (!DOMINIO_GT.test(limpio)) {
      throw new UnprocessableEntityException({
        code: 'FUENTE_NO_GUATEMALTECA',
        detail: 'El dominio tiene que ser de Guatemala y terminar en .gt, sin dirección web completa.',
      });
    }
    return limpio;
  }
}
