import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

const recortar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Importes como cadena decimal: nunca como número flotante en JSON. */
const IMPORTE = /^\d{1,11}(\.\d{1,3})?$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// ---- B-07 · Requisitos del producto

export const MODOS_REQUISITO = ['EXACTO', 'PREFERIDO', 'MINIMO'] as const;

export class CrearRequisitoDto {
  @Transform(recortar)
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  nombre!: string;

  @Transform(recortar)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  valor!: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(80)
  unidad?: string;

  @IsOptional()
  @IsIn(MODOS_REQUISITO)
  modo?: (typeof MODOS_REQUISITO)[number];

  @IsOptional()
  @IsBoolean()
  obligatorio?: boolean;
}

export class ActualizarRequisitoDto {
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  nombre?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  valor?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(80)
  unidad?: string;

  @IsOptional()
  @IsIn(MODOS_REQUISITO)
  modo?: (typeof MODOS_REQUISITO)[number];

  @IsOptional()
  @IsBoolean()
  obligatorio?: boolean;
}

export class DecidirRequisitoDto {
  @IsIn(['APROBADO', 'RECHAZADO'])
  estado!: 'APROBADO' | 'RECHAZADO';
}

// ---- B-08 · S.11 Proveedores propuestos

export class CrearProveedorPropuestoDto {
  @Transform(recortar)
  @IsString()
  @MinLength(2)
  @MaxLength(240)
  nombreRazonSocial!: string;

  @IsOptional()
  @Transform(recortar)
  @Matches(/^[0-9]{1,19}(-?[0-9Kk])?$/, { message: 'nit no es válido' })
  @MaxLength(40)
  nit?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(500)
  direccion?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(40)
  telefono?: string;

  /** Proveedor ya registrado en el portal, si lo hay. */
  @IsOptional()
  @IsUUID()
  proveedorId?: string;

  /** Productos de la solicitud que esta empresa podría ofrecer. */
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  productoIds!: string[];
}

export class ActualizarProveedorPropuestoDto {
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MinLength(2)
  @MaxLength(240)
  nombreRazonSocial?: string;

  @IsOptional()
  @Transform(recortar)
  @Matches(/^[0-9]{1,19}(-?[0-9Kk])?$/, { message: 'nit no es válido' })
  @MaxLength(40)
  nit?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(500)
  direccion?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(40)
  telefono?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  productoIds?: string[];
}

export class DecidirProveedorPropuestoDto {
  @IsIn(['CONFIRMADO', 'DESCARTADO'])
  estado!: 'CONFIRMADO' | 'DESCARTADO';
}

// ---- B-09 · S.21 / S.22 Importación

export class RepresentanteDto {
  @Transform(recortar)
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  nombre!: string;

  @Transform(recortar)
  @IsString()
  @MaxLength(320)
  @Matches(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, { message: 'correo no es válido' })
  correo!: string;

  @Transform(recortar)
  @IsString()
  @MinLength(5)
  @MaxLength(40)
  telefono!: string;

  @Transform(recortar)
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  direccionNotificaciones!: string;
}

export class CotizacionProductoDto {
  @IsUUID()
  productoSolicitudId!: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(4000)
  especificacionesCotizacion?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(240)
  fabricante?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(120)
  paisOrigen?: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Matches(/^[A-Z]{3}$/, { message: 'moneda debe ser un código ISO de 3 letras' })
  moneda!: string;

  @Matches(IMPORTE, { message: 'precioFobTotal debe ser un decimal con hasta 3 decimales' })
  precioFobTotal!: string;

  @IsOptional()
  @Matches(IMPORTE, { message: 'flete debe ser un decimal con hasta 3 decimales' })
  flete?: string;

  @IsOptional()
  @Matches(IMPORTE, { message: 'seguro debe ser un decimal con hasta 3 decimales' })
  seguro?: string;

  @IsOptional()
  @Matches(IMPORTE, { message: 'otrosGastos debe ser un decimal con hasta 3 decimales' })
  otrosGastos?: string;
}

export class CrearCotizacionImportacionDto {
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(120)
  numeroCotizacion?: string;

  @Transform(recortar)
  @IsString()
  @MinLength(2)
  @MaxLength(240)
  proveedorNombre!: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(500)
  @Matches(/^https?:\/\//i, { message: 'sitioWeb debe empezar con http:// o https://' })
  sitioWeb?: string;

  @IsOptional()
  @Transform(recortar)
  @Matches(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, { message: 'correoProveedor no es válido' })
  @MaxLength(320)
  correoProveedor?: string;

  @IsOptional()
  @Transform(recortar)
  @Matches(/^\+?[0-9]{1,7}$/, { message: 'codigoPaisTelefono no es válido' })
  codigoPaisTelefono?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(40)
  telefonoProveedor?: string;

  @IsOptional()
  @Matches(FECHA, { message: 'fechaConsulta debe tener formato AAAA-MM-DD' })
  fechaConsulta?: string;

  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CotizacionProductoDto)
  productos!: CotizacionProductoDto[];
}

export class CambiarEstadoComisionDto {
  @IsIn(['EN_CONFORMACION', 'CONFORMADA', 'FINALIZADA'])
  estado!: 'EN_CONFORMACION' | 'CONFORMADA' | 'FINALIZADA';
}

export class CrearJustificacionDto {
  @IsIn(['COTIZACIONES_INSUFICIENTES', 'NO_UTILIZA_CATALOGO_SIGES'])
  tipo!: 'COTIZACIONES_INSUFICIENTES' | 'NO_UTILIZA_CATALOGO_SIGES';

  @Transform(recortar)
  @IsString()
  @MinLength(10)
  @MaxLength(4000)
  motivo!: string;

  @Transform(recortar)
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  autoridadNombre!: string;

  @Transform(recortar)
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  autoridadCargo!: string;

  @IsOptional()
  @IsUUID()
  productoSolicitudId?: string;
}
