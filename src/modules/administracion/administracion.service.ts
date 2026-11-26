import { Injectable, NotFoundException } from '@nestjs/common';
import type { EstadoUsuario, Prisma } from '../../infrastructure/database/generated/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';

const CODIGOS_ROL = [
  'ADMIN',
  'JEFE',
  'TRABAJADOR_INE',
  'PROVEEDOR',
  'SOLICITANTE',
] as const;

@Injectable()
export class AdministracionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async resumen() {
    const [
      pendientes,
      usuariosActivos,
      modalidadesActivas,
      modalidadesTotal,
      auditoriaTotal,
      roles,
    ] = await Promise.all([
      this.prisma.perfilSolicitante.count({
        where: {
          estadoRevision: 'PENDIENTE',
          usuario: { estado: 'PENDIENTE_APROBACION' },
        },
      }),
      this.prisma.usuario.count({ where: { estado: 'ACTIVO' } }),
      this.prisma.tipoModalidad.count({ where: { activo: true } }),
      this.prisma.tipoModalidad.count(),
      this.prisma.eventoAuditoria.count(),
      Promise.all(
        CODIGOS_ROL.map(async (codigo) => {
          const total = await this.prisma.usuarioRol.count({
            where: { rol: { codigo }, usuario: { estado: 'ACTIVO' } },
          });
          return [codigo, total] as const;
        }),
      ),
    ]);

    return {
      pendientes,
      usuariosActivos,
      modalidadesActivas,
      modalidadesTotal,
      auditoriaTotal,
      accesos: Object.fromEntries(roles),
    };
  }

  async listarUsuarios(opciones: {
    texto?: string;
    rol?: string;
    estado?: EstadoUsuario;
    pagina: number;
    limite: number;
  }) {
    const texto = opciones.texto?.trim();
    const where: Prisma.UsuarioWhereInput = {};
    if (opciones.estado) where.estado = opciones.estado;
    if (opciones.rol) {
      where.roles = { some: { rol: { codigo: opciones.rol } } };
    }
    if (texto) {
      where.OR = [
        { nombre: { contains: texto, mode: 'insensitive' } },
        { email: { contains: texto, mode: 'insensitive' } },
      ];
    }

    const [total, usuarios] = await Promise.all([
      this.prisma.usuario.count({ where }),
      this.prisma.usuario.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { nombre: 'asc' }],
        skip: (opciones.pagina - 1) * opciones.limite,
        take: opciones.limite,
        select: {
          id: true,
          email: true,
          nombre: true,
          estado: true,
          emailVerificadoEn: true,
          ultimoAccesoEn: true,
          createdAt: true,
          roles: { select: { rol: { select: { codigo: true, nombre: true } } } },
        },
      }),
    ]);

    return {
      total,
      pagina: opciones.pagina,
      paginas: Math.max(1, Math.ceil(total / opciones.limite)),
      limite: opciones.limite,
      usuarios: usuarios.map((usuario) => ({
        id: usuario.id,
        email: usuario.email,
        nombre: usuario.nombre,
        estado: usuario.estado,
        correoVerificadoEn: usuario.emailVerificadoEn,
        ultimoAccesoEn: usuario.ultimoAccesoEn,
        creadoEn: usuario.createdAt,
        roles: usuario.roles.map((item) => item.rol.codigo),
      })),
    };
  }

  listarModalidades() {
    return this.prisma.tipoModalidad.findMany({
      orderBy: [{ activo: 'desc' }, { nombre: 'asc' }],
      select: { id: true, codigo: true, nombre: true, activo: true },
    });
  }

  async cambiarModalidad(
    id: string,
    activo: boolean,
    actorId: string,
    ip?: string,
  ) {
    const actual = await this.prisma.tipoModalidad.findUnique({
      where: { id },
      select: { id: true, nombre: true, activo: true },
    });
    if (!actual) {
      throw new NotFoundException({
        code: 'MODALIDAD_NO_ENCONTRADA',
        detail: 'La modalidad no existe.',
      });
    }
    if (actual.activo === activo) {
      return { id, nombre: actual.nombre, activo };
    }

    const modalidad = await this.prisma.$transaction(async (tx) => {
      const actualizada = await tx.tipoModalidad.update({
        where: { id },
        data: { activo },
        select: { id: true, codigo: true, nombre: true, activo: true },
      });
      await this.auditoria.registrarEn(tx, {
        actorId,
        accion: activo ? 'MODALIDAD_ACTIVADA' : 'MODALIDAD_INACTIVA',
        recurso: 'tipo_modalidad',
        recursoId: id,
        ip,
        metadatos: { nombre: actualizada.nombre },
      });
      return actualizada;
    });

    return modalidad;
  }

  async listarAuditoria(opciones: {
    texto?: string;
    actorId?: string;
    accion?: string;
    recurso?: string;
    recursoId?: string;
    ip?: string;
    desde?: string;
    hasta?: string;
    pagina: number;
    limite: number;
  }) {
    const texto = opciones.texto?.trim();
    const filtros: Prisma.EventoAuditoriaWhereInput[] = [];
    if (opciones.actorId) filtros.push({ actorId: opciones.actorId });
    if (opciones.accion) {
      filtros.push({ accion: { equals: opciones.accion, mode: 'insensitive' } });
    }
    if (opciones.recurso) {
      filtros.push({ recurso: { equals: opciones.recurso, mode: 'insensitive' } });
    }
    if (opciones.recursoId) filtros.push({ recursoId: opciones.recursoId });
    if (opciones.ip) filtros.push({ ip: opciones.ip });
    if (opciones.desde || opciones.hasta) {
      filtros.push({
        creadoEn: {
          ...(opciones.desde ? { gte: new Date(opciones.desde) } : {}),
          ...(opciones.hasta ? { lte: new Date(opciones.hasta) } : {}),
        },
      });
    }
    const porTexto: Prisma.EventoAuditoriaWhereInput = texto
      ? {
          OR: [
            { accion: { contains: texto, mode: 'insensitive' } },
            { recurso: { contains: texto, mode: 'insensitive' } },
            { recursoId: { contains: texto, mode: 'insensitive' } },
            { actor: { nombre: { contains: texto, mode: 'insensitive' } } },
            { actor: { email: { contains: texto, mode: 'insensitive' } } },
          ],
        }
      : {};
    const where: Prisma.EventoAuditoriaWhereInput = { AND: [porTexto, ...filtros] };

    const [total, eventos] = await Promise.all([
      this.prisma.eventoAuditoria.count({ where }),
      this.prisma.eventoAuditoria.findMany({
        where,
        orderBy: { creadoEn: 'desc' },
        skip: (opciones.pagina - 1) * opciones.limite,
        take: opciones.limite,
        select: {
          id: true,
          accion: true,
          recurso: true,
          recursoId: true,
          metadatos: true,
          ip: true,
          creadoEn: true,
          actor: { select: { nombre: true, email: true } },
        },
      }),
    ]);

    return {
      total,
      pagina: opciones.pagina,
      paginas: Math.max(1, Math.ceil(total / opciones.limite)),
      limite: opciones.limite,
      eventos: eventos.map((evento) => ({
        id: evento.id,
        accion: evento.accion,
        recurso: evento.recurso,
        recursoId: evento.recursoId,
        metadatos: evento.metadatos,
        ip: evento.ip,
        creadoEn: evento.creadoEn,
        actor: evento.actor?.nombre ?? 'Sistema',
        actorCorreo: evento.actor?.email ?? null,
      })),
    };
  }

  listarProveedores() {
    return this.prisma.proveedor.findMany({
      where: { estado: 'ACTIVO' },
      orderBy: { nombreComercial: 'asc' },
      select: { id: true, nombreComercial: true, correoContacto: true },
    });
  }
}