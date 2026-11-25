import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import type { AuthenticatedRequest } from '../../common/auth/auth-context.js';
import { AuthService } from './auth.service.js';
import { Public } from './public.decorator.js';
import { SignInDto } from './sign-in.dto.js';

@Controller('auth')
@ApiTags('Autenticación')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('iniciar-sesion')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Iniciar sesión' })
  @ApiBody({ type: SignInDto })
  @ApiOkResponse({
    description: 'Sesión iniciada. El token se entrega en una cookie HttpOnly.',
    schema: {
      example: {
        usuario: {
          id: '497f6eca-6276-4993-bfeb-53cbbbba6f08',
          email: 'solicitante@example.org',
          nombre: 'Usuario de prueba',
          roles: ['SOLICITANTE'],
        },
        csrfToken: 'token-csrf-devuelto-al-cliente',
      },
    },
    headers: {
      'Set-Cookie': {
        description: 'Cookie de sesión HttpOnly.',
        schema: { type: 'string' },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'El cuerpo no cumple la validación.' })
  @ApiUnauthorizedResponse({
    description: 'Credenciales no válidas o cuenta no habilitada.',
  })
  @ApiResponse({
    status: 429,
    description: 'Se excedió el límite de intentos de inicio de sesión.',
  })
  async signIn(
    @Body() body: SignInDto,
    @Res({ passthrough: true }) response: Response,
    @Req() request?: Request,
  ) {
    const result = await this.authService.signIn(body.email, body.password, {
      ip: request?.ip,
    });
    response.cookie(
      this.config.getOrThrow<string>('SESSION_COOKIE_NAME'),
      result.sessionToken,
      {
        ...this.cookieOptions(),
        httpOnly: true,
        maxAge: this.config.getOrThrow<number>('SESSION_TTL_SECONDS') * 1000,
      },
    );
    return { usuario: result.usuario, csrfToken: result.csrfToken };
  }

  @Get('yo')
  @ApiCookieAuth('session-cookie')
  @ApiOperation({ summary: 'Consultar el usuario autenticado' })
  @ApiOkResponse({
    description: 'Datos básicos del usuario y sus roles.',
    schema: {
      example: {
        usuario: {
          id: '497f6eca-6276-4993-bfeb-53cbbbba6f08',
          email: 'solicitante@example.org',
          nombre: 'Usuario de prueba',
          roles: ['SOLICITANTE'],
        },
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Sesión ausente, expirada o revocada.',
  })
  getCurrentUser(@Req() request: AuthenticatedRequest) {
    return { usuario: request.auth.usuario };
  }

  @Get('csrf')
  @ApiCookieAuth('session-cookie')
  @ApiOperation({ summary: 'Renovar el token CSRF de la sesión' })
  @ApiOkResponse({
    description: 'Token CSRF nuevo; el token anterior queda invalidado.',
    schema: { example: { csrfToken: 'nuevo-token-csrf' } },
  })
  @ApiUnauthorizedResponse({
    description: 'Sesión ausente, expirada o revocada.',
  })
  async getCsrfToken(@Req() request: AuthenticatedRequest) {
    return {
      csrfToken: await this.authService.rotateCsrfToken(request.auth.sessionId),
    };
  }

  @Post('cerrar-sesion')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth('session-cookie')
  @ApiOperation({ summary: 'Cerrar la sesión actual' })
  @ApiHeader({
    name: 'x-csrf-token',
    required: true,
    description: 'Token CSRF recibido al iniciar sesión o renovar el token.',
  })
  @ApiNoContentResponse({ description: 'Sesión revocada y cookie eliminada.' })
  @ApiUnauthorizedResponse({
    description: 'Sesión ausente, expirada o revocada.',
  })
  @ApiForbiddenResponse({ description: 'Token CSRF ausente o inválido.' })
  async signOut(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.revokeSession(
      request.auth.sessionId,
      request.auth.usuario.id,
      { ip: request.ip },
    );
    response.clearCookie(
      this.config.getOrThrow<string>('SESSION_COOKIE_NAME'),
      { ...this.cookieOptions(), httpOnly: true },
    );
  }

  private cookieOptions(): CookieOptions {
    const domain = this.config.get<string>('COOKIE_DOMAIN')?.trim();
    const sameSite =
      this.config.get<'lax' | 'strict' | 'none'>('SESSION_COOKIE_SAME_SITE') ??
      'lax';
    return {
      path: '/',
      secure:
        this.config.get<string>('NODE_ENV') === 'production' ||
        sameSite === 'none',
      sameSite,
      ...(domain ? { domain } : {}),
    };
  }
}
