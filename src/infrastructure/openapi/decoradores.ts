import { applyDecorators } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
  ApiResponse,
  ApiSecurity,
  getSchemaPath,
} from '@nestjs/swagger';

export class ErrorCampoDto {
  @ApiProperty({ example: 'productos[1].cantidad' })
  field!: string;

  @ApiProperty({ example: 'La cantidad debe ser mayor que cero' })
  message!: string;
}

/** Cuerpo de todos los errores HTTP (RFC 7807, `application/problem+json`). */
export class ProblemaDto {
  @ApiProperty({
    example: 'https://portal-precios-ine.gob.gt/problems/validacion_fallida',
  })
  type!: string;

  @ApiProperty({ example: 'BAD_REQUEST' })
  title!: string;

  @ApiProperty({ example: 400 })
  status!: number;

  @ApiProperty({ example: 'Uno o más campos no cumplen el contrato.' })
  detail!: string;

  @ApiProperty({ example: '/api/v1/solicitudes' })
  instance!: string;

  @ApiProperty({
    description: 'Código estable para que el cliente decida qué mostrar.',
    example: 'VALIDACION_FALLIDA',
  })
  code!: string;

  @ApiPropertyOptional({ type: [ErrorCampoDto] })
  errors?: ErrorCampoDto[];
}

export const SEGURIDAD_SESION = 'session-cookie';
export const SEGURIDAD_CSRF = 'csrf-header';

/** Documenta una respuesta de error `application/problem+json`. */
export function ApiProblema(status: number, description: string) {
  return applyDecorators(
    ApiExtraModels(ProblemaDto),
    ApiResponse({
      status,
      description,
      content: {
        'application/problem+json': {
          schema: { $ref: getSchemaPath(ProblemaDto) },
        },
      },
    }),
  );
}

/**
 * Endpoint protegido: exige la cookie de sesión y, si modifica datos,
 * el encabezado CSRF devuelto al iniciar sesión o por `GET /auth/csrf`.
 */
export function ApiProtegido(opciones: { csrf: boolean; roles?: string }) {
  return applyDecorators(
    ApiCookieAuth(SEGURIDAD_SESION),
    ...(opciones.csrf ? [ApiSecurity(SEGURIDAD_CSRF)] : []),
    ApiProblema(401, 'Sesión ausente, expirada o revocada.'),
    ApiProblema(
      403,
      opciones.roles
        ? `Rol insuficiente (se requiere: ${opciones.roles})` +
            (opciones.csrf ? ' o token CSRF ausente o inválido.' : '.')
        : opciones.csrf
          ? 'Token CSRF ausente o inválido.'
          : 'Sin permiso.',
    ),
  );
}

export function ApiLimite() {
  return ApiProblema(
    429,
    'Se superó el límite de peticiones; reintenta más tarde.',
  );
}
