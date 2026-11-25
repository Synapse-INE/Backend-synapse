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
import type { AuthenticatedRequest } from '../../common/auth/auth-context.js';
import { Roles } from '../../common/auth/roles.decorator.js';
import { SolicitantesService } from './solicitantes.service.js';

@Controller('solicitantes')
@Roles('ADMIN')
export class SolicitantesController {
  constructor(private readonly solicitantes: SolicitantesService) {}

  @Get('pendientes')
  async pendientes() {
    return { solicitantes: await this.solicitantes.listarPendientes() };
  }

  @Post(':usuarioId/aprobar')
  @HttpCode(HttpStatus.OK)
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
