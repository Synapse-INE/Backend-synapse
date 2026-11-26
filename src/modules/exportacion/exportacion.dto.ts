import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

function textoOpcional(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const limpio = value.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  return limpio || undefined;
}

function booleano(value: unknown) {
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return undefined;
}

/** Mismos filtros que la publicación, más rango de fechas y solo vigentes. */
export class ConsultaExportacionDto {
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

  /** Un día exacto. No se combina con `desde` ni `hasta`. */
  @IsOptional()
  @Transform(({ value }) => textoOpcional(value))
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fecha?: string;

  @IsOptional()
  @Transform(({ value }) => textoOpcional(value))
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  desde?: string;

  @IsOptional()
  @Transform(({ value }) => textoOpcional(value))
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  hasta?: string;

  @IsOptional()
  @Transform(({ value }) => booleano(value))
  @IsBoolean()
  soloVigentes?: boolean;
}
