import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import type { BuscarCatalogoDto } from './catalogo-ine.dto.js';

@Injectable()
export class CatalogoIneService {
  constructor(private readonly prisma: PrismaService) {}

  async buscar(filtros: BuscarCatalogoDto) {
    const texto = filtros.texto.trim();
    const filas = await this.prisma.referenciaINE.findMany({
      where: {
        OR: [
          { producto: { contains: texto, mode: 'insensitive' } },
          { caracteristicas: { contains: texto, mode: 'insensitive' } },
          { presentacion: { contains: texto, mode: 'insensitive' } },
          { nog: { contains: texto, mode: 'insensitive' } },
        ],
      },
      orderBy: [{ fechaPublicacion: 'desc' }, { producto: 'asc' }],
      take: filtros.limite ?? 10,
      select: {
        id: true,
        producto: true,
        caracteristicas: true,
        presentacion: true,
        precioReferencia: true,
        moneda: true,
        fechaPublicacion: true,
        vigenciaHasta: true,
        categoriaOriginal: true,
        nog: true,
      },
    });

    return {
      referencias: filas.map((fila) => ({
        ...fila,
        precioReferencia: fila.precioReferencia?.toString() ?? null,
      })),
    };
  }
}
