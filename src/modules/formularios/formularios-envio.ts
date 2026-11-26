import type { Prisma } from '../../infrastructure/database/generated/client.js';

/** Mínimo de empresas o cotizaciones por producto (decisión del INE asumida: por producto). */
export const MINIMO_POR_PRODUCTO = 3;

export interface ErrorEnvio {
  field: string;
  message: string;
}

export interface DatosFormularios {
  modalidad: string | null;
  productos: Array<{ id: string; numero: number }>;
  /** Empresas propuestas (no descartadas) por producto. */
  propuestasPorProducto: Map<string, number>;
  /** Cotizaciones de importación por producto. */
  cotizacionesPorProducto: Map<string, number>;
  representantes: Set<string>;
  justificaciones: Array<{ tipo: string; productoSolicitudId: string | null }>;
}

/** Reglas por modalidad que se comprueban al enviar. Función pura, sin acceso a datos. */
export function evaluarFormularios(datos: DatosFormularios): ErrorEnvio[] {
  const errores: ErrorEnvio[] = [];

  if (datos.modalidad === 'SUBASTA_ELECTRONICA_INVERSA') {
    for (const producto of datos.productos) {
      const propuestas = datos.propuestasPorProducto.get(producto.id) ?? 0;
      if (propuestas < MINIMO_POR_PRODUCTO) {
        errores.push({
          field: `productos[${producto.numero}].proveedoresPropuestos`,
          message: `Propón al menos ${MINIMO_POR_PRODUCTO} empresas por producto (hay ${propuestas})`,
        });
      }
    }
  }

  if (datos.modalidad === 'BIENES_SUMINISTROS_IMPORTADOS') {
    for (const tipo of ['TITULAR', 'SUPLENTE']) {
      if (!datos.representantes.has(tipo)) {
        errores.push({
          field: `representantes.${tipo.toLowerCase()}`,
          message: `Falta el representante ${tipo.toLowerCase()} de la comisión`,
        });
      }
    }
    for (const producto of datos.productos) {
      const cotizaciones = datos.cotizacionesPorProducto.get(producto.id) ?? 0;
      const justificado = datos.justificaciones.some(
        (justificacion) =>
          justificacion.tipo === 'COTIZACIONES_INSUFICIENTES' &&
          (justificacion.productoSolicitudId === null ||
            justificacion.productoSolicitudId === producto.id),
      );
      if (cotizaciones < MINIMO_POR_PRODUCTO && !justificado) {
        errores.push({
          field: `productos[${producto.numero}].cotizaciones`,
          message: `Registra al menos ${MINIMO_POR_PRODUCTO} cotizaciones o justifica por qué no es posible (hay ${cotizaciones})`,
        });
      }
    }
  }

  return errores;
}

/** Carga lo necesario y aplica las reglas anteriores dentro de la transacción de envío. */
export async function validarFormulariosParaEnvio(
  tx: Prisma.TransactionClient,
  solicitudId: string,
  modalidad: string | null,
): Promise<ErrorEnvio[]> {
  if (
    modalidad !== 'SUBASTA_ELECTRONICA_INVERSA' &&
    modalidad !== 'BIENES_SUMINISTROS_IMPORTADOS'
  ) {
    return [];
  }

  const [productos, propuestas, cotizaciones, representantes, justificaciones] =
    await Promise.all([
      tx.productoSolicitud.findMany({
        where: { solicitudId },
        select: { id: true, numero: true },
        orderBy: { numero: 'asc' },
      }),
      tx.proveedorSolicitudProducto.groupBy({
        by: ['productoSolicitudId'],
        where: {
          proveedorSolicitud: { solicitudId, estado: { not: 'DESCARTADO' } },
        },
        _count: { _all: true },
      }),
      tx.cotizacionProducto.groupBy({
        by: ['productoSolicitudId'],
        where: { cotizacion: { comision: { solicitudId } } },
        _count: { _all: true },
      }),
      tx.representanteSolicitante.findMany({
        where: { comision: { solicitudId } },
        select: { tipo: true },
      }),
      tx.justificacionSolicitud.findMany({
        where: { solicitudId },
        select: { tipo: true, productoSolicitudId: true },
      }),
    ]);

  return evaluarFormularios({
    modalidad,
    productos,
    propuestasPorProducto: new Map(
      propuestas.map((fila) => [fila.productoSolicitudId, fila._count._all]),
    ),
    cotizacionesPorProducto: new Map(
      cotizaciones.map((fila) => [fila.productoSolicitudId, fila._count._all]),
    ),
    representantes: new Set(representantes.map((fila) => fila.tipo)),
    justificaciones,
  });
}
