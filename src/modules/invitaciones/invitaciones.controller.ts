import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthenticatedRequest } from '../../common/auth/auth-context.js';
import { Roles } from '../../common/auth/roles.decorator.js';
import { CrearInvitacionDto } from './invitaciones.dto.js';
import { InvitacionesService } from './invitaciones.service.js';

@Controller('invitaciones')
@Roles('ADMIN')
export class InvitacionesController {
  constructor(private readonly invitaciones: InvitacionesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  crear(@Body() body: CrearInvitacionDto, @Req() request: AuthenticatedRequest) {
    return this.invitaciones.crear(
      body,
      request.auth.usuario.id,
      request.ip,
    );
  }
}
