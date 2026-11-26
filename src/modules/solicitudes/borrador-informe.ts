import { textoEstadisticas, type EstadisticasExpediente } from './estadisticas-precios.js';

export type ProductoBorrador = {
  numero: number;
  nombre: string;
  unidadMedida: string | null;
  cantidad: string | null;
  precioAdoptado: string | null;
  moneda: string | null;
};

/** Un solo documento con el informe técnico y el oficio. El analista puede corregir el texto antes de emitirlo. */
export function borradorInforme(datos: {
  codigo: string;
  titulo: string;
  institucion: string;
  destinatario: string;
  elaboradoPor: string;
  fecha: string;
  productos: ProductoBorrador[];
  estadisticas: EstadisticasExpediente;
}) {
  const productos = datos.productos.map((producto) => {
    const precio = producto.precioAdoptado
      ? `${producto.moneda ?? 'GTQ'} ${producto.precioAdoptado} por ${producto.unidadMedida ?? 'unidad'}`
      : 'pendiente de confirmación del analista';
    const cantidad = producto.cantidad ?? 'sin registrar';
    const unidad = producto.unidadMedida ?? '';
    return `${producto.numero}. ${producto.nombre} — cantidad ${cantidad} ${unidad} — precio de referencia: ${precio}`.trim();
  });

  return [
    'Instituto Nacional de Estadística',
    'Dirección de Precios e Índices de Referencia',
    `Documento del expediente ${datos.codigo}. ${datos.titulo}.`,
    `Entidad solicitante: ${datos.institucion}.`,
    `Elaborado por: ${datos.elaboradoPor}.`,
    `Fecha: ${datos.fecha}.`,
    `Destinatario: ${datos.destinatario}.`,
    'Informe técnico',
    'Precios de referencia que el analista dejó confirmados:',
    ...(productos.length > 0 ? productos : ['No hay productos en el expediente.']),
    'Estadística de los precios comparables',
    textoEstadisticas(datos.estadisticas),
    'Oficio',
    `Se traslada a ${datos.destinatario} el resultado del expediente ${datos.codigo}, conforme a los precios de referencia confirmados en el informe técnico de este mismo documento.`,
  ].join('\n');
}
