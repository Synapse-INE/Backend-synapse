import { Module } from '@nestjs/common';
import { CatalogoIneController } from './catalogo-ine.controller.js';
import { CatalogoIneService } from './catalogo-ine.service.js';
import { ImportadorINEService } from './importador-ine.service.js';
import { PublicacionController } from './publicacion.controller.js';
import { PublicacionService } from './publicacion.service.js';

@Module({
  controllers: [CatalogoIneController, PublicacionController],
  providers: [ImportadorINEService, CatalogoIneService, PublicacionService],
  exports: [ImportadorINEService],
})
export class ReferenciasINEModule {}
