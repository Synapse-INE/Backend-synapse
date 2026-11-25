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
  ApiLimite,
  ApiProblema,
  ApiProtegido,
} from '../../infrastructure/openapi/decoradores.js';
import {
  ActualizarSolicitudDto,
  CambiarEstadoDto,
  CrearSolicitudDto,
  ListarSolicitudesDto,
} from './solicitudes.dto.js';
import { SolicitudesService } from './solicitudes.service.js';

const EJEMPLO_SOLICITUD = {
  id: 'b89c6820-0292-47d5-bb7a-4e5e85bdc7c5',
  titulo: 'Guantes de nitrilo',
  descripcion: 'Compra anual',
  institucionSolicitante: 'Ministerio de Prueba',
  institucionSolicitanteId: 'aaaaaaaa-0000-4000-8000-000000000001',
  modalidad: 'CONTRATO_ABIERTO',
  unidadEjecutora: 'Unidad de Compras',
  fechaFormulario: '2026-11-24T00:00:00.000Z',
  enlaceNombre: 'Persona Enlace',
  enlaceCargo: 'Jefe de Compras',
  autoridadNombre: 'Persona Autoridad',
  autoridadCargo: 'Director',
  estado: 'BORRADOR',
  creadaPorId: '497f6eca-6276-4993-bfeb-53cbbbba6f08',
  enviadaEn: null,
  createdAt: '2026-11-24T20:00:00.000Z',
  updatedAt: '2026-11-24T20:00:00.000Z',
  productos: [
    {
      id: '0b1f2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
      numero: 1,
      nombre: 'Guantes',
      codigoSiges: null,
      especificacionesTecnicas: 'Nitrilo talla M',
      unidadMedida: 'Caja',
      cantidad: '10.5',
    },
  ],
};

@Controller('solicitudes')
@Roles('SOLICITANTE', 'TRABAJADOR_INE', 'ADMIN')
@ApiTags('Solicitudes de precio (S.00)')
export class SolicitudesController {
  constructor(private readonly solicitudes: SolicitudesService) {}

  @Post()
  @Roles('SOLICITANTE')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiProtegido({ csrf: true, roles: 'SOLICITANTE' })
  @ApiOperation({
    summary: 'Crear un borrador de solicitud',
    description:
      'Queda ligada al usuario y a su institución. Un borrador puede estar incompleto; ' +
      'los requisitos se validan al enviar. Las cantidades viajan como cadena decimal y la fecha como `YYYY-MM-DD`.',
  })
  @ApiCreatedResponse({ schema: { example: EJEMPLO_SOLICITUD } })
  @ApiProblema(400, 'Datos inválidos (`VALIDACION_FALLIDA`).')
  @ApiProblema(422, 'La cuenta no tiene institución asociada (`SIN_INSTITUCION`).')
  @ApiLimite()
  crear(@Body() body: CrearSolicitudDto, @Req() request: AuthenticatedRequest) {
    return this.solicitudes.crear(body, request.auth, request.ip);
  }

  @Get()
  @ApiProtegido({ csrf: false })
  @ApiOperation({
    summary: 'Listar solicitudes',
    description:
      'El solicitante ve sus borradores y lo enviado por su institución. ' +
      'El personal del INE ve solo lo enviado. Paginación con `limite` (1–100, por defecto 25) y `desplazamiento`.',
  })
  @ApiOkResponse({
    schema: {
      example: {
        total: 1,
        solicitudes: [
          {
            id: EJEMPLO_SOLICITUD.id,
            titulo: EJEMPLO_SOLICITUD.titulo,
            modalidad: 'CONTRATO_ABIERTO',
            estado: 'RECIBIDA',
            institucionSolicitante: 'Ministerio de Prueba',
            creadaPorId: EJEMPLO_SOLICITUD.creadaPorId,
            enviadaEn: '2026-11-24T21:00:00.000Z',
            createdAt: '2026-11-24T20:00:00.000Z',
            _count: { productos: 1 },
          },
        ],
      },
    },
  })
  listar(
    @Query() filtros: ListarSolicitudesDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.solicitudes.listar(filtros, request.auth);
  }

  @Get(':id')
  @ApiProtegido({ csrf: false })
  @ApiOperation({ summary: 'Consultar una solicitud con sus productos' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ schema: { example: EJEMPLO_SOLICITUD } })
  @ApiProblema(
    404,
    'No existe o no es visible para el usuario (`SOLICITUD_NO_ENCONTRADA`); no se distingue para no revelar su existencia.',
  )
  obtener(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.solicitudes.obtener(id, request.auth);
  }

  @Patch(':id')
  @Roles('SOLICITANTE')
  @ApiProtegido({ csrf: true, roles: 'SOLICITANTE' })
  @ApiOperation({
    summary: 'Editar un borrador',
    description:
      'Solo el autor y solo en `BORRADOR`. Si se envía `productos`, reemplaza por completo la lista.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ schema: { example: EJEMPLO_SOLICITUD } })
  @ApiProblema(400, 'Datos inválidos (`VALIDACION_FALLIDA`).')
  @ApiProblema(404, 'No existe o no es visible (`SOLICITUD_NO_ENCONTRADA`).')
  @ApiProblema(409, 'Ya fue enviada (`SOLICITUD_NO_EDITABLE`).')
  actualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ActualizarSolicitudDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.solicitudes.actualizar(id, body, request.auth, request.ip);
  }

  @Post(':id/enviar')
  @Roles('SOLICITANTE')
  @HttpCode(HttpStatus.OK)
  @ApiProtegido({ csrf: true, roles: 'SOLICITANTE' })
  @ApiOperation({
    summary: 'Enviar la solicitud al INE',
    description:
      'Exige modalidad, unidad ejecutora, fecha del formulario, enlace, autoridad y al menos un producto ' +
      'con especificaciones, unidad de medida y cantidad mayor que cero. Pasa a `RECIBIDA`.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({
    schema: { example: { ...EJEMPLO_SOLICITUD, estado: 'RECIBIDA' } },
  })
  @ApiProblema(404, 'No existe o no es visible (`SOLICITUD_NO_ENCONTRADA`).')
  @ApiProblema(409, 'Ya fue enviada (`SOLICITUD_NO_EDITABLE`).')
  @ApiProblema(
    422,
    'Faltan requisitos (`SOLICITUD_INCOMPLETA`); `errors` lista cada campo faltante.',
  )
  enviar(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.solicitudes.enviar(id, request.auth, request.ip);
  }

  @Post(':id/estado')
  @Roles('TRABAJADOR_INE', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiProtegido({ csrf: true, roles: 'TRABAJADOR_INE, ADMIN' })
  @ApiOperation({
    summary: 'Cambiar el estado de una solicitud',
    description:
      'Transiciones: `RECIBIDA → EN_REVISION → EN_ANALISIS → COMPLETADA`, y `RECHAZADA` desde cualquiera de las tres primeras. ' +
      'El `motivo` queda en la auditoría.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({
    schema: { example: { ...EJEMPLO_SOLICITUD, estado: 'EN_REVISION' } },
  })
  @ApiProblema(404, 'No existe (`SOLICITUD_NO_ENCONTRADA`).')
  @ApiProblema(409, 'Transición no permitida (`TRANSICION_NO_PERMITIDA`).')
  cambiarEstado(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CambiarEstadoDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.solicitudes.cambiarEstado(id, body, request.auth, request.ip);
  }
}
