import { Module } from '@nestjs/common';
import { AuditoriaModule } from '../auditoria/auditoria.module.js';
import { SolicitantesController } from './solicitantes.controller.js';
import { SolicitantesService } from './solicitantes.service.js';

@Module({
  imports: [AuditoriaModule],
  controllers: [SolicitantesController],
  providers: [SolicitantesService],
})
export class SolicitantesModule {}
