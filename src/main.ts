import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { ProblemDetailsFilter } from './common/http/problem-details.filter.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const port = config.getOrThrow<number>('PORT');
  const allowedOrigins = config
    .getOrThrow<string>('CORS_ORIGINS')
    .split(',')
    .map((origin) => origin.trim());

  if (config.getOrThrow<boolean>('CF_TRUSTED_PROXY')) {
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
  }

  app.setGlobalPrefix('api/v1');
  app.enableCors({ origin: allowedOrigins, credentials: true });
  app.use(cookieParser());
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
      exceptionFactory: (errors) =>
        new BadRequestException({
          code: 'VALIDACION_FALLIDA',
          detail: 'Uno o más campos no cumplen el contrato.',
          errors: errors.flatMap((error) =>
            Object.values(error.constraints ?? {}).map((message) => ({
              field: error.property,
              message,
            })),
          ),
        }),
    }),
  );
  app.useGlobalFilters(new ProblemDetailsFilter());

  await app.listen(port, '0.0.0.0');
}

await bootstrap();
