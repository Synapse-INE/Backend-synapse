import { Controller, Get, Query, Req, Res, StreamableFile } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../common/auth/auth-context.js';
import { Roles } from '../../common/auth/roles.decorator.js';
import {
  ApiLimite,
  ApiProblema,
  ApiProtegido,
} from '../../infrastructure/openapi/decoradores.js';
import { ConsultaExportacionDto } from './exportacion.dto.js';
import { nombreArchivo } from './exportacion.filas.js';
import { ExportacionService } from './exportacion.service.js';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const TOO_BIG =
  'La consulta supera el máximo del formato (`EXPORTACION_DEMASIADO_GRANDE`) o los filtros son incompatibles (`VALIDACION_FALLIDA`).';

@Controller('exportaciones/precios')
@Roles('JEFE', 'TRABAJADOR_INE', 'ADMIN')
@ApiTags('Exportación de precios')
export class ExportacionController {
  constructor(private readonly exportacion: ExportacionService) {}

  @Get('datos')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiProtegido({ csrf: false, roles: 'JEFE, TRABAJADOR_INE, ADMIN' })
  @ApiOperation({
    summary: 'Datos del catálogo de precios para que el frontend arme su propio PDF',
    description:
      'Devuelve las filas y la definición de columnas, sin generar ningún archivo. Mismos filtros que las demás exportaciones. ' +
      'Máximo 20 000 filas. Los precios son cadenas decimales con tres decimales y las fechas `AAAA-MM-DD`. Cada consulta queda auditada.',
  })
  @ApiOkResponse({
    schema: {
      example: {
        generadoEn: '2026-11-26T02:00:00.000Z',
        total: 1,
        filtros: { Categoría: 'Médico quirúrgico' },
        columnas: [
          { clave: 'producto', titulo: 'Producto' },
          { clave: 'precioReferencia', titulo: 'Precio de referencia' },
        ],
        filas: [
          {
            nog: '123456',
            producto: 'Guantes de nitrilo',
            presentacion: 'Caja',
            precioReferencia: '42.500',
            moneda: 'GTQ',
            fechaPublicacion: '2026-01-15',
            vigenciaHasta: '2026-12-31',
            vigente: true,
          },
        ],
      },
    },
  })
  @ApiProblema(422, TOO_BIG)
  @ApiLimite()
  datos(@Query() filtro: ConsultaExportacionDto, @Req() request: AuthenticatedRequest) {
    return this.exportacion.datos(filtro, {
      actorId: request.auth.usuario.id,
      ip: request.ip,
    });
  }

  @Get('excel')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiProtegido({ csrf: false, roles: 'JEFE, TRABAJADOR_INE, ADMIN' })
  @ApiOperation({
    summary: 'Descargar el catálogo de precios en Excel (.xlsx)',
    description:
      'Hoja `Precios` con filtro automático y encabezado fijo, y hoja `Información` con filtros y fecha. Máximo 50 000 filas. ' +
      'Los textos que empiezan con `=`, `+`, `-` o `@` se neutralizan para evitar inyección de fórmulas.',
  })
  @ApiProduces(XLSX)
  @ApiOkResponse({
    description: 'Libro de Excel.',
    content: { [XLSX]: { schema: { type: 'string', format: 'binary' } } },
  })
  @ApiProblema(422, TOO_BIG)
  @ApiLimite()
  async excel(
    @Query() filtro: ConsultaExportacionDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const archivo = await this.exportacion.excel(filtro, {
      actorId: request.auth.usuario.id,
      ip: request.ip,
    });
    return this.descarga(response, archivo, XLSX, nombreArchivo('xlsx'));
  }

  @Get('pdf')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiProtegido({ csrf: false, roles: 'JEFE, TRABAJADOR_INE, ADMIN' })
  @ApiOperation({
    summary: 'Descargar el catálogo de precios en PDF',
    description:
      'Reporte horizontal con encabezado repetido, filtros aplicados y numeración de páginas. Máximo 3 000 filas; para más, usa Excel o `datos`.',
  })
  @ApiProduces('application/pdf')
  @ApiOkResponse({
    description: 'Documento PDF.',
    content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } },
  })
  @ApiProblema(422, TOO_BIG)
  @ApiLimite()
  async pdf(
    @Query() filtro: ConsultaExportacionDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const archivo = await this.exportacion.pdf(filtro, {
      actorId: request.auth.usuario.id,
      ip: request.ip,
    });
    return this.descarga(response, archivo, 'application/pdf', nombreArchivo('pdf'));
  }

  private descarga(response: Response, archivo: Buffer, tipo: string, nombre: string) {
    response.set({
      'Content-Type': tipo,
      'Content-Disposition': `attachment; filename="${nombre}"`,
      'Content-Length': String(archivo.length),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    return new StreamableFile(archivo);
  }
}
