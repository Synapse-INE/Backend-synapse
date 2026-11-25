import { Module } from '@nestjs/common';
import { AuditoriaModule } from '../auditoria/auditoria.module.js';
import { FuentesConsultaController } from './fuentes-consulta.controller.js';
import { FuentesConsultaService } from './fuentes-consulta.service.js';

@Module({
  imports: [AuditoriaModule],
  controllers: [FuentesConsultaController],
  providers: [FuentesConsultaService],
})
export class FuentesConsultaModule {}
