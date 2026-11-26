import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SolicitudesService } from './solicitudes.service.js';

const solicitante = {
  sessionId: 's1',
  csrfTokenHash: 'x',
  usuario: { id: 'u1', email: 'a@b.c', nombre: 'A', roles: ['SOLICITANTE'] },
  ownership: { usuarioId: 'u1', proveedorId: null, institucionId: 'inst-1' },
};
const otroDeLaInstitucion = {
  ...solicitante,
  usuario: { ...solicitante.usuario, id: 'u2' },
  ownership: { ...solicitante.ownership, usuarioId: 'u2' },
};
const personal = {
  ...solicitante,
  usuario: { ...solicitante.usuario, id: 'w1', roles: ['TRABAJADOR_INE'] },
  ownership: { usuarioId: 'w1', proveedorId: null, institucionId: null },
};
const jefe = {
  ...personal,
  usuario: { ...personal.usuario, id: 'j1', roles: ['JEFE'] },
  ownership: { usuarioId: 'j1', proveedorId: null, institucionId: null },
};

const completa = {
  id: 'sol-1',
  estado: 'BORRADOR',
  creadaPorId: 'u1',
  asignadaAId: 'w1',
  modalidad: 'CONTRATO_ABIERTO',
  unidadEjecutora: 'Unidad',
  fechaFormulario: new Date('2026-11-24'),
  enlaceNombre: 'Enlace',
  enlaceCargo: 'Cargo',
  autoridadNombre: 'Autoridad',
  autoridadCargo: 'Cargo',
  productos: [
    {
      numero: 1,
      nombre: 'Guantes',
      especificacionesTecnicas: 'Nitrilo',
      unidadMedida: 'Caja',
      cantidad: { toString: () => '10.000' },
    },
  ],
};

describe('SolicitudesService', () => {
  const tx = {
    solicitudPrecio: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    solicitudColaborador: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    avisoPrecioProveedor: { findMany: vi.fn().mockResolvedValue([]) },
    productoSolicitud: { deleteMany: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
    solicitudHistorial: { create: vi.fn() },
    solicitudComentario: { create: vi.fn() },
    usuario: { findFirst: vi.fn() },
    precioConsultado: {
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
    },
    cotizacionProducto: { count: vi.fn().mockResolvedValue(0) },
    validacionAnalisis: {
      count: vi.fn().mockResolvedValue(0),
      upsert: vi.fn(),
      findMany: vi.fn(),
    },
    fuenteConsulta: { findFirst: vi.fn() },
    referenciaINE: { count: vi.fn() },
    consultaMercado: { create: vi.fn(), count: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    informeSolicitud: {
      aggregate: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    entregaSolicitud: { create: vi.fn(), count: vi.fn() },
    $queryRaw: vi.fn().mockResolvedValue([{ ultimo: 1 }]),
  };
  const prisma = {
    ...tx,
    institucionSolicitante: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  };
  const auditoria = { registrarEn: vi.fn() };
  const notificaciones = {
    avisar: vi.fn(),
    avisarJefesNuevaRecepcion: vi.fn(),
    avisarProveedoresActualizarPrecios: vi.fn(),
    avisarAsignacion: vi.fn(),
    avisarColaboracion: vi.fn(),
  };
  const config = { getOrThrow: vi.fn().mockReturnValue('https://portal.example.test') };
  const mail = { send: vi.fn().mockResolvedValue(undefined) };
  const adjuntos = { guardarInformeEmitido: vi.fn().mockResolvedValue(undefined) };
  let servicio: SolicitudesService;

  beforeEach(() => {
    vi.clearAllMocks();
    tx.precioConsultado.count.mockResolvedValue(0);
    tx.precioConsultado.findMany.mockResolvedValue([]);
    tx.validacionAnalisis.count.mockResolvedValue(0);
    prisma.$transaction.mockImplementation(
      (operacion: (cliente: typeof tx) => Promise<unknown>) => operacion(tx),
    );
    prisma.institucionSolicitante.findUnique.mockResolvedValue({
      id: 'inst-1',
      nombreOficial: 'Ministerio',
    });
    servicio = new SolicitudesService(
      prisma as never,
      auditoria as never,
      notificaciones as never,
      config as never,
      mail as never,
      adjuntos as never,
    );
  });

  it('crea un borrador ligado al usuario y su institución, con productos numerados', async () => {
    tx.solicitudPrecio.create.mockResolvedValue({ id: 'sol-1' });

    const resultado = await servicio.crear(
      {
        titulo: 'Guantes',
        descripcion: 'Compra',
        productos: [{ nombre: 'A' }, { nombre: 'B', cantidad: '2.5' }],
      },
      solicitante,
      '203.0.113.1',
    );

    expect(resultado).toMatchObject({ id: 'sol-1' });
    const { data } = tx.solicitudPrecio.create.mock.calls[0][0];
    expect(data).toMatchObject({
      estado: 'BORRADOR',
      creadaPorId: 'u1',
      institucionSolicitanteId: 'inst-1',
      institucionSolicitante: 'Ministerio',
    });
    expect(data.codigo).toMatch(/^PR-\d{4}-000001$/);
    expect(data.productos.create.map((p: { numero: number }) => p.numero)).toEqual([1, 2]);
    expect(tx.solicitudHistorial.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ accion: 'Solicitud creada', estadoNuevo: 'BORRADOR' }),
    });
    expect(auditoria.registrarEn).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ accion: 'SOLICITUD_CREADA', ip: '203.0.113.1' }),
    );
  });

  it('rechaza crear sin institución asociada', async () => {
    await expect(
      servicio.crear(
        { titulo: 'X', descripcion: 'Y' },
        { ...solicitante, ownership: { ...solicitante.ownership, institucionId: null } },
      ),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('oculta con 404 una solicitud ajena', async () => {
    tx.solicitudPrecio.findFirst.mockResolvedValue(null);

    await expect(servicio.actualizar('sol-x', { titulo: 'Nuevo' }, solicitante)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('permite a la institución leer pero no modificar lo de otro usuario', async () => {
    tx.solicitudPrecio.findFirst.mockResolvedValue({ ...completa, estado: 'RECIBIDA' });
    await expect(
      servicio.obtener('sol-1', otroDeLaInstitucion),
    ).resolves.toBeDefined();

    tx.solicitudPrecio.findFirst.mockResolvedValue(completa);
    await expect(
      servicio.actualizar('sol-1', { titulo: 'Nuevo' }, otroDeLaInstitucion),
    ).rejects.toThrow(ForbiddenException);
    expect(tx.solicitudPrecio.update).not.toHaveBeenCalled();
  });

  it('el alcance de lectura del solicitante excluye borradores ajenos', async () => {
    tx.solicitudPrecio.findFirst.mockResolvedValue(null);

    await expect(servicio.obtener('sol-1', otroDeLaInstitucion)).rejects.toThrow(
      NotFoundException,
    );
    const { where } = tx.solicitudPrecio.findFirst.mock.calls[0][0];
    expect(where.OR).toEqual([
      { creadaPorId: 'u2' },
      { institucionSolicitanteId: 'inst-1', estado: { not: 'BORRADOR' } },
    ]);
  });

  it('no permite editar una solicitud ya enviada', async () => {
    tx.solicitudPrecio.findFirst.mockResolvedValue({ ...completa, estado: 'RECIBIDA' });

    await expect(
      servicio.actualizar('sol-1', { titulo: 'Nuevo' }, solicitante),
    ).rejects.toMatchObject({ response: { code: 'SOLICITUD_NO_EDITABLE' } });
  });

  it('reemplaza la lista de productos solo cuando se envía', async () => {
    tx.solicitudPrecio.findFirst.mockResolvedValue(completa);
    tx.solicitudPrecio.update.mockResolvedValue({ id: 'sol-1' });

    await servicio.actualizar('sol-1', { titulo: 'Solo título' }, solicitante);
    expect(tx.productoSolicitud.deleteMany).not.toHaveBeenCalled();

    await servicio.actualizar('sol-1', { productos: [{ nombre: 'Nuevo' }] }, solicitante);
    expect(tx.productoSolicitud.deleteMany).toHaveBeenCalledOnce();
  });

  it('lista los campos faltantes al enviar un borrador incompleto', async () => {
    tx.solicitudPrecio.findFirst.mockResolvedValue({
      ...completa,
      modalidad: null,
      productos: [
        { numero: 1, nombre: 'A', especificacionesTecnicas: null, unidadMedida: 'Caja', cantidad: { toString: () => '0' } },
      ],
    });

    const error = await servicio.enviar('sol-1', solicitante).catch((e) => e);

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    const campos = error.getResponse().errors.map((e: { field: string }) => e.field);
    expect(campos).toEqual(
      expect.arrayContaining([
        'modalidad',
        'productos[1].especificacionesTecnicas',
        'productos[1].cantidad',
      ]),
    );
    expect(tx.solicitudPrecio.updateMany).not.toHaveBeenCalled();
  });

  it('exige al menos un producto para enviar', async () => {
    tx.solicitudPrecio.findFirst.mockResolvedValue({ ...completa, productos: [] });

    await expect(servicio.enviar('sol-1', solicitante)).rejects.toMatchObject({
      response: { errors: [{ field: 'productos', message: 'Agrega al menos un producto' }] },
    });
  });

  it('envía una solicitud completa y la audita', async () => {
    tx.solicitudPrecio.findFirst.mockResolvedValue(completa);
    tx.solicitudPrecio.updateMany.mockResolvedValue({ count: 1 });
    tx.solicitudPrecio.findUniqueOrThrow.mockResolvedValue({ id: 'sol-1', estado: 'RECIBIDA' });

    const resultado = await servicio.enviar('sol-1', solicitante);

    expect(resultado.estado).toBe('RECIBIDA');
    expect(tx.solicitudPrecio.updateMany).toHaveBeenCalledWith({
      where: { id: 'sol-1', estado: 'BORRADOR' },
      data: expect.objectContaining({ estado: 'RECIBIDA' }),
    });
    expect(auditoria.registrarEn).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ accion: 'SOLICITUD_ENVIADA' }),
    );
    expect(notificaciones.avisarJefesNuevaRecepcion).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ solicitudId: 'sol-1', actorId: 'u1' }),
    );
    expect(notificaciones.avisarProveedoresActualizarPrecios).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ solicitudId: 'sol-1', nombresProducto: expect.any(Array) }),
    );
  });

  it('un doble envío simultáneo no duplica la recepción', async () => {
    tx.solicitudPrecio.findFirst.mockResolvedValue(completa);
    tx.solicitudPrecio.updateMany.mockResolvedValue({ count: 0 });

    await expect(servicio.enviar('sol-1', solicitante)).rejects.toThrow(ConflictException);
    expect(auditoria.registrarEn).not.toHaveBeenCalled();
  });

  it('el personal avanza el estado por una transición válida y deja el motivo', async () => {
    tx.solicitudPrecio.findUnique.mockResolvedValue({ id: 'sol-1', estado: 'RECIBIDA', asignadaAId: 'w1' });
    tx.solicitudPrecio.updateMany.mockResolvedValue({ count: 1 });
    tx.solicitudPrecio.findUniqueOrThrow.mockResolvedValue({ id: 'sol-1' });

    await servicio.cambiarEstado('sol-1', { estado: 'RECHAZADA', motivo: 'Incompleta' }, personal);

    expect(auditoria.registrarEn).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        accion: 'SOLICITUD_ESTADO_CAMBIADO',
        metadatos: { de: 'RECIBIDA', a: 'RECHAZADA', motivo: 'Incompleta' },
      }),
    );
  });

  it('no entra a investigación mientras haya proveedores sin actualizar dentro del plazo', async () => {
    tx.solicitudPrecio.findUnique.mockResolvedValue({ id: 'sol-1', estado: 'EN_REVISION', asignadaAId: 'w1' });
    tx.avisoPrecioProveedor.findMany.mockResolvedValueOnce([
      { venceEn: new Date(Date.now() + 86_400_000), actualizadoEn: new Date(), proveedor: { nombreComercial: 'A' } },
      { venceEn: new Date(Date.now() + 86_400_000), actualizadoEn: null, proveedor: { nombreComercial: 'B' } },
    ]);

    await expect(
      servicio.cambiarEstado('sol-1', { estado: 'EN_INVESTIGACION' }, personal),
    ).rejects.toMatchObject({ response: { code: 'PROVEEDORES_PENDIENTES' } });
    expect(tx.solicitudPrecio.updateMany).not.toHaveBeenCalled();
  });

  it('entra a investigación si todos los proveedores actualizaron o si ya venció el plazo', async () => {
    tx.solicitudPrecio.findUnique.mockResolvedValue({ id: 'sol-1', estado: 'EN_REVISION', asignadaAId: 'w1' });
    tx.solicitudPrecio.updateMany.mockResolvedValue({ count: 1 });
    tx.solicitudPrecio.findUniqueOrThrow.mockResolvedValue({ id: 'sol-1' });

    tx.avisoPrecioProveedor.findMany.mockResolvedValueOnce([
      { venceEn: new Date(Date.now() + 86_400_000), actualizadoEn: new Date(), proveedor: { nombreComercial: 'A' } },
    ]);
    await servicio.cambiarEstado('sol-1', { estado: 'EN_INVESTIGACION' }, personal);

    tx.avisoPrecioProveedor.findMany.mockResolvedValueOnce([
      { venceEn: new Date(Date.now() - 1000), actualizadoEn: null, proveedor: { nombreComercial: 'B' } },
    ]);
    await servicio.cambiarEstado('sol-1', { estado: 'EN_INVESTIGACION' }, personal);

    expect(tx.solicitudPrecio.updateMany).toHaveBeenCalledTimes(2);
  });

  it('con responsable, otra persona del INE no avanza el expediente', async () => {
    tx.solicitudPrecio.findUnique.mockResolvedValue({
      id: 'sol-1',
      estado: 'RECIBIDA',
      asignadaAId: 'analista',
    });
    tx.solicitudColaborador.count.mockResolvedValue(0);

    await expect(
      servicio.cambiarEstado('sol-1', { estado: 'EN_REVISION' }, personal),
    ).rejects.toMatchObject({ response: { code: 'NO_ES_RESPONSABLE' } });
  });

  it('sin responsable, el expediente no se trabaja', async () => {
    tx.solicitudPrecio.findUnique.mockResolvedValue({ id: 'sol-1', estado: 'RECIBIDA', asignadaAId: null });

    await expect(
      servicio.cambiarEstado('sol-1', { estado: 'EN_REVISION' }, personal),
    ).rejects.toMatchObject({ response: { code: 'EXPEDIENTE_SIN_ASIGNAR' } });
  });

  it('rechaza saltos de estado y cambios sobre solicitudes cerradas', async () => {
    tx.solicitudPrecio.findUnique.mockResolvedValue({ id: 'sol-1', estado: 'RECIBIDA', asignadaAId: 'w1' });
    await expect(
      servicio.cambiarEstado('sol-1', { estado: 'COMPLETADA' }, personal),
    ).rejects.toMatchObject({ response: { code: 'TRANSICION_NO_PERMITIDA' } });

    tx.solicitudPrecio.findUnique.mockResolvedValue({ id: 'sol-1', estado: 'COMPLETADA', asignadaAId: 'w1' });
    await expect(
      servicio.cambiarEstado('sol-1', { estado: 'EN_REVISION' }, personal),
    ).rejects.toThrow(ConflictException);
    expect(tx.solicitudPrecio.updateMany).not.toHaveBeenCalled();
  });

  it('el personal del INE no ve borradores', async () => {
    prisma.solicitudPrecio.findMany = vi.fn().mockResolvedValue([]);
    (prisma.solicitudPrecio as unknown as { count: unknown }).count = vi
      .fn()
      .mockResolvedValue(0);

    await servicio.listar({}, personal);

    const { where } = (prisma.solicitudPrecio.findMany as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(where).toMatchObject({ estado: { not: 'BORRADOR' } });
  });

  it('asigna solo a personal activo del INE y no cambia el estado', async () => {
    tx.solicitudPrecio.findFirst.mockResolvedValue({ ...completa, estado: 'RECIBIDA' });
    tx.usuario.findFirst.mockResolvedValue({ id: 'w2', nombre: 'Analista' });
    tx.solicitudPrecio.findUniqueOrThrow.mockResolvedValue({ id: 'sol-1' });

    await servicio.asignar('sol-1', { usuarioId: 'w2' }, jefe);

    expect(tx.solicitudPrecio.update).toHaveBeenCalledWith({
      where: { id: 'sol-1' },
      data: { asignadaAId: 'w2' },
    });
    expect(tx.solicitudHistorial.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ accion: 'Responsable asignado', detalle: 'Analista' }),
    });
  });

  it('un trabajador no asigna el expediente', async () => {
    await expect(
      servicio.asignar('sol-1', { usuarioId: 'w2' }, personal),
    ).rejects.toMatchObject({ response: { code: 'ASIGNACION_SOLO_JEFE' } });
  });

  it('no asigna a alguien que no es trabajador del INE', async () => {
    tx.solicitudPrecio.findFirst.mockResolvedValue({ ...completa, estado: 'RECIBIDA' });
    tx.usuario.findFirst.mockResolvedValue(null);

    await expect(
      servicio.asignar('sol-1', { usuarioId: 'u1' }, jefe),
    ).rejects.toMatchObject({ response: { code: 'PERSONA_NO_ASIGNABLE' } });
  });

  it('una observación visible devuelve el expediente sin borrar nada', async () => {
    tx.solicitudPrecio.findFirst.mockResolvedValue({ ...completa, estado: 'EN_REVISION' });
    tx.solicitudPrecio.updateMany.mockResolvedValue({ count: 1 });
    tx.solicitudPrecio.findUniqueOrThrow.mockResolvedValue({ id: 'sol-1' });

    await servicio.comentar(
      'sol-1',
      { contenido: 'Falta la unidad de medida.', devolver: true },
      personal,
    );

    expect(tx.solicitudComentario.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ esInterno: false, contenido: 'Falta la unidad de medida.' }),
    });
    expect(tx.solicitudPrecio.updateMany).toHaveBeenCalledWith({
      where: { id: 'sol-1', estado: 'EN_REVISION' },
      data: { estado: 'PENDIENTE_SUBSANACION' },
    });
    expect(tx.productoSolicitud.deleteMany).not.toHaveBeenCalled();
  });

  it('la entidad no puede devolver ni escribir una nota interna', async () => {
    await expect(
      servicio.comentar('sol-1', { contenido: 'Nota', esInterno: true }, solicitante),
    ).rejects.toThrow(ForbiddenException);
    expect(tx.solicitudComentario.create).not.toHaveBeenCalled();
  });

  it('el autor reenvía una subsanación y conserva el responsable', async () => {
    tx.solicitudPrecio.findFirst.mockResolvedValue({
      ...completa,
      estado: 'PENDIENTE_SUBSANACION',
      asignadaAId: 'w1',
    });
    tx.solicitudPrecio.updateMany.mockResolvedValue({ count: 1 });
    tx.solicitudPrecio.findUniqueOrThrow.mockResolvedValue({
      id: 'sol-1',
      estado: 'RECIBIDA',
      asignadaAId: 'w1',
    });

    const resultado = await servicio.reenviar('sol-1', solicitante);

    expect(resultado.asignadaAId).toBe('w1');
    expect(tx.solicitudPrecio.updateMany).toHaveBeenCalledWith({
      where: { id: 'sol-1', estado: 'PENDIENTE_SUBSANACION' },
      data: { estado: 'RECIBIDA' },
    });
  });

  it('registra la boleta con el precio escrito y no con el del catálogo', async () => {
    tx.solicitudPrecio.findFirst.mockResolvedValue({ ...completa, estado: 'EN_INVESTIGACION' });
    tx.fuenteConsulta.findFirst.mockResolvedValue({ id: 'f1', nombre: 'Catálogo INE' });
    tx.productoSolicitud.findMany.mockResolvedValue([{ id: 'p1' }]);
    tx.referenciaINE.count.mockResolvedValue(1);
    tx.solicitudPrecio.findUniqueOrThrow.mockResolvedValue({ id: 'sol-1' });

    await servicio.registrarConsulta(
      'sol-1',
      {
        fuenteId: 'f1',
        fechaConsulta: '2026-11-25',
        precios: [
          {
            productoSolicitudId: 'p1',
            precio: '18.500',
            unidadMedida: 'Caja',
            referenciaIneId: 'r1',
          },
        ],
      },
      personal,
    );

    const { data } = tx.consultaMercado.create.mock.calls[0][0];
    expect(data.precios.create[0]).toMatchObject({ precio: '18.500', referenciaIneId: 'r1' });
    expect(tx.validacionAnalisis.upsert).not.toHaveBeenCalled();
  });

  it('no registra una boleta fuera de investigación o análisis', async () => {
    tx.solicitudPrecio.findFirst.mockResolvedValue({ ...completa, estado: 'RECIBIDA' });

    await expect(
      servicio.registrarConsulta(
        'sol-1',
        {
          fuenteId: 'f1',
          fechaConsulta: '2026-11-25',
          precios: [{ productoSolicitudId: 'p1', precio: '10', unidadMedida: 'Caja' }],
        },
        personal,
      ),
    ).rejects.toMatchObject({ response: { code: 'ETAPA_NO_PERMITE_ACCION' } });
  });

  it('la confirmación del analista guarda el precio que él escribió', async () => {
    tx.solicitudPrecio.findFirst.mockResolvedValue({ ...completa, estado: 'EN_ANALISIS' });
    tx.productoSolicitud.findFirst.mockResolvedValue({ id: 'p1', nombre: 'Guantes' });
    tx.solicitudPrecio.findUniqueOrThrow.mockResolvedValue({ id: 'sol-1' });

    await servicio.registrarValidacion(
      'sol-1',
      {
        productoSolicitudId: 'p1',
        precioAdoptado: '21.000',
        unidadMedida: 'Caja',
        criterio: 'Se dejan fuera dos cotizaciones marcadas como atípicas.',
        confirmar: true,
      },
      personal,
    );

    expect(tx.validacionAnalisis.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          precioAdoptado: '21.000',
          confirmada: true,
          confirmadaPorId: 'w1',
        }),
      }),
    );
  });

  it('no abre el informe si falta un precio confirmado', async () => {
    tx.solicitudPrecio.findUnique.mockResolvedValue({ id: 'sol-1', estado: 'EN_ANALISIS', asignadaAId: 'w1' });
    tx.productoSolicitud.findMany.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);
    tx.validacionAnalisis.count.mockResolvedValue(1);

    await expect(
      servicio.cambiarEstado('sol-1', { estado: 'EN_INFORME' }, personal),
    ).rejects.toMatchObject({ response: { code: 'ANALISIS_INCOMPLETO' } });
    expect(tx.solicitudPrecio.updateMany).not.toHaveBeenCalled();
  });

  it('no cierra el expediente sin una entrega registrada', async () => {
    tx.solicitudPrecio.findUnique.mockResolvedValue({ id: 'sol-1', estado: 'EN_ENTREGA', asignadaAId: 'w1' });
    tx.entregaSolicitud.count.mockResolvedValue(0);

    await expect(
      servicio.cambiarEstado('sol-1', { estado: 'COMPLETADA' }, personal),
    ).rejects.toMatchObject({ response: { code: 'ENTREGA_INCOMPLETA' } });
  });

  it('arma el borrador del informe con el precio confirmado y lo marca como no oficial', async () => {
    tx.solicitudPrecio.findFirst.mockResolvedValue({
      ...completa,
      id: 'sol-1',
      codigo: 'PR-2026-000001',
      titulo: 'Guantes',
      institucionSolicitante: 'Ministerio',
      estado: 'EN_INFORME',
      productos: [
        {
          id: 'p1',
          numero: 1,
          nombre: 'Guantes',
          unidadMedida: 'Caja',
          cantidad: { toString: () => '10.000' },
        },
      ],
    });
    tx.informeSolicitud.aggregate.mockResolvedValue({ _max: { version: 0 } });
    tx.validacionAnalisis.findMany.mockResolvedValue([
      { productoSolicitudId: 'p1', precioAdoptado: { toString: () => '21.000' }, moneda: 'GTQ' },
    ]);
    tx.consultaMercado.count.mockResolvedValue(2);
    tx.solicitudPrecio.findUniqueOrThrow.mockResolvedValue({ id: 'sol-1' });

    await servicio.crearInforme(
      'sol-1',
      { tipo: 'INFORME_TECNICO', destinatario: 'Dirección de Compras' },
      personal,
    );

    const { data } = tx.informeSolicitud.create.mock.calls[0][0];
    expect(data.destinatario).toBe('Dirección de Compras');
    expect(data.resumen).toContain('Informe técnico');
    expect(data.resumen).toContain('Oficio');
    expect(data.resumen).toContain('GTQ 21.000');
    expect(data.version).toBe(1);
  });

  it('una nota interna no avisa a quien creó el expediente', async () => {
    tx.solicitudPrecio.findFirst.mockResolvedValue({
      ...completa,
      id: 'sol-1',
      codigo: 'PR-2026-000001',
      estado: 'EN_REVISION',
      asignadaAId: 'w1',
    });
    tx.solicitudPrecio.findUniqueOrThrow.mockResolvedValue({ id: 'sol-1' });

    await servicio.comentar('sol-1', { contenido: 'Nota de trabajo', esInterno: true }, personal);

    expect(notificaciones.avisar).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ incluirCreador: false, titulo: 'Nota interna en el expediente' }),
    );
  });

  it('corregir una boleta deja el precio anterior en el historial y no toca la validación', async () => {
    tx.solicitudPrecio.findFirst.mockResolvedValue({
      ...completa,
      id: 'sol-1',
      estado: 'EN_ANALISIS',
    });
    tx.consultaMercado.findFirst.mockResolvedValue({
      id: 'c1',
      nota: null,
      evidencia: null,
      fechaConsulta: new Date('2026-11-20T00:00:00.000Z'),
      precios: [
        {
          id: 'pc1',
          precio: { toString: () => '10.000' },
          moneda: 'GTQ',
          unidadMedida: 'Caja',
          observacion: null,
          productoSolicitud: { nombre: 'Guantes' },
        },
      ],
    });
    tx.solicitudPrecio.findUniqueOrThrow.mockResolvedValue({ id: 'sol-1' });

    await servicio.corregirConsulta(
      'sol-1',
      'c1',
      { precios: [{ id: 'pc1', precio: '21.000' }] },
      personal,
    );

    expect(tx.precioConsultado.update).toHaveBeenCalledWith({
      where: { id: 'pc1' },
      data: { precio: '21.000' },
    });
    expect(tx.solicitudHistorial.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accion: 'Boleta corregida',
        detalle: 'Guantes: 10.000 → 21.000',
      }),
    });
    expect(tx.validacionAnalisis.upsert).not.toHaveBeenCalled();
  });
});
