import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';

const ESPERA_BASE_MS = 2_000;

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  getStatus() {
    return {
      estado: 'ok',
      servicio: 'portal-precios-api',
    };
  }

  /** Readiness: la API puede atender solo si PostgreSQL responde a tiempo. */
  async estaLista() {
    try {
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise((_, rechazar) =>
          setTimeout(() => rechazar(new Error('timeout')), ESPERA_BASE_MS).unref(),
        ),
      ]);
      return true;
    } catch {
      return false;
    }
  }
}
