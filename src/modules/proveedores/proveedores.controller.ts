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
  Req,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../../common/auth/auth-context.js';
import { Roles } from '../../common/auth/roles.decorator.js';
import {
  ApiProblema,
  ApiProtegido,
} from '../../infrastructure/openapi/decoradores.js';
import {
  ActualizarProductoProveedorDto,
  CrearProductoProveedorDto,
} from './proveedores.dto.js';
import { ProveedoresService } from './proveedores.service.js';

@Controller('proveedores/yo')
@Roles('PROVEEDOR')
@ApiTags('Catálogo del proveedor')
export class ProveedoresController {
  constructor(private readonly proveedores: ProveedoresService) {}

  @Get('productos')
  @ApiProtegido({ csrf: false, roles: 'PROVEEDOR' })
  @ApiOperation({
    summary: 'Listar los productos del proveedor autenticado',
    description:
      'Incluye el historial de precios de cada producto, ordenado del más antiguo al más reciente.',
  })
  @ApiOkResponse({
    schema: {
      example: {
        proveedor: {
          id: '9bc274e7-469c-4c41-ab69-57edfd567171',
          nombreComercial: 'Empresa de prueba',
        },
        productos: [],
      },
    },
  })
  listarProductos(@Req() request: AuthenticatedRequest) {
    return this.proveedores.listarProductos(request.auth.ownership);
  }

  @Post('productos')
  @HttpCode(HttpStatus.CREATED)
  @ApiProtegido({ csrf: true, roles: 'PROVEEDOR' })
  @ApiOperation({
    summary: 'Agregar un producto al catálogo',
    description:
      'Crea el producto en estado `PUBLICADO` con su primer precio y vigencia de seis meses.',
  })
  @ApiCreatedResponse({ description: 'Producto creado con su primer precio.' })
  @ApiProblema(403, 'La cuenta no está ligada a un proveedor (`PROVEEDOR_REQUERIDO`).')
  crearProducto(
    @Req() request: AuthenticatedRequest,
    @Body() body: CrearProductoProveedorDto,
  ) {
    return this.proveedores.crearProducto(
      request.auth.ownership,
      body,
      request.auth.usuario.id,
    );
  }

  @Patch('productos/:id')
  @ApiProtegido({ csrf: true, roles: 'PROVEEDOR' })
  @ApiOperation({
    summary: 'Editar un producto del catálogo',
    description:
      'Si el monto cambia respecto al precio vigente, agrega un registro nuevo en el historial.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ description: 'Producto actualizado.' })
  @ApiProblema(404, 'El producto no existe o no pertenece a este proveedor.')
  actualizarProducto(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ActualizarProductoProveedorDto,
  ) {
    return this.proveedores.actualizarProducto(
      request.auth.ownership,
      id,
      body,
      request.auth.usuario.id,
    );
  }

  @Post('productos/:id/confirmar-precio')
  @HttpCode(HttpStatus.OK)
  @ApiProtegido({ csrf: true, roles: 'PROVEEDOR' })
  @ApiOperation({
    summary: 'Confirmar el precio vencido',
    description:
      'Abre una nueva vigencia de seis meses con el mismo monto del último precio registrado.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ description: 'Precio confirmado con nueva vigencia.' })
  @ApiProblema(
    400,
    'El precio sigue vigente (`PRECIO_VIGENTE`) o el producto no tiene precio (`PRECIO_REQUERIDO`).',
  )
  confirmarPrecio(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.proveedores.confirmarPrecio(
      request.auth.ownership,
      id,
      request.auth.usuario.id,
    );
  }

  @Get('avisos-precio')
  @ApiProtegido({ csrf: false, roles: 'PROVEEDOR' })
  @ApiOperation({
    summary: 'Solicitudes que esperan la actualización de precios del proveedor',
    description:
      'Solo incluye avisos sin atender y dentro del plazo de dos días. Registrar o confirmar un precio del catálogo los atiende todos.',
  })
  @ApiOkResponse({ schema: { example: { avisos: [] } } })
  listarAvisosPrecio(@Req() request: AuthenticatedRequest) {
    return this.proveedores.listarAvisosPrecio(request.auth.ownership);
  }

  @Post('avisos-precio/:id/confirmar')
  @HttpCode(HttpStatus.OK)
  @ApiProtegido({ csrf: true, roles: 'PROVEEDOR' })
  @ApiOperation({
    summary: 'Confirmar que los precios del catálogo están al día',
    description: 'Atiende el aviso sin cambiar precios; devuelve los avisos que siguen pendientes.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ schema: { example: { avisos: [] } } })
  @ApiProblema(404, 'El aviso no existe o es de otro proveedor (`AVISO_NO_ENCONTRADO`).')
  confirmarAvisoPrecio(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.proveedores.confirmarAvisoPrecio(request.auth.ownership, id);
  }
}