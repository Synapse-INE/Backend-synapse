import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { crearValidationPipe } from '../src/common/http/validation-pipe.js';
import { PrismaService } from '../src/infrastructure/database/prisma.service.js';
import { setupSwagger } from '../src/infrastructure/openapi/swagger.js';

describe('Authentication endpoints', () => {
  const password = 'correct horse battery staple';
  const user = {
    id: '497f6eca-6276-4993-bfeb-53cbbbba6f08',
    email: 'requester@example.org',
    passwordHash: '',
    nombre: 'Requester',
    estado: 'ACTIVO',
    emailVerificadoEn: new Date(),
    roles: [{ rol: { codigo: 'SOLICITANTE' } }],
  };
  const previousNodeEnv = process.env.NODE_ENV;
  let sessionRecord: Record<string, unknown> | null = null;
  const prisma = {
    usuario: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    sesionUsuario: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    eventoAuditoria: { create: vi.fn(), count: vi.fn().mockResolvedValue(0) },
    $transaction: vi.fn(),
  };
  let app: INestApplication;

  beforeAll(async () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL ??=
      'postgresql://precios:precios@localhost:5432/precios';
    user.passwordHash = await argon2.hash(password);
    const { AppModule } = await import('../src/app.module.js');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    setupSwagger(app, 'ine_session');
    app.use(cookieParser());
    app.useGlobalPipes(crearValidationPipe());
    await app.init();
  }, 30_000);

  beforeEach(() => {
    vi.clearAllMocks();
    sessionRecord = null;
    prisma.$transaction.mockImplementation(
      (operation: (transaction: typeof prisma) => Promise<unknown>) =>
        operation(prisma),
    );
    prisma.usuario.findUnique.mockResolvedValue(user);
    prisma.usuario.update.mockResolvedValue(user);
    prisma.sesionUsuario.create.mockImplementation(({ data }) => {
      sessionRecord = {
        id: 'session-id',
        ...data,
        revocadaEn: null,
        usuario: user,
      };
      return Promise.resolve(sessionRecord);
    });
    prisma.sesionUsuario.findUnique.mockImplementation(({ where }) =>
      sessionRecord && (sessionRecord.tokenHash as string) === where.tokenHash
        ? Promise.resolve(sessionRecord)
        : Promise.resolve(null),
    );
    prisma.sesionUsuario.update.mockImplementation(({ data }) => {
      if (sessionRecord) Object.assign(sessionRecord, data);
      return Promise.resolve(sessionRecord);
    });
    prisma.sesionUsuario.updateMany.mockImplementation(({ data }) => {
      if (sessionRecord) Object.assign(sessionRecord, data);
      return Promise.resolve({ count: 1 });
    });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  });

  it('publishes an OpenAPI document for implemented routes', async () => {
    const docsPage = await request(app.getHttpServer())
      .get('/api/v1/docs')
      .expect(200);
    const response = await request(app.getHttpServer())
      .get('/api/v1/openapi.json')
      .expect(200);
    const paths = Object.keys(response.body.paths);

    expect(docsPage.text).toContain('swagger-ui');
    expect(paths.some((path) => path.endsWith('/salud'))).toBe(true);
    expect(paths.some((path) => path.endsWith('/auth/iniciar-sesion'))).toBe(
      true,
    );
    expect(
      response.body.components.securitySchemes['session-cookie'],
    ).toMatchObject({
      type: 'apiKey',
      in: 'cookie',
      name: 'ine_session',
    });
  });

  it('creates a cookie session, rotates CSRF material, and revokes on logout', async () => {
    const signIn = await request(app.getHttpServer())
      .post('/api/v1/auth/iniciar-sesion')
      .send({ email: ` ${user.email.toUpperCase()} `, password })
      .expect(200);

    expect(signIn.body.usuario).toEqual({
      id: user.id,
      email: user.email,
      nombre: user.nombre,
      proveedorId: null,
      roles: ['SOLICITANTE'],
    });
    expect(signIn.body.sessionToken).toBeUndefined();
    const cookieHeader = signIn.headers['set-cookie'][0];
    expect(cookieHeader).toContain('HttpOnly');
    expect(cookieHeader).toContain('Secure');
    expect(cookieHeader).toContain('SameSite=Lax');
    expect(cookieHeader).toContain('Path=/');
    const sessionToken = cookieHeader.match(/ine_session=([^;]+)/)?.[1];
    expect(sessionToken).toBeTruthy();

    const currentUser = await request(app.getHttpServer())
      .get('/api/v1/auth/yo')
      .set('Cookie', `ine_session=${sessionToken}`)
      .expect(200);
    expect(currentUser.body.usuario.id).toBe(user.id);

    await request(app.getHttpServer())
      .post('/api/v1/auth/cerrar-sesion')
      .set('Cookie', `ine_session=${sessionToken}`)
      .expect(403);

    const csrfResponse = await request(app.getHttpServer())
      .get('/api/v1/auth/csrf')
      .set('Cookie', `ine_session=${sessionToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/auth/cerrar-sesion')
      .set('Cookie', `ine_session=${sessionToken}`)
      .set('x-csrf-token', csrfResponse.body.csrfToken)
      .expect(204);

    await request(app.getHttpServer())
      .get('/api/v1/auth/yo')
      .set('Cookie', `ine_session=${sessionToken}`)
      .expect(401);
  });

  it('limits sign-in attempts even when clients spoof forwarded IP headers', async () => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/iniciar-sesion')
        .set('x-forwarded-for', `198.51.100.${attempt + 1}`)
        .send({ email: user.email, password: 'incorrect password' })
        .expect(401);
    }

    await request(app.getHttpServer())
      .post('/api/v1/auth/iniciar-sesion')
      .set('x-forwarded-for', '198.51.100.5')
      .send({ email: user.email, password: 'incorrect password' })
      .expect(429);
  });

  it('responde errores como application/problem+json con código estable', async () => {
    const respuesta = await request(app.getHttpServer())
      .get('/api/v1/auth/yo')
      .expect(401);

    expect(respuesta.headers['content-type']).toContain(
      'application/problem+json',
    );
    expect(respuesta.body).toMatchObject({
      status: 401,
      code: 'NO_AUTENTICADO',
      instance: '/api/v1/auth/yo',
    });
  });
});
