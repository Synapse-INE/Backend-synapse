function escaparHtml(valor: string) {
  return valor
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function correoInformeEmitido(datos: {
  nombre: string;
  codigo: string;
  tipo: 'INFORME_TECNICO' | 'OFICIO';
  resumen: string;
  enlace: string;
}) {
  const tipo = datos.tipo === 'OFICIO' ? 'oficio' : 'informe técnico';
  const nombre = datos.nombre.replace(/[\r\n]/g, ' ').trim();
  const resumen = datos.resumen.trim();
  const text = [
    `Hola ${nombre},`,
    '',
    `El INE emitió el ${tipo} del expediente ${datos.codigo}.`,
    '',
    resumen,
    '',
    `Consulta el expediente en: ${datos.enlace}`,
  ].join('\n');
  const html = `<!DOCTYPE html>
<html lang="es"><body style="margin:0;padding:24px 12px;background:#f3f6fb;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#172033;">
  <div style="max-width:680px;margin:0 auto;background:#ffffff;border-radius:18px;padding:28px 32px;">
    <p style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#EF7916;">Instituto Nacional de Estadística</p>
    <h1 style="margin:0 0 16px;font-size:26px;color:#163b78;">Documento emitido</h1>
    <p style="margin:0 0 12px;">Hola ${escaparHtml(nombre)},</p>
    <p style="margin:0 0 18px;">El INE emitió el ${escaparHtml(tipo)} del expediente <b>${escaparHtml(datos.codigo)}</b>.</p>
    <pre style="white-space:pre-wrap;margin:0 0 22px;padding:16px;background:#f6f8fc;border-radius:10px;font:14px/1.55 Segoe UI,Roboto,Helvetica,Arial,sans-serif;">${escaparHtml(resumen)}</pre>
    <p style="margin:0;"><a href="${escaparHtml(datos.enlace)}" style="display:inline-block;padding:14px 26px;background:#163b78;color:#ffffff;font-weight:700;text-decoration:none;border-radius:10px;">Ver mi expediente</a></p>
  </div>
</body></html>`;
  return { text, html };
}
