import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';

@Injectable()
export class PersonalIneService {
  constructor(private readonly prisma: PrismaService) {}

  listar() {
    return this.prisma.usuario.findMany({
      where: {
        estado: 'ACTIVO',
        roles: { some: { rol: { codigo: 'TRABAJADOR_INE' } } },
      },
      orderBy: { nombre: 'asc' },
      select: { id: true, nombre: true },
    });
  }
}
