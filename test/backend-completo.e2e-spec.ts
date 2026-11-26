import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import argon2 from 'argon2';
import { config as loadEnv } from 'dotenv';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedRequest } from '../src/common/auth/auth-context.js';
import { hashToken } from '../src/common/security/tokens.js';
import { PrismaService } from '../src/infrastructure/database/prisma.service.js';
import { PrimerAdminService } from '../src/modules/administracion/primer-admin.service.js';
import { UsuariosAdminService } from '../src/modules/administracion/usuarios-admin.service.js';
import { AuditoriaService } from '../src/modules/auditoria/auditoria.service.js';
import { FormulariosService } from '../src/modules/formularios/formularios.service.js';
import { NotificacionesService } from '../src/modules/notificaciones/notificaciones.service.js';
import { RecuperacionService } from '../src/modules/recuperacion/recuperacion.service.js';
import { RevisionIneService } from '../src/modules/referencias-ine/revision-ine.service.js';
import { SolicitudesService } from '../src/modules/solicitudes/solicitudes.service.js';

loadEnv({ path: resolve(import.meta.dirname, '../.env') });

const ROL_SOLICITANTE = '10000000-0000-4000-8000-000000000004';
const ROL_TRABAJADOR = '10000000-0000-4000-8000-000000000002';
const ROL_ADMIN = '10000000-0000-4000-8000-000000000001';

type Actor = AuthenticatedRequest['auth'];

function actor(
  usuario: { id: string; email: string; nombre: string },
  roles: string[],
  institucionId: string | null,
): Actor {
  return {
    sessionId: 'sesion-de-prueba',
    csrfTokenHash: 'x',
    usuario: { ...usuario, roles, proveedorId: null },
    ownership: { usuarioId: usuario.id, proveedorId: null, institucionId },
  };
}

const PASSWORD_VIEJA = 'contraseña-vieja-1234';
const PASSWORD_NUEVA = 'contraseña-nueva-5678';

describe('Backend completo contra PostgreSQL', () => {
  const marca = randomUUID().slice(0, 8);
  const correo = (papel: string) => `bk-${marca}-${papel}@example.test`;
  const creados = { usuarios: [] as string[], solicitudes: [] as string[], institucionId: '' };
  const correosEnviados: Array<{ to: string; text: string }> = [];

  let prisma: PrismaService;
  let recuperacion: RecuperacionService;
  let usuariosAdmin: UsuariosAdminService;
  let primerAdmin: PrimerAdminService;
  let formularios: FormulariosService;
  let solicitudes: SolicitudesService;
  let revision: RevisionIneService;
  let administrador: Actor;
  let solicitante: Actor;
  let analista: Actor;

  const tokenDelUltimoCorreo = () => {
    const ultimo = correosEnviados.at(-1);
    return decodeURIComponent(/token=([^\s&]+)/.exec(ultimo?.text ?? '')?.[1] ?? '');
  };

  async function crearUsuario(papel: string, rolId: string, password = PASSWORD_VIEJA) {
    const usuario = await prisma.usuario.create({
      data: {
        email: correo(papel),
        passwordHash: await argon2.hash(password),
        nombre: `Backend ${papel} ${marca}`,
        estado: 'ACTIVO',
        emailVerificadoEn: new Date(),
        roles: { create: { rolId } },
      },
      select: { id: true, email: true, nombre: true },
    });
    creados.usuarios.push(usuario.id);
    return usuario;
  }

  beforeAll(async () => {
    prisma = new PrismaService({
      getOrThrow: (clave: string) => {
        const valor = process.env[clave];
        if (!valor) throw new Error(`Falta ${clave}`);
        return valor;
      },
    } as never);
    const auditoria = new AuditoriaService(prisma);
    const config = {
      getOrThrow: (clave: string) =>
        ({
          FRONTEND_URL: 'http://localhost:5173',
          RESET_TOKEN_TTL_HOURS: 1,
          INVITATION_TTL_HOURS: 72,
        })[clave],
    };
    const correo = {
      send: vi.fn((mensaje: { to: string; text: string }) => {
        correosEnviados.push({ to: mensaje.to, text: mensaje.text });
        return Promise.resolve();
      }),
    };
    recuperacion = new RecuperacionService(prisma, config as never, correo as never, auditoria);
    usuariosAdmin = new UsuariosAdminService(prisma, auditoria, recuperacion);
    primerAdmin = new PrimerAdminService(prisma, auditoria);
    formularios = new FormulariosService(prisma, auditoria);
    solicitudes = new SolicitudesService(prisma, auditoria, new NotificacionesService(prisma));
    revision = new RevisionIneService(prisma, auditoria, {} as never);

    const institucion = await prisma.institucionSolicitante.create({
      data: { nombreOficial: `Institución backend ${marca}` },
      select: { id: true },
    });
    creados.institucionId = institucion.id;

    const [admin, soli, analis] = await Promise.all([
      crearUsuario('admin', ROL_ADMIN),
      crearUsuario('solicitante', ROL_SOLICITANTE),
      crearUsuario('analista', ROL_TRABAJADOR),
    ]);
    await prisma.perfilSolicitante.create({
      data: { usuarioId: soli.id, institucionId: institucion.id, estadoRevision: 'VERIFICADO' },
    });
    administrador = actor(admin, ['ADMIN'], null);
    solicitante = actor(soli, ['SOLICITANTE'], institucion.id);
    analista = actor(analis, ['TRABAJADOR_INE'], null);
  }, 30_000);

  afterAll(async () => {
    if (!prisma) return;
    for (const solicitudId of creados.solicitudes) {
      await prisma.eventoAuditoria.deleteMany({ where: { recursoId: solicitudId } });
      await prisma.notificacion.deleteMany({ where: { solicitudId } });
      await prisma.solicitudHistorial.deleteMany({ where: { solicitudId } });
      await prisma.solicitudPrecio.delete({ where: { id: solicitudId } });
    }
    if (creados.usuarios.length > 0) {
      await prisma.eventoAuditoria.deleteMany({ where: { actorId: { in: creados.usuarios } } });
      await prisma.usuario.deleteMany({ where: { id: { in: creados.usuarios } } });
    }
    if (creados.institucionId) {
      await prisma.institucionSolicitante
        .delete({ where: { id: creados.institucionId } })
        .catch(() => undefined);
    }
    await prisma.$disconnect();
  }, 30_000);

  describe('recuperación de contraseña', () => {
    it('restablece con un enlace de un solo uso y cierra todas las sesiones', async () => {
      const usuario = await crearUsuario('recupera', ROL_SOLICITANTE);
      const sesion = await prisma.sesionUsuario.create({
        data: {
          usuarioId: usuario.id,
          tokenHash: hashToken(`sesion-${marca}`),
          csrfTokenHash: hashToken('csrf'),
          venceEn: new Date(Date.now() + 3_600_000),
        },
      });

      await recuperacion.solicitarRestablecimiento(usuario.email);
      expect(correosEnviados.at(-1)?.to).toBe(usuario.email);
      const token = tokenDelUltimoCorreo();
      expect(token.length).toBeGreaterThan(20);

      await recuperacion.restablecer(token, PASSWORD_NUEVA);

      const guardado = await prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id } });
      expect(await argon2.verify(guardado.passwordHash, PASSWORD_NUEVA)).toBe(true);
      const cerrada = await prisma.sesionUsuario.findUniqueOrThrow({ where: { id: sesion.id } });
      expect(cerrada.revocadaEn).not.toBeNull();
      await expect(recuperacion.restablecer(token, 'otra-contraseña-9999')).rejects.toMatchObject({
        response: { code: 'TOKEN_INVALIDO' },
      });
    });

    it('un enlace nuevo invalida el anterior y no revela si la cuenta existe', async () => {
      const usuario = await crearUsuario('doble', ROL_SOLICITANTE);
      await recuperacion.solicitarRestablecimiento(usuario.email);
      const primero = tokenDelUltimoCorreo();
      await recuperacion.solicitarRestablecimiento(usuario.email);

      await expect(recuperacion.restablecer(primero, PASSWORD_NUEVA)).rejects.toMatchObject({
        response: { code: 'TOKEN_INVALIDO' },
      });

      const antes = correosEnviados.length;
      await expect(
        recuperacion.solicitarRestablecimiento(`nadie-${marca}@example.test`),
      ).resolves.toBeUndefined();
      expect(correosEnviados.length).toBe(antes);
    });

    it('una cuenta bloqueada no recibe enlace', async () => {
      const usuario = await crearUsuario('bloqueada-recupera', ROL_SOLICITANTE);
      await prisma.usuario.update({ where: { id: usuario.id }, data: { estado: 'BLOQUEADO' } });
      const antes = correosEnviados.length;

      await recuperacion.solicitarRestablecimiento(usuario.email);

      expect(correosEnviados.length).toBe(antes);
    });

    it('cambiar la contraseña exige la actual y conserva solo la sesión en uso', async () => {
      const usuario = await crearUsuario('cambia', ROL_SOLICITANTE);
      const crearSesion = (sufijo: string) =>
        prisma.sesionUsuario.create({
          data: {
            usuarioId: usuario.id,
            tokenHash: hashToken(`sesion-${sufijo}-${marca}`),
            csrfTokenHash: hashToken('csrf'),
            venceEn: new Date(Date.now() + 3_600_000),
          },
        });
      const actual = await crearSesion('actual');
      const otra = await crearSesion('otra');

      await expect(
        recuperacion.cambiar(usuario.id, actual.id, 'incorrecta-123456', PASSWORD_NUEVA),
      ).rejects.toMatchObject({ response: { code: 'CONTRASENA_ACTUAL_INCORRECTA' } });
      await expect(
        recuperacion.cambiar(usuario.id, actual.id, PASSWORD_VIEJA, PASSWORD_VIEJA),
      ).rejects.toMatchObject({ response: { code: 'CONTRASENA_REPETIDA' } });

      await recuperacion.cambiar(usuario.id, actual.id, PASSWORD_VIEJA, PASSWORD_NUEVA);

      expect(
        (await prisma.sesionUsuario.findUniqueOrThrow({ where: { id: actual.id } })).revocadaEn,
      ).toBeNull();
      expect(
        (await prisma.sesionUsuario.findUniqueOrThrow({ where: { id: otra.id } })).revocadaEn,
      ).not.toBeNull();
    });
  });

  describe('administración de usuarios', () => {
    it('crea personal con enlace de activación y sin contraseña conocida', async () => {
      const creado = await usuariosAdmin.crearPersonal(
        { email: correo('personal'), nombre: 'Personal Nuevo', roles: ['TRABAJADOR_INE'] },
        administrador.usuario.id,
      );
      creados.usuarios.push(creado.id);

      expect(correosEnviados.at(-1)?.to).toBe(correo('personal'));
      const token = tokenDelUltimoCorreo();
      await recuperacion.restablecer(token, PASSWORD_NUEVA);
      const guardado = await prisma.usuario.findUniqueOrThrow({ where: { id: creado.id } });
      expect(guardado.estado).toBe('ACTIVO');
      expect(await argon2.verify(guardado.passwordHash, PASSWORD_NUEVA)).toBe(true);
    });

    it('no crea personal con roles externos ni correos repetidos', async () => {
      await expect(
        usuariosAdmin.crearPersonal(
          { email: correo('externo'), nombre: 'Externo', roles: ['PROVEEDOR'] },
          administrador.usuario.id,
        ),
      ).rejects.toMatchObject({ response: { code: 'ROL_NO_PERMITIDO' } });
      await expect(
        usuariosAdmin.crearPersonal(
          { email: correo('admin'), nombre: 'Repetido', roles: ['JEFE'] },
          administrador.usuario.id,
        ),
      ).rejects.toMatchObject({ response: { code: 'CORREO_YA_REGISTRADO' } });
    });

    it('bloquea y desbloquea revocando sesiones, y no deja actuar sobre uno mismo', async () => {
      const objetivo = await crearUsuario('objetivo', ROL_TRABAJADOR);
      const sesion = await prisma.sesionUsuario.create({
        data: {
          usuarioId: objetivo.id,
          tokenHash: hashToken(`objetivo-${marca}`),
          csrfTokenHash: hashToken('csrf'),
          venceEn: new Date(Date.now() + 3_600_000),
        },
      });

      await expect(
        usuariosAdmin.bloquear(administrador.usuario.id, administrador.usuario.id),
      ).rejects.toMatchObject({ response: { code: 'ACCION_SOBRE_UNO_MISMO' } });

      await usuariosAdmin.bloquear(objetivo.id, administrador.usuario.id, '203.0.113.5');
      expect((await usuariosAdmin.obtener(objetivo.id)).estado).toBe('BLOQUEADO');
      expect(
        (await prisma.sesionUsuario.findUniqueOrThrow({ where: { id: sesion.id } })).revocadaEn,
      ).not.toBeNull();
      await expect(
        usuariosAdmin.bloquear(objetivo.id, administrador.usuario.id),
      ).rejects.toMatchObject({ response: { code: 'ESTADO_NO_PERMITE_BLOQUEO' } });

      await usuariosAdmin.desbloquear(objetivo.id, administrador.usuario.id);
      expect((await usuariosAdmin.obtener(objetivo.id)).estado).toBe('ACTIVO');
      const evento = await prisma.eventoAuditoria.findFirst({
        where: { accion: 'USUARIO_BLOQUEADO', recursoId: objetivo.id },
      });
      expect(evento?.ip).toBe('203.0.113.5');
    });

    it('cambia roles con las reglas de compatibilidad y audita el cambio', async () => {
      const objetivo = await crearUsuario('roles', ROL_TRABAJADOR);

      await expect(
        usuariosAdmin.asignarRoles(objetivo.id, ['PROVEEDOR'], administrador.usuario.id),
      ).rejects.toMatchObject({ response: { code: 'ROL_REQUIERE_PROVEEDOR' } });
      await expect(
        usuariosAdmin.asignarRoles(objetivo.id, ['SOLICITANTE'], administrador.usuario.id),
      ).rejects.toMatchObject({ response: { code: 'ROL_REQUIERE_PERFIL' } });
      await expect(
        usuariosAdmin.asignarRoles(administrador.usuario.id, ['JEFE'], administrador.usuario.id),
      ).rejects.toMatchObject({ response: { code: 'ACCION_SOBRE_UNO_MISMO' } });

      const resultado = await usuariosAdmin.asignarRoles(
        objetivo.id,
        ['JEFE', 'TRABAJADOR_INE'],
        administrador.usuario.id,
      );
      expect(resultado.roles.sort()).toEqual(['JEFE', 'TRABAJADOR_INE']);
      expect((await usuariosAdmin.obtener(objetivo.id)).roles.sort()).toEqual([
        'JEFE',
        'TRABAJADOR_INE',
      ]);
    });

    it('el comando de primer administrador se niega si ya existe uno', async () => {
      await expect(
        primerAdmin.crear({
          email: correo('segundo-admin'),
          nombre: 'Otro',
          password: PASSWORD_NUEVA,
        }),
      ).rejects.toMatchObject({ response: { code: 'ADMIN_YA_EXISTE' } });
    });

    it('consulta la auditoría por actor, acción, IP y fechas', async () => {
      const objetivo = await crearUsuario('auditada', ROL_TRABAJADOR);
      await usuariosAdmin.bloquear(objetivo.id, administrador.usuario.id, '198.51.100.7');
      const { AdministracionService } = await import(
        '../src/modules/administracion/administracion.service.js'
      );
      const admin = new AdministracionService(prisma, new AuditoriaService(prisma));

      const resultado = await admin.listarAuditoria({
        actorId: administrador.usuario.id,
        accion: 'usuario_bloqueado',
        ip: '198.51.100.7',
        desde: new Date(Date.now() - 60_000).toISOString(),
        hasta: new Date(Date.now() + 60_000).toISOString(),
        pagina: 1,
        limite: 10,
      });

      expect(resultado.total).toBe(1);
      expect(resultado.eventos[0]).toMatchObject({
        accion: 'USUARIO_BLOQUEADO',
        recursoId: objetivo.id,
      });
    });
  });

  describe('formularios de la solicitud', () => {
    async function nuevaSolicitud(modalidad: string) {
      const creada = await solicitudes.crear(
        {
          titulo: `Formularios ${modalidad} ${marca}`,
          descripcion: 'Solicitud de prueba de los formularios',
          modalidad: modalidad as never,
          unidadEjecutora: 'Unidad de prueba',
          fechaFormulario: '2026-11-25',
          enlaceNombre: 'Persona enlace',
          enlaceCargo: 'Jefe de compras',
          autoridadNombre: 'Persona autoridad',
          autoridadCargo: 'Director',
          productos: [
            {
              nombre: 'Guantes',
              especificacionesTecnicas: 'Nitrilo',
              unidadMedida: 'Caja',
              cantidad: '10',
            },
          ],
        },
        solicitante,
      );
      creados.solicitudes.push(creada.id);
      return { id: creada.id, productoId: creada.productos[0].id };
    }

    it('requisitos: la entidad edita, el INE decide y un cambio anula la decisión', async () => {
      const { id } = await nuevaSolicitud('CONTRATO_ABIERTO');

      const requisito = await formularios.crearRequisito(
        id,
        { nombre: 'Talla', valor: 'M', modo: 'EXACTO' },
        solicitante,
      );
      expect(requisito).toMatchObject({ estado: 'PENDIENTE', fuente: 'MANUAL' });
      await expect(
        formularios.decidirRequisito(id, requisito.id, { estado: 'APROBADO' }, analista),
      ).rejects.toMatchObject({ status: 404 });

      await solicitudes.enviar(id, solicitante);
      await expect(
        formularios.crearRequisito(id, { nombre: 'Otro', valor: 'x' }, solicitante),
      ).rejects.toMatchObject({ response: { code: 'SOLICITUD_NO_EDITABLE' } });
      await expect(
        formularios.decidirRequisito(id, requisito.id, { estado: 'APROBADO' }, solicitante),
      ).rejects.toMatchObject({ response: { code: 'ROL_NO_PERMITIDO' } });

      const aprobado = await formularios.decidirRequisito(
        id,
        requisito.id,
        { estado: 'APROBADO' },
        analista,
      );
      expect(aprobado).toMatchObject({ estado: 'APROBADO', aprobadoPorId: analista.usuario.id });
    });

    it('S.11: la Subasta exige tres empresas por producto y las descartadas no cuentan', async () => {
      const { id, productoId } = await nuevaSolicitud('SUBASTA_ELECTRONICA_INVERSA');
      const proponer = (nombre: string) =>
        formularios.crearProveedorPropuesto(
          id,
          { nombreRazonSocial: nombre, productoIds: [productoId] },
          solicitante,
        );

      await proponer('Empresa Uno');
      const dos = await proponer('Empresa Dos');
      await expect(solicitudes.enviar(id, solicitante)).rejects.toMatchObject({
        response: {
          code: 'SOLICITUD_INCOMPLETA',
          errors: [expect.objectContaining({ field: 'productos[1].proveedoresPropuestos' })],
        },
      });

      await expect(
        formularios.crearProveedorPropuesto(
          id,
          { nombreRazonSocial: 'Ajena', productoIds: [randomUUID()] },
          solicitante,
        ),
      ).rejects.toMatchObject({ response: { code: 'PRODUCTO_NO_PERTENECE' } });

      await proponer('Empresa Tres');
      const enviada = await solicitudes.enviar(id, solicitante);
      expect(enviada.estado).toBe('RECIBIDA');

      const decidida = await formularios.decidirProveedorPropuesto(
        id,
        dos.id,
        { estado: 'DESCARTADO' },
        analista,
      );
      expect(decidida).toMatchObject({ estado: 'DESCARTADO', productoIds: [productoId] });
    });

    it('S.21/S.22: importados con comisión, cotizaciones con importes exactos y justificación', async () => {
      const { id, productoId } = await nuevaSolicitud('BIENES_SUMINISTROS_IMPORTADOS');
      const representante = {
        nombre: 'Persona Representante',
        correo: 'representante@example.test',
        telefono: '+502 5555 1234',
        direccionNotificaciones: 'Zona 1, Ciudad de Guatemala',
      };

      await formularios.guardarRepresentante(id, 'TITULAR', representante, solicitante);
      const sinSuplente = await solicitudes.enviar(id, solicitante).catch((error: unknown) => error);
      expect(sinSuplente).toMatchObject({
        response: { errors: expect.arrayContaining([expect.objectContaining({ field: 'representantes.suplente' })]) },
      });
      await formularios.guardarRepresentante(id, 'SUPLENTE', representante, solicitante);

      const cotizar = (proveedorNombre: string, precio: string) =>
        formularios.crearCotizacion(
          id,
          {
            proveedorNombre,
            productos: [
              {
                productoSolicitudId: productoId,
                moneda: 'USD',
                precioFobTotal: precio,
                flete: '12.345',
                seguro: '1.5',
              },
            ],
          },
          solicitante,
        );
      const detalle = await cotizar('Exportadora Uno', '1000.125');
      expect(detalle.cotizaciones[0].productos[0]).toMatchObject({
        precioFobTotal: '1000.125',
        flete: '12.345',
        otrosGastos: null,
      });
      await cotizar('Exportadora Dos', '900');
      await expect(
        formularios.crearCotizacion(
          id,
          { proveedorNombre: 'Cero', productos: [{ productoSolicitudId: productoId, moneda: 'USD', precioFobTotal: '0' }] },
          solicitante,
        ),
      ).rejects.toMatchObject({ status: 422 });

      await expect(solicitudes.enviar(id, solicitante)).rejects.toMatchObject({
        response: {
          errors: [expect.objectContaining({ field: 'productos[1].cotizaciones' })],
        },
      });

      await formularios.crearJustificacion(
        id,
        {
          tipo: 'COTIZACIONES_INSUFICIENTES',
          motivo: 'Solo dos fabricantes atienden este mercado.',
          autoridadNombre: 'Persona autoridad',
          autoridadCargo: 'Director',
        },
        solicitante,
      );
      expect((await solicitudes.enviar(id, solicitante)).estado).toBe('RECIBIDA');

      const conformada = await formularios.cambiarEstadoComision(
        id,
        { estado: 'CONFORMADA' },
        analista,
      );
      expect(conformada.comision?.estado).toBe('CONFORMADA');
      expect(conformada.comision?.formadaEn).not.toBeNull();
    });

    it('rechaza el apartado de importación en otra modalidad', async () => {
      const { id } = await nuevaSolicitud('CONTRATO_ABIERTO');

      await expect(formularios.obtenerImportacion(id, solicitante)).rejects.toMatchObject({
        response: { code: 'MODALIDAD_NO_APLICA' },
      });
    });

    it('no revela solicitudes de otra entidad', async () => {
      const { id } = await nuevaSolicitud('CONTRATO_ABIERTO');
      const ajeno = actor(
        { id: randomUUID(), email: 'ajeno@example.test', nombre: 'Ajeno' },
        ['SOLICITANTE'],
        randomUUID(),
      );

      await expect(formularios.listarRequisitos(id, ajeno)).rejects.toMatchObject({
        response: { code: 'SOLICITUD_NO_ENCONTRADA' },
      });
    });
  });

  describe('alias de modalidad', () => {
    it('confirma un alias ligándolo a una modalidad activa y registra al revisor', async () => {
      const alias = await prisma.aliasModalidad.create({
        data: {
          valorOriginal: `Alias de prueba ${marca}`,
          claveNormalizada: `alias-prueba-${marca}`,
        },
      });
      const modalidad = await prisma.tipoModalidad.findFirstOrThrow({
        where: { activo: true },
        select: { id: true },
      });
      try {
        await expect(
          revision.revisarAlias(alias.id, { estado: 'CONFIRMADO' }, administrador.usuario.id),
        ).rejects.toMatchObject({ status: 422 });

        const confirmado = await revision.revisarAlias(
          alias.id,
          { estado: 'CONFIRMADO', tipoModalidadId: modalidad.id },
          administrador.usuario.id,
        );
        expect(confirmado).toMatchObject({ estado: 'CONFIRMADO', tipoModalidadId: modalidad.id });
        const guardado = await prisma.aliasModalidad.findUniqueOrThrow({ where: { id: alias.id } });
        expect(guardado.revisadoPorId).toBe(administrador.usuario.id);

        const pendientes = await revision.listarAlias({ estado: 'CONFIRMADO', pagina: 1, limite: 100 });
        expect(pendientes.alias.some((fila) => fila.id === alias.id)).toBe(true);
      } finally {
        await prisma.eventoAuditoria.deleteMany({ where: { recursoId: alias.id } });
        await prisma.aliasModalidad.delete({ where: { id: alias.id } });
      }
    });
  });
});
