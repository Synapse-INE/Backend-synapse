import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

const recortar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

class InstitucionDto {
  @Transform(recortar)
  @IsString()
  @MinLength(3)
  @MaxLength(240)
  nombreOficial!: string;

  @IsOptional()
  @Transform(recortar)
  @Matches(/^[0-9]{1,19}(-?[0-9Kk])?$/, { message: 'nit no es válido' })
  @MaxLength(20)
  nit?: string;
}

export class RegistroSolicitanteDto {
  @Transform(recortar)
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @MinLength(12, { message: 'La contraseña debe tener al menos 12 caracteres' })
  @MaxLength(128)
  password!: string;

  @Transform(recortar)
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  nombre!: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(160)
  cargo?: string;

  @ValidateNested()
  @Type(() => InstitucionDto)
  institucion!: InstitucionDto;
}

export class VerificarCorreoDto {
  @IsString()
  @MinLength(20)
  @MaxLength(128)
  token!: string;
}

export class ReenviarVerificacionDto {
  @Transform(recortar)
  @IsEmail()
  @MaxLength(320)
  email!: string;
}

export class AceptarInvitacionDto {
  @IsString()
  @MinLength(20)
  @MaxLength(128)
  token!: string;

  @IsString()
  @MinLength(12, { message: 'La contraseña debe tener al menos 12 caracteres' })
  @MaxLength(128)
  password!: string;

  @Transform(recortar)
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  nombre!: string;
}
