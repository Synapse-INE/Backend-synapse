import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/auth/roles.decorator.js';
import { ApiProtegido } from '../../infrastructure/openapi/decoradores.js';
import { PersonalIneService } from './personal-ine.service.js';

@Controller('personal-ine')
@Roles('TRABAJADOR_INE', 'ADMIN')
@ApiTags('Personal del INE')
export class PersonalIneController {
  constructor(private readonly personal: PersonalIneService) {}

  @Get()
  @ApiProtegido({ csrf: false, roles: 'TRABAJADOR_INE, ADMIN' })
  @ApiOperation({
    summary: 'Listar el personal activo que puede recibir un expediente',
    description: 'Devuelve identificador y nombre. Sirve para elegir responsable. No incluye correo.',
  })
  @ApiOkResponse({
    schema: {
      example: [{ id: '497f6eca-6276-4993-bfeb-53cbbbba6f08', nombre: 'Ana Analista' }],
    },
  })
  listar() {
    return this.personal.listar();
  }
}
