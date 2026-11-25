import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../../common/auth/auth-context.js';
import { Roles } from '../../common/auth/roles.decorator.js';
import { ApiProblema, ApiProtegido } from '../../infrastructure/openapi/decoradores.js';
import {
  ActualizarFuenteDto,
  CrearFuenteDto,
  ListarFuentesDto,
} from './fuentes-consulta.dto.js';
import { FuentesConsultaService } from './fuentes-consulta.service.js';

@Controller('fuentes-consulta')
@Roles('TRABAJADOR_INE', 'ADMIN')
@ApiTags('Fuentes de consulta')
export class FuentesConsultaController {
  constructor(private readonly fuentes: FuentesConsultaService) {}

  @Get()
  @ApiProtegido({ csrf: false, roles: 'TRABAJADOR_INE, ADMIN' })
  @ApiOperation({
    summary: 'Listar las fuentes habilitables de Guatemala',
    description:
      'Registro cerrado. No busca en la web. `soloActivas=true` deja fuera las que ya no se pueden usar en boletas nuevas.',
  })
  @ApiOkResponse({
    schema: {
      example: [
        {
          id: '10000000-0000-4000-8000-0000000000f1',
          nombre: 'Catálogo de precios de referencia del INE',
          tipo: 'CATALOGO_INE',
          pais: 'GT',
          dominio: null,
          activa: true,
          nota: 'Fuente interna.',
        },
      ],
    },
  })
  listar(@Query() filtros: ListarFuentesDto) {
    return this.fuentes.listar(filtros);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiProtegido({ csrf: true, roles: 'TRABAJADOR_INE, ADMIN' })
  @ApiOperation({
    summary: 'Registrar una fuente de Guatemala',
    description:
      'El país queda en GT. Si hay dominio, tiene que terminar en `.gt` y no lleva dirección completa.',
  })
  @ApiProblema(422, 'El dominio no es de Guatemala (`FUENTE_NO_GUATEMALTECA`).')
  crear(@Body() body: CrearFuenteDto, @Req() request: AuthenticatedRequest) {
    return this.fuentes.crear(body, request.auth, request.ip);
  }

  @Patch(':id')
  @ApiProtegido({ csrf: true, roles: 'TRABAJADOR_INE, ADMIN' })
  @ApiOperation({
    summary: 'Actualizar o desactivar una fuente',
    description: 'Desactivar impide usarla en boletas nuevas. Las boletas ya registradas se conservan.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiProblema(404, 'No existe (`FUENTE_NO_ENCONTRADA`).')
  @ApiProblema(422, 'Sin cambios (`VALIDACION_FALLIDA`) o dominio no guatemalteco (`FUENTE_NO_GUATEMALTECA`).')
  actualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ActualizarFuenteDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.fuentes.actualizar(id, body, request.auth, request.ip);
  }
}
