import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedRequest } from '../../common/auth/auth-context.js';
import { Prisma } from '../../infrastructure/database/generated/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import type { ListarNotificacionesDto } from './notificaciones.dto.js';

type Actor = AuthenticatedRequest['auth'];

export const PLAZO_PROVEEDORES_MS = 2 * 24 * 60 * 60 * 1000;

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
  /** Otros destinatarios (p. ej. colaboradores del expediente). */
  destinatariosExtra?: string[];
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

  /**
   * Nueva solicitud de cotización: pide a los proveedores activos que actualicen precios y abre
   * el plazo de espera que bloquea el avance de la solicitud (ver `PLAZO_PROVEEDORES_MS`).
   */
  async avisarProveedoresActualizarPrecios(
    tx: Prisma.TransactionClient,
    datos: {
      solicitudId: string;
      codigo: string;
      tituloExpediente?: string | null;
      nombresProducto?: string[];
    },
  ) {
    const terminos = terminosDeProductos(datos.nombresProducto ?? []);
    if (terminos.length === 0) return;

    // La solicitud no guarda una categoría explícita. La obtenemos de las filas
    // importadas del INE y la combinamos con coincidencias de texto del catálogo
    // del proveedor. Así una solicitud de laptops no llega a una farmacia.
    const referencias = await tx.referenciaINE.findMany({
      where: {
        OR: terminos.flatMap((termino) => [
          { producto: { contains: termino, mode: 'insensitive' as const } },
          { caracteristicas: { contains: termino, mode: 'insensitive' as const } },
        ]),
      },
      select: { categoriaOriginal: true },
      take: 100,
    });
    const categorias = [...new Set(
      referencias.map((referencia) => referencia.categoriaOriginal?.trim()).filter(Boolean),
    )] as string[];
    const productosRelacionados = await tx.productoProveedor.findMany({
      where: {
        estado: 'PUBLICADO',
        OR: [
          ...terminos.flatMap((termino) => [
            { nombre: { contains: termino, mode: 'insensitive' as const } },
            { descripcion: { contains: termino, mode: 'insensitive' as const } },
            { categoriaOriginal: { contains: termino, mode: 'insensitive' as const } },
          ]),
          ...(categorias.length > 0 ? [{ categoriaOriginal: { in: categorias } }] : []),
        ],
      },
      select: { proveedorId: true },
    });
    const proveedoresRelacionados = [...new Set(productosRelacionados.map((producto) => producto.proveedorId))];
    if (proveedoresRelacionados.length === 0) return;

    const cuentas = await tx.usuario.findMany({
      where: {
        estado: 'ACTIVO',
        proveedorId: { in: proveedoresRelacionados },
        proveedor: { estado: 'ACTIVO' },
        roles: { some: { rol: { codigo: 'PROVEEDOR' } } },
      },
      select: { id: true, proveedorId: true },
    });
    if (cuentas.length === 0) return;

    const avisadoEn = new Date();
    const venceEn = new Date(avisadoEn.getTime() + PLAZO_PROVEEDORES_MS);
    const proveedores = [...new Set(cuentas.map((cuenta) => cuenta.proveedorId as string))];
    for (const proveedorId of proveedores) {
      await tx.avisoPrecioProveedor.upsert({
        where: { solicitudId_proveedorId: { solicitudId: datos.solicitudId, proveedorId } },
        create: { solicitudId: datos.solicitudId, proveedorId, avisadoEn, venceEn },
        update: { avisadoEn, venceEn, actualizadoEn: null },
      });
    }

    const productos = (datos.nombresProducto ?? []).filter(Boolean);
    const listaProductos =
      productos.length > 0
        ? ` Productos: ${productos.slice(0, 8).join('; ')}${productos.length > 8 ? '…' : ''}.`
        : '';
    const detalle = `${datos.codigo}${datos.tituloExpediente ? `: ${datos.tituloExpediente}` : ''}. `
      + `Tienes 2 días para actualizar los precios de tu catálogo o confirmar que están al día.${listaProductos}`;
    await tx.notificacion.createMany({
      data: cuentas.map((cuenta) => ({
        usuarioId: cuenta.id,
        solicitudId: datos.solicitudId,
        titulo: 'Actualiza tus precios de referencia',
        detalle: detalle.slice(0, 500),
      })),
    });
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

  avisarColaboracion(
    tx: Prisma.TransactionClient,
    datos: {
      solicitudId: string;
      actorId: string;
      colaboradorId: string;
      codigo: string;
      tituloExpediente?: string | null;
    },
  ) {
    if (datos.actorId === datos.colaboradorId) return Promise.resolve();
    return tx.notificacion.create({
      data: {
        usuarioId: datos.colaboradorId,
        solicitudId: datos.solicitudId,
        titulo: 'Te sumaron a un expediente',
        detalle: `${datos.codigo}${datos.tituloExpediente ? `: ${datos.tituloExpediente}` : ''}. Colaboras en el trámite.`,
      },
      select: { id: true },
    });
  }

  /** Aviso directo al nuevo responsable (p. ej. al asignar desde el jefe). */
  avisarAsignacion(
    tx: Prisma.TransactionClient,
    datos: {
      solicitudId: string;
      actorId: string;
      asignadoId: string;
      codigo: string;
      tituloExpediente?: string | null;
    },
  ) {
    if (datos.actorId === datos.asignadoId) return Promise.resolve();
    return tx.notificacion.create({
      data: {
        usuarioId: datos.asignadoId,
        solicitudId: datos.solicitudId,
        titulo: 'Te asignaron un expediente',
        detalle: `${datos.codigo}${datos.tituloExpediente ? `: ${datos.tituloExpediente}` : ''}. Eres el responsable.`,
      },
      select: { id: true },
    });
  }

  /** Quien hizo la acción no se avisa a sí mismo. */
  avisar(tx: Prisma.TransactionClient, aviso: Aviso) {
    const destinatarios = new Set<string>();
    if (aviso.incluirCreador !== false && aviso.creadaPorId) {
      destinatarios.add(aviso.creadaPorId);
    }
    if (aviso.asignadaAId) destinatarios.add(aviso.asignadaAId);
    for (const id of aviso.destinatariosExtra ?? []) {
      if (id) destinatarios.add(id);
    }
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

const PALABRAS_OMITIDAS = new Set([
  'para', 'con', 'por', 'del', 'las', 'los', 'una', 'unos', 'unas', 'que', 'tipo', 'general',
]);

/** Términos concretos para relacionar un producto solicitado con los catálogos existentes. */
function terminosDeProductos(productos: string[]) {
  const terminos = new Set<string>();
  for (const producto of productos) {
    const nombre = producto.trim();
    if (nombre.length >= 3) terminos.add(nombre);
    for (const palabra of nombre.match(/[\p{L}\p{N}]+/gu) ?? []) {
      if (palabra.length >= 3 && !PALABRAS_OMITIDAS.has(palabra.toLocaleLowerCase('es'))) {
        terminos.add(palabra);
      }
    }
  }
  return [...terminos].slice(0, 24);
}
