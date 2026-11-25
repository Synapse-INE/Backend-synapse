export type ProductoBorrador = {
  numero: number;
  nombre: string;
  unidadMedida: string | null;
  cantidad: string | null;
  precioAdoptado: string | null;
  moneda: string | null;
};

/** Texto de trabajo armado con lo ya guardado. No es una plantilla oficial. */
export function borradorInforme(datos: {
  tipo: 'INFORME_TECNICO' | 'OFICIO';
  codigo: string;
  titulo: string;
  institucion: string;
  destinatario: string;
  productos: ProductoBorrador[];
  consultas: number;
}) {
  const tituloDoc = datos.tipo === 'OFICIO' ? 'oficio' : 'informe técnico';
  const productos = datos.productos.map((producto) => {
    const precio = producto.precioAdoptado
      ? `${producto.moneda ?? 'GTQ'} ${producto.precioAdoptado} por ${producto.unidadMedida ?? 'unidad'}`
      : 'pendiente de confirmación del analista';
    const cantidad = producto.cantidad ?? 'sin registrar';
    const unidad = producto.unidadMedida ?? '';
    return `${producto.numero}. ${producto.nombre} — cantidad ${cantidad} ${unidad} — precio de referencia: ${precio}`.trim();
  });

  return [
    `Borrador de ${tituloDoc}. No es la plantilla oficial del INE; una persona debe revisarlo antes de emitirlo.`,
    `Expediente ${datos.codigo}. ${datos.titulo}.`,
    `Entidad solicitante: ${datos.institucion}.`,
    `Destinatario indicado: ${datos.destinatario}.`,
    `Consultas de mercado registradas: ${datos.consultas}.`,
    'Precios de referencia que el analista dejó confirmados:',
    ...(productos.length > 0 ? productos : ['No hay productos en el expediente.']),
  ].join('\n');
}
