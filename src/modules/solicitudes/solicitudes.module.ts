import { Module } from '@nestjs/common';
import { AuditoriaModule } from '../auditoria/auditoria.module.js';
import { MailModule } from '../../infrastructure/mail/mail.module.js';
import { NotificacionesModule } from '../notificaciones/notificaciones.module.js';
import { AdjuntosService } from './adjuntos.service.js';
import { SolicitudesController } from './solicitudes.controller.js';
import { SolicitudesService } from './solicitudes.service.js';

@Module({
  imports: [AuditoriaModule, MailModule, NotificacionesModule],
  controllers: [SolicitudesController],
  providers: [SolicitudesService, AdjuntosService],
})
export class SolicitudesModule {}
