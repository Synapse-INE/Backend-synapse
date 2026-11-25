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
import { Throttle } from '@nestjs/throttler';
import type { AuthenticatedRequest } from '../../common/auth/auth-context.js';
import { Roles } from '../../common/auth/roles.decorator.js';
import {
  ActualizarSolicitudDto,
  CambiarEstadoDto,
  CrearSolicitudDto,
  ListarSolicitudesDto,
} from './solicitudes.dto.js';
import { SolicitudesService } from './solicitudes.service.js';

@Controller('solicitudes')
@Roles('SOLICITANTE', 'TRABAJADOR_INE', 'ADMIN')
export class SolicitudesController {
  constructor(private readonly solicitudes: SolicitudesService) {}

  @Post()
  @Roles('SOLICITANTE')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  crear(@Body() body: CrearSolicitudDto, @Req() request: AuthenticatedRequest) {
    return this.solicitudes.crear(body, request.auth, request.ip);
  }

  @Get()
  listar(
    @Query() filtros: ListarSolicitudesDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.solicitudes.listar(filtros, request.auth);
  }

  @Get(':id')
  obtener(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.solicitudes.obtener(id, request.auth);
  }

  @Patch(':id')
  @Roles('SOLICITANTE')
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
  enviar(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.solicitudes.enviar(id, request.auth, request.ip);
  }

  @Post(':id/estado')
  @Roles('TRABAJADOR_INE', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  cambiarEstado(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CambiarEstadoDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.solicitudes.cambiarEstado(id, body, request.auth, request.ip);
  }
}
