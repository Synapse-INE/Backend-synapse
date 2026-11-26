import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { esErrorUnico } from '../../common/security/tokens.js';
import type { Prisma } from '../../infrastructure/database/generated/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { RecuperacionService } from '../recuperacion/recuperacion.service.js';

export const ROLES_PERSONAL = ['ADMIN', 'JEFE', 'TRABAJADOR_INE'] as const;
export const ROLES_ASIGNABLES = [
  ...ROLES_PERSONAL,
  'PROVEEDOR',
  'SOLICITANTE',
] as const;

const SELECCION_DETALLE = {
  id: true,
  email: true,
  nombre: true,
  estado: true,
  proveedorId: true,
  emailVerificadoEn: true,
  ultimoAccesoEn: true,
  createdAt: true,
  roles: { select: { rol: { select: { codigo: true } } } },
  perfilSolicitante: {
    select: {
      cargo: true,
      estadoRevision: true,
      institucion: { select: { id: true, nombreOficial: true } },
    },
  },
} satisfies Prisma.UsuarioSelect;

@Injectable()
export class UsuariosAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    private readonly recuperacion: RecuperacionService,
  ) {}

  async obtener(id: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id },
      select: SELECCION_DETALLE,
    });
    if (!usuario) throw this.noEncontrado();
    return this.presentar(usuario);
  }

  /**
   * Alta de personal del INE. No se define contraseña aquí: la persona la elige
   * con un enlace de un solo uso enviado a su correo.
   */
  async crearPersonal(
    datos: { email: string; nombre: string; roles: string[] },
    actorId: string,
    ip?: string,
  ) {
    const roles = this.normalizarRoles(datos.roles);
    if (roles.some((rol) => !(ROLES_PERSONAL as readonly string[]).includes(rol))) {
      throw new UnprocessableEntityException({
        code: 'ROL_NO_PERMITIDO',
        detail: 'Aquí solo se crean cuentas del personal (ADMIN, JEFE o TRABAJADOR_INE).',
      });
    }
    const email = datos.email.trim().toLowerCase();
    // Contraseña aleatoria que nadie conoce: la cuenta se activa con el enlace.
    const passwordHash = await argon2.hash(randomBytes(32).toString('base64url'));

    let creado: { id: string; email: string; nombre: string };
    try {
      creado = await this.prisma.$transaction(async (tx) => {
        const filas = await tx.rol.findMany({ where: { codigo: { in: roles } } });
        const usuario = await tx.usuario.create({
          data: {
            email,
            passwordHash,
            nombre: datos.nombre,
            estado: 'ACTIVO',
            emailVerificadoEn: new Date(),
            roles: {
              create: filas.map((rol) => ({ rolId: rol.id, asignadoPorId: actorId })),
            },
          },
          select: { id: true, email: true, nombre: true },
        });
        await this.auditoria.registrarEn(tx, {
          actorId,
          accion: 'USUARIO_PERSONAL_CREADO',
          recurso: 'usuario',
          recursoId: usuario.id,
          ip,
          metadatos: { roles },
        });
        return usuario;
      });
    } catch (error) {
      if (esErrorUnico(error)) {
        throw new ConflictException({
          code: 'CORREO_YA_REGISTRADO',
          detail: 'Ya existe una cuenta con ese correo.',
        });
      }
      throw error;
    }

    await this.recuperacion.enviarActivacion(creado, ip, actorId);
    return { ...creado, roles };
  }

  async bloquear(id: string, actorId: string, ip?: string) {
    this.exigirOtraPersona(id, actorId, 'No puedes bloquear tu propia cuenta.');
    return this.prisma.$transaction(async (tx) => {
      const usuario = await this.cargar(tx, id);
      if (usuario.estado !== 'ACTIVO') {
        throw new ConflictException({
          code: 'ESTADO_NO_PERMITE_BLOQUEO',
          detail: 'Solo se bloquea una cuenta activa.',
        });
      }
      await this.exigirOtroAdministrador(tx, usuario, 'bloquear');
      await tx.usuario.update({ where: { id }, data: { estado: 'BLOQUEADO' } });
      await tx.sesionUsuario.updateMany({
        where: { usuarioId: id, revocadaEn: null },
        data: { revocadaEn: new Date() },
      });
      await this.auditoria.registrarEn(tx, {
        actorId,
        accion: 'USUARIO_BLOQUEADO',
        recurso: 'usuario',
        recursoId: id,
        ip,
      });
      return { id, estado: 'BLOQUEADO' as const };
    });
  }

  async desbloquear(id: string, actorId: string, ip?: string) {
    return this.prisma.$transaction(async (tx) => {
      const usuario = await this.cargar(tx, id);
      if (usuario.estado !== 'BLOQUEADO') {
        throw new ConflictException({
          code: 'ESTADO_NO_PERMITE_DESBLOQUEO',
          detail: 'Solo se desbloquea una cuenta bloqueada.',
        });
      }
      await tx.usuario.update({ where: { id }, data: { estado: 'ACTIVO' } });
      await this.auditoria.registrarEn(tx, {
        actorId,
        accion: 'USUARIO_DESBLOQUEADO',
        recurso: 'usuario',
        recursoId: id,
        ip,
      });
      return { id, estado: 'ACTIVO' as const };
    });
  }

  /** Reemplaza el conjunto de roles. Las reglas protegen al último administrador y a uno mismo. */
  async asignarRoles(id: string, rolesEntrada: string[], actorId: string, ip?: string) {
    this.exigirOtraPersona(id, actorId, 'No puedes cambiar tus propios roles.');
    const roles = this.normalizarRoles(rolesEntrada);

    return this.prisma.$transaction(async (tx) => {
      const usuario = await this.cargar(tx, id);
      const actuales = usuario.roles.map((item) => item.rol.codigo);

      if (roles.includes('PROVEEDOR') && !usuario.proveedorId) {
        throw new UnprocessableEntityException({
          code: 'ROL_REQUIERE_PROVEEDOR',
          detail: 'El rol PROVEEDOR solo se asigna a una cuenta ligada a un proveedor (por invitación).',
        });
      }
      if (roles.includes('SOLICITANTE') && !usuario.perfilSolicitante) {
        throw new UnprocessableEntityException({
          code: 'ROL_REQUIERE_PERFIL',
          detail: 'El rol SOLICITANTE solo se asigna a una cuenta registrada como solicitante.',
        });
      }
      if (actuales.includes('ADMIN') && !roles.includes('ADMIN')) {
        await this.exigirOtroAdministrador(tx, usuario, 'quitar el rol de administrador a');
      }

      const filas = await tx.rol.findMany({ where: { codigo: { in: roles } } });
      await tx.usuarioRol.deleteMany({ where: { usuarioId: id } });
      await tx.usuarioRol.createMany({
        data: filas.map((rol) => ({
          usuarioId: id,
          rolId: rol.id,
          asignadoPorId: actorId,
        })),
      });
      await this.auditoria.registrarEn(tx, {
        actorId,
        accion: 'USUARIO_ROLES_CAMBIADOS',
        recurso: 'usuario',
        recursoId: id,
        ip,
        metadatos: { anteriores: actuales, nuevos: roles },
      });
      return { id, roles };
    });
  }

  private normalizarRoles(roles: string[]) {
    const unicos = [...new Set(roles.map((rol) => rol.trim().toUpperCase()))];
    if (
      unicos.length === 0 ||
      unicos.some((rol) => !(ROLES_ASIGNABLES as readonly string[]).includes(rol))
    ) {
      throw new UnprocessableEntityException({
        code: 'VALIDACION_FALLIDA',
        detail: 'Indica uno o más roles válidos.',
        errors: [
          {
            field: 'roles',
            message: `Valores permitidos: ${ROLES_ASIGNABLES.join(', ')}`,
          },
        ],
      });
    }
    return unicos;
  }

  private exigirOtraPersona(id: string, actorId: string, detalle: string) {
    if (id === actorId) {
      throw new ForbiddenException({ code: 'ACCION_SOBRE_UNO_MISMO', detail: detalle });
    }
  }

  /** Antes de quitar acceso a un administrador debe quedar al menos otro activo. */
  private async exigirOtroAdministrador(
    tx: Prisma.TransactionClient,
    usuario: { id: string; roles: Array<{ rol: { codigo: string } }> },
    accion: string,
  ) {
    if (!usuario.roles.some((item) => item.rol.codigo === 'ADMIN')) return;
    const otros = await tx.usuario.count({
      where: {
        id: { not: usuario.id },
        estado: 'ACTIVO',
        roles: { some: { rol: { codigo: 'ADMIN' } } },
      },
    });
    if (otros < 1) {
      throw new ConflictException({
        code: 'ULTIMO_ADMINISTRADOR',
        detail: `No se puede ${accion} el último administrador activo.`,
      });
    }
  }

  private async cargar(tx: Prisma.TransactionClient, id: string) {
    // Candado de fila: dos cambios simultáneos sobre la misma cuenta se ordenan.
    await tx.$queryRaw`SELECT id FROM usuarios WHERE id = ${id}::uuid FOR UPDATE`;
    const usuario = await tx.usuario.findUnique({
      where: { id },
      select: SELECCION_DETALLE,
    });
    if (!usuario) throw this.noEncontrado();
    return usuario;
  }

  private presentar(usuario: {
    id: string;
    email: string;
    nombre: string;
    estado: string;
    proveedorId: string | null;
    emailVerificadoEn: Date | null;
    ultimoAccesoEn: Date | null;
    createdAt: Date;
    roles: Array<{ rol: { codigo: string } }>;
    perfilSolicitante: {
      cargo: string | null;
      estadoRevision: string;
      institucion: { id: string; nombreOficial: string };
    } | null;
  }) {
    return {
      id: usuario.id,
      email: usuario.email,
      nombre: usuario.nombre,
      estado: usuario.estado,
      proveedorId: usuario.proveedorId,
      correoVerificadoEn: usuario.emailVerificadoEn,
      ultimoAccesoEn: usuario.ultimoAccesoEn,
      creadoEn: usuario.createdAt,
      roles: usuario.roles.map((item) => item.rol.codigo),
      solicitante: usuario.perfilSolicitante,
    };
  }

  private noEncontrado() {
    return new NotFoundException({
      code: 'USUARIO_NO_ENCONTRADO',
      detail: 'La cuenta no existe.',
    });
  }
}
