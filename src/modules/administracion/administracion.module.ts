import { Module } from '@nestjs/common';
import { AuditoriaModule } from '../auditoria/auditoria.module.js';
import { RecuperacionModule } from '../recuperacion/recuperacion.module.js';
import { AdministracionController } from './administracion.controller.js';
import { AdministracionService } from './administracion.service.js';
import { PrimerAdminService } from './primer-admin.service.js';
import { UsuariosAdminService } from './usuarios-admin.service.js';

@Module({
  imports: [AuditoriaModule, RecuperacionModule],
  controllers: [AdministracionController],
  providers: [AdministracionService, UsuariosAdminService, PrimerAdminService],
})
export class AdministracionModule {}