import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedOwnership } from '../../common/auth/auth-context.js';
import { assertResourceOwnership } from '../../common/auth/ownership.js';
import type { Prisma } from '../../infrastructure/database/generated/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import type {
  ActualizarProductoProveedorDto,
  CrearProductoProveedorDto,
} from './proveedores.dto.js';
import {
  fechaDesdeIso,
  fechaIso,
  hoyIso,
  sumarMeses,
} from './fechas-vigencia.js';
import { serializarProducto } from './producto-proveedor.serial.js';

@Injectable()
export class ProveedoresService {
  constructor(private readonly prisma: PrismaService) {}

  private exigirProveedor(actor: AuthenticatedOwnership) {
    if (!actor.proveedorId) {
      throw new ForbiddenException({
        code: 'PROVEEDOR_REQUERIDO',
        detail: 'La cuenta no está ligada a un proveedor.',
      });
    }
    return actor.proveedorId;
  }

  async listarProductos(actor: AuthenticatedOwnership) {
    const proveedorId = this.exigirProveedor(actor);
    const proveedor = await this.prisma.proveedor.findUniqueOrThrow({
      where: { id: proveedorId },
      select: { id: true, nombreComercial: true },
    });
    const filas = await this.prisma.productoProveedor.findMany({
      where: { proveedorId },
      include: { precios: { orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
    return {
      proveedor: {
        id: proveedor.id,
        nombreComercial: proveedor.nombreComercial,
      },
      productos: filas.map(serializarProducto),
    };
  }

  async crearProducto(
    actor: AuthenticatedOwnership,
    dto: CrearProductoProveedorDto,
    usuarioId: string,
  ) {
    const proveedorId = this.exigirProveedor(actor);
    const hoy = hoyIso();
    const codigo = await this.siguienteCodigo(proveedorId);
    const atributos = this.normalizarAtributos(
      dto.atributos ? { ...dto.atributos } : undefined,
    );

    const creado = await this.prisma.$transaction(async (tx) => {
      const producto = await tx.productoProveedor.create({
        data: {
          proveedorId,
          codigoProveedor: codigo,
          nombre: dto.nombre,
          descripcion: dto.descripcion,
          presentacion: dto.presentacion?.trim() || null,
          categoriaOriginal: dto.categoriaOriginal,
          atributos,
          estado: 'PUBLICADO',
        },
        include: { precios: true },
      });
      await tx.precioProveedor.create({
        data: {
          productoProveedorId: producto.id,
          monto: dto.monto,
          moneda: 'GTQ',
          fechaPrecio: fechaDesdeIso(hoy),
          vigenciaHasta: fechaDesdeIso(sumarMeses(hoy)),
          registradoPorId: usuarioId,
        },
      });
      await this.marcarAvisosAlDia(tx, proveedorId);
      return tx.productoProveedor.findUniqueOrThrow({
        where: { id: producto.id },
        include: { precios: { orderBy: { createdAt: 'asc' } } },
      });
    });

    return serializarProducto(creado);
  }

  async actualizarProducto(
    actor: AuthenticatedOwnership,
    productoId: string,
    dto: ActualizarProductoProveedorDto,
    usuarioId: string,
  ) {
    this.exigirProveedor(actor);
    const existente = await this.prisma.productoProveedor.findUnique({
      where: { id: productoId },
      include: { precios: { orderBy: { createdAt: 'asc' } } },
    });
    if (!existente) {
      throw new NotFoundException({
        code: 'PRODUCTO_NO_ENCONTRADO',
        detail: 'El producto no existe.',
      });
    }
    assertResourceOwnership(actor, { proveedorId: existente.proveedorId }, 'proveedor');

    const ultimo = existente.precios.at(-1);
    const hayCambioPrecio =
      dto.monto !== undefined &&
      (!ultimo || Number(ultimo.monto) !== Number(dto.monto));

    const actualizado = await this.prisma.$transaction(async (tx) => {
      await tx.productoProveedor.update({
        where: { id: productoId },
        data: {
          ...(dto.nombre !== undefined ? { nombre: dto.nombre } : {}),
          ...(dto.descripcion !== undefined ? { descripcion: dto.descripcion } : {}),
          ...(dto.presentacion !== undefined
            ? { presentacion: dto.presentacion.trim() || null }
            : {}),
          ...(dto.categoriaOriginal !== undefined
            ? { categoriaOriginal: dto.categoriaOriginal }
            : {}),
          ...(dto.atributos !== undefined
            ? { atributos: this.normalizarAtributos(dto.atributos) }
            : {}),
          ...(existente.estado === 'BORRADOR' ? { estado: 'PUBLICADO' } : {}),
        },
      });
      if (hayCambioPrecio) {
        const hoy = hoyIso();
        await tx.precioProveedor.create({
          data: {
            productoProveedorId: productoId,
            monto: dto.monto!,
            moneda: 'GTQ',
            fechaPrecio: fechaDesdeIso(hoy),
            vigenciaHasta: fechaDesdeIso(sumarMeses(hoy)),
            registradoPorId: usuarioId,
          },
        });
        await this.marcarAvisosAlDia(tx, proveedorId);
      }
      return tx.productoProveedor.findUniqueOrThrow({
        where: { id: productoId },
        include: { precios: { orderBy: { createdAt: 'asc' } } },
      });
    });

    return serializarProducto(actualizado);
  }

  async confirmarPrecio(
    actor: AuthenticatedOwnership,
    productoId: string,
    usuarioId: string,
  ) {
    this.exigirProveedor(actor);
    const existente = await this.prisma.productoProveedor.findUnique({
      where: { id: productoId },
      include: { precios: { orderBy: { createdAt: 'asc' } } },
    });
    if (!existente) {
      throw new NotFoundException({
        code: 'PRODUCTO_NO_ENCONTRADO',
        detail: 'El producto no existe.',
      });
    }
    assertResourceOwnership(actor, { proveedorId: existente.proveedorId }, 'proveedor');

    const ultimo = existente.precios.at(-1);
    if (!ultimo) {
      throw new BadRequestException({
        code: 'PRECIO_REQUERIDO',
        detail: 'El producto no tiene un precio que confirmar.',
      });
    }
    const vigencia = fechaIso(ultimo.vigenciaHasta);
    const hoy = hoyIso();
    if (vigencia && vigencia >= hoy) {
      throw new BadRequestException({
        code: 'PRECIO_VIGENTE',
        detail: 'El precio actual todavía está dentro de su vigencia.',
      });
    }

    const actualizado = await this.prisma.$transaction(async (tx) => {
      await tx.precioProveedor.create({
        data: {
          productoProveedorId: productoId,
          monto: ultimo.monto,
          moneda: ultimo.moneda,
          fechaPrecio: fechaDesdeIso(hoy),
          vigenciaHasta: fechaDesdeIso(sumarMeses(hoy)),
          registradoPorId: usuarioId,
        },
      });
      await this.marcarAvisosAlDia(tx, proveedorId);
      return tx.productoProveedor.findUniqueOrThrow({
        where: { id: productoId },
        include: { precios: { orderBy: { createdAt: 'asc' } } },
      });
    });

    return serializarProducto(actualizado);
  }

  async listarAvisosPrecio(actor: AuthenticatedOwnership) {
    const proveedorId = this.exigirProveedor(actor);
    const avisos = await this.prisma.avisoPrecioProveedor.findMany({
      where: { proveedorId, actualizadoEn: null, venceEn: { gt: new Date() } },
      orderBy: { venceEn: 'asc' },
      select: {
        id: true,
        avisadoEn: true,
        venceEn: true,
        solicitud: {
          select: {
            codigo: true,
            titulo: true,
            productos: { orderBy: { numero: 'asc' }, select: { nombre: true } },
          },
        },
      },
    });
    return {
      avisos: avisos.map((aviso) => ({
        id: aviso.id,
        avisadoEn: aviso.avisadoEn,
        venceEn: aviso.venceEn,
        codigo: aviso.solicitud.codigo,
        titulo: aviso.solicitud.titulo,
        productos: aviso.solicitud.productos.map((producto) => producto.nombre),
      })),
    };
  }

  async confirmarAvisoPrecio(actor: AuthenticatedOwnership, avisoId: string) {
    const proveedorId = this.exigirProveedor(actor);
    const aviso = await this.prisma.avisoPrecioProveedor.findUnique({
      where: { id: avisoId },
      select: { id: true, proveedorId: true, actualizadoEn: true },
    });
    if (!aviso || aviso.proveedorId !== proveedorId) {
      throw new NotFoundException({
        code: 'AVISO_NO_ENCONTRADO',
        detail: 'El aviso no existe.',
      });
    }
    if (!aviso.actualizadoEn) {
      await this.prisma.avisoPrecioProveedor.update({
        where: { id: avisoId },
        data: { actualizadoEn: new Date() },
      });
    }
    return this.listarAvisosPrecio(actor);
  }

  private marcarAvisosAlDia(tx: Prisma.TransactionClient, proveedorId: string) {
    return tx.avisoPrecioProveedor.updateMany({
      where: { proveedorId, actualizadoEn: null },
      data: { actualizadoEn: new Date() },
    });
  }

  private normalizarAtributos(
    entrada?: Record<string, string | undefined> | null,
  ): Record<string, string> | undefined {
    if (!entrada) return undefined;
    const limpio: Record<string, string> = {};
    for (const [clave, valor] of Object.entries(entrada)) {
      const texto = typeof valor === 'string' ? valor.trim() : '';
      if (texto) limpio[clave] = texto;
    }
    return Object.keys(limpio).length ? limpio : undefined;
  }

  private async siguienteCodigo(proveedorId: string): Promise<string> {
    const existentes = await this.prisma.productoProveedor.findMany({
      where: { proveedorId },
      select: { codigoProveedor: true },
    });
    let maximo = 0;
    for (const fila of existentes) {
      const coincidencia = fila.codigoProveedor?.match(/(\d+)\s*$/);
      if (coincidencia) {
        maximo = Math.max(maximo, Number(coincidencia[1]));
      }
    }
    return `PD-${String(maximo + 1).padStart(4, '0')}`;
  }
}