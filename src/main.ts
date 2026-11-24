import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import type { Express } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { isValidTrustedProxyCidr } from './infrastructure/security/trusted-proxy-cidr.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const port = config.getOrThrow<number>('PORT');
  const allowedOrigins = config
    .getOrThrow<string>('CORS_ORIGINS')
    .split(',')
    .map((origin) => origin.trim());

  app.setGlobalPrefix('api/v1');
  app.enableCors({ origin: allowedOrigins, credentials: true });
  app.use(cookieParser());
  const trustedProxyCidrs = config
    .getOrThrow<string>('TRUSTED_PROXY_CIDRS')
    .split(',')
    .map((cidr) => cidr.trim())
    .filter(Boolean);
  if (trustedProxyCidrs.some((cidr) => !isValidTrustedProxyCidr(cidr))) {
    throw new Error('TRUSTED_PROXY_CIDRS contiene un CIDR no válido.');
  }
  if (trustedProxyCidrs.length > 0) {
    const expressApp = app.getHttpAdapter().getInstance() as Express;
    expressApp.set('trust proxy', trustedProxyCidrs);
  }
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          baseUri: ["'self'"],
          frameAncestors: ["'none'"],
          objectSrc: ["'none'"],
          upgradeInsecureRequests:
            config.get<string>('NODE_ENV') === 'production' ? [] : null,
        },
      },
      hsts:
        config.get<string>('NODE_ENV') === 'production'
          ? { maxAge: 31_536_000, includeSubDomains: true }
          : false,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      xFrameOptions: { action: 'deny' },
    }),
  );
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(port, '0.0.0.0');
}

await bootstrap();
