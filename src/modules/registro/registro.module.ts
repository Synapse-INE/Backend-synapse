import { Module } from '@nestjs/common';
import { MailModule } from '../../infrastructure/mail/mail.module.js';
import { AuditoriaModule } from '../auditoria/auditoria.module.js';
import { RegistroController } from './registro.controller.js';
import { RegistroService } from './registro.service.js';

@Module({
  imports: [MailModule, AuditoriaModule],
  controllers: [RegistroController],
  providers: [RegistroService],
})
export class RegistroModule {}
