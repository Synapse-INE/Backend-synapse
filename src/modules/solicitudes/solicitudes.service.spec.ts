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

const completa = {
  id: 'sol-1',
  estado: 'BORRADOR',
  creadaPorId: 'u1',
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
    },
    productoSolicitud: { deleteMany: vi.fn() },
  };
  const prisma = {
    ...tx,
    institucionSolicitante: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  };
  const auditoria = { registrarEn: vi.fn() };
  let servicio: SolicitudesService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(
      (operacion: (cliente: typeof tx) => Promise<unknown>) => operacion(tx),
    );
    prisma.institucionSolicitante.findUnique.mockResolvedValue({
      id: 'inst-1',
      nombreOficial: 'Ministerio',
    });
    servicio = new SolicitudesService(prisma as never, auditoria as never);
  });

  it('crea un borrador ligado al usuario y su institución, con productos numerados', async () => {
    tx.solicitudPrecio.create.mockResolvedValue({ id: 'sol-1' });

    await servicio.crear(
      {
        titulo: 'Guantes',
        descripcion: 'Compra',
        productos: [{ nombre: 'A' }, { nombre: 'B', cantidad: '2.5' }],
      },
      solicitante,
      '203.0.113.1',
    );

    const { data } = tx.solicitudPrecio.create.mock.calls[0][0];
    expect(data).toMatchObject({
      estado: 'BORRADOR',
      creadaPorId: 'u1',
      institucionSolicitanteId: 'inst-1',
      institucionSolicitante: 'Ministerio',
    });
    expect(data.productos.create.map((p: { numero: number }) => p.numero)).toEqual([1, 2]);
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
  });

  it('un doble envío simultáneo no duplica la recepción', async () => {
    tx.solicitudPrecio.findFirst.mockResolvedValue(completa);
    tx.solicitudPrecio.updateMany.mockResolvedValue({ count: 0 });

    await expect(servicio.enviar('sol-1', solicitante)).rejects.toThrow(ConflictException);
    expect(auditoria.registrarEn).not.toHaveBeenCalled();
  });

  it('el personal avanza el estado por una transición válida y deja el motivo', async () => {
    tx.solicitudPrecio.findUnique.mockResolvedValue({ estado: 'RECIBIDA' });
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

  it('rechaza saltos de estado y cambios sobre solicitudes cerradas', async () => {
    tx.solicitudPrecio.findUnique.mockResolvedValue({ estado: 'RECIBIDA' });
    await expect(
      servicio.cambiarEstado('sol-1', { estado: 'COMPLETADA' }, personal),
    ).rejects.toMatchObject({ response: { code: 'TRANSICION_NO_PERMITIDA' } });

    tx.solicitudPrecio.findUnique.mockResolvedValue({ estado: 'COMPLETADA' });
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
});
