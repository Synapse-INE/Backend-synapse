export function correoInvitacion(datos: {
  enlace: string;
  horas: number;
  empresa?: string;
}) {
  const horas = datos.horas;
  const enlace = datos.enlace;
  const empresa = datos.empresa?.replace(/[\r\n]/g, ' ').trim();
  const empresaHtml = empresa ? escaparHtml(empresa) : '';
  const enlaceHtml = escaparHtml(enlace);

  const saludo = empresa
    ? `El INE te invita a crear la cuenta de proveedor de ${empresa}.`
  : 'El INE te invita a crear una cuenta de proveedor en el portal.';

  const text = [
    saludo,
    '',
    `Usa este enlace de un solo uso (vence en ${horas} horas):`,
    enlace,
    '',
    'Allí defines tu nombre y contraseña para ingresar como proveedor.',
    'Si no esperabas esta invitación, ignora este mensaje.',
  ].join('\n');

  const html = `<!DOCTYPE html>
<html lang="es">
  <body style="margin:0;padding:0;background:#f3f6fb;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
      Invitación al portal como proveedor. El enlace vence en ${horas} horas.
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f6fb;padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden;">
            <tr>
              <td style="height:6px;background:#2153A1;font-size:0;line-height:0;">&nbsp;</td>
              <td style="height:6px;width:28%;background:#EF7916;font-size:0;line-height:0;">&nbsp;</td>
            </tr>
            <tr>
              <td colspan="2" style="padding:28px 32px 0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
                <p style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#EF7916;">Instituto Nacional de Estadística</p>
                <h1 style="margin:0;font-size:28px;line-height:1.2;font-weight:650;color:#163b78;">Invitación de proveedor</h1>
              </td>
            </tr>
            <tr>
              <td colspan="2" style="padding:16px 32px 8px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.55;color:#172033;">
                ${
                  empresaHtml
                    ? `<p style="margin:0 0 12px;">Te invitamos a registrar la cuenta de <strong>${empresaHtml}</strong> en el Portal de Precios de Referencia.</p>`
                    : '<p style="margin:0 0 12px;">Te invitamos a crear tu cuenta de proveedor en el Portal de Precios de Referencia.</p>'
                }
                <p style="margin:0 0 20px;">El enlace es de un solo uso y vence en ${horas} horas. Allí defines tu nombre y contraseña para ingresar.</p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">
                  <tr>
                    <td align="center" bgcolor="#EF7916" style="border-radius:10px;">
                      <a href="${enlaceHtml}" style="display:inline-block;padding:14px 26px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;">Completar registro</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 8px;font-size:14px;color:#5b6778;">Si el botón no abre, copia esta dirección en el navegador:</p>
                <p style="margin:0 0 18px;font-size:13px;line-height:1.45;word-break:break-all;"><a href="${enlaceHtml}" style="color:#2153A1;">${enlaceHtml}</a></p>
                <p style="margin:0;font-size:14px;color:#5b6778;">Si no esperabas esta invitación, ignora este mensaje.</p>
              </td>
            </tr>
            <tr>
              <td colspan="2" style="padding:16px 32px;background:#163b78;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.45;color:#d6e2f5;">
                Dirección de Precios e Índices de Referencia · Instituto Nacional de Estadística
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
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