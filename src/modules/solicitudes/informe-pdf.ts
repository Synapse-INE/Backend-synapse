import PDFDocument from 'pdfkit';
import type { EstadisticasExpediente } from './estadisticas-precios.js';

type DatosInformePdf = {
  codigo: string;
  tipo: 'INFORME_TECNICO' | 'OFICIO';
  version: number;
  destinatario: string;
  resumen: string;
  estadisticas: EstadisticasExpediente;
};

const moneda = new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' });

function monto(valor: string | null) {
  const numero = Number(String(valor ?? '').split(' y ')[0]);
  return Number.isFinite(numero) ? moneda.format(numero) : '—';
}

function texto(doc: PDFKit.PDFDocument, valor: string) {
  doc.text(valor.replace(/[\r\n]+/g, ' ').trim());
}

function espacio(doc: PDFKit.PDFDocument, alto = 8) {
  if (doc.y > 735 - alto) doc.addPage();
  else doc.moveDown(alto / 12);
}

/** PDF fijo del informe emitido; se almacena junto al expediente. */
export function crearPdfInforme(datos: DatosInformePdf): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 46, info: { Title: `${datos.codigo} · Informe` } });
    const partes: Buffer[] = [];
    doc.on('data', (parte: Buffer) => partes.push(parte));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);

    doc.fillColor('#163b78').fontSize(15).font('Helvetica-Bold').text('INSTITUTO NACIONAL DE ESTADÍSTICA', { align: 'center' });
    doc.fontSize(10).font('Helvetica').text('Dirección de Precios e Índices de Referencia', { align: 'center' });
    doc.moveDown(1).strokeColor('#163b78').moveTo(46, doc.y).lineTo(549, doc.y).stroke();
    doc.moveDown(1);
    doc.fillColor('#172033').fontSize(15).font('Helvetica-Bold').text(datos.tipo === 'OFICIO' ? 'OFICIO' : 'INFORME TÉCNICO');
    doc.fontSize(10).font('Helvetica').text(`Expediente: ${datos.codigo} · Versión ${datos.version}`);
    doc.text(`Destinatario: ${datos.destinatario}`);
    espacio(doc);

    doc.font('Helvetica').fontSize(10);
    for (const parrafo of datos.resumen.split(/\n+/).map((linea) => linea.trim()).filter(Boolean)) {
      texto(doc, parrafo);
      espacio(doc, 7);
    }

    doc.addPage();
    doc.fillColor('#163b78').font('Helvetica-Bold').fontSize(13).text('Estadística y referencias consultadas');
    doc.fillColor('#172033').font('Helvetica').fontSize(9).text('Los valores se calculan con precios comparables en quetzales, excluyendo los marcados como atípicos.');
    espacio(doc, 12);

    for (const medida of datos.estadisticas.productos) {
      if (doc.y > 620) doc.addPage();
      doc.fillColor('#163b78').font('Helvetica-Bold').fontSize(11).text(medida.nombre);
      doc.fillColor('#172033').font('Helvetica').fontSize(9)
        .text(`Comparables: ${medida.incluidos.length} · Media: ${monto(medida.media)} · Mediana: ${monto(medida.mediana)} · Moda: ${medida.moda ? monto(medida.moda) : 'Sin moda'}`);
      espacio(doc, 8);

      const puntos = medida.incluidos;
      const maximo = Math.max(...puntos.map((punto) => Number(punto.precio) || 0), 1);
      for (const punto of puntos) {
        if (doc.y > 730) doc.addPage();
        const y = doc.y;
        const etiqueta = `${punto.fuente}: ${monto(punto.precio)}`;
        doc.fillColor('#172033').fontSize(8).text(etiqueta, 46, y, { width: 190 });
        const ancho = Math.max(2, Math.round(((Number(punto.precio) || 0) / maximo) * 220));
        doc.fillColor('#1f4e8c').rect(245, y + 1, ancho, 11).fill();
        doc.moveDown(1.35);
      }
      if (puntos.length === 0) doc.fillColor('#6b7a90').fontSize(9).text('No hay precios comparables para graficar.');
      doc.fillColor('#172033').fontSize(8).text(medida.interpretacion);
      espacio(doc, 14);
    }

    doc.fontSize(8).fillColor('#4f7a18').text('Documento emitido por el Portal de Precios de Referencia del INE.', { align: 'center' });
    doc.end();
  });
}
