import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

function textoOpcional(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const limpio = value.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  return limpio || undefined;
}

export class ConsultarPublicacionDto {
  @IsOptional()
  @Transform(({ value }) => textoOpcional(value))
  @IsString()
  @MaxLength(240)
  categoria?: string;

  @IsOptional()
  @Transform(({ value }) => textoOpcional(value))
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  producto?: string;

  @IsOptional()
  @Transform(({ value }) => textoOpcional(value))
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  nog?: string;

  @IsOptional()
  @Transform(({ value }) => textoOpcional(value))
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  texto?: string;

  @IsOptional()
  @Transform(({ value }) => textoOpcional(value))
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fecha?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limite?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2000)
  pagina?: number;
}
