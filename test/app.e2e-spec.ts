import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { AppModule } from '../src/app.module.js';

describe('GET /api/v1/salud', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.DATABASE_URL ??=
      'postgresql://precios:precios@localhost:5432/precios';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns the public health status', async () => {
    await request(app.getHttpServer()).get('/api/v1/salud').expect(200).expect({
      estado: 'ok',
      servicio: 'portal-precios-api',
    });
  });
});
