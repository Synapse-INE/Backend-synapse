import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/infrastructure/database/prisma.service.js';
import {
  SEGURIDAD_CSRF,
  SEGURIDAD_SESION,
} from '../src/infrastructure/openapi/decoradores.js';

type Operacion = {
  tags?: string[];
  security?: Array<Record<string, string[]>>;
  responses: Record<string, unknown>;
};

describe('Documento OpenAPI', () => {
  let app: INestApplication;
  let paths: Record<string, Record<string, Operacion>>;

  beforeAll(async () => {
    process.env.DATABASE_URL ??=
      'postgresql://precios:precios@localhost:5432/precios';
    const { AppModule } = await import('../src/app.module.js');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    paths = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    ).paths as never;
  });

  afterAll(async () => {
    await app.close();
  });

  const esperados: Array<[string, string, { sesion: boolean; csrf: boolean }]> = [
    ['get', '/api/v1/salud', { sesion: false, csrf: false }],
    ['post', '/api/v1/auth/iniciar-sesion', { sesion: false, csrf: false }],
    ['get', '/api/v1/auth/yo', { sesion: true, csrf: false }],
    ['get', '/api/v1/auth/csrf', { sesion: true, csrf: false }],
    ['post', '/api/v1/auth/cerrar-sesion', { sesion: true, csrf: false }],
    ['post', '/api/v1/auth/registro-solicitante', { sesion: false, csrf: false }],
    ['post', '/api/v1/auth/verificar-correo', { sesion: false, csrf: false }],
    ['post', '/api/v1/auth/reenviar-verificacion', { sesion: false, csrf: false }],
    ['post', '/api/v1/auth/aceptar-invitacion', { sesion: false, csrf: false }],
    ['post', '/api/v1/invitaciones', { sesion: true, csrf: true }],
    ['get', '/api/v1/solicitantes/pendientes', { sesion: true, csrf: false }],
    ['post', '/api/v1/solicitantes/{usuarioId}/aprobar', { sesion: true, csrf: true }],
    ['post', '/api/v1/solicitantes/{usuarioId}/rechazar', { sesion: true, csrf: true }],
    ['post', '/api/v1/solicitudes', { sesion: true, csrf: true }],
    ['get', '/api/v1/solicitudes', { sesion: true, csrf: false }],
    ['get', '/api/v1/solicitudes/{id}', { sesion: true, csrf: false }],
    ['patch', '/api/v1/solicitudes/{id}', { sesion: true, csrf: true }],
    ['post', '/api/v1/solicitudes/{id}/enviar', { sesion: true, csrf: true }],
    ['post', '/api/v1/solicitudes/{id}/estado', { sesion: true, csrf: true }],
    ['post', '/api/v1/solicitudes/{id}/asignar', { sesion: true, csrf: true }],
    ['post', '/api/v1/solicitudes/{id}/comentarios', { sesion: true, csrf: true }],
    ['post', '/api/v1/solicitudes/{id}/reenviar', { sesion: true, csrf: true }],
    ['post', '/api/v1/solicitudes/{id}/consultas', { sesion: true, csrf: true }],
    ['patch', '/api/v1/solicitudes/{id}/consultas/{consultaId}', { sesion: true, csrf: true }],
    ['post', '/api/v1/solicitudes/{id}/atipicos', { sesion: true, csrf: true }],
    ['post', '/api/v1/solicitudes/{id}/validaciones', { sesion: true, csrf: true }],
    ['post', '/api/v1/solicitudes/{id}/informes', { sesion: true, csrf: true }],
    ['post', '/api/v1/solicitudes/{id}/informes/{informeId}/emitir', { sesion: true, csrf: true }],
    ['post', '/api/v1/solicitudes/{id}/entregas', { sesion: true, csrf: true }],
    ['get', '/api/v1/fuentes-consulta', { sesion: true, csrf: false }],
    ['post', '/api/v1/fuentes-consulta', { sesion: true, csrf: true }],
    ['patch', '/api/v1/fuentes-consulta/{id}', { sesion: true, csrf: true }],
    ['get', '/api/v1/referencias-ine', { sesion: true, csrf: false }],
    ['get', '/api/v1/notificaciones', { sesion: true, csrf: false }],
    ['post', '/api/v1/notificaciones/leer-todas', { sesion: true, csrf: true }],
    ['post', '/api/v1/notificaciones/{id}/leer', { sesion: true, csrf: true }],
    ['get', '/api/v1/personal-ine', { sesion: true, csrf: false }],
  ];

  it.each(esperados)('documenta %s %s', (metodo, ruta, seguridad) => {
    const operacion = paths[ruta]?.[metodo];
    expect(operacion, `${metodo} ${ruta} no está documentado`).toBeDefined();

    const esquemas = (operacion.security ?? []).flatMap((requisito) =>
      Object.keys(requisito),
    );
    expect(esquemas.includes(SEGURIDAD_SESION)).toBe(seguridad.sesion);
    // iniciar-sesión/cerrar-sesión documentan su encabezado CSRF como parámetro.
    expect(esquemas.includes(SEGURIDAD_CSRF)).toBe(seguridad.csrf);
  });

  it('no documenta rutas que no existen y no omite las existentes', () => {
    const documentadas = Object.entries(paths).flatMap(([ruta, metodos]) =>
      Object.keys(metodos).map((metodo) => `${metodo} ${ruta}`),
    );

    expect(documentadas.sort()).toEqual(
      esperados.map(([metodo, ruta]) => `${metodo} ${ruta}`).sort(),
    );
  });

  it('declara los errores RFC 7807 en los endpoints protegidos', () => {
    const respuestas = paths['/api/v1/solicitudes'].post.responses;

    expect(Object.keys(respuestas)).toEqual(
      expect.arrayContaining(['401', '403', '422']),
    );
  });
});
