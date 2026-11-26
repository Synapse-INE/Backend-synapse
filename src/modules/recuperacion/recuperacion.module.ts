import { Module } from '@nestjs/common';
import { MailModule } from '../../infrastructure/mail/mail.module.js';
import { AuditoriaModule } from '../auditoria/auditoria.module.js';
import { RecuperacionController } from './recuperacion.controller.js';
import { RecuperacionService } from './recuperacion.service.js';

@Module({
  imports: [MailModule, AuditoriaModule],
  controllers: [RecuperacionController],
  providers: [RecuperacionService],
  exports: [RecuperacionService],
})
export class RecuperacionModule {}
