import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../../common/auth/auth-context.js';
import { Roles } from '../../common/auth/roles.decorator.js';
import {
  ApiProblema,
  ApiProtegido,
} from '../../infrastructure/openapi/decoradores.js';
import {
  CambiarModalidadDto,
  ConsultaAuditoriaDto,
  ConsultaUsuariosDto,
} from './administracion.dto.js';
import { AdministracionService } from './administracion.service.js';

@Controller('administracion')
@Roles('ADMIN')
@ApiTags('Administración del portal')
export class AdministracionController {
  constructor(private readonly administracion: AdministracionService) {}

  @Get('resumen')
  @ApiProtegido({ csrf: false, roles: 'ADMIN' })
  @ApiOperation({ summary: 'Indicadores generales para la consola del administrador' })
  @ApiOkResponse({
    schema: {
      example: {
        pendientes: 1,
        usuariosActivos: 6,
        modalidadesActivas: 3,
        modalidadesTotal: 3,
        auditoriaTotal: 42,
        accesos: {
          ADMIN: 1,
          JEFE: 1,
          TRABAJADOR_INE: 1,
          PROVEEDOR: 0,
          SOLICITANTE: 2,
        },
      },
    },
  })
  resumen() {
    return this.administracion.resumen();
  }

  @Get('usuarios')
  @ApiProtegido({ csrf: false, roles: 'ADMIN' })
  @ApiOperation({ summary: 'Listar cuentas registradas en el portal' })
  listarUsuarios(@Query() consulta: ConsultaUsuariosDto) {
    return this.administracion.listarUsuarios(consulta);
  }

  @Get('modalidades')
  @ApiProtegido({ csrf: false, roles: 'ADMIN' })
  @ApiOperation({ summary: 'Listar los tipos de modalidad de compra' })
  async listarModalidades() {
    return { modalidades: await this.administracion.listarModalidades() };
  }

  @Patch('modalidades/:id')
  @HttpCode(HttpStatus.OK)
  @ApiProtegido({ csrf: true, roles: 'ADMIN' })
  @ApiOperation({ summary: 'Activar o inactivar un tipo de modalidad' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiProblema(404, 'La modalidad no existe (`MODALIDAD_NO_ENCONTRADA`).')
  cambiarModalidad(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CambiarModalidadDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.administracion.cambiarModalidad(
      id,
      body.activo,
      request.auth.usuario.id,
      request.ip,
    );
  }

  @Get('auditoria')
  @ApiProtegido({ csrf: false, roles: 'ADMIN' })
  @ApiOperation({ summary: 'Consultar la bitácora de eventos del portal' })
  listarAuditoria(@Query() consulta: ConsultaAuditoriaDto) {
    return this.administracion.listarAuditoria(consulta);
  }

  @Get('proveedores')
  @ApiProtegido({ csrf: false, roles: 'ADMIN' })
  @ApiOperation({
    summary: 'Proveedores activos',
    description: 'Sirve para invitar a una empresa ya registrada.',
  })
  async listarProveedores() {
    return { proveedores: await this.administracion.listarProveedores() };
  }
}