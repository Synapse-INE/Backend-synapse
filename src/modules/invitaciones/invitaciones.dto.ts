import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

const recortar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class NuevoProveedorDto {
  @Transform(recortar)
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  nombreComercial!: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(240)
  razonSocial?: string;
}

export class CrearInvitacionDto {
  @Transform(recortar)
  @IsEmail()
  @MaxLength(320)
  email!: string;

  /** Proveedor existente. Se debe indicar este o `nuevoProveedor`, no ambos. */
  @IsOptional()
  @IsUUID()
  proveedorId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => NuevoProveedorDto)
  nuevoProveedor?: NuevoProveedorDto;
}
