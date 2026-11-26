export function correoRestablecimiento(datos: {
  nombre: string;
  enlace: string;
  horas: number;
  tipo?: 'ACTIVACION' | 'RESTABLECIMIENTO';
}) {
  const activacion = datos.tipo === 'ACTIVACION';
  const titulo = activacion ? 'Activa tu cuenta' : 'Restablece tu contraseña';
  const intro = activacion
    ? 'Un administrador creó tu cuenta en el Portal de Precios de Referencia. Elige tu contraseña con este enlace de un solo uso'
    : 'Recibimos una solicitud para restablecer tu contraseña. El enlace es de un solo uso';
  const nombre = datos.nombre.replace(/[\r\n]/g, ' ').trim();
  const text = [
    `Hola ${nombre},`,
    '',
    `${intro} y vence en ${datos.horas} hora(s):`,
    datos.enlace,
    '',
    activacion
      ? 'Si no esperabas este mensaje, ignóralo.'
      : 'Si no fuiste tú, ignora este mensaje: tu contraseña no cambia.',
  ].join('\n');

  const html = `<!DOCTYPE html>
<html lang="es">
  <body style="margin:0;padding:24px 12px;background:#f3f6fb;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#172033;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:18px;padding:28px 32px;">
      <p style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#EF7916;">Instituto Nacional de Estadística</p>
      <h1 style="margin:0 0 16px;font-size:26px;color:#163b78;">${titulo}</h1>
      <p style="margin:0 0 12px;">Hola ${escaparHtml(nombre)},</p>
      <p style="margin:0 0 20px;">${intro} y vence en ${datos.horas} hora(s).</p>
      <p style="margin:0 0 22px;"><a href="${escaparHtml(datos.enlace)}" style="display:inline-block;padding:14px 26px;background:#EF7916;color:#ffffff;font-weight:700;text-decoration:none;border-radius:10px;">${activacion ? 'Elegir mi contraseña' : 'Elegir nueva contraseña'}</a></p>
      <p style="margin:0;font-size:13px;color:#5b6577;">${activacion ? 'Si no esperabas este mensaje, ignóralo.' : 'Si no fuiste tú, ignora este mensaje: tu contraseña no cambia.'}</p>
    </div>
  </body>
</html>`;

  return { text, html };
}

function escaparHtml(valor: string) {
  return valor
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
