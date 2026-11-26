import { Transform, Type } from 'class-transformer';
import {
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const recortar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class AtributosProductoDto {
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(160)
  marca?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(160)
  modelo?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(500)
  especificacion?: string;
}

export class CrearProductoProveedorDto {
  @Transform(recortar)
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  nombre!: string;

  @Transform(recortar)
  @IsString()
  @MinLength(1)
  @MaxLength(10_000)
  descripcion!: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(160)
  presentacion?: string;

  @Transform(recortar)
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  categoriaOriginal!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AtributosProductoDto)
  atributos?: AtributosProductoDto;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  monto!: number;
}

export class ActualizarProductoProveedorDto {
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  nombre?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MinLength(1)
  @MaxLength(10_000)
  descripcion?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(160)
  presentacion?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  categoriaOriginal?: string;

  @IsOptional()
  @IsObject()
  atributos?: Record<string, string>;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  monto?: number;
}