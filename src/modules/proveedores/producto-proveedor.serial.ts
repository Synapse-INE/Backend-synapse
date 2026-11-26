import type { Prisma } from '../../infrastructure/database/generated/client.js';
import { fechaIso } from './fechas-vigencia.js';

export type ProductoConPrecios = Prisma.ProductoProveedorGetPayload<{
  include: { precios: { orderBy: { createdAt: 'asc' } } };
}>;

export function serializarProducto(fila: ProductoConPrecios) {
  return {
    id: fila.id,
    proveedorId: fila.proveedorId,
    codigoProveedor: fila.codigoProveedor,
    nombre: fila.nombre,
    descripcion: fila.descripcion,
    presentacion: fila.presentacion,
    categoriaOriginal: fila.categoriaOriginal,
    atributos: (fila.atributos as Record<string, string> | null) ?? {},
    estado: fila.estado,
    createdAt: fechaIso(fila.createdAt),
    precios: fila.precios.map((precio) => ({
      id: precio.id,
      monto: Number(precio.monto),
      moneda: precio.moneda,
      fechaPrecio: fechaIso(precio.fechaPrecio),
      vigenciaHasta: fechaIso(precio.vigenciaHasta),
      registradoPorId: precio.registradoPorId,
    })),
  };
}