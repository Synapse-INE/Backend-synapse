import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
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

export const ESTADOS_SOLICITUD = [
  'BORRADOR',
  'RECIBIDA',
  'EN_REVISION',
  'PENDIENTE_SUBSANACION',
  'EN_INVESTIGACION',
  'EN_ANALISIS',
  'EN_INFORME',
  'EN_ENTREGA',
  'COMPLETADA',
  'RECHAZADA',
  'EN_ESPERA',
  'CANCELADA',
] as const;

/** Destinos que el personal del INE elige en el cambio de estado. La subsanación sale por el comentario. */
export const ESTADOS_CAMBIO = [
  'EN_REVISION',
  'EN_INVESTIGACION',
  'EN_ANALISIS',
  'EN_INFORME',
  'EN_ENTREGA',
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
  @IsIn([...ESTADOS_SOLICITUD])
  estado?: string;

  /** Bandeja del responsable. Solo aplica al personal del INE. */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  asignadasAMi?: boolean;
}

export class CambiarEstadoDto {
  @IsIn(ESTADOS_CAMBIO)
  estado!: (typeof ESTADOS_CAMBIO)[number];

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(1000)
  motivo?: string;
}

export class AsignarSolicitudDto {
  @IsUUID()
  usuarioId!: string;
}

export class CrearComentarioDto {
  @Transform(recortar)
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  contenido!: string;

  @IsOptional()
  @IsBoolean()
  esInterno?: boolean;

  /** Devuelve el expediente a la entidad. Exige un comentario visible y un estado de revisión. */
  @IsOptional()
  @IsBoolean()
  devolver?: boolean;
}

const PRECIO = /^\d{1,11}(\.\d{1,3})?$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export class PrecioConsultadoDto {
  @IsUUID()
  productoSolicitudId!: string;

  @Matches(PRECIO, { message: 'precio debe ser un decimal con hasta 3 decimales' })
  precio!: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(/^[A-Z]{3}$/, { message: 'moneda debe ser un código de 3 letras' })
  moneda?: string;

  @Transform(recortar)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  unidadMedida!: string;

  @IsOptional()
  @IsUUID()
  referenciaIneId?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(500)
  observacion?: string;
}

export class CrearConsultaDto {
  @IsUUID()
  fuenteId!: string;

  @Matches(FECHA, { message: 'fechaConsulta debe ser YYYY-MM-DD' })
  fechaConsulta!: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(1000)
  nota?: string;

  /** Referencia textual de la evidencia. El PDF, si se adjunta, es opcional. */
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(500)
  evidencia?: string;

  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PrecioConsultadoDto)
  precios!: PrecioConsultadoDto[];
}

export class MarcarAtipicoDto {
  @IsUUID()
  precioConsultadoId!: string;

  @IsBoolean()
  esAtipico!: boolean;
}

export class RegistrarValidacionDto {
  @IsUUID()
  productoSolicitudId!: string;

  @Matches(PRECIO, { message: 'precioAdoptado debe ser un decimal con hasta 3 decimales' })
  precioAdoptado!: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(/^[A-Z]{3}$/, { message: 'moneda debe ser un código de 3 letras' })
  moneda?: string;

  @Transform(recortar)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  unidadMedida!: string;

  @Transform(recortar)
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  criterio!: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(1000)
  notaAtipicos?: string;

  /** La confirmación la hace el analista. Sin ella el precio no queda oficial. */
  @IsOptional()
  @IsBoolean()
  confirmar?: boolean;
}

export class CrearInformeDto {
  @IsIn(['INFORME_TECNICO', 'OFICIO'])
  tipo!: 'INFORME_TECNICO' | 'OFICIO';

  @Transform(recortar)
  @IsString()
  @MinLength(3)
  @MaxLength(240)
  destinatario!: string;

  /** Si se omite, el servidor arma un borrador con los datos guardados. */
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MinLength(1)
  @MaxLength(20_000)
  resumen?: string;
}

export class RegistrarEntregaDto {
  @IsOptional()
  @IsUUID()
  informeId?: string;

  @IsIn(['DIGITAL', 'FISICA', 'CD'])
  medio!: 'DIGITAL' | 'FISICA' | 'CD';

  @Transform(recortar)
  @IsString()
  @MinLength(3)
  @MaxLength(240)
  destinatario!: string;

  @Matches(FECHA, { message: 'fechaEntrega debe ser YYYY-MM-DD' })
  fechaEntrega!: string;

  @Transform(recortar)
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  constancia!: string;
}

export class CorregirPrecioConsultadoDto {
  @IsUUID()
  id!: string;

  @IsOptional()
  @Matches(PRECIO, { message: 'precio debe ser un decimal con hasta 3 decimales' })
  precio?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(/^[A-Z]{3}$/, { message: 'moneda debe ser un código de 3 letras' })
  moneda?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  unidadMedida?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(500)
  observacion?: string;
}

export class CorregirConsultaDto {
  @IsOptional()
  @Matches(FECHA, { message: 'fechaConsulta debe ser YYYY-MM-DD' })
  fechaConsulta?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(1000)
  nota?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(500)
  evidencia?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CorregirPrecioConsultadoDto)
  precios?: CorregirPrecioConsultadoDto[];
}
