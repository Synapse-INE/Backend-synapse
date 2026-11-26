import { Module } from '@nestjs/common';
import { AuditoriaModule } from '../auditoria/auditoria.module.js';
import { ExportacionController } from './exportacion.controller.js';
import { ExportacionService } from './exportacion.service.js';

@Module({
  imports: [AuditoriaModule],
  controllers: [ExportacionController],
  providers: [ExportacionService],
})
export class ExportacionModule {}
