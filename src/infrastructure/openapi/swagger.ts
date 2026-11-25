import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function setupSwagger(app: INestApplication, sessionCookieName: string) {
  const options = new DocumentBuilder()
    .setTitle('Portal de Precios de Referencia API')
    .setDescription(
      'Documenta únicamente los endpoints implementados. Los flujos de formularios y solicitudes aún no están disponibles.',
    )
    .setVersion('0.1.0')
    .addCookieAuth(
      sessionCookieName,
      { type: 'apiKey', in: 'cookie' },
      'session-cookie',
    )
    .build();
  const document = SwaggerModule.createDocument(app, options);

  SwaggerModule.setup('docs', app, document, {
    useGlobalPrefix: true,
    jsonDocumentUrl: 'openapi.json',
    customSiteTitle: 'Portal de Precios de Referencia API',
  });
}
