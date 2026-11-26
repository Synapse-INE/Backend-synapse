import { describe, expect, it, vi } from 'vitest';
import { HealthService } from './health.service.js';

describe('HealthService', () => {
  it('está lista cuando PostgreSQL responde', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]) };

    await expect(new HealthService(prisma as never).estaLista()).resolves.toBe(true);
  });

  it('no está lista cuando la consulta falla', async () => {
    const prisma = { $queryRaw: vi.fn().mockRejectedValue(new Error('sin conexión')) };

    await expect(new HealthService(prisma as never).estaLista()).resolves.toBe(false);
  });

  it('el estado de vida no depende de la base', () => {
    expect(new HealthService({} as never).getStatus()).toEqual({
      estado: 'ok',
      servicio: 'portal-precios-api',
    });
  });
});
