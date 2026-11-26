import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PersonalIneService } from './personal-ine.service.js';

describe('PersonalIneService', () => {
  const prisma = { usuario: { findMany: vi.fn() } };
  let servicio: PersonalIneService;

  beforeEach(() => {
    vi.clearAllMocks();
    servicio = new PersonalIneService(prisma as never);
  });

  it('pide solo personal activo del INE, con identificador y nombre', async () => {
    prisma.usuario.findMany.mockResolvedValue([]);

    await servicio.listar();

    expect(prisma.usuario.findMany).toHaveBeenCalledWith({
      where: {
        estado: 'ACTIVO',
        roles: {
          some: {
            rol: { codigo: { in: ['TRABAJADOR_INE', 'JEFE'] } },
          },
        },
      },
      orderBy: { nombre: 'asc' },
      select: { id: true, nombre: true },
    });
  });
});