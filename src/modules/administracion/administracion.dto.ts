import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
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