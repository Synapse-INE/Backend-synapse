import { applyDecorators, UseGuards } from '@nestjs/common';
import { Roles } from './roles.decorator.js';
import { RolesGuard } from '../guards/roles.guard.js';
import type { RolCodigo } from '../auth.types.js';

export const Autorizado = (...roles: RolCodigo[]) =>
  applyDecorators(
    Roles(...roles),
    UseGuards(RolesGuard),
  );
