import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AuthenticatedRequest } from '../../common/auth/auth-context.js';
import { Roles } from '../../common/auth/roles.decorator.js';
import {
  ApiLimite,
  ApiProblema,
  ApiProtegido,
} from '../../infrastructure/openapi/decoradores.js';
import { CrearInvitacionDto } from './invitaciones.dto.js';
import { InvitacionesService } from './invitaciones.service.js';

@Controller('invitaciones')
@Roles('ADMIN')
@ApiTags('Registro e invitaciones')
export class InvitacionesController {
  constructor(private readonly invitaciones: InvitacionesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiProtegido({ csrf: true, roles: 'ADMIN' })
  @ApiOperation({
    summary: 'Invitar a un proveedor',
    description:
      'Indica `proveedorId` (existente) o `nuevoProveedor`, pero no ambos. ' +
      'Una invitación vigente anterior para el mismo correo deja de servir. ' +
      'La respuesta nunca incluye el token; si el correo no pudo enviarse, `correoEnviado` es `false`.',
  })
  @ApiCreatedResponse({
    schema: {
      example: {
        id: '3f1c6a4e-1b0f-4d3e-8a7a-2f6b9c1d0e11',
        email: 'contacto@empresa.com',
        proveedorId: '9bc274e7-469c-4c41-ab69-57edfd567171',
        venceEn: '2026-11-28T02:55:00.723Z',
        correoEnviado: true,
      },
    },
  })
  @ApiProblema(
    400,
    'Datos inválidos o falta indicar exactamente una forma de proveedor (`PROVEEDOR_REQUERIDO`).',
  )
  @ApiProblema(404, 'El proveedor indicado no existe (`PROVEEDOR_NO_ENCONTRADO`).')
  @ApiProblema(409, 'Ya existe una cuenta con ese correo (`CORREO_YA_REGISTRADO`).')
  @ApiLimite()
  crear(@Body() body: CrearInvitacionDto, @Req() request: AuthenticatedRequest) {
    return this.invitaciones.crear(
      body,
      request.auth.usuario.id,
      request.ip,
    );
  }
}
