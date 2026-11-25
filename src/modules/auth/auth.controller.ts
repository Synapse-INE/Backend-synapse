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
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import type { AuthenticatedRequest } from '../../common/auth/auth-context.js';
import { AuthService } from './auth.service.js';
import { Public } from './public.decorator.js';
import { SignInDto } from './sign-in.dto.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('iniciar-sesion')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
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
  getCurrentUser(@Req() request: AuthenticatedRequest) {
    return { usuario: request.auth.usuario };
  }

  @Get('csrf')
  async getCsrfToken(@Req() request: AuthenticatedRequest) {
    return {
      csrfToken: await this.authService.rotateCsrfToken(request.auth.sessionId),
    };
  }

  @Post('cerrar-sesion')
  @HttpCode(HttpStatus.NO_CONTENT)
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
