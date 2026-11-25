import { Module } from '@nestjs/common';
import { MailModule } from '../../infrastructure/mail/mail.module.js';
import { AuditoriaModule } from '../auditoria/auditoria.module.js';
import { InvitacionesController } from './invitaciones.controller.js';
import { InvitacionesService } from './invitaciones.service.js';

@Module({
  imports: [MailModule, AuditoriaModule],
  controllers: [InvitacionesController],
  providers: [InvitacionesService],
})
export class InvitacionesModule {}
