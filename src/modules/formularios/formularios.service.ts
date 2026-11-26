import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../../common/auth/auth-context.js';
import { assertResourceOwnership } from '../../common/auth/ownership.js';
import { esErrorUnico } from '../../common/security/tokens.js';
import type { Prisma } from '../../infrastructure/database/generated/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type {
  ActualizarProveedorPropuestoDto,
  ActualizarRequisitoDto,
  CambiarEstadoComisionDto,
  CrearCotizacionImportacionDto,
  CrearJustificacionDto,
  CrearProveedorPropuestoDto,
  CrearRequisitoDto,
  DecidirProveedorPropuestoDto,
  DecidirRequisitoDto,
  RepresentanteDto,
} from './formularios.dto.js';

type Actor = AuthenticatedRequest['auth'];
type Cliente = Prisma.TransactionClient;

const EDITABLES = new Set(['BORRADOR', 'PENDIENTE_SUBSANACION']);
const CERRADOS = new Set(['COMPLETADA', 'RECHAZADA', 'CANCELADA']);

const SELECCION_REQUISITO = {
  id: true,
  nombre: true,
  valor: true,
  unidad: true,
  modo: true,
  obligatorio: true,
  fuente: true,
  estado: true,
  aprobadoPorId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.RequisitoSolicitudSelect;

const SELECCION_PROPUESTO = {
  id: true,
  proveedorId: true,
  nombreRazonSocial: true,
  nit: true,
  direccion: true,
  telefono: true,
  estado: true,
  confirmadoPorId: true,
  confirmadoEn: true,
  createdAt: true,
  productos: { select: { productoSolicitudId: true } },
} satisfies Prisma.ProveedorSolicitudSelect;

const SELECCION_COTIZACION = {
  id: true,
  numero: true,
  numeroCotizacion: true,
  proveedorNombre: true,
  sitioWeb: true,
  correoProveedor: true,
  codigoPaisTelefono: true,
  telefonoProveedor: true,
  fechaConsulta: true,
  createdAt: true,
  productos: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      productoSolicitudId: true,
      especificacionesCotizacion: true,
      fabricante: true,
      paisOrigen: true,
      moneda: true,
      precioFobTotal: true,
      flete: true,
      seguro: true,
      otrosGastos: true,
    },
  },
} satisfies Prisma.CotizacionImportacionSelect;

const SELECCION_JUSTIFICACION = {
  id: true,
  tipo: true,
  motivo: true,
  autoridadNombre: true,
  autoridadCargo: true,
  productoSolicitudId: true,
  createdAt: true,
} satisfies Prisma.JustificacionSolicitudSelect;

@Injectable()
export class FormulariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  // ---------------------------------------------------------------- Requisitos

  async listarRequisitos(id: string, actor: Actor) {
    await this.solicitud(this.prisma, id, actor);
    const requisitos = await this.prisma.requisitoSolicitud.findMany({
      where: { solicitudId: id },
      orderBy: { createdAt: 'asc' },
      select: SELECCION_REQUISITO,
    });
    return { requisitos };
  }

  crearRequisito(id: string, dto: CrearRequisitoDto, actor: Actor, ip?: string) {
    return this.prisma.$transaction(async (tx) => {
      const solicitud = await this.solicitudParaEditar(tx, id, actor);
      const requisito = await tx.requisitoSolicitud.create({
        data: {
          solicitudId: solicitud.id,
          nombre: dto.nombre,
          valor: dto.valor,
          unidad: dto.unidad ?? null,
          modo: dto.modo ?? 'EXACTO',
          obligatorio: dto.obligatorio ?? true,
          fuente: 'MANUAL',
        },
        select: SELECCION_REQUISITO,
      });
      await this.auditar(tx, actor, 'REQUISITO_CREADO', 'requisito_solicitud', requisito.id, ip, {
        solicitudId: id,
      });
      return requisito;
    });
  }

  actualizarRequisito(
    id: string,
    requisitoId: string,
    dto: ActualizarRequisitoDto,
    actor: Actor,
    ip?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.solicitudParaEditar(tx, id, actor);
      await this.exigirRequisito(tx, id, requisitoId);
      const requisito = await tx.requisitoSolicitud.update({
        where: { id: requisitoId },
        data: {
          ...(dto.nombre !== undefined ? { nombre: dto.nombre } : {}),
          ...(dto.valor !== undefined ? { valor: dto.valor } : {}),
          ...(dto.unidad !== undefined ? { unidad: dto.unidad } : {}),
          ...(dto.modo !== undefined ? { modo: dto.modo } : {}),
          ...(dto.obligatorio !== undefined ? { obligatorio: dto.obligatorio } : {}),
          // Cambiar un requisito anula la decisión previa del INE.
          estado: 'PENDIENTE',
          aprobadoPorId: null,
        },
        select: SELECCION_REQUISITO,
      });
      await this.auditar(tx, actor, 'REQUISITO_ACTUALIZADO', 'requisito_solicitud', requisitoId, ip, {
        solicitudId: id,
      });
      return requisito;
    });
  }

  eliminarRequisito(id: string, requisitoId: string, actor: Actor, ip?: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.solicitudParaEditar(tx, id, actor);
      await this.exigirRequisito(tx, id, requisitoId);
      await tx.requisitoSolicitud.delete({ where: { id: requisitoId } });
      await this.auditar(tx, actor, 'REQUISITO_ELIMINADO', 'requisito_solicitud', requisitoId, ip, {
        solicitudId: id,
      });
    });
  }

  decidirRequisito(
    id: string,
    requisitoId: string,
    dto: DecidirRequisitoDto,
    actor: Actor,
    ip?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.solicitudParaDecidir(tx, id, actor);
      await this.exigirRequisito(tx, id, requisitoId);
      const requisito = await tx.requisitoSolicitud.update({
        where: { id: requisitoId },
        data: { estado: dto.estado, aprobadoPorId: actor.usuario.id },
        select: SELECCION_REQUISITO,
      });
      await this.auditar(tx, actor, `REQUISITO_${dto.estado}`, 'requisito_solicitud', requisitoId, ip, {
        solicitudId: id,
      });
      return requisito;
    });
  }

  // ------------------------------------------------- S.11 Proveedores propuestos

  async listarProveedoresPropuestos(id: string, actor: Actor) {
    await this.solicitud(this.prisma, id, actor);
    const filas = await this.prisma.proveedorSolicitud.findMany({
      where: { solicitudId: id },
      orderBy: { createdAt: 'asc' },
      select: SELECCION_PROPUESTO,
    });
    return { proveedores: filas.map((fila) => this.presentarPropuesto(fila)) };
  }

  crearProveedorPropuesto(
    id: string,
    dto: CrearProveedorPropuestoDto,
    actor: Actor,
    ip?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const solicitud = await this.solicitudParaEditar(tx, id, actor);
      const productoIds = await this.productosValidos(tx, solicitud.id, dto.productoIds);
      if (dto.proveedorId) {
        const existe = await tx.proveedor.count({ where: { id: dto.proveedorId } });
        if (existe < 1) {
          throw new UnprocessableEntityException({
            code: 'PROVEEDOR_NO_ENCONTRADO',
            detail: 'El proveedor indicado no existe.',
          });
        }
      }
      const creado = await tx.proveedorSolicitud.create({
        data: {
          solicitudId: solicitud.id,
          proveedorId: dto.proveedorId ?? null,
          nombreRazonSocial: dto.nombreRazonSocial,
          nit: dto.nit ?? null,
          direccion: dto.direccion ?? null,
          telefono: dto.telefono ?? null,
          productos: {
            create: productoIds.map((productoSolicitudId) => ({ productoSolicitudId })),
          },
        },
        select: SELECCION_PROPUESTO,
      });
      await this.auditar(tx, actor, 'PROVEEDOR_PROPUESTO_CREADO', 'proveedor_solicitud', creado.id, ip, {
        solicitudId: id,
      });
      return this.presentarPropuesto(creado);
    });
  }

  actualizarProveedorPropuesto(
    id: string,
    propuestoId: string,
    dto: ActualizarProveedorPropuestoDto,
    actor: Actor,
    ip?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const solicitud = await this.solicitudParaEditar(tx, id, actor);
      await this.exigirPropuesto(tx, id, propuestoId);
      const productoIds = dto.productoIds
        ? await this.productosValidos(tx, solicitud.id, dto.productoIds)
        : undefined;
      if (productoIds) {
        await tx.proveedorSolicitudProducto.deleteMany({
          where: { proveedorSolicitudId: propuestoId },
        });
        await tx.proveedorSolicitudProducto.createMany({
          data: productoIds.map((productoSolicitudId) => ({
            proveedorSolicitudId: propuestoId,
            productoSolicitudId,
          })),
        });
      }
      const actualizado = await tx.proveedorSolicitud.update({
        where: { id: propuestoId },
        data: {
          ...(dto.nombreRazonSocial !== undefined
            ? { nombreRazonSocial: dto.nombreRazonSocial }
            : {}),
          ...(dto.nit !== undefined ? { nit: dto.nit } : {}),
          ...(dto.direccion !== undefined ? { direccion: dto.direccion } : {}),
          ...(dto.telefono !== undefined ? { telefono: dto.telefono } : {}),
          // Cualquier cambio vuelve la empresa a revisión del INE.
          estado: 'PENDIENTE',
          confirmadoPorId: null,
          confirmadoEn: null,
        },
        select: SELECCION_PROPUESTO,
      });
      await this.auditar(tx, actor, 'PROVEEDOR_PROPUESTO_ACTUALIZADO', 'proveedor_solicitud', propuestoId, ip, {
        solicitudId: id,
      });
      return this.presentarPropuesto(actualizado);
    });
  }

  eliminarProveedorPropuesto(id: string, propuestoId: string, actor: Actor, ip?: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.solicitudParaEditar(tx, id, actor);
      await this.exigirPropuesto(tx, id, propuestoId);
      await tx.proveedorSolicitud.delete({ where: { id: propuestoId } });
      await this.auditar(tx, actor, 'PROVEEDOR_PROPUESTO_ELIMINADO', 'proveedor_solicitud', propuestoId, ip, {
        solicitudId: id,
      });
    });
  }

  decidirProveedorPropuesto(
    id: string,
    propuestoId: string,
    dto: DecidirProveedorPropuestoDto,
    actor: Actor,
    ip?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.solicitudParaDecidir(tx, id, actor);
      await this.exigirPropuesto(tx, id, propuestoId);
      const actualizado = await tx.proveedorSolicitud.update({
        where: { id: propuestoId },
        data: {
          estado: dto.estado,
          confirmadoPorId: actor.usuario.id,
          confirmadoEn: new Date(),
        },
        select: SELECCION_PROPUESTO,
      });
      await this.auditar(tx, actor, `PROVEEDOR_PROPUESTO_${dto.estado}`, 'proveedor_solicitud', propuestoId, ip, {
        solicitudId: id,
      });
      return this.presentarPropuesto(actualizado);
    });
  }

  // -------------------------------------------- S.21 / S.22 Importaciones

  async obtenerImportacion(id: string, actor: Actor) {
    const solicitud = await this.solicitud(this.prisma, id, actor);
    this.exigirImportada(solicitud.modalidad);
    return this.armarImportacion(this.prisma, id);
  }

  guardarRepresentante(
    id: string,
    tipo: 'TITULAR' | 'SUPLENTE',
    dto: RepresentanteDto,
    actor: Actor,
    ip?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const solicitud = await this.solicitudParaEditar(tx, id, actor);
      this.exigirImportada(solicitud.modalidad);
      const comision = await this.comision(tx, id);
      await tx.representanteSolicitante.upsert({
        where: { comisionId_tipo: { comisionId: comision.id, tipo } },
        create: { comisionId: comision.id, tipo, ...dto },
        update: { ...dto },
      });
      await this.auditar(tx, actor, 'REPRESENTANTE_GUARDADO', 'comision_importacion', comision.id, ip, {
        solicitudId: id,
        tipo,
      });
      return this.armarImportacion(tx, id);
    });
  }

  cambiarEstadoComision(
    id: string,
    dto: CambiarEstadoComisionDto,
    actor: Actor,
    ip?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const solicitud = await this.solicitudParaDecidir(tx, id, actor);
      this.exigirImportada(solicitud.modalidad);
      const comision = await this.comision(tx, id);
      await tx.comisionImportacion.update({
        where: { id: comision.id },
        data: {
          estado: dto.estado,
          ...(dto.estado === 'CONFORMADA' && !comision.formadaEn
            ? { formadaEn: new Date() }
            : {}),
        },
      });
      await this.auditar(tx, actor, 'COMISION_ESTADO_CAMBIADO', 'comision_importacion', comision.id, ip, {
        solicitudId: id,
        estado: dto.estado,
      });
      return this.armarImportacion(tx, id);
    });
  }

  crearCotizacion(
    id: string,
    dto: CrearCotizacionImportacionDto,
    actor: Actor,
    ip?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const solicitud = await this.solicitudParaEditar(tx, id, actor);
      this.exigirImportada(solicitud.modalidad);
      if (dto.productos.length === 0) {
        throw new UnprocessableEntityException({
          code: 'VALIDACION_FALLIDA',
          detail: 'La cotización debe incluir al menos un producto.',
          errors: [{ field: 'productos', message: 'Agrega al menos un producto' }],
        });
      }
      const repetidos = new Set(dto.productos.map((p) => p.productoSolicitudId));
      if (repetidos.size !== dto.productos.length) {
        throw new UnprocessableEntityException({
          code: 'VALIDACION_FALLIDA',
          detail: 'Una cotización no repite el mismo producto.',
          errors: [{ field: 'productos', message: 'Cada producto va una sola vez' }],
        });
      }
      await this.productosValidos(
        tx,
        solicitud.id,
        dto.productos.map((p) => p.productoSolicitudId),
      );
      dto.productos.forEach((producto, indice) => {
        if (Number(producto.precioFobTotal) <= 0) {
          throw new UnprocessableEntityException({
            code: 'VALIDACION_FALLIDA',
            detail: 'El precio FOB debe ser mayor que cero.',
            errors: [
              {
                field: `productos[${indice}].precioFobTotal`,
                message: 'Debe ser mayor que cero',
              },
            ],
          });
        }
      });

      const comision = await this.comision(tx, id);
      const ultimo = await tx.cotizacionImportacion.aggregate({
        where: { comisionId: comision.id },
        _max: { numero: true },
      });
      let creada: { id: string };
      try {
        creada = await tx.cotizacionImportacion.create({
          data: {
            comisionId: comision.id,
            numero: (ultimo._max.numero ?? 0) + 1,
            numeroCotizacion: dto.numeroCotizacion ?? null,
            proveedorNombre: dto.proveedorNombre,
            sitioWeb: dto.sitioWeb ?? null,
            correoProveedor: dto.correoProveedor ?? null,
            codigoPaisTelefono: dto.codigoPaisTelefono ?? null,
            telefonoProveedor: dto.telefonoProveedor ?? null,
            fechaConsulta: dto.fechaConsulta ? new Date(`${dto.fechaConsulta}T00:00:00.000Z`) : null,
            productos: {
              create: dto.productos.map((p) => ({
                productoSolicitudId: p.productoSolicitudId,
                especificacionesCotizacion: p.especificacionesCotizacion ?? null,
                fabricante: p.fabricante ?? null,
                paisOrigen: p.paisOrigen ?? null,
                moneda: p.moneda,
                precioFobTotal: p.precioFobTotal,
                flete: p.flete ?? null,
                seguro: p.seguro ?? null,
                otrosGastos: p.otrosGastos ?? null,
              })),
            },
          },
          select: { id: true },
        });
      } catch (error) {
        // Dos altas simultáneas toman el mismo número: se pide reintentar.
        if (esErrorUnico(error)) {
          throw new ConflictException({
            code: 'COTIZACION_CONCURRENTE',
            detail: 'Otra cotización se registró al mismo tiempo; intenta de nuevo.',
          });
        }
        throw error;
      }
      await this.auditar(tx, actor, 'COTIZACION_IMPORTACION_CREADA', 'cotizacion_importacion', creada.id, ip, {
        solicitudId: id,
      });
      return this.armarImportacion(tx, id);
    });
  }

  eliminarCotizacion(id: string, cotizacionId: string, actor: Actor, ip?: string) {
    return this.prisma.$transaction(async (tx) => {
      const solicitud = await this.solicitudParaEditar(tx, id, actor);
      this.exigirImportada(solicitud.modalidad);
      const cotizacion = await tx.cotizacionImportacion.findFirst({
        where: { id: cotizacionId, comision: { solicitudId: id } },
        select: { id: true },
      });
      if (!cotizacion) {
        throw new NotFoundException({
          code: 'COTIZACION_NO_ENCONTRADA',
          detail: 'La cotización no existe en esta solicitud.',
        });
      }
      await tx.cotizacionImportacion.delete({ where: { id: cotizacionId } });
      await this.auditar(tx, actor, 'COTIZACION_IMPORTACION_ELIMINADA', 'cotizacion_importacion', cotizacionId, ip, {
        solicitudId: id,
      });
      return this.armarImportacion(tx, id);
    });
  }

  // ----------------------------------------------------------- Justificaciones

  async listarJustificaciones(id: string, actor: Actor) {
    await this.solicitud(this.prisma, id, actor);
    const justificaciones = await this.prisma.justificacionSolicitud.findMany({
      where: { solicitudId: id },
      orderBy: { createdAt: 'asc' },
      select: SELECCION_JUSTIFICACION,
    });
    return { justificaciones };
  }

  crearJustificacion(id: string, dto: CrearJustificacionDto, actor: Actor, ip?: string) {
    return this.prisma.$transaction(async (tx) => {
      const solicitud = await this.solicitudParaEditar(tx, id, actor);
      if (dto.productoSolicitudId) {
        await this.productosValidos(tx, solicitud.id, [dto.productoSolicitudId]);
      }
      const creada = await tx.justificacionSolicitud.create({
        data: {
          solicitudId: solicitud.id,
          productoSolicitudId: dto.productoSolicitudId ?? null,
          tipo: dto.tipo,
          motivo: dto.motivo,
          autoridadNombre: dto.autoridadNombre,
          autoridadCargo: dto.autoridadCargo,
          creadaPorId: actor.usuario.id,
        },
        select: SELECCION_JUSTIFICACION,
      });
      await this.auditar(tx, actor, 'JUSTIFICACION_CREADA', 'justificacion_solicitud', creada.id, ip, {
        solicitudId: id,
        tipo: dto.tipo,
      });
      return creada;
    });
  }

  eliminarJustificacion(id: string, justificacionId: string, actor: Actor, ip?: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.solicitudParaEditar(tx, id, actor);
      const existe = await tx.justificacionSolicitud.count({
        where: { id: justificacionId, solicitudId: id },
      });
      if (existe < 1) {
        throw new NotFoundException({
          code: 'JUSTIFICACION_NO_ENCONTRADA',
          detail: 'La justificación no existe en esta solicitud.',
        });
      }
      await tx.justificacionSolicitud.delete({ where: { id: justificacionId } });
      await this.auditar(tx, actor, 'JUSTIFICACION_ELIMINADA', 'justificacion_solicitud', justificacionId, ip, {
        solicitudId: id,
      });
    });
  }

  // ------------------------------------------------------------------ helpers

  private esPersonal(actor: Actor) {
    return actor.usuario.roles.some(
      (rol) => rol === 'ADMIN' || rol === 'JEFE' || rol === 'TRABAJADOR_INE',
    );
  }

  /** El personal no ve borradores; la entidad ve lo propio y lo de su institución. Misma respuesta si no existe o no es suyo. */
  private async solicitud(cliente: Cliente | PrismaService, id: string, actor: Actor) {
    const institucionId = actor.ownership.institucionId;
    const where: Prisma.SolicitudPrecioWhereInput = this.esPersonal(actor)
      ? { id, estado: { not: 'BORRADOR' } }
      : {
          id,
          OR: [
            { creadaPorId: actor.usuario.id },
            ...(institucionId
              ? [{ institucionSolicitanteId: institucionId, estado: { not: 'BORRADOR' as const } }]
              : []),
          ],
        };
    const solicitud = await cliente.solicitudPrecio.findFirst({
      where,
      select: { id: true, estado: true, modalidad: true, creadaPorId: true },
    });
    if (!solicitud) {
      throw new NotFoundException({
        code: 'SOLICITUD_NO_ENCONTRADA',
        detail: 'La solicitud no existe.',
      });
    }
    return solicitud;
  }

  /** Solo la persona autora modifica el formulario, y solo mientras es borrador o está devuelto. */
  private async solicitudParaEditar(tx: Cliente, id: string, actor: Actor) {
    const solicitud = await this.solicitud(tx, id, actor);
    assertResourceOwnership(actor.ownership, { usuarioId: solicitud.creadaPorId }, 'usuario');
    // Candado de fila: no se edita mientras otra transacción envía la solicitud.
    await tx.$queryRaw`SELECT id FROM solicitudes_precio WHERE id = ${id}::uuid FOR UPDATE`;
    const vigente = await tx.solicitudPrecio.findUniqueOrThrow({
      where: { id },
      select: { id: true, estado: true, modalidad: true, creadaPorId: true },
    });
    if (!EDITABLES.has(vigente.estado)) {
      throw new ConflictException({
        code: 'SOLICITUD_NO_EDITABLE',
        detail: 'Solo se puede modificar un borrador o un expediente devuelto para subsanación.',
      });
    }
    return vigente;
  }

  /** Las decisiones sobre el formulario son del personal del INE, con la solicitud ya recibida y abierta. */
  private async solicitudParaDecidir(tx: Cliente, id: string, actor: Actor) {
    if (!this.esPersonal(actor)) {
      throw new ForbiddenException({
        code: 'ROL_NO_PERMITIDO',
        detail: 'Esta acción es del personal del INE.',
      });
    }
    const solicitud = await this.solicitud(tx, id, actor);
    if (CERRADOS.has(solicitud.estado)) {
      throw new ConflictException({
        code: 'SOLICITUD_CERRADA',
        detail: 'La solicitud ya está cerrada.',
      });
    }
    return solicitud;
  }

  private exigirImportada(modalidad: string | null) {
    if (modalidad !== 'BIENES_SUMINISTROS_IMPORTADOS') {
      throw new ConflictException({
        code: 'MODALIDAD_NO_APLICA',
        detail: 'Este apartado es solo de Bienes y Suministros Importados.',
      });
    }
  }

  private async exigirRequisito(tx: Cliente, id: string, requisitoId: string) {
    const existe = await tx.requisitoSolicitud.count({
      where: { id: requisitoId, solicitudId: id },
    });
    if (existe < 1) {
      throw new NotFoundException({
        code: 'REQUISITO_NO_ENCONTRADO',
        detail: 'El requisito no existe en esta solicitud.',
      });
    }
  }

  private async exigirPropuesto(tx: Cliente, id: string, propuestoId: string) {
    const existe = await tx.proveedorSolicitud.count({
      where: { id: propuestoId, solicitudId: id },
    });
    if (existe < 1) {
      throw new NotFoundException({
        code: 'PROVEEDOR_PROPUESTO_NO_ENCONTRADO',
        detail: 'La empresa propuesta no existe en esta solicitud.',
      });
    }
  }

  /** Cada producto indicado debe pertenecer a la solicitud; sin repetidos. */
  private async productosValidos(tx: Cliente, solicitudId: string, ids: string[]) {
    const unicos = [...new Set(ids)];
    const encontrados = await tx.productoSolicitud.count({
      where: { solicitudId, id: { in: unicos } },
    });
    if (encontrados !== unicos.length) {
      throw new UnprocessableEntityException({
        code: 'PRODUCTO_NO_PERTENECE',
        detail: 'Algún producto no pertenece a esta solicitud.',
        errors: [{ field: 'productoIds', message: 'Usa solo productos de la solicitud' }],
      });
    }
    return unicos;
  }

  private async comision(tx: Cliente, solicitudId: string) {
    return tx.comisionImportacion.upsert({
      where: { solicitudId },
      create: { solicitudId },
      update: {},
    });
  }

  private async armarImportacion(cliente: Cliente | PrismaService, solicitudId: string) {
    const comision = await cliente.comisionImportacion.findUnique({
      where: { solicitudId },
      select: {
        id: true,
        estado: true,
        formadaEn: true,
        representantes: {
          orderBy: { tipo: 'asc' },
          select: {
            tipo: true,
            nombre: true,
            correo: true,
            telefono: true,
            direccionNotificaciones: true,
          },
        },
        cotizaciones: {
          orderBy: { numero: 'asc' },
          select: SELECCION_COTIZACION,
        },
      },
    });
    const justificaciones = await cliente.justificacionSolicitud.findMany({
      where: { solicitudId },
      orderBy: { createdAt: 'asc' },
      select: SELECCION_JUSTIFICACION,
    });
    return {
      comision: comision
        ? {
            id: comision.id,
            estado: comision.estado,
            formadaEn: comision.formadaEn,
            representantes: comision.representantes,
          }
        : null,
      cotizaciones: (comision?.cotizaciones ?? []).map((cotizacion) => ({
        ...cotizacion,
        fechaConsulta: cotizacion.fechaConsulta
          ? cotizacion.fechaConsulta.toISOString().slice(0, 10)
          : null,
        productos: cotizacion.productos.map((producto) => ({
          ...producto,
          precioFobTotal: producto.precioFobTotal.toString(),
          flete: producto.flete?.toString() ?? null,
          seguro: producto.seguro?.toString() ?? null,
          otrosGastos: producto.otrosGastos?.toString() ?? null,
        })),
      })),
      justificaciones,
    };
  }

  private presentarPropuesto(fila: {
    id: string;
    proveedorId: string | null;
    nombreRazonSocial: string;
    nit: string | null;
    direccion: string | null;
    telefono: string | null;
    estado: string;
    confirmadoPorId: string | null;
    confirmadoEn: Date | null;
    createdAt: Date;
    productos: Array<{ productoSolicitudId: string }>;
  }) {
    const { productos, ...resto } = fila;
    return { ...resto, productoIds: productos.map((p) => p.productoSolicitudId) };
  }

  private auditar(
    tx: Cliente,
    actor: Actor,
    accion: string,
    recurso: string,
    recursoId: string,
    ip: string | undefined,
    metadatos: Prisma.InputJsonValue,
  ) {
    return this.auditoria.registrarEn(tx, {
      actorId: actor.usuario.id,
      accion,
      recurso,
      recursoId,
      ip,
      metadatos,
    });
  }
}
