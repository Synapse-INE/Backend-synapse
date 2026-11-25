import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../../common/auth/auth-context.js';
import { Roles } from '../../common/auth/roles.decorator.js';
import {
  ApiProblema,
  ApiProtegido,
} from '../../infrastructure/openapi/decoradores.js';
import { SolicitantesService } from './solicitantes.service.js';

@Controller('solicitantes')
@Roles('ADMIN')
@ApiTags('Revisión de solicitantes')
export class SolicitantesController {
  constructor(private readonly solicitantes: SolicitantesService) {}

  @Get('pendientes')
  @ApiProtegido({ csrf: false, roles: 'ADMIN' })
  @ApiOperation({
    summary: 'Listar solicitantes pendientes de revisión',
    description:
      'Solo cuentas con correo verificado y perfil pendiente, de la más antigua a la más reciente.',
  })
  @ApiOkResponse({
    schema: {
      example: {
        solicitantes: [
          {
            usuarioId: '497f6eca-6276-4993-bfeb-53cbbbba6f08',
            email: 'persona@entidad.gob.gt',
            nombre: 'Persona Solicitante',
            cargo: 'Analista',
            institucion: {
              id: 'aaaaaaaa-0000-4000-8000-000000000001',
              nombreOficial: 'Ministerio de Prueba',
              nit: '1234567-8',
            },
            solicitadoEn: '2026-11-24T20:00:00.000Z',
          },
        ],
      },
    },
  })
  async pendientes() {
    return { solicitantes: await this.solicitantes.listarPendientes() };
  }

  @Post(':usuarioId/aprobar')
  @HttpCode(HttpStatus.OK)
  @ApiProtegido({ csrf: true, roles: 'ADMIN' })
  @ApiOperation({
    summary: 'Aprobar un solicitante',
    description: 'Activa la cuenta. Se audita revisor, fecha e IP.',
  })
  @ApiParam({ name: 'usuarioId', format: 'uuid' })
  @ApiOkResponse({
    schema: {
      example: {
        usuarioId: '497f6eca-6276-4993-bfeb-53cbbbba6f08',
        estado: 'ACTIVO',
      },
    },
  })
  @ApiProblema(
    409,
    'No está pendiente de revisión o no verificó su correo (`REVISION_NO_APLICABLE`).',
  )
  aprobar(
    @Param('usuarioId', ParseUUIDPipe) usuarioId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.solicitantes.revisar(
      usuarioId,
      'APROBAR',
      request.auth.usuario.id,
      request.ip,
    );
  }

  @Post(':usuarioId/rechazar')
  @HttpCode(HttpStatus.OK)
  @ApiProtegido({ csrf: true, roles: 'ADMIN' })
  @ApiOperation({
    summary: 'Rechazar un solicitante',
    description: 'Desactiva la cuenta. Se audita revisor, fecha e IP.',
  })
  @ApiParam({ name: 'usuarioId', format: 'uuid' })
  @ApiOkResponse({
    schema: {
      example: {
        usuarioId: '497f6eca-6276-4993-bfeb-53cbbbba6f08',
        estado: 'DESACTIVADO',
      },
    },
  })
  @ApiProblema(
    409,
    'No está pendiente de revisión o no verificó su correo (`REVISION_NO_APLICABLE`).',
  )
  rechazar(
    @Param('usuarioId', ParseUUIDPipe) usuarioId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.solicitantes.revisar(
      usuarioId,
      'RECHAZAR',
      request.auth.usuario.id,
      request.ip,
    );
  }
}
