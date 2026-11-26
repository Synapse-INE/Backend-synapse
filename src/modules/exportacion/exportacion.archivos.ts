import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import {
  celdaSegura,
  COLUMNAS,
  type FilaExportada,
} from './exportacion.filas.js';

export interface MetaExportacion {
  generadoEn: string;
  total: number;
  filtros: Array<[string, string]>;
}

const AVISO =
  'Precios de referencia históricos del catálogo del INE. No sustituyen un expediente de precios ni constituyen un resultado oficial.';

// ------------------------------------------------------------------ Excel

export async function generarExcel(
  filas: FilaExportada[],
  meta: MetaExportacion,
): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'Portal de Precios de Referencia';
  libro.created = new Date();

  const hoja = libro.addWorksheet('Precios', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  hoja.columns = COLUMNAS.map((columna) => ({
    header: columna.titulo,
    key: columna.clave,
    width: columna.ancho,
  }));
  const encabezado = hoja.getRow(1);
  encabezado.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  encabezado.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF2153A1' },
  };
  encabezado.alignment = { vertical: 'middle', wrapText: true };

  for (const fila of filas) {
    hoja.addRow({
      nog: celdaSegura(fila.nog),
      correlativo: celdaSegura(fila.correlativo),
      evento: celdaSegura(fila.evento),
      modalidad: celdaSegura(fila.modalidad),
      categoria: celdaSegura(fila.categoria),
      producto: celdaSegura(fila.producto),
      caracteristicas: celdaSegura(fila.caracteristicas),
      presentacion: celdaSegura(fila.presentacion),
      // Número real para poder ordenar y sumar; tres decimales como en el libro.
      precioReferencia: fila.precioReferencia === null ? null : Number(fila.precioReferencia),
      moneda: fila.moneda,
      fechaPublicacion: fila.fechaPublicacion
        ? new Date(`${fila.fechaPublicacion}T00:00:00.000Z`)
        : null,
      vigenciaHasta: fila.vigenciaHasta ? new Date(`${fila.vigenciaHasta}T00:00:00.000Z`) : null,
      vigente: fila.vigente ? 'Sí' : 'No',
    });
  }
  hoja.getColumn('precioReferencia').numFmt = '#,##0.000';
  hoja.getColumn('fechaPublicacion').numFmt = 'dd/mm/yyyy';
  hoja.getColumn('vigenciaHasta').numFmt = 'dd/mm/yyyy';
  hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNAS.length } };

  const info = libro.addWorksheet('Información');
  info.columns = [
    { key: 'campo', width: 28 },
    { key: 'valor', width: 90 },
  ];
  info.addRow(['Reporte', 'Precios de referencia del INE']).font = { bold: true };
  info.addRow(['Generado el', meta.generadoEn]);
  info.addRow(['Filas exportadas', meta.total]);
  for (const [campo, valor] of meta.filtros) info.addRow([campo, celdaSegura(valor)]);
  if (meta.filtros.length === 0) info.addRow(['Filtros', 'Ninguno (todo el catálogo con precio)']);
  info.addRow(['Aviso', AVISO]);

  return Buffer.from(await libro.xlsx.writeBuffer());
}

// -------------------------------------------------------------------- PDF

const MARGEN = 30;
const ANCHOS = { nog: 62, producto: 320, categoria: 110, presentacion: 86, precio: 70, publicado: 52, vigente: 52 };
const PAD = 4;

const recortar = (texto: string | null, maximo: number) => {
  if (!texto) return '';
  return texto.length > maximo ? `${texto.slice(0, maximo - 1)}…` : texto;
};

function fechaCorta(iso: string | null) {
  if (!iso) return '';
  const [anio, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${anio}`;
}

export function generarPdf(filas: FilaExportada[], meta: MetaExportacion): Promise<Buffer> {
  return new Promise((resolver, rechazar) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: MARGEN,
      bufferPages: true,
      info: {
        Title: 'Precios de referencia del INE',
        Author: 'Portal de Precios de Referencia',
      },
    });
    const partes: Buffer[] = [];
    doc.on('data', (parte: Buffer) => partes.push(parte));
    doc.on('end', () => resolver(Buffer.concat(partes)));
    doc.on('error', rechazar);

    const ancho = doc.page.width - MARGEN * 2;
    const fondo = () => doc.page.height - MARGEN - 18;

    const columnas = [
      { titulo: 'NOG', ancho: ANCHOS.nog, alinear: 'left' as const },
      { titulo: 'Producto y características', ancho: ANCHOS.producto, alinear: 'left' as const },
      { titulo: 'Categoría', ancho: ANCHOS.categoria, alinear: 'left' as const },
      { titulo: 'Presentación', ancho: ANCHOS.presentacion, alinear: 'left' as const },
      { titulo: 'Precio', ancho: ANCHOS.precio, alinear: 'right' as const },
      { titulo: 'Publicado', ancho: ANCHOS.publicado, alinear: 'left' as const },
      { titulo: 'Vigente hasta', ancho: ANCHOS.vigente, alinear: 'left' as const },
    ];

    const encabezado = () => {
      const y = doc.y;
      doc.rect(MARGEN, y, ancho, 18).fill('#2153A1');
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8);
      let x = MARGEN;
      for (const columna of columnas) {
        doc.text(columna.titulo, x + PAD, y + 5, {
          width: columna.ancho - PAD * 2,
          align: columna.alinear,
          lineBreak: false,
        });
        x += columna.ancho;
      }
      doc.y = y + 20;
      doc.fillColor('#172033').font('Helvetica').fontSize(7.5);
    };

    // Portada del reporte
    doc.font('Helvetica-Bold').fontSize(16).fillColor('#163b78').text('Precios de referencia del INE');
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(8.5).fillColor('#5b6577');
    doc.text(`Generado el ${meta.generadoEn}  ·  ${meta.total} fila(s)`);
    if (meta.filtros.length > 0) {
      doc.text(`Filtros: ${meta.filtros.map(([campo, valor]) => `${campo}: ${valor}`).join('  ·  ')}`);
    }
    doc.text(AVISO);
    doc.moveDown(0.6);
    encabezado();

    let par = false;
    for (const fila of filas) {
      const producto = recortar(fila.producto, 220);
      const caracteristicas = recortar(fila.caracteristicas, 260);
      const precio = fila.precioReferencia ? `${fila.moneda} ${fila.precioReferencia}` : '';
      const celdas = [
        recortar(fila.nog, 30),
        '',
        recortar(fila.categoria, 90),
        recortar(fila.presentacion, 60),
        precio,
        fechaCorta(fila.fechaPublicacion),
        fechaCorta(fila.vigenciaHasta),
      ];

      doc.font('Helvetica-Bold').fontSize(7.5);
      const altoProducto = doc.heightOfString(producto, { width: ANCHOS.producto - PAD * 2 });
      doc.font('Helvetica').fontSize(7);
      const altoCaract = caracteristicas
        ? doc.heightOfString(caracteristicas, { width: ANCHOS.producto - PAD * 2 })
        : 0;
      doc.fontSize(7.5);
      const altos = [
        altoProducto + altoCaract,
        ...columnas.map((columna, indice) =>
          indice === 1 ? 0 : doc.heightOfString(celdas[indice], { width: columna.ancho - PAD * 2 }),
        ),
      ];
      const alto = Math.max(...altos) + PAD * 2;

      if (doc.y + alto > fondo()) {
        doc.addPage();
        encabezado();
      }

      const y = doc.y;
      if (par) doc.rect(MARGEN, y, ancho, alto).fill('#F3F6FB');
      par = !par;
      doc.fillColor('#172033');

      let x = MARGEN;
      columnas.forEach((columna, indice) => {
        if (indice === 1) {
          doc.font('Helvetica-Bold').fontSize(7.5).text(producto, x + PAD, y + PAD, {
            width: columna.ancho - PAD * 2,
          });
          if (caracteristicas) {
            doc.font('Helvetica').fontSize(7).fillColor('#5b6577').text(caracteristicas, x + PAD, y + PAD + altoProducto, {
              width: columna.ancho - PAD * 2,
            });
            doc.fillColor('#172033');
          }
        } else {
          doc.font('Helvetica').fontSize(7.5).text(celdas[indice], x + PAD, y + PAD, {
            width: columna.ancho - PAD * 2,
            align: columna.alinear,
          });
        }
        x += columna.ancho;
      });
      doc.y = y + alto;
    }

    if (filas.length === 0) {
      doc.moveDown().font('Helvetica-Oblique').text('Ningún precio coincide con los filtros.');
    }

    // Pie con el número de página en todas las páginas.
    const paginas = doc.bufferedPageRange();
    for (let indice = 0; indice < paginas.count; indice += 1) {
      doc.switchToPage(paginas.start + indice);
      doc.page.margins.bottom = 0;
      doc.font('Helvetica').fontSize(7).fillColor('#5b6577').text(
        `Página ${indice + 1} de ${paginas.count}`,
        MARGEN,
        doc.page.height - MARGEN,
        { width: ancho, align: 'right', lineBreak: false },
      );
    }
    doc.end();
  });
}
