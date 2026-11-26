import { Module } from '@nestjs/common';
import { AuditoriaModule } from '../auditoria/auditoria.module.js';
import { CatalogoIneController } from './catalogo-ine.controller.js';
import { CatalogoIneService } from './catalogo-ine.service.js';
import { ImportadorINEService } from './importador-ine.service.js';
import { PublicacionController } from './publicacion.controller.js';
import { PublicacionService } from './publicacion.service.js';
import { RevisionIneController } from './revision-ine.controller.js';
import { RevisionIneService } from './revision-ine.service.js';

@Module({
  imports: [AuditoriaModule],
  controllers: [CatalogoIneController, PublicacionController, RevisionIneController],
  providers: [
    ImportadorINEService,
    CatalogoIneService,
    PublicacionService,
    RevisionIneService,
  ],
  exports: [ImportadorINEService],
})
export class ReferenciasINEModule {}
