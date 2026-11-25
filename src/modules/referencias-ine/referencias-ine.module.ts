import { Module } from '@nestjs/common';
import { CatalogoIneController } from './catalogo-ine.controller.js';
import { CatalogoIneService } from './catalogo-ine.service.js';
import { ImportadorINEService } from './importador-ine.service.js';

@Module({
  controllers: [CatalogoIneController],
  providers: [ImportadorINEService, CatalogoIneService],
  exports: [ImportadorINEService],
})
export class ReferenciasINEModule {}
