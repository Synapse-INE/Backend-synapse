import {
  Body,
  Controller,
  ForbiddenException,
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
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { Public } from './decorators/public.decorator.js';
import { SkipCsrf } from './decorators/skip-csrf.decorator.js';
import type { AuthPrincipal } from './auth.types.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('login')
  @Public()
  @SkipCsrf()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.iniciarSesion(dto, request.ip);
    this.escribirCookies(response, result.tokens);
    return { usuario: result.principal, csrfToken: result.tokens.csrfToken };
  }

  @Post('refresh')
  @Public()
  @SkipCsrf()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.validarCsrfDobleEnvio(request);
    const result = await this.authService.refrescarSesion(
      this.refreshToken(request),
      this.csrfToken(request),
      request.ip,
    );
    this.escribirCookies(response, result.tokens);
    return { usuario: result.principal, csrfToken: result.tokens.csrfToken };
  }

  @Post('logout')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.cerrarSesion(this.refreshTokenOrUndefined(request), request.ip);
    this.borrarCookies(response);
  }

  @Get('me')
  me(@CurrentUser() usuario: AuthPrincipal) {
    return { usuario };
  }

  @Get('csrf')
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async csrf(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const csrfToken = await this.authService.renovarCsrf(this.refreshToken(request));
    response.cookie(
      this.config.getOrThrow<string>('AUTH_CSRF_COOKIE_NAME'),
      csrfToken,
      this.csrfCookieOptions(),
    );
    return { csrfToken };
  }

  private escribirCookies(
    response: Response,
    tokens: { accessToken: string; refreshToken: string; csrfToken: string },
  ) {
    response.cookie(
      this.config.getOrThrow<string>('AUTH_ACCESS_COOKIE_NAME'),
      tokens.accessToken,
      { ...this.httpOnlyCookieOptions(), maxAge: this.accessTtlMilliseconds() },
    );
    response.cookie(
      this.config.getOrThrow<string>('AUTH_REFRESH_COOKIE_NAME'),
      tokens.refreshToken,
      this.httpOnlyCookieOptions(),
    );
    response.cookie(
      this.config.getOrThrow<string>('AUTH_CSRF_COOKIE_NAME'),
      tokens.csrfToken,
      this.csrfCookieOptions(),
    );
  }

  private borrarCookies(response: Response) {
    response.clearCookie(
      this.config.getOrThrow<string>('AUTH_ACCESS_COOKIE_NAME'),
      this.httpOnlyCookieOptions(),
    );
    response.clearCookie(
      this.config.getOrThrow<string>('AUTH_REFRESH_COOKIE_NAME'),
      this.httpOnlyCookieOptions(),
    );
    response.clearCookie(
      this.config.getOrThrow<string>('AUTH_CSRF_COOKIE_NAME'),
      this.csrfCookieOptions(),
    );
  }

  private httpOnlyCookieOptions(): CookieOptions {
    const refreshTtlDays = this.config.getOrThrow<number>('AUTH_REFRESH_TTL_DAYS');
    return {
      httpOnly: true,
      secure: this.config.getOrThrow<boolean>('COOKIE_SECURE'),
      sameSite: 'strict',
      path: '/',
      maxAge: refreshTtlDays * 24 * 60 * 60 * 1000,
    };
  }

  private csrfCookieOptions(): CookieOptions {
    return { ...this.httpOnlyCookieOptions(), httpOnly: false };
  }

  private accessTtlMilliseconds() {
    return this.config.getOrThrow<number>('JWT_ACCESS_TTL_SECONDS') * 1000;
  }

  private refreshToken(request: Request) {
    return this.refreshTokenOrUndefined(request) ?? '';
  }

  private refreshTokenOrUndefined(request: Request) {
    return request.cookies?.[
      this.config.getOrThrow<string>('AUTH_REFRESH_COOKIE_NAME')
    ] as string | undefined;
  }

  private csrfToken(request: Request) {
    const header = this.config
      .getOrThrow<string>('AUTH_CSRF_HEADER_NAME')
      .toLowerCase();
    const token = request.headers[header];
    return Array.isArray(token) ? token[0] : token ?? '';
  }

  private validarCsrfDobleEnvio(request: Request) {
    const csrfCookieName = this.config.getOrThrow<string>('AUTH_CSRF_COOKIE_NAME');
    const csrfToken = this.csrfToken(request);
    if (!csrfToken || csrfToken !== request.cookies?.[csrfCookieName]) {
      throw new ForbiddenException({
        code: 'CSRF_INVALIDO',
        detail: 'La solicitud no contiene un token CSRF válido.',
      });
    }
  }
}
