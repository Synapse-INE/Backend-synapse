import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ProblemDetailsFilter } from './common/http/problem-details.filter.js';
import { ConfigModule } from '@nestjs/config';
import { MailModule } from './infrastructure/mail/mail.module.js';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import Joi from 'joi';
import { AuditoriaModule } from './modules/auditoria/auditoria.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { AdjuntosModule } from './modules/adjuntos/adjuntos.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { IntegracionesModule } from './modules/integraciones/integraciones.module.js';
import { RecuperacionModule } from './modules/recuperacion/recuperacion.module.js';
import { FormulariosModule } from './modules/formularios/formularios.module.js';
import { RegistroModule } from './modules/registro/registro.module.js';
import { SolicitudesModule } from './modules/solicitudes/solicitudes.module.js';
import { SolicitantesModule } from './modules/solicitantes/solicitantes.module.js';
import { InvitacionesModule } from './modules/invitaciones/invitaciones.module.js';
import { FuentesConsultaModule } from './modules/fuentes-consulta/fuentes-consulta.module.js';
import { NotificacionesModule } from './modules/notificaciones/notificaciones.module.js';
import { PersonalIneModule } from './modules/personal-ine/personal-ine.module.js';
import { ReferenciasINEModule } from './modules/referencias-ine/referencias-ine.module.js';
import { AdministracionModule } from './modules/administracion/administracion.module.js';
import { ProveedoresModule } from './modules/proveedores/proveedores.module.js';
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
        SWAGGER_ENABLED: Joi.boolean().default(false),
        SESSION_TTL_SECONDS: Joi.number()
          .integer()
          .min(300)
          .max(2_592_000)
          .default(28_800),
        SESSION_COOKIE_NAME: Joi.string()
          .pattern(/^[A-Za-z0-9_-]+$/)
          .default('ine_session'),
        SESSION_COOKIE_SAME_SITE: Joi.string()
          .valid('lax', 'strict', 'none')
          .default('lax'),
        COOKIE_DOMAIN: Joi.string().allow('').default(''),
        TRUSTED_PROXY_CIDRS: Joi.string().allow('').default(''),
        FRONTEND_URL: Joi.string().uri().default('http://localhost:5173'),
        EMAIL_TOKEN_TTL_HOURS: Joi.number().integer().min(1).max(168).default(24),
        RESET_TOKEN_TTL_HOURS: Joi.number().integer().min(1).max(24).default(1),
        INVITATION_TTL_HOURS: Joi.number().integer().min(1).max(720).default(72),
        REGISTRO_DOMINIOS_PERMITIDOS: Joi.string().allow('').default(''),
        SMTP_HOST: Joi.string().allow('').optional(),
        SMTP_PORT: Joi.number().port().default(587),
        SMTP_USER: Joi.string().allow('').optional(),
        SMTP_PASSWORD: Joi.string().allow('').optional(),
        SMTP_FROM: Joi.string()
          .pattern(/^[^\r\n]+$/)
          .allow('')
          .optional(),
        SMTP_SECURE: Joi.boolean().default(false),
        IMPORT_INE_MAX_FILE_BYTES: Joi.number()
          .integer()
          .min(1_048_576)
          .default(52_428_800),
        ALMACENAMIENTO_DIR: Joi.string().allow('').optional(),
      }),
    }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }]),
    DatabaseModule,
    MailModule,
    HealthModule,
    AuthModule,
    InvitacionesModule,
    RegistroModule,
    RecuperacionModule,
    SolicitantesModule,
    AdministracionModule,
    SolicitudesModule,
    FormulariosModule,
    FuentesConsultaModule,
    NotificacionesModule,
    PersonalIneModule,
    AuditoriaModule,
    AdjuntosModule,
    IntegracionesModule,
    ReferenciasINEModule,
    ProveedoresModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
  ],
})
export class AppModule {}
