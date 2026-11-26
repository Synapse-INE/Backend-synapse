import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProveedoresService } from './proveedores.service.js';

describe('ProveedoresService', () => {
  const prisma = {
    proveedor: { findUniqueOrThrow: vi.fn() },
    productoProveedor: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  let servicio: ProveedoresService;

  const actor = {
    usuarioId: 'u1',
    proveedorId: 'prov-1',
    institucionId: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    servicio = new ProveedoresService(prisma as never);
  });

  it('rechaza listar si la cuenta no tiene proveedor', async () => {
    await expect(
      servicio.listarProductos({
        usuarioId: 'u1',
        proveedorId: null,
        institucionId: null,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('lista productos del proveedor autenticado', async () => {
    prisma.proveedor.findUniqueOrThrow.mockResolvedValue({
      id: 'prov-1',
      nombreComercial: 'Empresa',
    });
    prisma.productoProveedor.findMany.mockResolvedValue([]);

    const resultado = await servicio.listarProductos(actor);

    expect(resultado.proveedor.nombreComercial).toBe('Empresa');
    expect(resultado.productos).toEqual([]);
    expect(prisma.productoProveedor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { proveedorId: 'prov-1' } }),
    );
  });

  it('no confirma un producto ajeno', async () => {
    prisma.productoProveedor.findUnique.mockResolvedValue({
      id: 'p1',
      proveedorId: 'otro',
      precios: [{ monto: 10, moneda: 'GTQ', vigenciaHasta: new Date('2020-01-01') }],
    });

    await expect(servicio.confirmarPrecio(actor, 'p1', 'u1')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('no actualiza un producto inexistente', async () => {
    prisma.productoProveedor.findUnique.mockResolvedValue(null);

    await expect(
      servicio.actualizarProducto(actor, 'p1', { nombre: 'X' }, 'u1'),
    ).rejects.toThrow(NotFoundException);
  });
});