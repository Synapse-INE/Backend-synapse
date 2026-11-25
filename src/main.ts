import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import type { Express } from 'express';
import type { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { crearValidationPipe } from './common/http/validation-pipe.js';
import { ConfigService } from '@nestjs/config';
import { isValidTrustedProxyCidr } from './infrastructure/security/trusted-proxy-cidr.js';
import { setupSwagger } from './infrastructure/openapi/swagger.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const port = config.getOrThrow<number>('PORT');
  const swaggerEnabled = config.getOrThrow<boolean>('SWAGGER_ENABLED');
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
  const helmetOptions = {
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
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' as const },
    xFrameOptions: { action: 'deny' as const },
  };
  const apiHelmet = helmet(helmetOptions);
  const swaggerHelmet = helmet({
    ...helmetOptions,
    contentSecurityPolicy: {
      directives: {
        ...helmetOptions.contentSecurityPolicy.directives,
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
      },
    },
  });
  app.use((request: Request, response: Response, next: NextFunction) => {
    const swaggerUiPath = '/api/v1/docs';
    const isSwaggerUi =
      swaggerEnabled &&
      (request.path === swaggerUiPath ||
        request.path.startsWith(`${swaggerUiPath}/`));

    // Swagger UI needs inline initialization scripts; keep this exception on its opt-in route only.
    (isSwaggerUi ? swaggerHelmet : apiHelmet)(request, response, next);
  });
  app.useGlobalPipes(crearValidationPipe());

  if (swaggerEnabled) {
    setupSwagger(app, config.getOrThrow<string>('SESSION_COOKIE_NAME'));
  }

  await app.listen(port, '0.0.0.0');
}

await bootstrap();
