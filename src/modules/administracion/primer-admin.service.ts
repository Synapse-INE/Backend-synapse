import { ConflictException, Injectable } from '@nestjs/common';
import argon2 from 'argon2';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';

export const ERROR_ADMIN_EXISTENTE = 'ADMIN_YA_EXISTE';

/** Clave del candado de sesión que serializa la creación del primer administrador. */
const CANDADO_PRIMER_ADMIN = 7_201_126;

export interface DatosPrimerAdmin {
  email: string;
  nombre: string;
  password: string;
}

@Injectable()
export class PrimerAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * Crea la cuenta del primer administrador. Se niega si ya hay uno, para que
   * no sirva como vía de escalada una vez operando el sistema.
   */
  async crear(datos: DatosPrimerAdmin) {
    const email = datos.email.trim().toLowerCase();
    const nombre = datos.nombre.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
      throw new Error('El correo no es válido.');
    }
    if (nombre.length < 2 || nombre.length > 160) {
      throw new Error('El nombre debe tener entre 2 y 160 caracteres.');
    }
    if (datos.password.length < 12 || datos.password.length > 128) {
      throw new Error('La contraseña debe tener entre 12 y 128 caracteres.');
    }

    const passwordHash = await argon2.hash(datos.password);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CANDADO_PRIMER_ADMIN})`;
      const existentes = await tx.usuarioRol.count({
        where: { rol: { codigo: 'ADMIN' } },
      });
      if (existentes > 0) {
        throw new ConflictException({
          code: ERROR_ADMIN_EXISTENTE,
          detail: 'Ya existe un administrador; usa la administración de usuarios.',
        });
      }
      const rol = await tx.rol.findUniqueOrThrow({ where: { codigo: 'ADMIN' } });
      const usuario = await tx.usuario.create({
        data: {
          email,
          passwordHash,
          nombre,
          estado: 'ACTIVO',
          emailVerificadoEn: new Date(),
          roles: { create: [{ rolId: rol.id }] },
        },
        select: { id: true, email: true, nombre: true },
      });
      await this.auditoria.registrarEn(tx, {
        actorId: usuario.id,
        accion: 'PRIMER_ADMIN_CREADO',
        recurso: 'usuario',
        recursoId: usuario.id,
      });
      return usuario;
    });
  }
}
