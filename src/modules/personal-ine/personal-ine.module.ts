import { Module } from '@nestjs/common';
import { PersonalIneController } from './personal-ine.controller.js';
import { PersonalIneService } from './personal-ine.service.js';

@Module({
  controllers: [PersonalIneController],
  providers: [PersonalIneService],
})
export class PersonalIneModule {}