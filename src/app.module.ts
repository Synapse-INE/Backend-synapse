import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import Joi from 'joi';
import { AuditoriaModule } from './modules/auditoria/auditoria.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CsrfGuard } from './modules/auth/guards/csrf.guard.js';
import { JwtAccessGuard } from './modules/auth/guards/jwt-access.guard.js';
import { AdjuntosModule } from './modules/adjuntos/adjuntos.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { IntegracionesModule } from './modules/integraciones/integraciones.module.js';
import { InvitacionesModule } from './modules/invitaciones/invitaciones.module.js';
import { ReferenciasINEModule } from './modules/referencias-ine/referencias-ine.module.js';
import { DatabaseModule } from './infrastructure/database/database.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validationSchema: Joi.object({
        NODE_ENV: Joi.string()
          .valid('development', 'test', 'production')
          .default('development'),
        PORT: Joi.number().port().default(3000),
        DATABASE_URL: Joi.string().min(1).required(),
        CORS_ORIGINS: Joi.string().min(1).default('http://localhost:5173'),
        JWT_ACCESS_SECRET: Joi.string().min(32).required(),
        JWT_ACCESS_TTL_SECONDS: Joi.number().integer().min(60).default(900),
        AUTH_REFRESH_TTL_DAYS: Joi.number().integer().min(1).max(30).default(7),
        AUTH_ACCESS_COOKIE_NAME: Joi.string()
          .pattern(/^[A-Za-z0-9_-]+$/)
          .default('ine_access'),
        AUTH_REFRESH_COOKIE_NAME: Joi.string()
          .pattern(/^[A-Za-z0-9_-]+$/)
          .default('ine_refresh'),
        AUTH_CSRF_COOKIE_NAME: Joi.string()
          .pattern(/^[A-Za-z0-9_-]+$/)
          .default('ine_csrf'),
        AUTH_CSRF_HEADER_NAME: Joi.string()
          .pattern(/^[A-Za-z0-9-]+$/)
          .default('x-csrf-token'),
        COOKIE_SECURE: Joi.boolean().default(false),
        CF_TRUSTED_PROXY: Joi.boolean().default(false),
        IMPORT_INE_MAX_FILE_BYTES: Joi.number()
          .integer()
          .min(1_048_576)
          .default(52_428_800),
      }),
    }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }]),
    DatabaseModule,
    HealthModule,
    AuthModule,
    InvitacionesModule,
    AuditoriaModule,
    AdjuntosModule,
    IntegracionesModule,
    ReferenciasINEModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useExisting: JwtAccessGuard },
    { provide: APP_GUARD, useExisting: CsrfGuard },
  ],
})
export class AppModule {}
