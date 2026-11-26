import { Module } from '@nestjs/common';
import { AuditoriaModule } from '../auditoria/auditoria.module.js';
import { AdministracionController } from './administracion.controller.js';
import { AdministracionService } from './administracion.service.js';

@Module({
  imports: [AuditoriaModule],
  controllers: [AdministracionController],
  providers: [AdministracionService],
})
export class AdministracionModule {}