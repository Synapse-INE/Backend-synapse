import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthenticatedRequest } from '../src/common/auth/auth-context.js';
import { PrismaService } from '../src/infrastructure/database/prisma.service.js';
import { AuditoriaService } from '../src/modules/auditoria/auditoria.service.js';
import { NotificacionesService } from '../src/modules/notificaciones/notificaciones.service.js';
import { PersonalIneService } from '../src/modules/personal-ine/personal-ine.service.js';
import { SolicitudesService } from '../src/modules/solicitudes/solicitudes.service.js';

loadEnv({ path: resolve(import.meta.dirname, '../.env') });

const FUENTE_CATALOGO = '10000000-0000-4000-8000-0000000000f1';
const ROL_SOLICITANTE = '10000000-0000-4000-8000-000000000004';
const ROL_TRABAJADOR = '10000000-0000-4000-8000-000000000002';

type Actor = AuthenticatedRequest['auth'];

async function limpiarPruebasAnteriores(prisma: PrismaService) {
  const usuarios = await prisma.usuario.findMany({
    where: { email: { contains: '@example.test', startsWith: 'ciclo-' } },
    select: { id: true },
  });
  const ids = usuarios.map((usuario) => usuario.id);
  if (ids.length === 0) return;
  const solicitudes = await prisma.solicitudPrecio.findMany({
    where: { creadaPorId: { in: ids } },
    select: { id: true },
  });
  for (const solicitud of solicitudes) {
    const solicitudId = solicitud.id;
    await prisma.eventoAuditoria.deleteMany({ where: { recursoId: solicitudId } });
    await prisma.precioConsultado.deleteMany({ where: { consulta: { solicitudId } } });
    await prisma.validacionAnalisis.deleteMany({ where: { solicitudId } });
    await prisma.entregaSolicitud.deleteMany({ where: { solicitudId } });
    await prisma.informeSolicitud.deleteMany({ where: { solicitudId } });
    await prisma.consultaMercado.deleteMany({ where: { solicitudId } });
    await prisma.solicitudPrecio.delete({ where: { id: solicitudId } });
  }
  await prisma.usuario.deleteMany({ where: { id: { in: ids } } });
  await prisma.institucionSolicitante.deleteMany({
    where: { nombreOficial: { startsWith: 'Institución ciclo ' } },
  });
}

function actor(
  usuario: { id: string; email: string; nombre: string },
  roles: string[],
  institucionId: string | null,
): Actor {
  return {
    sessionId: 'sesion-de-prueba',
    csrfTokenHash: 'x',
    usuario: { ...usuario, roles },
    ownership: { usuarioId: usuario.id, proveedorId: null, institucionId },
  };
}

describe('Ciclo completo de un expediente', () => {
  const marca = randomUUID().slice(0, 8);
  const creados = {
    institucionId: '',
    usuarios: [] as string[],
    solicitudId: '',
  };
  let prisma: PrismaService;
  let solicitudes: SolicitudesService;
  let avisos: NotificacionesService;
  let personal: PersonalIneService;
  let solicitante: Actor;
  let jefe: Actor;
  let analista: Actor;

  beforeAll(async () => {
    prisma = new PrismaService({
      getOrThrow: (clave: string) => {
        const valor = process.env[clave];
        if (!valor) throw new Error(`Falta ${clave}`);
        return valor;
      },
    } as never);
    const auditoria = new AuditoriaService(prisma);
    avisos = new NotificacionesService(prisma);
    personal = new PersonalIneService(prisma);
    solicitudes = new SolicitudesService(prisma, auditoria, avisos);
    await limpiarPruebasAnteriores(prisma);

    const institucion = await prisma.institucionSolicitante.create({
      data: { nombreOficial: `Institución ciclo ${marca}` },
      select: { id: true },
    });
    creados.institucionId = institucion.id;

    const cuentas = await Promise.all(
      [
        ['solicitante', 'SOLICITANTE', ROL_SOLICITANTE],
        ['jefe', 'TRABAJADOR_INE', ROL_TRABAJADOR],
        ['analista', 'TRABAJADOR_INE', ROL_TRABAJADOR],
      ].map(async ([papel, , rolId]) => {
        const usuario = await prisma.usuario.create({
          data: {
            email: `ciclo-${marca}-${papel}@example.test`,
            passwordHash: 'hash-de-prueba',
            nombre: `Ciclo ${papel} ${marca}`,
            estado: 'ACTIVO',
            emailVerificadoEn: new Date(),
            roles: { create: { rolId } },
          },
          select: { id: true, email: true, nombre: true },
        });
        creados.usuarios.push(usuario.id);
        return usuario;
      }),
    );
    await prisma.perfilSolicitante.create({
      data: {
        usuarioId: cuentas[0].id,
        institucionId: institucion.id,
        estadoRevision: 'VERIFICADO',
      },
    });

    solicitante = actor(cuentas[0], ['SOLICITANTE'], institucion.id);
    jefe = actor(cuentas[1], ['TRABAJADOR_INE'], null);
    analista = actor(cuentas[2], ['TRABAJADOR_INE'], null);
  }, 30_000);

  afterAll(async () => {
    if (!prisma) return;
    if (creados.solicitudId) {
      const solicitudId = creados.solicitudId;
      await prisma.eventoAuditoria.deleteMany({ where: { recursoId: solicitudId } });
      await prisma.precioConsultado.deleteMany({ where: { consulta: { solicitudId } } });
      await prisma.validacionAnalisis.deleteMany({ where: { solicitudId } });
      await prisma.entregaSolicitud.deleteMany({ where: { solicitudId } });
      await prisma.informeSolicitud.deleteMany({ where: { solicitudId } });
      await prisma.consultaMercado.deleteMany({ where: { solicitudId } });
      await prisma.solicitudPrecio.delete({ where: { id: solicitudId } });
    }
    if (creados.usuarios.length > 0) {
      await prisma.usuario.deleteMany({ where: { id: { in: creados.usuarios } } });
    }
    if (creados.institucionId) {
      await prisma.institucionSolicitante
        .delete({ where: { id: creados.institucionId } })
        .catch(() => undefined);
    }
    await prisma.$disconnect();
  }, 30_000);

  it('recorre solicitud, corrección, análisis, informe y entrega', async () => {
    const creada = await solicitudes.crear(
      {
        titulo: `Ciclo ${marca}`,
        descripcion: 'Expediente de prueba del ciclo completo',
        modalidad: 'CONTRATO_ABIERTO',
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
          {
            nombre: 'Jeringa',
            especificacionesTecnicas: '5 ml',
            unidadMedida: 'Unidad',
            cantidad: '20',
          },
        ],
      },
      solicitante,
    );
    creados.solicitudId = creada.id;
    const guantes = creada.productos.find((producto) => producto.nombre === 'Guantes');
    const jeringa = creada.productos.find((producto) => producto.nombre === 'Jeringa');
    expect(guantes && jeringa).toBeTruthy();

    await solicitudes.enviar(creada.id, solicitante);
    await solicitudes.cambiarEstado(creada.id, { estado: 'EN_REVISION' }, jefe);
    await solicitudes.asignar(creada.id, { usuarioId: analista.usuario.id }, jefe);
    await solicitudes.comentar(
      creada.id,
      { contenido: 'Nota de trabajo que la entidad no debe recibir.', esInterno: true },
      analista,
    );
    await solicitudes.comentar(
      creada.id,
      { contenido: 'Falta precisar la talla.', devolver: true },
      analista,
    );
    await solicitudes.actualizar(
      creada.id,
      { descripcion: 'Expediente corregido: talla M.' },
      solicitante,
    );
    const reenviada = await solicitudes.reenviar(creada.id, solicitante);
    expect(reenviada.asignadaAId).toBe(analista.usuario.id);

    await solicitudes.cambiarEstado(creada.id, { estado: 'EN_REVISION' }, jefe);
    await solicitudes.cambiarEstado(creada.id, { estado: 'EN_INVESTIGACION' }, analista);
    const conBoleta = await solicitudes.registrarConsulta(
      creada.id,
      {
        fuenteId: FUENTE_CATALOGO,
        fechaConsulta: '2026-11-25',
        evidencia: 'Boleta de prueba',
        precios: [
          { productoSolicitudId: guantes!.id, precio: '10.000', unidadMedida: 'Caja' },
          { productoSolicitudId: jeringa!.id, precio: '2.500', unidadMedida: 'Unidad' },
        ],
      },
      analista,
    );
    const consulta = conBoleta.consultas[0];
    const precioGuantes = consulta.precios.find(
      (precio) => precio.productoSolicitudId === guantes!.id,
    );
    const precioJeringa = consulta.precios.find(
      (precio) => precio.productoSolicitudId === jeringa!.id,
    );

    await solicitudes.corregirConsulta(
      creada.id,
      consulta.id,
      { precios: [{ id: precioGuantes!.id, precio: '21.000' }] },
      analista,
    );
    await solicitudes.cambiarEstado(creada.id, { estado: 'EN_ANALISIS' }, analista);
    await solicitudes.marcarAtipico(
      creada.id,
      { precioConsultadoId: precioJeringa!.id, esAtipico: true },
      analista,
    );
    await solicitudes.registrarValidacion(
      creada.id,
      {
        productoSolicitudId: guantes!.id,
        precioAdoptado: '21.000',
        unidadMedida: 'Caja',
        criterio: 'Se adopta el precio corregido de la boleta.',
        confirmar: true,
      },
      analista,
    );
    await solicitudes.registrarValidacion(
      creada.id,
      {
        productoSolicitudId: jeringa!.id,
        precioAdoptado: '2.500',
        unidadMedida: 'Unidad',
        criterio: 'El precio se conserva y queda marcado como atípico.',
        notaAtipicos: 'Una sola consulta, marcada por el analista.',
        confirmar: true,
      },
      analista,
    );

    await solicitudes.cambiarEstado(creada.id, { estado: 'EN_INFORME' }, analista);
    const conInforme = await solicitudes.crearInforme(
      creada.id,
      { tipo: 'INFORME_TECNICO', destinatario: 'Unidad receptora de prueba' },
      analista,
    );
    const tecnico = conInforme.informes.find((informe) => informe.tipo === 'INFORME_TECNICO');
    expect(tecnico?.resumen).toContain('No es la plantilla oficial del INE');
    expect(tecnico?.resumen).toMatch(/GTQ 21(\.0+)?/);
    await solicitudes.emitirInforme(creada.id, tecnico!.id, analista);
    const conOficio = await solicitudes.crearInforme(
      creada.id,
      { tipo: 'OFICIO', destinatario: 'Unidad receptora de prueba' },
      analista,
    );
    const oficio = conOficio.informes.find((informe) => informe.tipo === 'OFICIO');
    await solicitudes.emitirInforme(creada.id, oficio!.id, analista);

    await solicitudes.cambiarEstado(creada.id, { estado: 'EN_ENTREGA' }, jefe);
    await solicitudes.registrarEntrega(
      creada.id,
      {
        informeId: tecnico!.id,
        medio: 'DIGITAL',
        destinatario: 'Unidad receptora de prueba',
        fechaEntrega: '2026-11-25',
        constancia: 'Acuse de la prueba de ciclo.',
      },
      jefe,
    );
    await solicitudes.cambiarEstado(creada.id, { estado: 'COMPLETADA' }, jefe);

    const paraLaEntidad = await solicitudes.obtener(creada.id, solicitante);
    expect(paraLaEntidad.estado).toBe('COMPLETADA');
    expect(paraLaEntidad.consultas).toEqual([]);
    expect(paraLaEntidad.informes.map((informe) => informe.estado)).toEqual([
      'EMITIDO',
      'EMITIDO',
    ]);
    expect(paraLaEntidad.entregas).toHaveLength(1);
    expect(
      paraLaEntidad.historial.some(
        (evento) =>
          evento.accion === 'Boleta corregida' && evento.detalle?.includes('→ 21.000'),
      ),
    ).toBe(true);

    const bandejaEntidad = await avisos.listar({}, solicitante);
    const titulosEntidad = bandejaEntidad.notificaciones.map((aviso) => aviso.titulo);
    expect(titulosEntidad).toContain('Expediente devuelto');
    expect(titulosEntidad).toContain('Entrega registrada');
    expect(titulosEntidad).not.toContain('Nota interna');

    const delAnalista = await prisma.notificacion.findMany({
      where: { usuarioId: analista.usuario.id, titulo: 'Expediente asignado' },
    });
    const delJefe = await prisma.notificacion.findMany({
      where: { usuarioId: jefe.usuario.id, titulo: 'Expediente asignado' },
    });
    expect(delAnalista).toHaveLength(1);
    expect(delJefe).toHaveLength(0);

    const leida = await avisos.marcarLeida(bandejaEntidad.notificaciones[0].id, solicitante);
    expect(leida.leidaEn).toBeTruthy();
    await expect(
      avisos.marcarLeida(bandejaEntidad.notificaciones[0].id, analista),
    ).rejects.toMatchObject({ response: { code: 'NOTIFICACION_NO_ENCONTRADA' } });

    const personas = await personal.listar();
    const identificadores = personas.map((persona) => persona.id);
    expect(identificadores).toContain(analista.usuario.id);
    expect(identificadores).not.toContain(solicitante.usuario.id);
    expect(personas.every((persona) => !('email' in persona))).toBe(true);
  }, 30_000);
});
