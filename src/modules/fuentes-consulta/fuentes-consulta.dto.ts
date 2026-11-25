import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

const recortar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export const TIPOS_FUENTE = ['CATALOGO_INE', 'INSTITUCION', 'EMPRESA', 'OTRA'] as const;

export class CrearFuenteDto {
  @Transform(recortar)
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  nombre!: string;

  @IsIn(TIPOS_FUENTE)
  tipo!: (typeof TIPOS_FUENTE)[number];

  /** Sin esquema ni ruta. Solo un dominio que termine en .gt. */
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(253)
  dominio?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(500)
  nota?: string;
}

export class ActualizarFuenteDto {
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  nombre?: string;

  @IsOptional()
  @IsBoolean()
  activa?: boolean;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(253)
  dominio?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(500)
  nota?: string;
}

export class ListarFuentesDto {
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  soloActivas?: boolean;
}
