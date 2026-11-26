import { Module } from '@nestjs/common';
import { AuditoriaModule } from '../auditoria/auditoria.module.js';
import { FormulariosController } from './formularios.controller.js';
import { FormulariosService } from './formularios.service.js';

@Module({
  imports: [AuditoriaModule],
  controllers: [FormulariosController],
  providers: [FormulariosService],
})
export class FormulariosModule {}
