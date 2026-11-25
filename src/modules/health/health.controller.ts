import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/public.decorator.js';
import { HealthService } from './health.service.js';

@Controller('salud')
@ApiTags('Salud')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @Public()
  @SkipThrottle()
  @ApiOperation({ summary: 'Consultar el estado de la API' })
  @ApiOkResponse({
    description: 'La API está disponible.',
    schema: {
      example: { estado: 'ok', servicio: 'portal-precios-api' },
    },
  })
  getStatus() {
    return this.healthService.getStatus();
  }
}
