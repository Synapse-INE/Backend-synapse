import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/auth/roles.decorator.js';
import { ApiProtegido } from '../../infrastructure/openapi/decoradores.js';
import { BuscarCatalogoDto } from './catalogo-ine.dto.js';
import { CatalogoIneService } from './catalogo-ine.service.js';

@Controller('referencias-ine')
@Roles('TRABAJADOR_INE', 'ADMIN')
@ApiTags('Catálogo interno del INE')
export class CatalogoIneController {
  constructor(private readonly catalogo: CatalogoIneService) {}

  @Get()
  @ApiProtegido({ csrf: false, roles: 'TRABAJADOR_INE, ADMIN' })
  @ApiOperation({
    summary: 'Buscar en el catálogo interno importado',
    description:
      'Consulta las filas ya cargadas del libro del INE. No sale a internet. El precio que devuelve es de referencia histórica; no se adopta como resultado del expediente.',
  })
  @ApiOkResponse({
    schema: {
      example: {
        referencias: [
          {
            id: '0b1f2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
            producto: 'Guantes de nitrilo',
            caracteristicas: 'Talla M',
            presentacion: 'Caja',
            precioReferencia: '42.500',
            moneda: 'GTQ',
            fechaPublicacion: '2026-01-15T00:00:00.000Z',
            vigenciaHasta: null,
            categoriaOriginal: 'Médico quirúrgico',
            nog: '123',
          },
        ],
      },
    },
  })
  buscar(@Query() filtros: BuscarCatalogoDto) {
    return this.catalogo.buscar(filtros);
  }
}
