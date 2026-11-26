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
  Put,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AuthenticatedRequest } from '../../common/auth/auth-context.js';
import { Roles } from '../../common/auth/roles.decorator.js';
import {
  ApiProblema,
  ApiProtegido,
} from '../../infrastructure/openapi/decoradores.js';
import {
  AsignarRolesDto,
  CambiarModalidadDto,
  ConsultaAuditoriaDto,
  ConsultaUsuariosDto,
  CrearPersonalDto,
} from './administracion.dto.js';
import { AdministracionService } from './administracion.service.js';
import { UsuariosAdminService } from './usuarios-admin.service.js';

@Controller('administracion')
@Roles('ADMIN')
@ApiTags('Administración del portal')
export class AdministracionController {
  constructor(
    private readonly administracion: AdministracionService,
    private readonly usuarios: UsuariosAdminService,
  ) {}

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

  @Post('usuarios')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiProtegido({ csrf: true, roles: 'ADMIN' })
  @ApiOperation({
    summary: 'Crear una cuenta del personal del INE',
    description:
      'Solo roles `ADMIN`, `JEFE` o `TRABAJADOR_INE`. No se define contraseña: la persona recibe un enlace de un solo uso para elegirla.',
  })
  @ApiCreatedResponse({
    schema: {
      example: {
        id: '497f6eca-6276-4993-bfeb-53cbbbba6f08',
        email: 'analista@ine.gob.gt',
        nombre: 'Analista INE',
        roles: ['TRABAJADOR_INE'],
      },
    },
  })
  @ApiProblema(409, 'Ya existe una cuenta con ese correo (`CORREO_YA_REGISTRADO`).')
  @ApiProblema(422, 'Rol no permitido o datos inválidos.')
  crearPersonal(@Body() body: CrearPersonalDto, @Req() request: AuthenticatedRequest) {
    return this.usuarios.crearPersonal(body, request.auth.usuario.id, request.ip);
  }

  @Get('usuarios/:id')
  @ApiProtegido({ csrf: false, roles: 'ADMIN' })
  @ApiOperation({ summary: 'Detalle de una cuenta' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiProblema(404, 'La cuenta no existe (`USUARIO_NO_ENCONTRADO`).')
  obtenerUsuario(@Param('id', ParseUUIDPipe) id: string) {
    return this.usuarios.obtener(id);
  }

  @Post('usuarios/:id/bloquear')
  @HttpCode(HttpStatus.OK)
  @ApiProtegido({ csrf: true, roles: 'ADMIN' })
  @ApiOperation({
    summary: 'Bloquear una cuenta',
    description:
      'Revoca sus sesiones. No puede bloquearse a sí mismo ni al último administrador activo.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiProblema(403, 'Intento de bloquear la propia cuenta (`ACCION_SOBRE_UNO_MISMO`).')
  @ApiProblema(404, 'La cuenta no existe (`USUARIO_NO_ENCONTRADO`).')
  @ApiProblema(
    409,
    'La cuenta no está activa o es el último administrador (`ESTADO_NO_PERMITE_BLOQUEO`, `ULTIMO_ADMINISTRADOR`).',
  )
  bloquear(@Param('id', ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest) {
    return this.usuarios.bloquear(id, request.auth.usuario.id, request.ip);
  }

  @Post('usuarios/:id/desbloquear')
  @HttpCode(HttpStatus.OK)
  @ApiProtegido({ csrf: true, roles: 'ADMIN' })
  @ApiOperation({ summary: 'Desbloquear una cuenta bloqueada' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiProblema(404, 'La cuenta no existe (`USUARIO_NO_ENCONTRADO`).')
  @ApiProblema(409, 'La cuenta no está bloqueada (`ESTADO_NO_PERMITE_DESBLOQUEO`).')
  desbloquear(@Param('id', ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest) {
    return this.usuarios.desbloquear(id, request.auth.usuario.id, request.ip);
  }

  @Put('usuarios/:id/roles')
  @ApiProtegido({ csrf: true, roles: 'ADMIN' })
  @ApiOperation({
    summary: 'Reemplazar los roles de una cuenta',
    description:
      'No puede cambiar sus propios roles ni quitar el rol al último administrador activo. ' +
      '`PROVEEDOR` exige una cuenta ligada a un proveedor y `SOLICITANTE` una cuenta con perfil de solicitante.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({
    schema: {
      example: { id: '497f6eca-6276-4993-bfeb-53cbbbba6f08', roles: ['JEFE'] },
    },
  })
  @ApiProblema(403, 'Intento de cambiar los propios roles (`ACCION_SOBRE_UNO_MISMO`).')
  @ApiProblema(404, 'La cuenta no existe (`USUARIO_NO_ENCONTRADO`).')
  @ApiProblema(409, 'Se quedaría sin administradores (`ULTIMO_ADMINISTRADOR`).')
  @ApiProblema(422, 'Roles inválidos o incompatibles con la cuenta.')
  asignarRoles(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AsignarRolesDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.usuarios.asignarRoles(id, body.roles, request.auth.usuario.id, request.ip);
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