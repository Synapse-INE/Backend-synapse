import { Module } from '@nestjs/common';
import { ImportadorINEService } from './importador-ine.service.js';

@Module({
  providers: [ImportadorINEService],
  exports: [ImportadorINEService],
})
export class ReferenciasINEModule {}
