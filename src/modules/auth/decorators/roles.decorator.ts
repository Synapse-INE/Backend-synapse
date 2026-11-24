import { SetMetadata } from '@nestjs/common';
import { ROLES_KEY, type RolCodigo } from '../auth.types.js';

export const Roles = (...roles: RolCodigo[]) => SetMetadata(ROLES_KEY, roles);
