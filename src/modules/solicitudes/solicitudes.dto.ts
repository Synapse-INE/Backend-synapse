import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const recortar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export const MODALIDADES = [
  'CONTRATO_ABIERTO',
  'SUBASTA_ELECTRONICA_INVERSA',
  'BIENES_SUMINISTROS_IMPORTADOS',
] as const;

export const ESTADOS_REVISABLES = [
  'EN_REVISION',
  'EN_ANALISIS',
  'COMPLETADA',
  'RECHAZADA',
] as const;

export class ProductoSolicitudDto {
  @Transform(recortar)
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  nombre!: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(100)
  codigoSiges?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(10_000)
  especificacionesTecnicas?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(120)
  unidadMedida?: string;

  /** Decimal como cadena para no perder precisión en JSON. */
  @IsOptional()
  @Matches(/^\d{1,11}(\.\d{1,3})?$/, {
    message: 'cantidad debe ser un decimal positivo con hasta 3 decimales',
  })
  cantidad?: string;
}

class CamposSolicitudDto {
  @IsOptional()
  @IsIn(MODALIDADES)
  modalidad?: (typeof MODALIDADES)[number];

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(240)
  unidadEjecutora?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'fechaFormulario debe ser YYYY-MM-DD' })
  fechaFormulario?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(160)
  enlaceNombre?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(160)
  enlaceCargo?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(160)
  autoridadNombre?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(160)
  autoridadCargo?: string;

  /** Si se envía, reemplaza por completo la lista de productos. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ProductoSolicitudDto)
  productos?: ProductoSolicitudDto[];
}

export class CrearSolicitudDto extends CamposSolicitudDto {
  @Transform(recortar)
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  titulo!: string;

  @Transform(recortar)
  @IsString()
  @MinLength(1)
  @MaxLength(10_000)
  descripcion!: string;
}

export class ActualizarSolicitudDto extends CamposSolicitudDto {
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  titulo?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MinLength(1)
  @MaxLength(10_000)
  descripcion?: string;
}

export class ListarSolicitudesDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limite?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  desplazamiento?: number;

  @IsOptional()
  @IsIn(['BORRADOR', 'RECIBIDA', ...ESTADOS_REVISABLES])
  estado?: string;
}

export class CambiarEstadoDto {
  @IsIn(ESTADOS_REVISABLES)
  estado!: (typeof ESTADOS_REVISABLES)[number];

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(1000)
  motivo?: string;
}
