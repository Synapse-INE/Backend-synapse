import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../../common/auth/auth-context.js';
import {
  ApiProblema,
  ApiProtegido,
} from '../../infrastructure/openapi/decoradores.js';
import {
  ActualizarProveedorPropuestoDto,
  ActualizarRequisitoDto,
  CambiarEstadoComisionDto,
  CrearCotizacionImportacionDto,
  CrearJustificacionDto,
  CrearProveedorPropuestoDto,
  CrearRequisitoDto,
  DecidirProveedorPropuestoDto,
  DecidirRequisitoDto,
  RepresentanteDto,
} from './formularios.dto.js';
import { FormulariosService } from './formularios.service.js';

const TIPOS_REPRESENTANTE = { TITULAR: 'TITULAR', SUPLENTE: 'SUPLENTE' } as const;
const NO_EDITABLE =
  'La solicitud no es un borrador ni está devuelta para subsanación (`SOLICITUD_NO_EDITABLE`).';
const NO_VISIBLE = 'No existe o no es visible (`SOLICITUD_NO_ENCONTRADA`).';

@Controller('solicitudes/:id')
@ApiTags('Formularios de la solicitud')
export class FormulariosController {
  constructor(private readonly formularios: FormulariosService) {}

  // ---- Requisitos del producto

  @Get('requisitos')
  @ApiProtegido({ csrf: false })
  @ApiOperation({ summary: 'Listar los requisitos de la solicitud' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiProblema(404, NO_VISIBLE)
  listarRequisitos(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.formularios.listarRequisitos(id, request.auth);
  }

  @Post('requisitos')
  @HttpCode(HttpStatus.CREATED)
  @ApiProtegido({ csrf: true })
  @ApiOperation({
    summary: 'Agregar un requisito',
    description:
      'Solo la persona autora, con la solicitud en borrador o devuelta. Nace `PENDIENTE` de aprobación del INE y con fuente `MANUAL`.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiCreatedResponse({
    schema: {
      example: {
        id: '3f1c6a4e-1b0f-4d3e-8a7a-2f6b9c1d0e11',
        nombre: 'Potencia',
        valor: '750',
        unidad: 'W',
        modo: 'MINIMO',
        obligatorio: true,
        fuente: 'MANUAL',
        estado: 'PENDIENTE',
      },
    },
  })
  @ApiProblema(404, NO_VISIBLE)
  @ApiProblema(409, NO_EDITABLE)
  crearRequisito(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CrearRequisitoDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.formularios.crearRequisito(id, body, request.auth, request.ip);
  }

  @Patch('requisitos/:requisitoId')
  @ApiProtegido({ csrf: true })
  @ApiOperation({
    summary: 'Modificar un requisito',
    description: 'Un cambio devuelve el requisito a `PENDIENTE` y anula la decisión anterior.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'requisitoId', format: 'uuid' })
  @ApiProblema(404, 'La solicitud o el requisito no existen.')
  @ApiProblema(409, NO_EDITABLE)
  actualizarRequisito(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('requisitoId', ParseUUIDPipe) requisitoId: string,
    @Body() body: ActualizarRequisitoDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.formularios.actualizarRequisito(id, requisitoId, body, request.auth, request.ip);
  }

  @Delete('requisitos/:requisitoId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiProtegido({ csrf: true })
  @ApiOperation({ summary: 'Eliminar un requisito' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'requisitoId', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Requisito eliminado.' })
  @ApiProblema(404, 'La solicitud o el requisito no existen.')
  @ApiProblema(409, NO_EDITABLE)
  eliminarRequisito(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('requisitoId', ParseUUIDPipe) requisitoId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.formularios.eliminarRequisito(id, requisitoId, request.auth, request.ip);
  }

  @Post('requisitos/:requisitoId/decision')
  @HttpCode(HttpStatus.OK)
  @ApiProtegido({ csrf: true })
  @ApiOperation({
    summary: 'Aprobar o rechazar un requisito',
    description: 'Solo el personal del INE, con la solicitud recibida y abierta. Registra quién decidió.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'requisitoId', format: 'uuid' })
  @ApiProblema(403, 'No es personal del INE (`ROL_NO_PERMITIDO`).')
  @ApiProblema(404, 'La solicitud o el requisito no existen.')
  @ApiProblema(409, 'La solicitud está cerrada (`SOLICITUD_CERRADA`).')
  decidirRequisito(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('requisitoId', ParseUUIDPipe) requisitoId: string,
    @Body() body: DecidirRequisitoDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.formularios.decidirRequisito(id, requisitoId, body, request.auth, request.ip);
  }

  // ---- S.11 Proveedores propuestos

  @Get('proveedores-propuestos')
  @ApiProtegido({ csrf: false })
  @ApiOperation({
    summary: 'Listar las empresas propuestas (formato S.11)',
    description: 'Cada empresa trae los `productoIds` que podría ofrecer.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiProblema(404, NO_VISIBLE)
  listarPropuestos(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.formularios.listarProveedoresPropuestos(id, request.auth);
  }

  @Post('proveedores-propuestos')
  @HttpCode(HttpStatus.CREATED)
  @ApiProtegido({ csrf: true })
  @ApiOperation({
    summary: 'Proponer una empresa',
    description:
      'En Subasta Electrónica Inversa, al enviar cada producto necesita al menos tres empresas propuestas no descartadas.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiProblema(404, NO_VISIBLE)
  @ApiProblema(409, NO_EDITABLE)
  @ApiProblema(422, 'Un producto no pertenece a la solicitud (`PRODUCTO_NO_PERTENECE`) o el proveedor no existe.')
  crearPropuesto(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CrearProveedorPropuestoDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.formularios.crearProveedorPropuesto(id, body, request.auth, request.ip);
  }

  @Patch('proveedores-propuestos/:propuestoId')
  @ApiProtegido({ csrf: true })
  @ApiOperation({
    summary: 'Modificar una empresa propuesta',
    description: 'Vuelve a `PENDIENTE` de confirmación del INE.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'propuestoId', format: 'uuid' })
  @ApiProblema(404, 'La solicitud o la empresa no existen.')
  @ApiProblema(409, NO_EDITABLE)
  actualizarPropuesto(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('propuestoId', ParseUUIDPipe) propuestoId: string,
    @Body() body: ActualizarProveedorPropuestoDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.formularios.actualizarProveedorPropuesto(
      id,
      propuestoId,
      body,
      request.auth,
      request.ip,
    );
  }

  @Delete('proveedores-propuestos/:propuestoId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiProtegido({ csrf: true })
  @ApiOperation({ summary: 'Quitar una empresa propuesta' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'propuestoId', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Empresa eliminada.' })
  @ApiProblema(404, 'La solicitud o la empresa no existen.')
  @ApiProblema(409, NO_EDITABLE)
  eliminarPropuesto(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('propuestoId', ParseUUIDPipe) propuestoId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.formularios.eliminarProveedorPropuesto(id, propuestoId, request.auth, request.ip);
  }

  @Post('proveedores-propuestos/:propuestoId/decision')
  @HttpCode(HttpStatus.OK)
  @ApiProtegido({ csrf: true })
  @ApiOperation({
    summary: 'Confirmar o descartar una empresa propuesta',
    description: 'Solo el personal del INE. Una empresa descartada no cuenta para el mínimo de tres.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'propuestoId', format: 'uuid' })
  @ApiProblema(403, 'No es personal del INE (`ROL_NO_PERMITIDO`).')
  @ApiProblema(404, 'La solicitud o la empresa no existen.')
  @ApiProblema(409, 'La solicitud está cerrada (`SOLICITUD_CERRADA`).')
  decidirPropuesto(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('propuestoId', ParseUUIDPipe) propuestoId: string,
    @Body() body: DecidirProveedorPropuestoDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.formularios.decidirProveedorPropuesto(
      id,
      propuestoId,
      body,
      request.auth,
      request.ip,
    );
  }

  // ---- S.21 / S.22 Bienes y suministros importados

  @Get('importacion')
  @ApiProtegido({ csrf: false })
  @ApiOperation({
    summary: 'Ver la comisión, las cotizaciones y las justificaciones de una importación',
    description:
      'Solo para solicitudes de Bienes y Suministros Importados. Los importes viajan como cadenas decimales.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({
    schema: {
      example: {
        comision: {
          id: '3f1c6a4e-1b0f-4d3e-8a7a-2f6b9c1d0e11',
          estado: 'EN_CONFORMACION',
          formadaEn: null,
          representantes: [],
        },
        cotizaciones: [],
        justificaciones: [],
      },
    },
  })
  @ApiProblema(404, NO_VISIBLE)
  @ApiProblema(409, 'La modalidad no es de importación (`MODALIDAD_NO_APLICA`).')
  obtenerImportacion(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.formularios.obtenerImportacion(id, request.auth);
  }

  @Put('importacion/representantes/:tipo')
  @ApiProtegido({ csrf: true })
  @ApiOperation({
    summary: 'Registrar el representante titular o suplente de la comisión',
    description: 'Crea o reemplaza al representante. Al enviar hacen falta ambos.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'tipo', enum: ['TITULAR', 'SUPLENTE'] })
  @ApiProblema(404, NO_VISIBLE)
  @ApiProblema(409, NO_EDITABLE)
  guardarRepresentante(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('tipo', new ParseEnumPipe(TIPOS_REPRESENTANTE)) tipo: 'TITULAR' | 'SUPLENTE',
    @Body() body: RepresentanteDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.formularios.guardarRepresentante(id, tipo, body, request.auth, request.ip);
  }

  @Post('importacion/estado-comision')
  @HttpCode(HttpStatus.OK)
  @ApiProtegido({ csrf: true })
  @ApiOperation({
    summary: 'Cambiar el estado de la comisión',
    description: 'Solo el personal del INE. Al pasar a `CONFORMADA` se registra la fecha de conformación.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiProblema(403, 'No es personal del INE (`ROL_NO_PERMITIDO`).')
  @ApiProblema(404, NO_VISIBLE)
  cambiarEstadoComision(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CambiarEstadoComisionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.formularios.cambiarEstadoComision(id, body, request.auth, request.ip);
  }

  @Post('importacion/cotizaciones')
  @HttpCode(HttpStatus.CREATED)
  @ApiProtegido({ csrf: true })
  @ApiOperation({
    summary: 'Registrar una cotización de importación',
    description:
      'Precio FOB, flete, seguro y otros gastos van como componentes separados. No se mezclan con el historial de precios del catálogo de proveedores. ' +
      'Al enviar, cada producto necesita al menos tres cotizaciones o una justificación `COTIZACIONES_INSUFICIENTES`.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiProblema(404, NO_VISIBLE)
  @ApiProblema(409, NO_EDITABLE)
  @ApiProblema(422, 'Producto ajeno a la solicitud o importes inválidos.')
  crearCotizacion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CrearCotizacionImportacionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.formularios.crearCotizacion(id, body, request.auth, request.ip);
  }

  @Delete('importacion/cotizaciones/:cotizacionId')
  @ApiProtegido({ csrf: true })
  @ApiOperation({ summary: 'Eliminar una cotización de importación' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'cotizacionId', format: 'uuid' })
  @ApiProblema(404, 'La solicitud o la cotización no existen.')
  @ApiProblema(409, NO_EDITABLE)
  eliminarCotizacion(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('cotizacionId', ParseUUIDPipe) cotizacionId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.formularios.eliminarCotizacion(id, cotizacionId, request.auth, request.ip);
  }

  // ---- Justificaciones

  @Get('justificaciones')
  @ApiProtegido({ csrf: false })
  @ApiOperation({ summary: 'Listar las justificaciones de la solicitud' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiProblema(404, NO_VISIBLE)
  listarJustificaciones(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.formularios.listarJustificaciones(id, request.auth);
  }

  @Post('justificaciones')
  @HttpCode(HttpStatus.CREATED)
  @ApiProtegido({ csrf: true })
  @ApiOperation({
    summary: 'Agregar una justificación firmada por la autoridad',
    description:
      '`COTIZACIONES_INSUFICIENTES` exime del mínimo de tres cotizaciones (del producto indicado o de toda la solicitud si no se indica).',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiProblema(404, NO_VISIBLE)
  @ApiProblema(409, NO_EDITABLE)
  @ApiProblema(422, 'El producto no pertenece a la solicitud (`PRODUCTO_NO_PERTENECE`).')
  crearJustificacion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CrearJustificacionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.formularios.crearJustificacion(id, body, request.auth, request.ip);
  }

  @Delete('justificaciones/:justificacionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiProtegido({ csrf: true })
  @ApiOperation({ summary: 'Eliminar una justificación' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'justificacionId', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Justificación eliminada.' })
  @ApiProblema(404, 'La solicitud o la justificación no existen.')
  @ApiProblema(409, NO_EDITABLE)
  eliminarJustificacion(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('justificacionId', ParseUUIDPipe) justificacionId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.formularios.eliminarJustificacion(id, justificacionId, request.auth, request.ip);
  }
}
