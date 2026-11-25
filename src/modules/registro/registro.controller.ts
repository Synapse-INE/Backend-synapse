import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../auth/public.decorator.js';
import {
  AceptarInvitacionDto,
  ReenviarVerificacionDto,
  RegistroSolicitanteDto,
  VerificarCorreoDto,
} from './registro.dto.js';
import { RegistroService } from './registro.service.js';

@Controller('auth')
@Public()
export class RegistroController {
  constructor(private readonly registro: RegistroService) {}

  @Post('registro-solicitante')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async registrarSolicitante(
    @Body() body: RegistroSolicitanteDto,
    @Req() request: Request,
  ) {
    await this.registro.registrarSolicitante(body, request.ip);
    return {
      mensaje:
        'Si los datos son válidos, enviaremos un enlace de verificación al correo indicado.',
    };
  }

  @Post('verificar-correo')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async verificarCorreo(
    @Body() body: VerificarCorreoDto,
    @Req() request: Request,
  ) {
    await this.registro.verificarCorreo(body.token, request.ip);
  }

  @Post('reenviar-verificacion')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async reenviarVerificacion(@Body() body: ReenviarVerificacionDto) {
    await this.registro.reenviarVerificacion(body.email);
    return {
      mensaje: 'Si la cuenta espera verificación, enviaremos un nuevo enlace.',
    };
  }

  @Post('aceptar-invitacion')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async aceptarInvitacion(
    @Body() body: AceptarInvitacionDto,
    @Req() request: Request,
  ) {
    return { usuario: await this.registro.aceptarInvitacion(body, request.ip) };
  }
}
