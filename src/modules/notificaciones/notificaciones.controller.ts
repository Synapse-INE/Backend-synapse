import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../../common/auth/auth-context.js';
import { Roles } from '../../common/auth/roles.decorator.js';
import { ApiProblema, ApiProtegido } from '../../infrastructure/openapi/decoradores.js';
import { ListarNotificacionesDto } from './notificaciones.dto.js';
import { NotificacionesService } from './notificaciones.service.js';

@Controller('notificaciones')
@Roles('SOLICITANTE', 'TRABAJADOR_INE', 'ADMIN')
@ApiTags('Avisos')
export class NotificacionesController {
  constructor(private readonly notificaciones: NotificacionesService) {}

  @Get()
  @ApiProtegido({ csrf: false })
  @ApiOperation({
    summary: 'Listar los avisos de quien inició sesión',
    description:
      'Solo ve los propios. `noLeidas` cuenta la bandeja aunque el filtro `soloNoLeidas` esté activo. No hay recordatorios por vencimiento.',
  })
  @ApiOkResponse({
    schema: {
      example: {
        total: 1,
        noLeidas: 1,
        notificaciones: [
          {
            id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
            titulo: 'Expediente devuelto',
            detalle: 'PR-2026-000001 volvió para corrección.',
            leidaEn: null,
            createdAt: '2026-11-25T16:00:00.000Z',
            solicitud: {
              id: 'b89c6820-0292-47d5-bb7a-4e5e85bdc7c5',
              codigo: 'PR-2026-000001',
              titulo: 'Guantes de nitrilo',
            },
          },
        ],
      },
    },
  })
  listar(
    @Query() filtros: ListarNotificacionesDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.notificaciones.listar(filtros, request.auth);
  }

  @Post('leer-todas')
  @HttpCode(HttpStatus.OK)
  @ApiProtegido({ csrf: true })
  @ApiOperation({ summary: 'Marcar como leídos los avisos propios que siguen pendientes' })
  @ApiOkResponse({ schema: { example: { actualizadas: 2 } } })
  marcarTodas(@Req() request: AuthenticatedRequest) {
    return this.notificaciones.marcarTodasLeidas(request.auth);
  }

  @Post(':id/leer')
  @HttpCode(HttpStatus.OK)
  @ApiProtegido({ csrf: true })
  @ApiOperation({ summary: 'Marcar un aviso propio como leído' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiProblema(404, 'No existe o es de otra persona (`NOTIFICACION_NO_ENCONTRADA`).')
  marcarLeida(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.notificaciones.marcarLeida(id, request.auth);
  }
}
