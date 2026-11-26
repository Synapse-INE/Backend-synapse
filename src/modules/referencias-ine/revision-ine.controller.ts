import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UnprocessableEntityException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AuthenticatedRequest } from '../../common/auth/auth-context.js';
import { Roles } from '../../common/auth/roles.decorator.js';
import {
  ApiLimite,
  ApiProblema,
  ApiProtegido,
} from '../../infrastructure/openapi/decoradores.js';
import {
  ConsultaAliasDto,
  ConsultaFilasDto,
  ConsultaPaginadaDto,
  RevisarAliasDto,
} from './revision-ine.dto.js';
import { RevisionIneService, type ArchivoCargado } from './revision-ine.service.js';

const MAXIMO_LIBRO_BYTES = 50 * 1024 * 1024;

@Controller()
@Roles('ADMIN')
@ApiTags('Revisión del catálogo INE')
export class RevisionIneController {
  constructor(private readonly revision: RevisionIneService) {}

  @Get('importaciones-ine')
  @ApiProtegido({ csrf: false, roles: 'ADMIN' })
  @ApiOperation({ summary: 'Listar las importaciones del libro del INE' })
  listarImportaciones(@Query() consulta: ConsultaPaginadaDto) {
    return this.revision.listarImportaciones(consulta);
  }

  @Post('importaciones-ine')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiProtegido({ csrf: true, roles: 'ADMIN' })
  @ApiOperation({
    summary: 'Cargar el libro XLSX del INE',
    description:
      'Multipart con el campo `archivo`. Es idempotente por huella SHA-256: el mismo libro no se importa dos veces (`yaExistia: true`). ' +
      'Máximo 50 MB. Las filas con observaciones quedan en estado `REVISAR`.',
  })
  @ApiOkResponse({
    schema: {
      example: {
        importacionId: '3f1c6a4e-1b0f-4d3e-8a7a-2f6b9c1d0e11',
        yaExistia: false,
        estado: 'PARCIAL',
        filasLeidas: 8000,
        filasAceptadas: 7000,
        filasConObservaciones: 900,
        filasRechazadas: 100,
      },
    },
  })
  @ApiProblema(422, 'Falta el archivo (`ARCHIVO_REQUERIDO`) o no es un libro XLSX válido (`ARCHIVO_NO_VALIDO`).')
  @ApiLimite()
  @UseInterceptors(
    FileInterceptor('archivo', { limits: { fileSize: MAXIMO_LIBRO_BYTES } }),
  )
  importar(
    @UploadedFile() archivo: ArchivoCargado | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    if (!archivo) {
      throw new UnprocessableEntityException({
        code: 'ARCHIVO_REQUERIDO',
        detail: 'Envía el libro en el campo `archivo`.',
      });
    }
    return this.revision.importar(archivo, request.auth.usuario.id, request.ip);
  }

  @Get('importaciones-ine/:id/filas')
  @ApiProtegido({ csrf: false, roles: 'ADMIN' })
  @ApiOperation({
    summary: 'Revisar las filas de una importación',
    description: 'Filtra por `estado` (por ejemplo `REVISAR`). Incluye los errores y la fila original.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiProblema(404, 'La importación no existe (`IMPORTACION_NO_ENCONTRADA`).')
  listarFilas(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() consulta: ConsultaFilasDto,
  ) {
    return this.revision.listarFilas(id, consulta);
  }

  @Post('importaciones-ine/:id/reprocesar')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiProtegido({ csrf: true, roles: 'ADMIN' })
  @ApiOperation({
    summary: 'Volver a normalizar una importación',
    description: 'Aplica los alias ya confirmados a las filas en `REVISAR`.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiProblema(404, 'La importación no existe (`IMPORTACION_NO_ENCONTRADA`).')
  @ApiLimite()
  reprocesar(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.revision.reprocesar(id, request.auth.usuario.id, request.ip);
  }

  @Get('alias-modalidad')
  @ApiProtegido({ csrf: false, roles: 'ADMIN' })
  @ApiOperation({
    summary: 'Listar los alias de modalidad detectados',
    description: 'Filtra por `estado` (`PENDIENTE`, `CONFIRMADO`, `DESCARTADO`).',
  })
  listarAlias(@Query() consulta: ConsultaAliasDto) {
    return this.revision.listarAlias(consulta);
  }

  @Patch('alias-modalidad/:id')
  @ApiProtegido({ csrf: true, roles: 'ADMIN' })
  @ApiOperation({
    summary: 'Confirmar o descartar un alias de modalidad',
    description:
      'Confirmar exige `tipoModalidadId` (modalidad oficial activa). Queda registrado quién revisó. ' +
      'Después conviene reprocesar la importación para que las filas tomen el alias.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiProblema(404, 'El alias no existe (`ALIAS_NO_ENCONTRADO`).')
  @ApiProblema(422, 'Falta o no es válida la modalidad (`MODALIDAD_NO_VALIDA`).')
  revisarAlias(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RevisarAliasDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.revision.revisarAlias(id, body, request.auth.usuario.id, request.ip);
  }
}
