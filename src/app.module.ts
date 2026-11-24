import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import Joi from 'joi';
import { AuditoriaModule } from './modules/auditoria/auditoria.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { AdjuntosModule } from './modules/adjuntos/adjuntos.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { IntegracionesModule } from './modules/integraciones/integraciones.module.js';
import { InvitacionesModule } from './modules/invitaciones/invitaciones.module.js';
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
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
