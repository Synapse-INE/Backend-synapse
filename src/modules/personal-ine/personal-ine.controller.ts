import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/auth/roles.decorator.js';
import { ApiProtegido } from '../../infrastructure/openapi/decoradores.js';
import { PersonalIneService } from './personal-ine.service.js';

@Controller('personal-ine')
@Roles('JEFE', 'TRABAJADOR_INE', 'ADMIN')
@ApiTags('Personal del INE')
export class PersonalIneController {
  constructor(private readonly personal: PersonalIneService) {}

  @Get()
  @ApiProtegido({ csrf: false, roles: 'JEFE, TRABAJADOR_INE, ADMIN' })
  @ApiOperation({
    summary: 'Listar los trabajadores activos que pueden recibir un expediente',
    description:
      'Devuelve identificador y nombre del personal activo asignable (`TRABAJADOR_INE` o `JEFE`). Sirve para que el jefe elija responsable o colaborador. No incluye correo.',
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
