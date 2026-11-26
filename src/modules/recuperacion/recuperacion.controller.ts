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
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import type { AuthenticatedRequest } from '../../common/auth/auth-context.js';
import {
  ApiLimite,
  ApiProblema,
  ApiProtegido,
} from '../../infrastructure/openapi/decoradores.js';
import { Public } from '../auth/public.decorator.js';
import {
  CambiarContrasenaDto,
  OlvideContrasenaDto,
  RestablecerContrasenaDto,
} from './recuperacion.dto.js';
import { RecuperacionService } from './recuperacion.service.js';

@Controller('auth')
@ApiTags('Recuperación de cuenta')
export class RecuperacionController {
  constructor(private readonly recuperacion: RecuperacionService) {}

  @Post('olvide-contrasena')
  @Public()
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Solicitar el restablecimiento de contraseña',
    description:
      'Responde 202 con el mismo mensaje exista o no la cuenta. Solo las cuentas activas reciben el enlace, ' +
      'que es de un solo uso e invalida los enlaces anteriores.',
  })
  @ApiAcceptedResponse({
    schema: {
      example: {
        mensaje:
          'Si la cuenta existe, enviaremos un enlace para restablecer la contraseña.',
      },
    },
  })
  @ApiLimite()
  async olvide(@Body() body: OlvideContrasenaDto, @Req() request: Request) {
    await this.recuperacion.solicitarRestablecimiento(body.email, request.ip);
    return {
      mensaje:
        'Si la cuenta existe, enviaremos un enlace para restablecer la contraseña.',
    };
  }

  @Post('restablecer-contrasena')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Restablecer la contraseña con el token recibido',
    description:
      'Consume el token y revoca todas las sesiones de la cuenta. El cliente debe volver a iniciar sesión.',
  })
  @ApiNoContentResponse({ description: 'Contraseña restablecida.' })
  @ApiProblema(400, 'Token inválido, vencido o ya usado (`TOKEN_INVALIDO`).')
  @ApiLimite()
  async restablecer(
    @Body() body: RestablecerContrasenaDto,
    @Req() request: Request,
  ) {
    await this.recuperacion.restablecer(body.token, body.password, request.ip);
  }

  @Post('cambiar-contrasena')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiProtegido({ csrf: true })
  @ApiOperation({
    summary: 'Cambiar la contraseña desde una sesión activa',
    description:
      'Exige la contraseña actual. Cierra las demás sesiones de la cuenta y conserva la actual.',
  })
  @ApiNoContentResponse({ description: 'Contraseña cambiada.' })
  @ApiProblema(
    400,
    'La contraseña nueva es igual a la actual (`CONTRASENA_REPETIDA`) o no cumple la política.',
  )
  @ApiProblema(
    401,
    'La contraseña actual es incorrecta (`CONTRASENA_ACTUAL_INCORRECTA`).',
  )
  @ApiLimite()
  async cambiar(
    @Body() body: CambiarContrasenaDto,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.recuperacion.cambiar(
      request.auth.usuario.id,
      request.auth.sessionId,
      body.passwordActual,
      body.passwordNueva,
      request.ip,
    );
  }
}
