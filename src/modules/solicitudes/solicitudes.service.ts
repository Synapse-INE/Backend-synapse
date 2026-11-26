import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedRequest } from '../../common/auth/auth-context.js';
import { assertResourceOwnership } from '../../common/auth/ownership.js';
import { Prisma } from '../../infrastructure/database/generated/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { MailService } from '../../infrastructure/mail/mail.service.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { NotificacionesService } from '../notificaciones/notificaciones.service.js';
import { validarFormulariosParaEnvio } from '../formularios/formularios-envio.js';
import { filtroPersonalAsignable } from '../personal-ine/personal-asignable.js';
import { medirAtencion, type AtencionExpediente } from './atencion.js';
import { borradorInforme } from './borrador-informe.js';
import { correoExpedienteCompletado, correoInformeEmitido } from './correo-informe.js';
import { crearPdfInforme } from './informe-pdf.js';
import { AdjuntosService } from './adjuntos.service.js';
import { medirExpediente } from './estadisticas-precios.js';
import type {
  ActualizarSolicitudDto,
  AsignarSolicitudDto,
  CambiarEstadoDto,
  CrearComentarioDto,
  CorregirConsultaDto,
  CrearConsultaDto,
  CrearInformeDto,
  CrearSolicitudDto,
  ListarSolicitudesDto,
  MarcarAtipicoDto,
  ProductoSolicitudDto,
  RegistrarEntregaDto,
  RegistrarValidacionDto,
} from './solicitudes.dto.js';

type Actor = AuthenticatedRequest['auth'];

const TRANSICIONES: Record<string, string[]> = {
  RECIBIDA: ['EN_REVISION', 'RECHAZADA'],
  EN_REVISION: ['EN_INVESTIGACION', 'RECHAZADA'],
  EN_INVESTIGACION: ['EN_ANALISIS', 'RECHAZADA'],
  EN_ANALISIS: ['EN_INFORME', 'RECHAZADA'],
  EN_INFORME: ['EN_ENTREGA', 'RECHAZADA'],
  EN_ENTREGA: ['COMPLETADA', 'RECHAZADA'],
};

const PUEDE_DEVOLVER = new Set(['EN_REVISION', 'EN_INVESTIGACION', 'EN_ANALISIS']);
const EDITABLES = new Set(['BORRADOR', 'PENDIENTE_SUBSANACION']);
const CERRADOS = new Set(['COMPLETADA', 'RECHAZADA', 'CANCELADA']);
const PAUSABLES = new Set([
  'RECIBIDA',
  'EN_REVISION',
  'EN_INVESTIGACION',
  'EN_ANALISIS',
  'EN_INFORME',
  'EN_ENTREGA',
]);
const CANCELABLES = new Set([
  'RECIBIDA',
  'EN_REVISION',
  'PENDIENTE_SUBSANACION',
  'EN_INVESTIGACION',
  'EN_ANALISIS',
  'EN_INFORME',
  'EN_ESPERA',
]);

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
  codigo: true,
  creadaPorId: true,
  asignadaAId: true,
  estadoAlPausar: true,
  asignadaA: { select: { id: true, nombre: true } },
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

const CONSULTA = {
  id: true,
  fechaConsulta: true,
  nota: true,
  evidencia: true,
  createdAt: true,
  fuente: { select: { id: true, nombre: true, tipo: true, dominio: true } },
  registradaPor: { select: { id: true, nombre: true } },
  precios: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true,
      precio: true,
      moneda: true,
      unidadMedida: true,
      esAtipico: true,
      observacion: true,
      productoSolicitudId: true,
      referenciaIneId: true,
    },
  },
} satisfies Prisma.ConsultaMercadoSelect;

const VALIDACION = {
  id: true,
  productoSolicitudId: true,
  precioAdoptado: true,
  moneda: true,
  unidadMedida: true,
  criterio: true,
  notaAtipicos: true,
  confirmada: true,
  confirmadaEn: true,
  confirmadaPor: { select: { id: true, nombre: true } },
} satisfies Prisma.ValidacionAnalisisSelect;

const INFORME = {
  id: true,
  tipo: true,
  version: true,
  destinatario: true,
  resumen: true,
  estadisticas: true,
  estado: true,
  emitidoEn: true,
  createdAt: true,
  elaboradoPor: { select: { id: true, nombre: true } },
} satisfies Prisma.InformeSolicitudSelect;

const ENTREGA = {
  id: true,
  medio: true,
  destinatario: true,
  fechaEntrega: true,
  constancia: true,
  informeId: true,
  createdAt: true,
  registradaPor: { select: { id: true, nombre: true } },
} satisfies Prisma.EntregaSolicitudSelect;

const ETAPAS_BOLETA = ['EN_INVESTIGACION', 'EN_ANALISIS'];

@Injectable()
export class SolicitudesService {
  private readonly logger = new Logger(SolicitudesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    private readonly notificaciones: NotificacionesService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly adjuntos: AdjuntosService,
  ) {}

  async crear(dto: CrearSolicitudDto, actor: Actor, ip?: string) {
    const institucion = await this.institucionDelActor(actor);

    const resultado = await this.prisma.$transaction(async (tx) => {
      const codigo = await this.siguienteCodigo(tx);
      const solicitud = await tx.solicitudPrecio.create({
        data: {
          codigo,
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
        select: this.detallePara(actor),
      });
      await this.historial(tx, {
        solicitudId: solicitud.id,
        actorId: actor.usuario.id,
        accion: 'Solicitud creada',
        estadoNuevo: 'BORRADOR',
        detalle: codigo,
      });
      await this.auditoria.registrarEn(tx, {
        actorId: actor.usuario.id,
        accion: 'SOLICITUD_CREADA',
        recurso: 'solicitud_precio',
        recursoId: solicitud.id,
        ip,
      });
      return this.presentar(solicitud, actor);
    });
    return resultado;
  }

  async listar(filtros: ListarSolicitudesDto, actor: Actor) {
    const where: Prisma.SolicitudPrecioWhereInput = {
      ...(filtros.estado
        ? { estado: filtros.estado as Prisma.EnumEstadoSolicitudFilter['equals'] }
        : {}),
      ...(filtros.asignadasAMi && this.esPersonalINE(actor)
        ? { asignadaAId: actor.usuario.id }
        : {}),
      ...this.alcanceLectura(actor),
    };
    const [total, solicitudes] = await Promise.all([
      this.prisma.solicitudPrecio.count({ where }),
      this.prisma.solicitudPrecio.findMany({
        where,
        orderBy: this.esPersonalINE(actor)
          ? [{ enviadaEn: 'asc' }, { createdAt: 'asc' }]
          : { createdAt: 'desc' },
        take: filtros.limite ?? 25,
        skip: filtros.desplazamiento ?? 0,
        select: {
          id: true,
          codigo: true,
          titulo: true,
          modalidad: true,
          estado: true,
          asignadaAId: true,
          asignadaA: { select: { id: true, nombre: true } },
          institucionSolicitante: true,
          creadaPorId: true,
          enviadaEn: true,
          createdAt: true,
          updatedAt: true,
          historial: {
            orderBy: { createdAt: 'asc' },
            select: { estadoNuevo: true, createdAt: true },
          },
          _count: { select: { productos: true } },
          colaboradores: { select: { usuarioId: true } },
        },
      }),
    ]);

    return {
      total,
      solicitudes: solicitudes.map(({ historial, ...solicitud }) => ({
        ...solicitud,
        atencion: medirAtencion({ ...solicitud, historial }),
      })),
    };
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
      this.exigirEditable(actual.estado);

      if (dto.productos) {
        const cotizaciones = await tx.cotizacionProducto.count({
          where: { productoSolicitud: { solicitudId: id } },
        });
        if (cotizaciones > 0) {
          throw new ConflictException({
            code: 'PRODUCTOS_CON_COTIZACIONES',
            detail:
              'No se reemplaza la lista de productos cuando ya hay cotizaciones de importación. Elimínalas primero.',
          });
        }
        const [boletas, validaciones] = await Promise.all([
          tx.precioConsultado.count({
            where: { productoSolicitud: { solicitudId: id } },
          }),
          tx.validacionAnalisis.count({ where: { solicitudId: id } }),
        ]);
        if (boletas > 0 || validaciones > 0) {
          throw new ConflictException({
            code: 'PRODUCTOS_CON_INVESTIGACION',
            detail:
              'No se reemplaza la lista de productos cuando ya hay boletas o validaciones. La investigación se conserva.',
          });
        }
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
        select: this.detallePara(actor),
      });
      await this.historial(tx, {
        solicitudId: id,
        actorId: actor.usuario.id,
        accion: 'Solicitud actualizada',
        estadoNuevo: actual.estado,
      });
      await this.auditoria.registrarEn(tx, {
        actorId: actor.usuario.id,
        accion: 'SOLICITUD_ACTUALIZADA',
        recurso: 'solicitud_precio',
        recursoId: id,
        ip,
      });
      return this.presentar(actualizada, actor);
    });
  }

  async enviar(id: string, actor: Actor, ip?: string) {
    return this.prisma.$transaction(async (tx) => {
      const actual = await this.cargarLegible(id, actor, tx);
      this.exigirAutor(actual.creadaPorId, actor);
      this.exigirEstado(
        actual.estado,
        'BORRADOR',
        'SOLICITUD_NO_EDITABLE',
        'Solo se puede enviar un borrador.',
      );

      const errores = [
        ...this.validarEnvio(actual),
        ...(await validarFormulariosParaEnvio(tx, id, actual.modalidad)),
      ];
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
      await this.historial(tx, {
        solicitudId: id,
        actorId: actor.usuario.id,
        accion: 'Solicitud enviada',
        estadoAnterior: 'BORRADOR',
        estadoNuevo: 'RECIBIDA',
      });
      await this.auditoria.registrarEn(tx, {
        actorId: actor.usuario.id,
        accion: 'SOLICITUD_ENVIADA',
        recurso: 'solicitud_precio',
        recursoId: id,
        ip,
      });
      await this.notificaciones.avisarJefesNuevaRecepcion(tx, {
        solicitudId: id,
        actorId: actor.usuario.id,
        codigo: actual.codigo ?? id,
        tituloExpediente: actual.titulo,
      });
      await this.notificaciones.avisarProveedoresActualizarPrecios(tx, {
        solicitudId: id,
        codigo: actual.codigo ?? id,
        tituloExpediente: actual.titulo,
        nombresProducto: (actual.productos ?? []).map((producto) => producto.nombre).filter(Boolean),
      });
      return this.presentar(
        await tx.solicitudPrecio.findUniqueOrThrow({
          where: { id },
          select: this.detallePara(actor),
        }),
        actor,
      );
    });
  }

  async cambiarEstado(
    id: string,
    dto: CambiarEstadoDto,
    actor: Actor,
    ip?: string,
  ) {
    const resultado = await this.prisma.$transaction(async (tx) => {
      const actual = await tx.solicitudPrecio.findUnique({
        where: { id },
        select: { id: true, estado: true, codigo: true, creadaPorId: true, asignadaAId: true },
      });
      if (!actual) {
        throw new NotFoundException(this.noEncontrada());
      }
      await this.exigirEncargado(tx, actual, actor);
      if (!TRANSICIONES[actual.estado]?.includes(dto.estado)) {
        throw new ConflictException({
          code: 'TRANSICION_NO_PERMITIDA',
          detail: `No se puede pasar de ${actual.estado} a ${dto.estado}.`,
        });
      }
      await this.exigirListoPara(tx, id, dto.estado);

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
      await this.historial(tx, {
        solicitudId: id,
        actorId: actor.usuario.id,
        accion: 'Estado actualizado',
        estadoAnterior: actual.estado,
        estadoNuevo: dto.estado,
        detalle: dto.motivo ?? null,
      });
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
      await this.avisar(
        tx,
        actual,
        actor,
        'Estado del expediente',
        `${actual.codigo} pasó de ${actual.estado} a ${dto.estado}.`,
      );
      const solicitud = this.presentar(
        await tx.solicitudPrecio.findUniqueOrThrow({
          where: { id },
          select: this.detallePara(actor),
        }),
        actor,
      );
      return {
        solicitud,
        completada: dto.estado === 'COMPLETADA'
          ? { creadaPorId: actual.creadaPorId, codigo: actual.codigo }
          : null,
      };
    });
    if (resultado.completada) await this.enviarExpedienteCompletado(resultado.completada);
    return resultado.solicitud;
  }

  async asignar(id: string, dto: AsignarSolicitudDto, actor: Actor, ip?: string) {
    this.exigirJefe(actor);
    return this.prisma.$transaction(async (tx) => {
      const actual = await this.cargarLegible(id, actor, tx);
      if (CERRADOS.has(actual.estado)) {
        throw new ConflictException({
          code: 'SOLICITUD_CERRADA',
          detail: 'Un expediente cerrado no se reasigna.',
        });
      }
      const persona = await tx.usuario.findFirst({
        where: { id: dto.usuarioId, ...filtroPersonalAsignable },
        select: { id: true, nombre: true },
      });
      if (!persona) {
        throw new UnprocessableEntityException({
          code: 'PERSONA_NO_ASIGNABLE',
          detail: 'La persona elegida tiene que ser un trabajador o jefe activo del INE.',
        });
      }
      await tx.solicitudPrecio.update({
        where: { id },
        data: { asignadaAId: persona.id },
      });
      await this.historial(tx, {
        solicitudId: id,
        actorId: actor.usuario.id,
        accion: 'Responsable asignado',
        estadoNuevo: actual.estado,
        detalle: persona.nombre,
      });
      await this.auditoria.registrarEn(tx, {
        actorId: actor.usuario.id,
        accion: 'SOLICITUD_ASIGNADA',
        recurso: 'solicitud_precio',
        recursoId: id,
        ip,
        metadatos: { asignadaAId: persona.id },
      });
      await this.notificaciones.avisarAsignacion(tx, {
        solicitudId: id,
        actorId: actor.usuario.id,
        asignadoId: persona.id,
        codigo: actual.codigo,
        tituloExpediente: actual.titulo,
      });
      await this.avisar(
        tx,
        { ...actual, asignadaAId: persona.id },
        actor,
        'Expediente asignado',
        `${actual.codigo} quedó a cargo de ${persona.nombre}.`,
        true,
        { incluirResponsable: false },
      );
      return this.presentar(
        await tx.solicitudPrecio.findUniqueOrThrow({
          where: { id },
          select: this.detallePara(actor),
        }),
        actor,
      );
    });
  }

  async comentar(id: string, dto: CrearComentarioDto, actor: Actor, ip?: string) {
    const interno = Boolean(dto.esInterno);
    const devolver = Boolean(dto.devolver);
    if (!this.esPersonalINE(actor) && (interno || devolver)) {
      throw new ForbiddenException({
        code: 'COMENTARIO_NO_PERMITIDO',
        detail: 'Solo el personal del INE escribe notas internas o devuelve el expediente.',
      });
    }
    if (devolver && interno) {
      throw new UnprocessableEntityException({
        code: 'DEVOLUCION_DEBE_SER_VISIBLE',
        detail: 'La observación que devuelve el expediente tiene que verla la entidad.',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const actual = await this.cargarLegible(id, actor, tx);
      if (CERRADOS.has(actual.estado)) {
        throw new ConflictException({
          code: 'SOLICITUD_CERRADA',
          detail: 'Un expediente cerrado no recibe comentarios.',
        });
      }
      if (devolver) {
        await this.exigirEncargado(tx, actual, actor);
        if (!PUEDE_DEVOLVER.has(actual.estado)) {
          throw new ConflictException({
            code: 'TRANSICION_NO_PERMITIDA',
            detail: 'Solo se devuelve un expediente que está en revisión, investigación o análisis.',
          });
        }
      }

      await tx.solicitudComentario.create({
        data: {
          solicitudId: id,
          autorId: actor.usuario.id,
          contenido: dto.contenido,
          esInterno: interno,
        },
      });

      if (devolver) {
        const cambio = await tx.solicitudPrecio.updateMany({
          where: { id, estado: actual.estado },
          data: { estado: 'PENDIENTE_SUBSANACION' },
        });
        if (cambio.count !== 1) {
          throw new ConflictException({
            code: 'TRANSICION_NO_PERMITIDA',
            detail: 'El estado cambió mientras se procesaba la solicitud.',
          });
        }
        await this.historial(tx, {
          solicitudId: id,
          actorId: actor.usuario.id,
          accion: 'Devuelta para subsanación',
          estadoAnterior: actual.estado,
          estadoNuevo: 'PENDIENTE_SUBSANACION',
          detalle: dto.contenido.slice(0, 1000),
        });
      } else {
        await this.historial(tx, {
          solicitudId: id,
          actorId: actor.usuario.id,
          accion: interno ? 'Nota interna' : 'Comentario agregado',
          estadoNuevo: actual.estado,
          detalle: dto.contenido.slice(0, 1000),
        });
      }

      await this.auditoria.registrarEn(tx, {
        actorId: actor.usuario.id,
        accion: devolver ? 'SOLICITUD_DEVUELTA' : 'SOLICITUD_COMENTADA',
        recurso: 'solicitud_precio',
        recursoId: id,
        ip,
        metadatos: { esInterno: interno },
      });
      const personalComento = this.esPersonalINE(actor);
      await this.avisar(
        tx,
        actual,
        actor,
        devolver
          ? 'Expediente devuelto'
          : interno
            ? 'Nota interna en el expediente'
            : personalComento
              ? 'Nuevo comentario del INE'
              : 'Observación de la entidad',
        devolver
          ? `${actual.codigo} volvió para corrección.`
          : `${actual.codigo}: ${dto.contenido.slice(0, 280)}`,
        !interno,
        { incluirColaboradores: !interno },
      );
      return this.presentar(
        await tx.solicitudPrecio.findUniqueOrThrow({
          where: { id },
          select: this.detallePara(actor),
        }),
        actor,
      );
    });
  }

  async reenviar(id: string, actor: Actor, ip?: string) {
    return this.prisma.$transaction(async (tx) => {
      const actual = await this.cargarLegible(id, actor, tx);
      this.exigirAutor(actual.creadaPorId, actor);
      this.exigirEstado(
        actual.estado,
        'PENDIENTE_SUBSANACION',
        'TRANSICION_NO_PERMITIDA',
        'Solo se reenvía un expediente devuelto para subsanación.',
      );
      const errores = this.validarEnvio(actual);
      if (errores.length > 0) {
        throw new UnprocessableEntityException({
          code: 'SOLICITUD_INCOMPLETA',
          detail: 'La solicitud no cumple los requisitos para reenviarse.',
          errors: errores,
        });
      }
      const cambio = await tx.solicitudPrecio.updateMany({
        where: { id, estado: 'PENDIENTE_SUBSANACION' },
        data: { estado: 'RECIBIDA' },
      });
      if (cambio.count !== 1) {
        throw new ConflictException({
          code: 'TRANSICION_NO_PERMITIDA',
          detail: 'El estado cambió mientras se procesaba la solicitud.',
        });
      }
      await this.historial(tx, {
        solicitudId: id,
        actorId: actor.usuario.id,
        accion: 'Solicitud reenviada',
        estadoAnterior: 'PENDIENTE_SUBSANACION',
        estadoNuevo: 'RECIBIDA',
      });
      await this.auditoria.registrarEn(tx, {
        actorId: actor.usuario.id,
        accion: 'SOLICITUD_REENVIADA',
        recurso: 'solicitud_precio',
        recursoId: id,
        ip,
      });
      await this.avisar(
        tx,
        actual,
        actor,
        'Expediente reenviado',
        `${actual.codigo} fue corregido y reenviado.`,
      );
      await this.notificaciones.avisarJefesNuevaRecepcion(tx, {
        solicitudId: id,
        actorId: actor.usuario.id,
        codigo: actual.codigo ?? id,
        tituloExpediente: actual.titulo,
        reenvio: true,
      });
      await this.notificaciones.avisarProveedoresActualizarPrecios(tx, {
        solicitudId: id,
        codigo: actual.codigo ?? id,
        tituloExpediente: actual.titulo,
        nombresProducto: (actual.productos ?? []).map((producto) => producto.nombre).filter(Boolean),
      });
      return this.presentar(
        await tx.solicitudPrecio.findUniqueOrThrow({
          where: { id },
          select: this.detallePara(actor),
        }),
        actor,
      );
    });
  }

  async registrarConsulta(id: string, dto: CrearConsultaDto, actor: Actor, ip?: string) {
    this.exigirPersonal(actor);
    this.preciosPositivos(dto.precios.map((precio, indice) => ({
      valor: precio.precio,
      campo: `precios[${indice}].precio`,
    })));
    const productos = new Set(dto.precios.map((precio) => precio.productoSolicitudId));
    if (productos.size !== dto.precios.length) {
      throw new UnprocessableEntityException({
        code: 'VALIDACION_FALLIDA',
        detail: 'Una boleta no repite el mismo producto.',
        errors: [{ field: 'precios', message: 'Cada producto va una sola vez' }],
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const actual = await this.cargarLegible(id, actor, tx);
      await this.exigirEncargado(tx, actual, actor);
      this.exigirEtapa(
        actual.estado,
        ETAPAS_BOLETA,
        'Las boletas se registran durante la investigación o el análisis.',
      );
      const fuente = await tx.fuenteConsulta.findFirst({
        where: { id: dto.fuenteId, activa: true },
        select: { id: true, nombre: true },
      });
      if (!fuente) {
        throw new UnprocessableEntityException({
          code: 'FUENTE_NO_PERMITIDA',
          detail: 'La fuente no está en el registro activo. Solo se consultan fuentes de Guatemala habilitadas.',
        });
      }
      const propios = await tx.productoSolicitud.findMany({
        where: { solicitudId: id, id: { in: [...productos] } },
        select: { id: true },
      });
      if (propios.length !== productos.size) {
        throw new UnprocessableEntityException({
          code: 'PRODUCTO_NO_PERTENECE',
          detail: 'Cada precio tiene que corresponder a un producto de este expediente.',
        });
      }
      const referencias = [
        ...new Set(dto.precios.flatMap((precio) => (precio.referenciaIneId ? [precio.referenciaIneId] : []))),
      ];
      if (referencias.length > 0) {
        const encontradas = await tx.referenciaINE.count({
          where: { id: { in: referencias } },
        });
        if (encontradas !== referencias.length) {
          throw new UnprocessableEntityException({
            code: 'REFERENCIA_NO_ENCONTRADA',
            detail: 'La fila del catálogo interno no existe.',
          });
        }
      }

      await tx.consultaMercado.create({
        data: {
          solicitudId: id,
          fuenteId: fuente.id,
          fechaConsulta: this.fecha(dto.fechaConsulta, 'fechaConsulta'),
          nota: dto.nota ?? null,
          evidencia: dto.evidencia ?? null,
          registradaPorId: actor.usuario.id,
          precios: {
            create: dto.precios.map((precio) => ({
              productoSolicitudId: precio.productoSolicitudId,
              precio: precio.precio,
              moneda: precio.moneda ?? 'GTQ',
              unidadMedida: precio.unidadMedida,
              referenciaIneId: precio.referenciaIneId ?? null,
              observacion: precio.observacion ?? null,
            })),
          },
        },
      });
      await this.historial(tx, {
        solicitudId: id,
        actorId: actor.usuario.id,
        accion: 'Boleta registrada',
        estadoNuevo: actual.estado,
        detalle: fuente.nombre,
      });
      await this.auditoria.registrarEn(tx, {
        actorId: actor.usuario.id,
        accion: 'CONSULTA_REGISTRADA',
        recurso: 'solicitud_precio',
        recursoId: id,
        ip,
        metadatos: { fuenteId: fuente.id, precios: dto.precios.length },
      });
      return this.presentar(
        await tx.solicitudPrecio.findUniqueOrThrow({
          where: { id },
          select: this.detallePara(actor),
        }),
        actor,
      );
    });
  }

  async marcarAtipico(id: string, dto: MarcarAtipicoDto, actor: Actor, ip?: string) {
    this.exigirPersonal(actor);
    return this.prisma.$transaction(async (tx) => {
      const actual = await this.cargarLegible(id, actor, tx);
      await this.exigirEncargado(tx, actual, actor);
      this.exigirEtapa(
        actual.estado,
        ['EN_ANALISIS'],
        'Los valores atípicos se marcan durante el análisis.',
      );
      const precio = await tx.precioConsultado.findFirst({
        where: { id: dto.precioConsultadoId, consulta: { solicitudId: id } },
        select: { id: true },
      });
      if (!precio) {
        throw new NotFoundException({
          code: 'PRECIO_NO_ENCONTRADO',
          detail: 'Ese precio consultado no pertenece al expediente.',
        });
      }
      await tx.precioConsultado.update({
        where: { id: precio.id },
        data: { esAtipico: dto.esAtipico },
      });
      await this.historial(tx, {
        solicitudId: id,
        actorId: actor.usuario.id,
        accion: dto.esAtipico ? 'Precio marcado como atípico' : 'Marca de atípico retirada',
        estadoNuevo: actual.estado,
        detalle: precio.id,
      });
      await this.auditoria.registrarEn(tx, {
        actorId: actor.usuario.id,
        accion: 'PRECIO_ATIPICO_MARCADO',
        recurso: 'solicitud_precio',
        recursoId: id,
        ip,
        metadatos: { precioConsultadoId: precio.id, esAtipico: dto.esAtipico },
      });
      return this.presentar(
        await tx.solicitudPrecio.findUniqueOrThrow({
          where: { id },
          select: this.detallePara(actor),
        }),
        actor,
      );
    });
  }

  async registrarValidacion(
    id: string,
    dto: RegistrarValidacionDto,
    actor: Actor,
    ip?: string,
  ) {
    this.exigirPersonal(actor);
    this.preciosPositivos([{ valor: dto.precioAdoptado, campo: 'precioAdoptado' }]);
    const confirmar = Boolean(dto.confirmar);
    return this.prisma.$transaction(async (tx) => {
      const actual = await this.cargarLegible(id, actor, tx);
      await this.exigirEncargado(tx, actual, actor);
      this.exigirEtapa(actual.estado, ['EN_ANALISIS'], 'El análisis se registra en EN_ANALISIS.');
      const producto = await tx.productoSolicitud.findFirst({
        where: { id: dto.productoSolicitudId, solicitudId: id },
        select: { id: true, nombre: true },
      });
      if (!producto) {
        throw new UnprocessableEntityException({
          code: 'PRODUCTO_NO_PERTENECE',
          detail: 'El producto no pertenece a este expediente.',
        });
      }
      await tx.validacionAnalisis.upsert({
        where: {
          solicitudId_productoSolicitudId: {
            solicitudId: id,
            productoSolicitudId: producto.id,
          },
        },
        create: {
          solicitudId: id,
          productoSolicitudId: producto.id,
          precioAdoptado: dto.precioAdoptado,
          moneda: dto.moneda ?? 'GTQ',
          unidadMedida: dto.unidadMedida,
          criterio: dto.criterio,
          notaAtipicos: dto.notaAtipicos ?? null,
          confirmada: confirmar,
          confirmadaPorId: confirmar ? actor.usuario.id : null,
          confirmadaEn: confirmar ? new Date() : null,
        },
        update: {
          precioAdoptado: dto.precioAdoptado,
          moneda: dto.moneda ?? 'GTQ',
          unidadMedida: dto.unidadMedida,
          criterio: dto.criterio,
          notaAtipicos: dto.notaAtipicos ?? null,
          confirmada: confirmar,
          confirmadaPorId: confirmar ? actor.usuario.id : null,
          confirmadaEn: confirmar ? new Date() : null,
        },
      });
      await this.historial(tx, {
        solicitudId: id,
        actorId: actor.usuario.id,
        accion: confirmar ? 'Precio de referencia confirmado' : 'Análisis actualizado',
        estadoNuevo: actual.estado,
        detalle: `${producto.nombre}: ${dto.moneda ?? 'GTQ'} ${dto.precioAdoptado}. ${dto.criterio}`.slice(0, 1000),
      });
      await this.auditoria.registrarEn(tx, {
        actorId: actor.usuario.id,
        accion: confirmar ? 'VALIDACION_CONFIRMADA' : 'VALIDACION_REGISTRADA',
        recurso: 'solicitud_precio',
        recursoId: id,
        ip,
        metadatos: { productoSolicitudId: producto.id, confirmada: confirmar },
      });
      return this.presentar(
        await tx.solicitudPrecio.findUniqueOrThrow({
          where: { id },
          select: this.detallePara(actor),
        }),
        actor,
      );
    });
  }

  async crearInforme(id: string, dto: CrearInformeDto, actor: Actor, ip?: string) {
    this.exigirPersonal(actor);
    return this.prisma.$transaction(async (tx) => {
      const actual = await this.cargarLegible(id, actor, tx);
      await this.exigirEncargado(tx, actual, actor);
      this.exigirEtapa(actual.estado, ['EN_INFORME'], 'El informe se prepara en EN_INFORME.');
      const ultima = await tx.informeSolicitud.aggregate({
        where: { solicitudId: id, tipo: dto.tipo },
        _max: { version: true },
      });
      const resumen = dto.resumen ?? (await this.textoBorrador(tx, id, actual, dto, actor.usuario.nombre));
      await tx.informeSolicitud.create({
        data: {
          solicitudId: id,
          tipo: dto.tipo,
          version: (ultima._max.version ?? 0) + 1,
          destinatario: dto.destinatario,
          resumen,
          elaboradoPorId: actor.usuario.id,
        },
      });
      await this.historial(tx, {
        solicitudId: id,
        actorId: actor.usuario.id,
        accion: 'Borrador de documento creado',
        estadoNuevo: actual.estado,
        detalle: `${dto.tipo} para ${dto.destinatario}`.slice(0, 1000),
      });
      await this.auditoria.registrarEn(tx, {
        actorId: actor.usuario.id,
        accion: 'INFORME_BORRADOR',
        recurso: 'solicitud_precio',
        recursoId: id,
        ip,
        metadatos: { tipo: dto.tipo },
      });
      return this.presentar(
        await tx.solicitudPrecio.findUniqueOrThrow({
          where: { id },
          select: this.detallePara(actor),
        }),
        actor,
      );
    });
  }

  async emitirInforme(id: string, informeId: string, actor: Actor, ip?: string) {
    this.exigirPersonal(actor);
    const emitido = await this.prisma.$transaction(async (tx) => {
      const actual = await this.cargarLegible(id, actor, tx);
      await this.exigirEncargado(tx, actual, actor);
      this.exigirEtapa(actual.estado, ['EN_INFORME'], 'Solo se emite un documento en EN_INFORME.');
      const informe = await tx.informeSolicitud.findFirst({
        where: { id: informeId, solicitudId: id },
        select: { id: true, tipo: true, estado: true, version: true, destinatario: true, resumen: true },
      });
      if (!informe) {
        throw new NotFoundException({
          code: 'INFORME_NO_ENCONTRADO',
          detail: 'Ese documento no pertenece al expediente.',
        });
      }
      if (informe.estado === 'EMITIDO') {
        throw new ConflictException({
          code: 'INFORME_YA_EMITIDO',
          detail: 'Ese documento ya fue emitido. Una versión nueva no borra la anterior.',
        });
      }
      if (informe.tipo === 'INFORME_TECNICO') {
        await this.exigirAnalisisConfirmado(tx, id);
      } else {
        const tecnico = await tx.informeSolicitud.count({
          where: { solicitudId: id, tipo: 'INFORME_TECNICO', estado: 'EMITIDO' },
        });
        if (tecnico < 1) {
          throw new ConflictException({
            code: 'INFORME_INCOMPLETO',
            detail: 'El oficio se emite después de un informe técnico ya emitido.',
          });
        }
      }
      const estadisticas = await this.estadisticasDe(tx, id, actual.productos);
      const cambio = await tx.informeSolicitud.updateMany({
        where: { id: informe.id, estado: 'BORRADOR' },
        data: {
          estado: 'EMITIDO',
          emitidoEn: new Date(),
          estadisticas: estadisticas as Prisma.InputJsonValue,
        },
      });
      if (cambio.count !== 1) {
        throw new ConflictException({
          code: 'INFORME_YA_EMITIDO',
          detail: 'El documento cambió mientras se procesaba.',
        });
      }
      await this.historial(tx, {
        solicitudId: id,
        actorId: actor.usuario.id,
        accion: 'Documento emitido',
        estadoNuevo: actual.estado,
        detalle: informe.tipo,
      });
      await this.auditoria.registrarEn(tx, {
        actorId: actor.usuario.id,
        accion: 'INFORME_EMITIDO',
        recurso: 'solicitud_precio',
        recursoId: id,
        ip,
        metadatos: { informeId: informe.id, tipo: informe.tipo },
      });
      await this.avisar(
        tx,
        actual,
        actor,
        'Documento emitido',
        `${actual.codigo}: se emitió ${informe.tipo === 'OFICIO' ? 'el oficio' : 'el informe técnico'}.`,
      );
      const solicitud = this.presentar(
        await tx.solicitudPrecio.findUniqueOrThrow({
          where: { id },
          select: this.detallePara(actor),
        }),
        actor,
      );
      return {
        solicitud,
        aviso: {
          creadaPorId: actual.creadaPorId,
          codigo: actual.codigo,
          tipo: informe.tipo,
          resumen: (solicitud.informes ?? []).find((item) => item.id === informe.id)?.resumen ?? '',
        },
        documento: {
          solicitudId: id,
          informeId: informe.id,
          codigo: actual.codigo,
          tipo: informe.tipo,
          version: informe.version,
          destinatario: informe.destinatario,
          resumen: informe.resumen,
          estadisticas,
          subidoPorId: actor.usuario.id,
        },
      };
    });
    let pdf: Buffer | undefined;
    try {
      pdf = await crearPdfInforme(emitido.documento);
      await this.adjuntos.guardarInformeEmitido({ ...emitido.documento, contenido: pdf });
    } catch (error) {
      this.logger.error('No se pudo guardar el PDF del documento emitido.', error instanceof Error ? error.message : undefined);
    }
    await this.enviarInformeEmitido(emitido.aviso, pdf, emitido.documento);
    return emitido.solicitud;
  }

  async registrarEntrega(id: string, dto: RegistrarEntregaDto, actor: Actor, ip?: string) {
    this.exigirPersonal(actor);
    return this.prisma.$transaction(async (tx) => {
      const actual = await this.cargarLegible(id, actor, tx);
      await this.exigirEncargado(tx, actual, actor);
      this.exigirEtapa(actual.estado, ['EN_ENTREGA'], 'La entrega se registra en EN_ENTREGA.');
      if (dto.informeId) {
        const informe = await tx.informeSolicitud.findFirst({
          where: { id: dto.informeId, solicitudId: id, estado: 'EMITIDO' },
          select: { id: true },
        });
        if (!informe) {
          throw new UnprocessableEntityException({
            code: 'INFORME_NO_EMITIDO',
            detail: 'La constancia solo puede citar un documento ya emitido de este expediente.',
          });
        }
      }
      await tx.entregaSolicitud.create({
        data: {
          solicitudId: id,
          informeId: dto.informeId ?? null,
          medio: dto.medio,
          destinatario: dto.destinatario,
          fechaEntrega: this.fecha(dto.fechaEntrega, 'fechaEntrega'),
          constancia: dto.constancia,
          registradaPorId: actor.usuario.id,
        },
      });
      await this.historial(tx, {
        solicitudId: id,
        actorId: actor.usuario.id,
        accion: 'Entrega registrada',
        estadoNuevo: actual.estado,
        detalle: `${dto.medio} a ${dto.destinatario}`.slice(0, 1000),
      });
      await this.auditoria.registrarEn(tx, {
        actorId: actor.usuario.id,
        accion: 'ENTREGA_REGISTRADA',
        recurso: 'solicitud_precio',
        recursoId: id,
        ip,
        metadatos: { medio: dto.medio },
      });
      await this.avisar(
        tx,
        actual,
        actor,
        'Entrega registrada',
        `${actual.codigo}: entrega ${dto.medio} registrada.`,
      );
      return this.presentar(
        await tx.solicitudPrecio.findUniqueOrThrow({
          where: { id },
          select: this.detallePara(actor),
        }),
        actor,
      );
    });
  }

  async corregirConsulta(
    id: string,
    consultaId: string,
    dto: CorregirConsultaDto,
    actor: Actor,
    ip?: string,
  ) {
    this.exigirPersonal(actor);
    const precios = dto.precios ?? [];
    this.preciosPositivos(
      precios.flatMap((precio, indice) =>
        precio.precio ? [{ valor: precio.precio, campo: `precios[${indice}].precio` }] : [],
      ),
    );

    return this.prisma.$transaction(async (tx) => {
      const actual = await this.cargarLegible(id, actor, tx);
      await this.exigirEncargado(tx, actual, actor);
      this.exigirEtapa(
        actual.estado,
        ETAPAS_BOLETA,
        'Una boleta se corrige durante la investigación o el análisis.',
      );
      const consulta = await tx.consultaMercado.findFirst({
        where: { id: consultaId, solicitudId: id },
        select: {
          id: true,
          nota: true,
          evidencia: true,
          fechaConsulta: true,
          precios: {
            select: {
              id: true,
              precio: true,
              moneda: true,
              unidadMedida: true,
              observacion: true,
              productoSolicitud: { select: { nombre: true } },
            },
          },
        },
      });
      if (!consulta) {
        throw new NotFoundException({
          code: 'CONSULTA_NO_ENCONTRADA',
          detail: 'Esa boleta no pertenece al expediente.',
        });
      }

      const cambios: string[] = [];
      const dataConsulta: {
        fechaConsulta?: Date;
        nota?: string | null;
        evidencia?: string | null;
      } = {};
      if (dto.fechaConsulta) {
        const fecha = this.fecha(dto.fechaConsulta, 'fechaConsulta');
        const anterior = consulta.fechaConsulta.toISOString().slice(0, 10);
        if (anterior !== dto.fechaConsulta) {
          dataConsulta.fechaConsulta = fecha;
          cambios.push(`Fecha: ${anterior} → ${dto.fechaConsulta}`);
        }
      }
      if (dto.nota !== undefined && dto.nota !== (consulta.nota ?? '')) {
        dataConsulta.nota = dto.nota || null;
        cambios.push('Se actualizó la nota de la boleta.');
      }
      if (dto.evidencia !== undefined && dto.evidencia !== (consulta.evidencia ?? '')) {
        dataConsulta.evidencia = dto.evidencia || null;
        cambios.push('Se actualizó la referencia de la evidencia.');
      }
      if (Object.keys(dataConsulta).length > 0) {
        await tx.consultaMercado.update({ where: { id: consulta.id }, data: dataConsulta });
      }

      const porId = new Map(consulta.precios.map((precio) => [precio.id, precio]));
      for (const [indice, cambio] of precios.entries()) {
        const vigente = porId.get(cambio.id);
        if (!vigente) {
          throw new UnprocessableEntityException({
            code: 'PRECIO_NO_ENCONTRADO',
            detail: 'El precio que se quiere corregir no está en esta boleta.',
            errors: [{ field: `precios[${indice}].id`, message: 'No pertenece a la boleta' }],
          });
        }
        const dataPrecio: {
          precio?: string;
          moneda?: string;
          unidadMedida?: string;
          observacion?: string | null;
        } = {};
        if (cambio.precio !== undefined && Number(vigente.precio.toString()) !== Number(cambio.precio)) {
          dataPrecio.precio = cambio.precio;
          cambios.push(
            `${vigente.productoSolicitud.nombre}: ${vigente.precio.toString()} → ${cambio.precio}`,
          );
        }
        if (cambio.moneda !== undefined && cambio.moneda !== vigente.moneda.trim()) {
          dataPrecio.moneda = cambio.moneda;
          cambios.push(`${vigente.productoSolicitud.nombre}: moneda ${vigente.moneda.trim()} → ${cambio.moneda}`);
        }
        if (cambio.unidadMedida !== undefined && cambio.unidadMedida !== vigente.unidadMedida) {
          dataPrecio.unidadMedida = cambio.unidadMedida;
          cambios.push(
            `${vigente.productoSolicitud.nombre}: unidad ${vigente.unidadMedida} → ${cambio.unidadMedida}`,
          );
        }
        if (
          cambio.observacion !== undefined &&
          cambio.observacion !== (vigente.observacion ?? '')
        ) {
          dataPrecio.observacion = cambio.observacion || null;
          cambios.push(`${vigente.productoSolicitud.nombre}: se actualizó la observación.`);
        }
        if (Object.keys(dataPrecio).length > 0) {
          await tx.precioConsultado.update({ where: { id: vigente.id }, data: dataPrecio });
        }
      }

      if (cambios.length === 0) {
        throw new UnprocessableEntityException({
          code: 'SIN_CAMBIOS',
          detail: 'La corrección no modifica ningún dato de la boleta.',
        });
      }

      await this.historial(tx, {
        solicitudId: id,
        actorId: actor.usuario.id,
        accion: 'Boleta corregida',
        estadoNuevo: actual.estado,
        detalle: cambios.join(' ').slice(0, 1000),
      });
      await this.auditoria.registrarEn(tx, {
        actorId: actor.usuario.id,
        accion: 'CONSULTA_CORREGIDA',
        recurso: 'solicitud_precio',
        recursoId: id,
        ip,
        metadatos: { consultaId },
      });
      return this.presentar(
        await tx.solicitudPrecio.findUniqueOrThrow({
          where: { id },
          select: this.detallePara(actor),
        }),
        actor,
      );
    });
  }

  async pausar(id: string, actor: Actor, ip?: string) {
    this.exigirPersonal(actor);
    return this.prisma.$transaction(async (tx) => {
      const actual = await this.cargarLegible(id, actor, tx);
      await this.exigirEncargado(tx, actual, actor);
      if (!PAUSABLES.has(actual.estado)) {
        throw new ConflictException({
          code: 'TRANSICION_NO_PERMITIDA',
          detail: 'Este expediente no se puede poner en espera desde su estado actual.',
        });
      }
      await tx.solicitudPrecio.update({
        where: { id },
        data: { estado: 'EN_ESPERA', estadoAlPausar: actual.estado },
      });
      await this.historial(tx, {
        solicitudId: id,
        actorId: actor.usuario.id,
        accion: 'Expediente en espera',
        estadoAnterior: actual.estado,
        estadoNuevo: 'EN_ESPERA',
      });
      await this.auditoria.registrarEn(tx, {
        actorId: actor.usuario.id,
        accion: 'SOLICITUD_PAUSADA',
        recurso: 'solicitud_precio',
        recursoId: id,
        ip,
        metadatos: { desde: actual.estado },
      });
      await this.avisar(
        tx,
        actual,
        actor,
        'Expediente en espera',
        `${actual.codigo ?? 'El expediente'} quedó en espera del INE.`,
      );
      return this.presentar(
        await tx.solicitudPrecio.findUniqueOrThrow({
          where: { id },
          select: this.detallePara(actor),
        }),
        actor,
      );
    });
  }

  async reanudar(id: string, actor: Actor, ip?: string) {
    this.exigirPersonal(actor);
    return this.prisma.$transaction(async (tx) => {
      const actual = await this.cargarLegible(id, actor, tx);
      await this.exigirEncargado(tx, actual, actor);
      if (actual.estado !== 'EN_ESPERA' || !actual.estadoAlPausar) {
        throw new ConflictException({
          code: 'TRANSICION_NO_PERMITIDA',
          detail: 'Solo se reanuda un expediente que está en espera.',
        });
      }
      const destino = actual.estadoAlPausar;
      await tx.solicitudPrecio.update({
        where: { id },
        data: { estado: destino, estadoAlPausar: null },
      });
      await this.historial(tx, {
        solicitudId: id,
        actorId: actor.usuario.id,
        accion: 'Expediente reanudado',
        estadoAnterior: 'EN_ESPERA',
        estadoNuevo: destino,
      });
      await this.auditoria.registrarEn(tx, {
        actorId: actor.usuario.id,
        accion: 'SOLICITUD_REANUDADA',
        recurso: 'solicitud_precio',
        recursoId: id,
        ip,
        metadatos: { hacia: destino },
      });
      await this.avisar(
        tx,
        actual,
        actor,
        'Expediente reanudado',
        `${actual.codigo ?? 'El expediente'} volvió a ${destino}.`,
      );
      return this.presentar(
        await tx.solicitudPrecio.findUniqueOrThrow({
          where: { id },
          select: this.detallePara(actor),
        }),
        actor,
      );
    });
  }

  async cancelar(id: string, actor: Actor, ip?: string) {
    return this.prisma.$transaction(async (tx) => {
      const actual = await this.cargarLegible(id, actor, tx);
      this.exigirAutor(actual.creadaPorId, actor);
      if (!CANCELABLES.has(actual.estado)) {
        throw new ConflictException({
          code: 'TRANSICION_NO_PERMITIDA',
          detail: 'Este expediente ya no se puede anular.',
        });
      }
      await tx.solicitudPrecio.update({
        where: { id },
        data: { estado: 'CANCELADA', estadoAlPausar: null },
      });
      await this.historial(tx, {
        solicitudId: id,
        actorId: actor.usuario.id,
        accion: 'Expediente anulado',
        estadoAnterior: actual.estado,
        estadoNuevo: 'CANCELADA',
      });
      await this.auditoria.registrarEn(tx, {
        actorId: actor.usuario.id,
        accion: 'SOLICITUD_CANCELADA',
        recurso: 'solicitud_precio',
        recursoId: id,
        ip,
      });
      await this.avisar(
        tx,
        actual,
        actor,
        'Expediente anulado',
        `${actual.codigo ?? 'El expediente'} fue anulado por quien lo solicitó.`,
        false,
      );
      return this.presentar(
        await tx.solicitudPrecio.findUniqueOrThrow({
          where: { id },
          select: this.detallePara(actor),
        }),
        actor,
      );
    });
  }

  async descartar(id: string, actor: Actor, ip?: string) {
    await this.prisma.$transaction(async (tx) => {
      const actual = await this.cargarLegible(id, actor, tx);
      this.exigirAutor(actual.creadaPorId, actor);
      this.exigirEstado(
        actual.estado,
        'BORRADOR',
        'SOLO_BORRADOR',
        'Solo se elimina un borrador que todavía no se envió.',
      );
      await tx.solicitudPrecio.delete({ where: { id } });
      await this.auditoria.registrarEn(tx, {
        actorId: actor.usuario.id,
        accion: 'SOLICITUD_DESCARTADA',
        recurso: 'solicitud_precio',
        recursoId: id,
        ip,
      });
    });
  }

  async agregarColaborador(id: string, dto: AsignarSolicitudDto, actor: Actor, ip?: string) {
    this.exigirJefe(actor);
    return this.prisma.$transaction(async (tx) => {
      const actual = await this.cargarLegible(id, actor, tx);
      if (CERRADOS.has(actual.estado)) {
        throw new ConflictException({
          code: 'SOLICITUD_CERRADA',
          detail: 'Un expediente cerrado no suma colaboradores.',
        });
      }
      if (dto.usuarioId === actual.asignadaAId) {
        throw new ConflictException({
          code: 'YA_ES_RESPONSABLE',
          detail: 'Esa persona ya es la responsable del expediente.',
        });
      }
      const persona = await tx.usuario.findFirst({
        where: { id: dto.usuarioId, ...filtroPersonalAsignable },
        select: { id: true, nombre: true },
      });
      if (!persona) {
        throw new UnprocessableEntityException({
          code: 'PERSONA_NO_ASIGNABLE',
          detail: 'El colaborador tiene que ser un trabajador o jefe activo del INE.',
        });
      }
      await tx.solicitudColaborador.upsert({
        where: { solicitudId_usuarioId: { solicitudId: id, usuarioId: persona.id } },
        create: { solicitudId: id, usuarioId: persona.id, agregadoPorId: actor.usuario.id },
        update: {},
      });
      await this.historial(tx, {
        solicitudId: id,
        actorId: actor.usuario.id,
        accion: 'Colaborador agregado',
        estadoNuevo: actual.estado,
        detalle: persona.nombre,
      });
      await this.auditoria.registrarEn(tx, {
        actorId: actor.usuario.id,
        accion: 'COLABORADOR_AGREGADO',
        recurso: 'solicitud_precio',
        recursoId: id,
        ip,
        metadatos: { usuarioId: persona.id },
      });
      await this.notificaciones.avisarColaboracion(tx, {
        solicitudId: id,
        actorId: actor.usuario.id,
        colaboradorId: persona.id,
        codigo: actual.codigo,
        tituloExpediente: actual.titulo,
      });
      return this.presentar(
        await tx.solicitudPrecio.findUniqueOrThrow({
          where: { id },
          select: this.detallePara(actor),
        }),
        actor,
      );
    });
  }

  async quitarColaborador(id: string, usuarioId: string, actor: Actor, ip?: string) {
    this.exigirJefe(actor);
    return this.prisma.$transaction(async (tx) => {
      const actual = await this.cargarLegible(id, actor, tx);
      const quitado = await tx.solicitudColaborador.deleteMany({
        where: { solicitudId: id, usuarioId },
      });
      if (quitado.count !== 1) {
        throw new NotFoundException({
          code: 'COLABORADOR_NO_ENCONTRADO',
          detail: 'Esa persona no colabora en el expediente.',
        });
      }
      await this.historial(tx, {
        solicitudId: id,
        actorId: actor.usuario.id,
        accion: 'Colaborador retirado',
        estadoNuevo: actual.estado,
      });
      await this.auditoria.registrarEn(tx, {
        actorId: actor.usuario.id,
        accion: 'COLABORADOR_RETIRADO',
        recurso: 'solicitud_precio',
        recursoId: id,
        ip,
        metadatos: { usuarioId },
      });
      return this.presentar(
        await tx.solicitudPrecio.findUniqueOrThrow({
          where: { id },
          select: this.detallePara(actor),
        }),
        actor,
      );
    });
  }

  // ---- helpers ----

  private esPersonalINE(actor: Actor) {
    return actor.usuario.roles.some(
      (rol) => rol === 'ADMIN' || rol === 'JEFE' || rol === 'TRABAJADOR_INE',
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
      select: this.detallePara(actor),
    });
    // Misma respuesta para «no existe» y «no es tuya»: no se revela existencia.
    if (!solicitud) {
      throw new NotFoundException(this.noEncontrada());
    }
    return this.presentar(solicitud, actor);
  }

  private exigirAutor(creadaPorId: string, actor: Actor) {
    assertResourceOwnership(actor.ownership, { usuarioId: creadaPorId }, 'usuario');
  }

  private exigirPersonal(actor: Actor) {
    if (!this.esPersonalINE(actor)) {
      throw new ForbiddenException({
        code: 'ROL_NO_PERMITIDO',
        detail: 'Esta acción es del personal del INE.',
      });
    }
  }

  private exigirJefe(actor: Actor) {
    if (!actor.usuario.roles.some((rol) => rol === 'JEFE' || rol === 'ADMIN')) {
      throw new ForbiddenException({
        code: 'ASIGNACION_SOLO_JEFE',
        detail: 'Solo el jefe asigna el expediente a un trabajador.',
      });
    }
  }

  /** Sin responsable no se trabaja el caso. Con responsable, lo trabaja esa persona, un colaborador o un administrador. */
  private async exigirEncargado(
    tx: Prisma.TransactionClient,
    solicitud: { id: string; asignadaAId: string | null },
    actor: Actor,
  ) {
    if (actor.usuario.roles.includes('ADMIN')) return;
    if (!solicitud.asignadaAId) {
      throw new ForbiddenException({
        code: 'EXPEDIENTE_SIN_ASIGNAR',
        detail: 'El jefe tiene que asignar este expediente a un trabajador antes de trabajarlo.',
      });
    }
    if (solicitud.asignadaAId === actor.usuario.id) return;
    const colabora = await tx.solicitudColaborador.count({
      where: { solicitudId: solicitud.id, usuarioId: actor.usuario.id },
    });
    if (colabora < 1) {
      throw new ForbiddenException({
        code: 'NO_ES_RESPONSABLE',
        detail: 'Este expediente lo trabaja la persona asignada o un colaborador.',
      });
    }
  }

  private exigirEditable(estado: string) {
    if (!EDITABLES.has(estado)) {
      throw new ConflictException({
        code: 'SOLICITUD_NO_EDITABLE',
        detail: 'Solo se puede modificar un borrador o un expediente devuelto para subsanación.',
      });
    }
  }

  private exigirEstado(estado: string, esperado: string, code: string, detail: string) {
    if (estado !== esperado) {
      throw new ConflictException({ code, detail });
    }
  }

  private detallePara(actor: Actor): Prisma.SolicitudPrecioSelect {
    const personal = this.esPersonalINE(actor);
    return {
      ...DETALLE,
      comentarios: {
        where: personal ? {} : { esInterno: false },
        orderBy: { createdAt: 'asc' as const },
        select: {
          id: true,
          contenido: true,
          esInterno: true,
          createdAt: true,
          autor: { select: { id: true, nombre: true } },
        },
      },
      historial: {
        orderBy: { createdAt: 'asc' as const },
        select: {
          id: true,
          accion: true,
          estadoAnterior: true,
          estadoNuevo: true,
          detalle: true,
          createdAt: true,
          actor: { select: { id: true, nombre: true } },
        },
      },
      ...(personal
        ? {
            consultas: { orderBy: { createdAt: 'asc' as const }, select: CONSULTA },
            validaciones: { orderBy: { createdAt: 'asc' as const }, select: VALIDACION },
            avisosPrecio: {
              orderBy: { avisadoEn: 'asc' as const },
              select: {
                id: true,
                avisadoEn: true,
                venceEn: true,
                actualizadoEn: true,
                proveedor: { select: { id: true, nombreComercial: true } },
              },
            },
          }
        : {}),
      informes: {
        ...(personal ? {} : { where: { estado: 'EMITIDO' as const } }),
        orderBy: { createdAt: 'asc' as const },
        select: INFORME,
      },
      entregas: {
        orderBy: { createdAt: 'asc' as const },
        select: ENTREGA,
      },
      colaboradores: {
        orderBy: { createdAt: 'asc' as const },
        select: {
          createdAt: true,
          usuario: { select: { id: true, nombre: true } },
        },
      },
    };
  }

  private presentar<
    T extends {
      estado?: string;
      enviadaEn?: Date | null;
      updatedAt?: Date | null;
      historial?: Array<{ estadoNuevo?: string | null; createdAt: Date | string }>;
      informes?: Array<{ estado: string }>;
      entregas?: unknown[];
    },
  >(solicitud: T, actor: Actor): T & { atencion: AtencionExpediente | null } {
    const visible = this.esPersonalINE(actor) || !solicitud.estado
      ? solicitud
      : {
          ...solicitud,
          consultas: [],
          validaciones: [],
          informes: (solicitud.informes ?? []).filter((informe) => informe.estado === 'EMITIDO'),
          entregas: solicitud.estado === 'COMPLETADA' ? (solicitud.entregas ?? []) : [],
        };
    return { ...visible, atencion: medirAtencion(visible) };
  }

  private exigirEtapa(estado: string, permitidos: string[], detail: string) {
    if (!permitidos.includes(estado)) {
      throw new ConflictException({ code: 'ETAPA_NO_PERMITE_ACCION', detail });
    }
  }

  private preciosPositivos(precios: Array<{ valor: string; campo: string }>) {
    const errores = precios
      .filter((precio) => Number(precio.valor) <= 0)
      .map((precio) => ({
        field: precio.campo,
        message: 'El precio debe ser mayor que cero',
      }));
    if (errores.length > 0) {
      throw new UnprocessableEntityException({
        code: 'VALIDACION_FALLIDA',
        detail: 'Uno o más campos no cumplen el contrato.',
        errors: errores,
      });
    }
  }

  /** Pasados los dos días se avanza aunque falten proveedores; antes, solo si todos actualizaron. */
  private async exigirProveedoresAlDia(tx: Prisma.TransactionClient, solicitudId: string) {
    const avisos = await tx.avisoPrecioProveedor.findMany({
      where: { solicitudId },
      select: { venceEn: true, actualizadoEn: true, proveedor: { select: { nombreComercial: true } } },
    });
    const pendientes = avisos.filter((aviso) => !aviso.actualizadoEn);
    if (pendientes.length === 0) return;
    const vence = new Date(Math.max(...avisos.map((aviso) => aviso.venceEn.getTime())));
    if (Date.now() >= vence.getTime()) return;
    throw new ConflictException({
      code: 'PROVEEDORES_PENDIENTES',
      detail:
        `Faltan ${pendientes.length} de ${avisos.length} proveedores por actualizar precios. `
        + `Se podrá avanzar cuando todos actualicen o al vencer el plazo (${vence.toISOString()}).`,
      errors: pendientes.map((aviso) => ({
        field: 'proveedores',
        message: aviso.proveedor.nombreComercial,
      })),
    });
  }

  private async exigirAnalisisConfirmado(tx: Prisma.TransactionClient, solicitudId: string) {
    const productos = await tx.productoSolicitud.findMany({
      where: { solicitudId },
      select: { id: true },
    });
    const confirmadas = await tx.validacionAnalisis.count({
      where: {
        solicitudId,
        confirmada: true,
        productoSolicitudId: { in: productos.map((producto) => producto.id) },
      },
    });
    if (productos.length === 0 || confirmadas < productos.length) {
      throw new ConflictException({
        code: 'ANALISIS_INCOMPLETO',
        detail: 'Cada producto necesita un precio de referencia confirmado por el analista.',
      });
    }
  }

  private async exigirListoPara(
    tx: Prisma.TransactionClient,
    solicitudId: string,
    destino: string,
  ) {
    if (destino === 'EN_INVESTIGACION') {
      await this.exigirProveedoresAlDia(tx, solicitudId);
    }
    if (destino === 'EN_INFORME') {
      await this.exigirAnalisisConfirmado(tx, solicitudId);
    }
    if (destino === 'EN_ENTREGA') {
      const emitidos = await tx.informeSolicitud.count({
        where: { solicitudId, estado: 'EMITIDO' },
      });
      if (emitidos < 1) {
        throw new ConflictException({
          code: 'INFORME_INCOMPLETO',
          detail: 'Antes de la entrega tiene que estar emitido el documento del expediente.',
        });
      }
    }
    if (destino === 'COMPLETADA') {
      const entregas = await tx.entregaSolicitud.count({ where: { solicitudId } });
      if (entregas < 1) {
        throw new ConflictException({
          code: 'ENTREGA_INCOMPLETA',
          detail: 'Registra al menos una entrega con su constancia antes de cerrar el expediente.',
        });
      }
    }
  }

  async estadisticas(id: string, actor: Actor) {
    this.exigirPersonal(actor);
    const actual = await this.cargarLegible(id, actor);
    return this.estadisticasDe(this.prisma, id, actual.productos);
  }

  private async estadisticasDe(
    tx: Prisma.TransactionClient | PrismaService,
    solicitudId: string,
    productos: Array<{ id: string; nombre: string; unidadMedida: string | null }>,
  ) {
    const precios = await tx.precioConsultado.findMany({
      where: { consulta: { solicitudId } },
      select: {
        precio: true,
        moneda: true,
        unidadMedida: true,
        esAtipico: true,
        productoSolicitudId: true,
        consulta: { select: { fuente: { select: { nombre: true } } } },
      },
    });
    return medirExpediente(
      productos,
      precios.map((precio) => ({
        productoSolicitudId: precio.productoSolicitudId,
        precio: precio.precio.toString(),
        moneda: precio.moneda,
        unidadMedida: precio.unidadMedida,
        esAtipico: precio.esAtipico,
        fuente: precio.consulta.fuente.nombre,
      })),
    );
  }

  private async textoBorrador(
    tx: Prisma.TransactionClient,
    solicitudId: string,
    actual: {
      codigo: string;
      titulo: string;
      institucionSolicitante: string;
      productos: Array<{
        id: string;
        numero: number;
        nombre: string;
        unidadMedida: string | null;
        cantidad: { toString(): string } | null;
      }>;
    },
    dto: CrearInformeDto,
    elaboradoPor: string,
  ) {
    const validaciones = await tx.validacionAnalisis.findMany({
      where: { solicitudId, confirmada: true },
      select: { productoSolicitudId: true, precioAdoptado: true, moneda: true },
    });
    const porProducto = new Map(
      validaciones.map((validacion) => [validacion.productoSolicitudId, validacion]),
    );
    const estadisticas = await this.estadisticasDe(tx, solicitudId, actual.productos);
    return borradorInforme({
      codigo: actual.codigo,
      titulo: actual.titulo,
      institucion: actual.institucionSolicitante,
      destinatario: dto.destinatario,
      elaboradoPor,
      fecha: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guatemala' }),
      estadisticas,
      productos: actual.productos.map((producto) => {
        const validacion = porProducto.get(producto.id);
        return {
          numero: producto.numero,
          nombre: producto.nombre,
          unidadMedida: producto.unidadMedida,
          cantidad: producto.cantidad ? producto.cantidad.toString() : null,
          precioAdoptado: validacion ? validacion.precioAdoptado.toString() : null,
          moneda: validacion?.moneda ?? null,
        };
      }),
    });
  }

  private async siguienteCodigo(tx: Prisma.TransactionClient) {
    const anio = new Date().getUTCFullYear();
    const filas = await tx.$queryRaw<Array<{ ultimo: number }>>(
      Prisma.sql`
        INSERT INTO solicitud_correlativo (anio, ultimo)
        VALUES (${anio}, 1)
        ON CONFLICT (anio)
        DO UPDATE SET ultimo = solicitud_correlativo.ultimo + 1
        RETURNING ultimo
      `,
    );
    const ultimo = filas[0]?.ultimo;
    if (!ultimo) {
      throw new ConflictException({
        code: 'CODIGO_NO_GENERADO',
        detail: 'No se pudo asignar el código del expediente.',
      });
    }
    return `PR-${anio}-${String(ultimo).padStart(6, '0')}`;
  }

  private async idsColaboradores(tx: Prisma.TransactionClient, solicitudId: string) {
    const filas = await tx.solicitudColaborador.findMany({
      where: { solicitudId },
      select: { usuarioId: true },
    });
    return filas.map((fila) => fila.usuarioId);
  }

  private async avisar(
    tx: Prisma.TransactionClient,
    actual: {
      id: string;
      codigo?: string | null;
      creadaPorId?: string | null;
      asignadaAId?: string | null;
    },
    actor: Actor,
    titulo: string,
    detalle: string,
    incluirCreador = true,
    opciones?: { incluirResponsable?: boolean; incluirColaboradores?: boolean },
  ): Promise<void> {
    const incluirResponsable = opciones?.incluirResponsable !== false;
    const destinatariosExtra = opciones?.incluirColaboradores !== false
      ? await this.idsColaboradores(tx, actual.id)
      : [];
    await this.notificaciones.avisar(tx, {
      solicitudId: actual.id,
      actorId: actor.usuario.id,
      creadaPorId: actual.creadaPorId,
      asignadaAId: incluirResponsable ? actual.asignadaAId : null,
      destinatariosExtra,
      titulo,
      detalle,
      incluirCreador,
    });
  }

  private async enviarInformeEmitido(datos: {
    creadaPorId: string | null;
    codigo: string | null;
    tipo: 'INFORME_TECNICO' | 'OFICIO';
    resumen: string;
  }, pdf?: Buffer, documento?: { codigo: string | null; tipo: 'INFORME_TECNICO' | 'OFICIO'; version: number }) {
    if (!datos.creadaPorId || !datos.codigo || !datos.resumen) return;
    try {
      const destinatario = await this.prisma.usuario.findUnique({
        where: { id: datos.creadaPorId },
        select: { email: true, nombre: true },
      });
      if (!destinatario) return;
      const base = this.config.getOrThrow<string>('FRONTEND_URL').replace(/\/$/, '');
      const mensaje = correoInformeEmitido({
        nombre: destinatario.nombre,
        codigo: datos.codigo,
        tipo: datos.tipo,
        resumen: datos.resumen,
        enlace: `${base}/cuenta`,
      });
      await this.mail.send({
        to: destinatario.email,
        subject: `Documento emitido · ${datos.codigo}`,
        text: mensaje.text,
        html: mensaje.html,
        ...(pdf && documento ? {
          attachments: [{
            filename: `${documento.codigo}-${documento.tipo === 'OFICIO' ? 'oficio' : 'informe-tecnico'}-v${documento.version}.pdf`,
            content: pdf,
            contentType: 'application/pdf',
          }],
        } : {}),
      });
    } catch (error) {
      // La emisión ya quedó registrada; un fallo de SMTP no debe revertirla.
      this.logger.error(
        'No se pudo enviar el correo del documento emitido.',
        error instanceof Error ? error.message : undefined,
      );
    }
  }

  private async enviarExpedienteCompletado(datos: { creadaPorId: string | null; codigo: string | null }) {
    if (!datos.creadaPorId || !datos.codigo) return;
    try {
      const destinatario = await this.prisma.usuario.findUnique({
        where: { id: datos.creadaPorId },
        select: { email: true, nombre: true },
      });
      if (!destinatario) return;
      const base = this.config.getOrThrow<string>('FRONTEND_URL').replace(/\/$/, '');
      const mensaje = correoExpedienteCompletado({
        nombre: destinatario.nombre,
        codigo: datos.codigo,
        enlace: `${base}/cuenta`,
      });
      await this.mail.send({
        to: destinatario.email,
        subject: `Expediente completado · ${datos.codigo}`,
        text: mensaje.text,
        html: mensaje.html,
      });
    } catch (error) {
      this.logger.error('No se pudo enviar el correo de expediente completado.', error instanceof Error ? error.message : undefined);
    }
  }

  private historial(
    tx: Prisma.TransactionClient,
    datos: {
      solicitudId: string;
      actorId: string;
      accion: string;
      estadoAnterior?: string | null;
      estadoNuevo?: string | null;
      detalle?: string | null;
    },
  ) {
    return tx.solicitudHistorial.create({ data: datos });
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

  private fecha(valor: string, campo = 'fechaFormulario') {
    const fecha = new Date(`${valor}T00:00:00.000Z`);
    if (Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== valor) {
      throw new UnprocessableEntityException({
        code: 'VALIDACION_FALLIDA',
        detail: 'Uno o más campos no cumplen el contrato.',
        errors: [{ field: campo, message: 'La fecha no es válida' }],
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
