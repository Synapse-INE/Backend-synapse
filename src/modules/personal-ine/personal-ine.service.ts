import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { filtroPersonalAsignable } from './personal-asignable.js';

@Injectable()
export class PersonalIneService {
  constructor(private readonly prisma: PrismaService) {}

  listar() {
    return this.prisma.usuario.findMany({
      where: filtroPersonalAsignable,
      orderBy: { nombre: 'asc' },
      select: { id: true, nombre: true },
    });
  }
}
