import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

const recortar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class OlvideContrasenaDto {
  @Transform(recortar)
  @IsEmail()
  @MaxLength(320)
  email!: string;
}

export class RestablecerContrasenaDto {
  @IsString()
  @MinLength(20)
  @MaxLength(128)
  token!: string;

  @IsString()
  @MinLength(12, { message: 'La contraseña debe tener al menos 12 caracteres' })
  @MaxLength(128)
  password!: string;
}

export class CambiarContrasenaDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  passwordActual!: string;

  @IsString()
  @MinLength(12, { message: 'La contraseña debe tener al menos 12 caracteres' })
  @MaxLength(128)
  passwordNueva!: string;
}
