import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { SEGURIDAD_CSRF, SEGURIDAD_SESION } from './decoradores.js';

export function setupSwagger(
  app: INestApplication,
  sessionCookieName: string,
  csrfHeaderName = 'x-csrf-token',
) {
  const options = new DocumentBuilder()
    .setTitle('Portal de Precios de Referencia API')
    .setDescription(
      [
        'Documenta los endpoints implementados: salud, autenticación, registro e invitaciones, revisión de solicitantes, solicitudes S.00, fuentes de consulta, catálogo interno, avisos y personal del INE.',
        '',
        '**Sesión:** el inicio de sesión entrega una cookie `HttpOnly`; el cliente debe enviar las peticiones con credenciales.',
        '**CSRF:** toda petición que modifica datos debe enviar el encabezado `x-csrf-token` con el valor devuelto por `iniciar-sesion` o `GET /auth/csrf`.',
        '**Errores:** siempre `application/problem+json` (RFC 7807) con un `code` estable.',
        '**Formatos:** importes y cantidades como cadena decimal; fechas `YYYY-MM-DD`; marcas de tiempo ISO 8601.',
        '',
        'Pendientes (no documentados porque no existen): formularios S.11, S.21 y S.22 y consulta de auditoría. Los avisos informan lo ya ocurrido; no hay recordatorios por vencimiento. La media, la mediana y la moda se calculan con los precios comparables de las boletas. Los PDF del expediente se adjuntan en la solicitud.',
      ].join('\n'),
    )
    .setVersion('0.2.0')
    .addCookieAuth(
      sessionCookieName,
      { type: 'apiKey', in: 'cookie' },
      SEGURIDAD_SESION,
    )
    .addApiKey(
      {
        type: 'apiKey',
        in: 'header',
        name: csrfHeaderName,
        description: 'Token CSRF de la sesión actual.',
      },
      SEGURIDAD_CSRF,
    )
    .build();
  const document = SwaggerModule.createDocument(app, options);

  SwaggerModule.setup('docs', app, document, {
    useGlobalPrefix: true,
    jsonDocumentUrl: 'openapi.json',
    customSiteTitle: 'Portal de Precios de Referencia API',
  });
}
