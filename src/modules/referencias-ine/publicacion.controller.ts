import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator.js';
import { ConsultarPublicacionDto } from './publicacion.consulta.dto.js';
import { PublicacionService } from './publicacion.service.js';

@Controller('publicacion')
@ApiTags('Publicación')
export class PublicacionController {
  constructor(private readonly publicacion: PublicacionService) {}

  @Get('resumen')
  @Public()
  @ApiOperation({
    summary: 'Resumen público de los precios de referencia publicados',
    description:
      'Cuenta los renglones reales del catálogo importado: cuántos siguen vigentes, cómo se compraron, en qué categorías hay más precios y cuántos se publicaron cada mes.',
  })
  @ApiOkResponse({
    schema: {
      example: {
        total: 7788,
        vigentes: 484,
        ultimaPublicacion: '2026-07-24',
        modalidadPrincipal: { etiqueta: 'Contrato Abierto', n: 7301, porcentaje: 94 },
        modalidades: [{ etiqueta: 'Contrato Abierto', n: 7301, porcentaje: 94 }],
        categorias: [{ etiqueta: 'Salud e insumos hospitalarios', n: 1456, porcentaje: 19 }],
        meses: [{ clave: '2026-07', etiqueta: 'Jul', n: 86 }],
        tendencia: '↑ alza',
        recientes: [
          {
            id: '0b1f2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
            producto: 'Guantes de nitrilo',
            precio: 42.5,
            fechaPublicacion: '2026-07-24',
          },
        ],
      },
    },
  })
  resumen() {
    return this.publicacion.resumen();
  }

  @Get('categorias')
  @Public()
  @ApiOperation({
    summary: 'Categorías de la publicación',
    description: 'Lista las categorías reales del catálogo, con la cantidad de renglones de cada una.',
  })
  @ApiOkResponse({
    schema: {
      example: {
        categorias: [{ etiqueta: 'Salud e insumos hospitalarios', n: 1456 }],
      },
    },
  })
  categorias() {
    return this.publicacion.categorias();
  }

  @Get('renglones')
  @Public()
  @ApiOperation({
    summary: 'Consultar renglones publicados',
    description:
      'Busca en el catálogo público por categoría, producto, NOG, fecha o un texto general. Devuelve una página de resultados. La portada pide cinco renglones; la lista pide hasta veinte.',
  })
  @ApiOkResponse({
    schema: {
      example: {
        total: 1456,
        vigentes: 120,
        pagina: 1,
        paginas: 73,
        limite: 20,
        renglones: [
          {
            id: '0b1f2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
            producto: 'Guantes de nitrilo',
            precio: 42.5,
            fechaPublicacion: '2026-07-24',
            categoria: 'Salud e insumos hospitalarios',
          },
        ],
      },
    },
  })
  renglones(@Query() filtros: ConsultarPublicacionDto) {
    return this.publicacion.renglones(filtros);
  }
}
