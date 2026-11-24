import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { CsrfGuard } from './guards/csrf.guard.js';
import { JwtAccessGuard } from './guards/jwt-access.guard.js';
import { RolesGuard } from './guards/roles.guard.js';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        signOptions: {
          expiresIn: config.getOrThrow<number>('JWT_ACCESS_TTL_SECONDS'),
          issuer: 'portal-precios-ine',
          audience: 'portal-precios-web',
        },
        verifyOptions: {
          issuer: 'portal-precios-ine',
          audience: 'portal-precios-web',
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAccessGuard, RolesGuard, CsrfGuard],
  exports: [AuthService, JwtAccessGuard, RolesGuard, CsrfGuard],
})
export class AuthModule {}
