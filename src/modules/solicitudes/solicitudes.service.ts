import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../../common/auth/auth-context.js';
import { assertResourceOwnership } from '../../common/auth/ownership.js';
import type { Prisma } from '../../infrastructure/database/generated/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type {
  ActualizarSolicitudDto,
  CambiarEstadoDto,
  CrearSolicitudDto,
  ListarSolicitudesDto,
  ProductoSolicitudDto,
} from './solicitudes.dto.js';

type Actor = AuthenticatedRequest['auth'];

const TRANSICIONES: Record<string, string[]> = {
  RECIBIDA: ['EN_REVISION', 'RECHAZADA'],
  EN_REVISION: ['EN_ANALISIS', 'RECHAZADA'],
  EN_ANALISIS: ['COMPLETADA', 'RECHAZADA'],
};

const DETALLE = {
  id: true,
  titulo: true,
  descripcion: true,
  institucionSolicitante: true,
  institucionSolicitanteId: true,
  modalidad: true,
  unidadEjecutora: true,
  fechaFormulario: true,
  enlaceNombre: true,
  enlaceCargo: true,
  autoridadNombre: true,
  autoridadCargo: true,
  estado: true,
  creadaPorId: true,
  enviadaEn: true,
  createdAt: true,
  updatedAt: true,
  productos: {
    orderBy: { numero: 'asc' },
    select: {
      id: true,
      numero: true,
      nombre: true,
      codigoSiges: true,
      especificacionesTecnicas: true,
      unidadMedida: true,
      cantidad: true,
    },
  },
} satisfies Prisma.SolicitudPrecioSelect;

@Injectable()
export class SolicitudesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async crear(dto: CrearSolicitudDto, actor: Actor, ip?: string) {
    const institucion = await this.institucionDelActor(actor);

    return this.prisma.$transaction(async (tx) => {
      const solicitud = await tx.solicitudPrecio.create({
        data: {
          titulo: dto.titulo,
          descripcion: dto.descripcion,
          institucionSolicitante: institucion.nombreOficial,
          institucionSolicitanteId: institucion.id,
          estado: 'BORRADOR',
          creadaPorId: actor.usuario.id,
          ...this.camposCabecera(dto),
          ...(dto.productos
            ? { productos: { create: this.productosNumerados(dto.productos) } }
            : {}),
        },
        select: DETALLE,
      });
      await this.auditoria.registrarEn(tx, {
        actorId: actor.usuario.id,
        accion: 'SOLICITUD_CREADA',
        recurso: 'solicitud_precio',
        recursoId: solicitud.id,
        ip,
      });
      return solicitud;
    });
  }

  async listar(filtros: ListarSolicitudesDto, actor: Actor) {
    const where: Prisma.SolicitudPrecioWhereInput = {
      ...(filtros.estado
        ? { estado: filtros.estado as Prisma.EnumEstadoSolicitudFilter['equals'] }
        : {}),
      ...this.alcanceLectura(actor),
    };
    const [total, solicitudes] = await Promise.all([
      this.prisma.solicitudPrecio.count({ where }),
      this.prisma.solicitudPrecio.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: filtros.limite ?? 25,
        skip: filtros.desplazamiento ?? 0,
        select: {
          id: true,
          titulo: true,
          modalidad: true,
          estado: true,
          institucionSolicitante: true,
          creadaPorId: true,
          enviadaEn: true,
          createdAt: true,
          _count: { select: { productos: true } },
        },
      }),
    ]);

    return { total, solicitudes };
  }

  async obtener(id: string, actor: Actor) {
    return this.cargarLegible(id, actor);
  }

  async actualizar(
    id: string,
    dto: ActualizarSolicitudDto,
    actor: Actor,
    ip?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const actual = await this.cargarLegible(id, actor, tx);
      this.exigirAutor(actual.creadaPorId, actor);
      this.exigirBorrador(actual.estado);

      if (dto.productos) {
        await tx.productoSolicitud.deleteMany({ where: { solicitudId: id } });
      }
      const actualizada = await tx.solicitudPrecio.update({
        where: { id },
        data: {
          ...(dto.titulo !== undefined ? { titulo: dto.titulo } : {}),
          ...(dto.descripcion !== undefined
            ? { descripcion: dto.descripcion }
            : {}),
          ...this.camposCabecera(dto),
          ...(dto.productos
            ? { productos: { create: this.productosNumerados(dto.productos) } }
            : {}),
        },
        select: DETALLE,
      });
      await this.auditoria.registrarEn(tx, {
        actorId: actor.usuario.id,
        accion: 'SOLICITUD_ACTUALIZADA',
        recurso: 'solicitud_precio',
        recursoId: id,
        ip,
      });
      return actualizada;
    });
  }

  async enviar(id: string, actor: Actor, ip?: string) {
    return this.prisma.$transaction(async (tx) => {
      const actual = await this.cargarLegible(id, actor, tx);
      this.exigirAutor(actual.creadaPorId, actor);
      this.exigirBorrador(actual.estado);

      const errores = this.validarEnvio(actual);
      if (errores.length > 0) {
        throw new UnprocessableEntityException({
          code: 'SOLICITUD_INCOMPLETA',
          detail: 'La solicitud no cumple los requisitos para enviarse.',
          errors: errores,
        });
      }

      // Condición de estado en el WHERE: dos envíos simultáneos no duplican la recepción.
      const enviada = await tx.solicitudPrecio.updateMany({
        where: { id, estado: 'BORRADOR' },
        data: { estado: 'RECIBIDA', enviadaEn: new Date() },
      });
      if (enviada.count !== 1) {
        throw new ConflictException({
          code: 'SOLICITUD_NO_EDITABLE',
          detail: 'La solicitud ya fue enviada.',
        });
      }
      await this.auditoria.registrarEn(tx, {
        actorId: actor.usuario.id,
        accion: 'SOLICITUD_ENVIADA',
        recurso: 'solicitud_precio',
        recursoId: id,
        ip,
      });
      return tx.solicitudPrecio.findUniqueOrThrow({
        where: { id },
        select: DETALLE,
      });
    });
  }

  async cambiarEstado(
    id: string,
    dto: CambiarEstadoDto,
    actor: Actor,
    ip?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const actual = await tx.solicitudPrecio.findUnique({
        where: { id },
        select: { estado: true },
      });
      if (!actual) {
        throw new NotFoundException(this.noEncontrada());
      }
      if (!TRANSICIONES[actual.estado]?.includes(dto.estado)) {
        throw new ConflictException({
          code: 'TRANSICION_NO_PERMITIDA',
          detail: `No se puede pasar de ${actual.estado} a ${dto.estado}.`,
        });
      }

      const cambio = await tx.solicitudPrecio.updateMany({
        where: { id, estado: actual.estado },
        data: { estado: dto.estado },
      });
      if (cambio.count !== 1) {
        throw new ConflictException({
          code: 'TRANSICION_NO_PERMITIDA',
          detail: 'El estado cambió mientras se procesaba la solicitud.',
        });
      }
      await this.auditoria.registrarEn(tx, {
        actorId: actor.usuario.id,
        accion: 'SOLICITUD_ESTADO_CAMBIADO',
        recurso: 'solicitud_precio',
        recursoId: id,
        ip,
        metadatos: {
          de: actual.estado,
          a: dto.estado,
          ...(dto.motivo ? { motivo: dto.motivo } : {}),
        },
      });
      return tx.solicitudPrecio.findUniqueOrThrow({
        where: { id },
        select: DETALLE,
      });
    });
  }

  // ---- helpers ----

  private esPersonalINE(actor: Actor) {
    return actor.usuario.roles.some(
      (rol) => rol === 'ADMIN' || rol === 'TRABAJADOR_INE',
    );
  }

  /** El personal del INE no ve borradores; el solicitante ve lo de su institución. */
  private alcanceLectura(actor: Actor): Prisma.SolicitudPrecioWhereInput {
    if (this.esPersonalINE(actor)) {
      return { estado: { not: 'BORRADOR' } };
    }
    return {
      OR: [
        { creadaPorId: actor.usuario.id },
        ...(actor.ownership.institucionId
          ? [
              {
                institucionSolicitanteId: actor.ownership.institucionId,
                estado: { not: 'BORRADOR' as const },
              },
            ]
          : []),
      ],
    };
  }

  private async cargarLegible(
    id: string,
    actor: Actor,
    cliente: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const solicitud = await cliente.solicitudPrecio.findFirst({
      where: { id, ...this.alcanceLectura(actor) },
      select: DETALLE,
    });
    // Misma respuesta para «no existe» y «no es tuya»: no se revela existencia.
    if (!solicitud) {
      throw new NotFoundException(this.noEncontrada());
    }
    return solicitud;
  }

  private exigirAutor(creadaPorId: string, actor: Actor) {
    assertResourceOwnership(actor.ownership, { usuarioId: creadaPorId }, 'usuario');
  }

  private exigirBorrador(estado: string) {
    if (estado !== 'BORRADOR') {
      throw new ConflictException({
        code: 'SOLICITUD_NO_EDITABLE',
        detail: 'Solo se puede modificar una solicitud en borrador.',
      });
    }
  }

  private noEncontrada() {
    return {
      code: 'SOLICITUD_NO_ENCONTRADA',
      detail: 'La solicitud no existe.',
    };
  }

  private async institucionDelActor(actor: Actor) {
    const institucionId = actor.ownership.institucionId;
    const institucion = institucionId
      ? await this.prisma.institucionSolicitante.findUnique({
          where: { id: institucionId },
          select: { id: true, nombreOficial: true },
        })
      : null;
    if (!institucion) {
      throw new UnprocessableEntityException({
        code: 'SIN_INSTITUCION',
        detail: 'Tu cuenta no tiene una institución asociada.',
      });
    }
    return institucion;
  }

  private camposCabecera(
    dto: Partial<
      Pick<
        CrearSolicitudDto,
        | 'modalidad'
        | 'unidadEjecutora'
        | 'fechaFormulario'
        | 'enlaceNombre'
        | 'enlaceCargo'
        | 'autoridadNombre'
        | 'autoridadCargo'
      >
    >,
  ) {
    return {
      ...(dto.modalidad !== undefined ? { modalidad: dto.modalidad } : {}),
      ...(dto.unidadEjecutora !== undefined
        ? { unidadEjecutora: dto.unidadEjecutora }
        : {}),
      ...(dto.fechaFormulario !== undefined
        ? { fechaFormulario: this.fecha(dto.fechaFormulario) }
        : {}),
      ...(dto.enlaceNombre !== undefined ? { enlaceNombre: dto.enlaceNombre } : {}),
      ...(dto.enlaceCargo !== undefined ? { enlaceCargo: dto.enlaceCargo } : {}),
      ...(dto.autoridadNombre !== undefined
        ? { autoridadNombre: dto.autoridadNombre }
        : {}),
      ...(dto.autoridadCargo !== undefined
        ? { autoridadCargo: dto.autoridadCargo }
        : {}),
    };
  }

  private fecha(valor: string) {
    const fecha = new Date(`${valor}T00:00:00.000Z`);
    if (Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== valor) {
      throw new UnprocessableEntityException({
        code: 'VALIDACION_FALLIDA',
        detail: 'Uno o más campos no cumplen el contrato.',
        errors: [{ field: 'fechaFormulario', message: 'La fecha no es válida' }],
      });
    }
    return fecha;
  }

  private productosNumerados(productos: ProductoSolicitudDto[]) {
    return productos.map((producto, indice) => ({
      numero: indice + 1,
      nombre: producto.nombre,
      codigoSiges: producto.codigoSiges ?? null,
      especificacionesTecnicas: producto.especificacionesTecnicas ?? null,
      unidadMedida: producto.unidadMedida ?? null,
      cantidad: producto.cantidad ?? null,
    }));
  }

  /** Requisitos del S.00 para enviar; un borrador puede estar incompleto. */
  private validarEnvio(solicitud: {
    modalidad: string | null;
    unidadEjecutora: string | null;
    fechaFormulario: Date | null;
    enlaceNombre: string | null;
    enlaceCargo: string | null;
    autoridadNombre: string | null;
    autoridadCargo: string | null;
    productos: Array<{
      numero: number;
      nombre: string;
      especificacionesTecnicas: string | null;
      unidadMedida: string | null;
      cantidad: { toString(): string } | null;
    }>;
  }) {
    const errores: Array<{ field: string; message: string }> = [];
    const requerido = (campo: string, valor: unknown) => {
      if (valor === null || valor === undefined || valor === '') {
        errores.push({ field: campo, message: 'Es obligatorio para enviar' });
      }
    };

    requerido('modalidad', solicitud.modalidad);
    requerido('unidadEjecutora', solicitud.unidadEjecutora);
    requerido('fechaFormulario', solicitud.fechaFormulario);
    requerido('enlaceNombre', solicitud.enlaceNombre);
    requerido('enlaceCargo', solicitud.enlaceCargo);
    requerido('autoridadNombre', solicitud.autoridadNombre);
    requerido('autoridadCargo', solicitud.autoridadCargo);

    if (solicitud.productos.length === 0) {
      errores.push({ field: 'productos', message: 'Agrega al menos un producto' });
    }
    for (const producto of solicitud.productos) {
      const campo = (nombre: string) => `productos[${producto.numero}].${nombre}`;
      requerido(campo('especificacionesTecnicas'), producto.especificacionesTecnicas);
      requerido(campo('unidadMedida'), producto.unidadMedida);
      if (producto.cantidad === null) {
        requerido(campo('cantidad'), null);
      } else if (Number(producto.cantidad.toString()) <= 0) {
        errores.push({
          field: campo('cantidad'),
          message: 'La cantidad debe ser mayor que cero',
        });
      }
    }

    return errores;
  }
}
