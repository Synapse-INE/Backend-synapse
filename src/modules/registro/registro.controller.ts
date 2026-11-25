import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { ApiLimite, ApiProblema } from '../../infrastructure/openapi/decoradores.js';
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
@ApiTags('Registro e invitaciones')
export class RegistroController {
  constructor(private readonly registro: RegistroService) {}

  @Post('registro-solicitante')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Registrar un solicitante',
    description:
      'Crea la cuenta en `PENDIENTE_VERIFICACION` y envía un enlace de verificación. ' +
      'Responde 202 con el mismo mensaje exista o no el correo, para no revelar qué cuentas hay. ' +
      'La cuenta no podrá iniciar sesión hasta verificar el correo y ser aprobada por un administrador.',
  })
  @ApiAcceptedResponse({
    schema: {
      example: {
        mensaje:
          'Si los datos son válidos, enviaremos un enlace de verificación al correo indicado.',
      },
    },
  })
  @ApiProblema(
    400,
    'Datos inválidos (`VALIDACION_FALLIDA`) o dominio de correo no permitido (`DOMINIO_NO_PERMITIDO`).',
  )
  @ApiLimite()
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
  @ApiOperation({
    summary: 'Verificar el correo con el token recibido',
    description:
      'El token es de un solo uso. Tras verificarlo la cuenta pasa a `PENDIENTE_APROBACION`.',
  })
  @ApiNoContentResponse({ description: 'Correo verificado.' })
  @ApiProblema(400, 'Token inválido, vencido o ya usado (`TOKEN_INVALIDO`).')
  @ApiLimite()
  async verificarCorreo(
    @Body() body: VerificarCorreoDto,
    @Req() request: Request,
  ) {
    await this.registro.verificarCorreo(body.token, request.ip);
  }

  @Post('reenviar-verificacion')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Reenviar el enlace de verificación',
    description:
      'Invalida los tokens anteriores. La respuesta es la misma exista o no la cuenta.',
  })
  @ApiAcceptedResponse({
    schema: {
      example: {
        mensaje: 'Si la cuenta espera verificación, enviaremos un nuevo enlace.',
      },
    },
  })
  @ApiLimite()
  async reenviarVerificacion(@Body() body: ReenviarVerificacionDto) {
    await this.registro.reenviarVerificacion(body.email);
    return {
      mensaje: 'Si la cuenta espera verificación, enviaremos un nuevo enlace.',
    };
  }

  @Post('aceptar-invitacion')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Aceptar una invitación de proveedor',
    description:
      'Crea la cuenta con rol `PROVEEDOR`, activa y ligada únicamente al proveedor invitado. ' +
      'La invitación es de un solo uso. No inicia sesión: el cliente debe llamar a `iniciar-sesion`.',
  })
  @ApiCreatedResponse({
    schema: {
      example: {
        usuario: {
          id: '497f6eca-6276-4993-bfeb-53cbbbba6f08',
          email: 'contacto@empresa.com',
          nombre: 'Persona Proveedora',
        },
      },
    },
  })
  @ApiProblema(400, 'Token inválido, vencido o ya usado (`TOKEN_INVALIDO`).')
  @ApiProblema(409, 'Ya existe una cuenta con ese correo (`CUENTA_EXISTENTE`).')
  @ApiLimite()
  async aceptarInvitacion(
    @Body() body: AceptarInvitacionDto,
    @Req() request: Request,
  ) {
    return { usuario: await this.registro.aceptarInvitacion(body, request.ip) };
  }
}
