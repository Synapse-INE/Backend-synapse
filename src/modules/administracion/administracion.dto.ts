import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsIP,
  IsUUID,
  MinLength,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { EstadoUsuario } from '../../infrastructure/database/generated/client.js';

const ESTADOS_USUARIO = [
  'PENDIENTE_VERIFICACION',
  'PENDIENTE_APROBACION',
  'ACTIVO',
  'BLOQUEADO',
  'DESACTIVADO',
] as const;

const recortar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class ConsultaUsuariosDto {
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(120)
  texto?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(40)
  rol?: string;

  @IsOptional()
  @IsIn(ESTADOS_USUARIO)
  estado?: EstadoUsuario;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pagina = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limite = 10;
}

export class ConsultaAuditoriaDto {
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(120)
  texto?: string;

  @IsOptional()
  @IsUUID()
  actorId?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(80)
  accion?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(80)
  recurso?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(80)
  recursoId?: string;

  @IsOptional()
  @IsIP()
  ip?: string;

  @IsOptional()
  @IsDateString()
  desde?: string;

  @IsOptional()
  @IsDateString()
  hasta?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pagina = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limite = 10;
}

export class CambiarModalidadDto {
  @IsBoolean()
  activo!: boolean;
}

const ROLES = ['ADMIN', 'JEFE', 'TRABAJADOR_INE', 'PROVEEDOR', 'SOLICITANTE'] as const;

export class AsignarRolesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @IsIn(ROLES, { each: true })
  roles!: string[];
}

export class CrearPersonalDto {
  @Transform(recortar)
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @Transform(recortar)
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  nombre!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @IsIn(['ADMIN', 'JEFE', 'TRABAJADOR_INE'], { each: true })
  roles!: string[];
}
