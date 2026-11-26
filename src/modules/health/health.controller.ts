import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblema } from '../../infrastructure/openapi/decoradores.js';
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

  @Get('listo')
  @Public()
  @SkipThrottle()
  @ApiOperation({
    summary: 'Comprobar que la API puede atender peticiones',
    description:
      'Readiness: verifica la conexión con PostgreSQL. Úsalo como sonda de disponibilidad; `GET /salud` solo indica que el proceso vive.',
  })
  @ApiOkResponse({
    schema: { example: { estado: 'listo', servicio: 'portal-precios-api' } },
  })
  @ApiProblema(503, 'La base de datos no responde (`NO_DISPONIBLE`).')
  async getReadiness() {
    if (!(await this.healthService.estaLista())) {
      throw new ServiceUnavailableException({
        code: 'NO_DISPONIBLE',
        detail: 'La base de datos no responde.',
      });
    }
    return { estado: 'listo', servicio: 'portal-precios-api' };
  }
}
