import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CatalogoIneService } from './catalogo-ine.service.js';

describe('CatalogoIneService', () => {
  const prisma = { referenciaINE: { findMany: vi.fn() } };
  let servicio: CatalogoIneService;

  beforeEach(() => {
    vi.clearAllMocks();
    servicio = new CatalogoIneService(prisma as never);
  });

  it('busca dentro del catálogo y devuelve el precio como texto', async () => {
    prisma.referenciaINE.findMany.mockResolvedValue([
      {
        id: 'r1',
        producto: 'Guantes',
        caracteristicas: null,
        presentacion: 'Caja',
        precioReferencia: { toString: () => '42.500' },
        moneda: 'GTQ',
        fechaPublicacion: null,
        vigenciaHasta: null,
        categoriaOriginal: null,
        nog: null,
      },
    ]);

    const resultado = await servicio.buscar({ texto: 'guan' });

    const { where, take } = prisma.referenciaINE.findMany.mock.calls[0][0];
    expect(where.OR[0].producto).toEqual({ contains: 'guan', mode: 'insensitive' });
    expect(take).toBe(10);
    expect(resultado.referencias[0].precioReferencia).toBe('42.500');
  });
});
