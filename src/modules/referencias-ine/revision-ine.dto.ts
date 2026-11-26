import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class ConsultaPaginadaDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  pagina = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limite = 20;
}

export class ConsultaFilasDto extends ConsultaPaginadaDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsIn(['PENDIENTE', 'NORMALIZADA', 'REVISAR', 'RECHAZADA'])
  estado?: 'PENDIENTE' | 'NORMALIZADA' | 'REVISAR' | 'RECHAZADA';
}

export class ConsultaAliasDto extends ConsultaPaginadaDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsIn(['PENDIENTE', 'CONFIRMADO', 'DESCARTADO'])
  estado?: 'PENDIENTE' | 'CONFIRMADO' | 'DESCARTADO';
}

export class RevisarAliasDto {
  @IsIn(['CONFIRMADO', 'DESCARTADO'])
  estado!: 'CONFIRMADO' | 'DESCARTADO';

  /** Obligatorio al confirmar: a qué modalidad oficial equivale el alias. */
  @IsOptional()
  @IsUUID()
  tipoModalidadId?: string;
}
