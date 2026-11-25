import { BadRequestException, ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashToken } from '../../common/security/tokens.js';
import { RegistroService } from './registro.service.js';

describe('RegistroService', () => {
  const tx = {
    institucionSolicitante: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    usuario: { create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    tokenVerificacionCorreo: {
      updateMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
    },
    invitacionProveedor: { updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
  };
  const prisma = {
    usuario: { findUnique: vi.fn() },
    rol: { findUniqueOrThrow: vi.fn() },
    $transaction: vi.fn(),
  };
  const mail = { send: vi.fn() };
  const auditoria = { registrar: vi.fn(), registrarEn: vi.fn() };
  const valoresConfig: Record<string, unknown> = {
    FRONTEND_URL: 'https://portal.example.test',
    EMAIL_TOKEN_TTL_HOURS: 24,
    REGISTRO_DOMINIOS_PERMITIDOS: '',
  };
  const config = {
    get: (clave: string) => valoresConfig[clave],
    getOrThrow: (clave: string) => valoresConfig[clave],
  };
  let servicio: RegistroService;

  const dto = {
    email: ' Persona@Entidad.gob.gt ',
    password: 'una contraseña larga y segura',
    nombre: 'Persona Prueba',
    institucion: { nombreOficial: 'Ministerio de Prueba' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    valoresConfig.REGISTRO_DOMINIOS_PERMITIDOS = '';
    prisma.$transaction.mockImplementation(
      (operacion: (cliente: typeof tx) => Promise<unknown>) => operacion(tx),
    );
    prisma.rol.findUniqueOrThrow.mockResolvedValue({ id: 'rol-1' });
    tx.institucionSolicitante.findFirst.mockResolvedValue(null);
    tx.institucionSolicitante.create.mockResolvedValue({ id: 'inst-1' });
    tx.usuario.create.mockResolvedValue({ id: 'usuario-1', email: 'x', nombre: 'n' });
    servicio = new RegistroService(
      prisma as never,
      config as never,
      mail as never,
      auditoria as never,
    );
  });

  it('registra al solicitante pendiente de verificación y envía solo el enlace', async () => {
    prisma.usuario.findUnique.mockResolvedValue(null);

    await servicio.registrarSolicitante(dto, '203.0.113.1');

    const { data } = tx.usuario.create.mock.calls[0][0];
    expect(data.email).toBe('persona@entidad.gob.gt');
    expect(data.passwordHash).toMatch(/^\$argon2id\$/);
    expect(data.estado).toBeUndefined();
    expect(data.tokensVerificacion.create.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(mail.send).toHaveBeenCalledOnce();
    const { text } = mail.send.mock.calls[0][0];
    const token = new URL(text.match(/https:\/\/\S+/)![0]).searchParams.get('token')!;
    expect(hashToken(token)).toBe(data.tokensVerificacion.create.tokenHash);
  });

  it('no revela que el correo ya existe: no crea ni envía nada', async () => {
    prisma.usuario.findUnique.mockResolvedValue({ id: 'existente' });

    await expect(servicio.registrarSolicitante(dto)).resolves.toBeUndefined();

    expect(tx.usuario.create).not.toHaveBeenCalled();
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('trata una carrera por el mismo correo con la misma respuesta genérica', async () => {
    prisma.usuario.findUnique.mockResolvedValue(null);
    tx.usuario.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' }));

    await expect(servicio.registrarSolicitante(dto)).resolves.toBeUndefined();
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('rechaza dominios fuera de la lista configurada', async () => {
    valoresConfig.REGISTRO_DOMINIOS_PERMITIDOS = 'gob.gt';

    await expect(
      servicio.registrarSolicitante({ ...dto, email: 'persona@gmail.com' }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      servicio.registrarSolicitante({ ...dto, email: 'persona@mp.gob.gt' }),
    ).resolves.toBeUndefined();
  });

  it('la cuenta queda creada aunque falle el SMTP y el error no incluye el token', async () => {
    prisma.usuario.findUnique.mockResolvedValue(null);
    mail.send.mockRejectedValue(new Error('SMTP caído'));

    await expect(servicio.registrarSolicitante(dto)).resolves.toBeUndefined();
    expect(tx.usuario.create).toHaveBeenCalledOnce();
  });

  it('verifica el correo consumiendo el token una sola vez', async () => {
    tx.tokenVerificacionCorreo.updateMany.mockResolvedValue({ count: 1 });
    tx.tokenVerificacionCorreo.findUniqueOrThrow.mockResolvedValue({ usuarioId: 'u1' });

    await servicio.verificarCorreo('token-de-prueba-suficientemente-largo');

    expect(tx.tokenVerificacionCorreo.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ consumidoEn: null }),
      }),
    );
    expect(tx.usuario.updateMany).toHaveBeenCalledWith({
      where: { id: 'u1', estado: 'PENDIENTE_VERIFICACION' },
      data: { estado: 'PENDIENTE_APROBACION' },
    });
  });

  it('rechaza un token vencido, repetido o inventado', async () => {
    tx.tokenVerificacionCorreo.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      servicio.verificarCorreo('token-de-prueba-suficientemente-largo'),
    ).rejects.toMatchObject({ response: { code: 'TOKEN_INVALIDO' } });
    expect(tx.usuario.update).not.toHaveBeenCalled();
  });

  it('crea la cuenta de proveedor solo con una invitación vigente y la consume', async () => {
    tx.invitacionProveedor.updateMany.mockResolvedValue({ count: 1 });
    tx.invitacionProveedor.findUniqueOrThrow.mockResolvedValue({
      id: 'inv-1',
      email: 'Proveedor@Empresa.com',
      proveedorId: 'prov-1',
    });
    tx.usuario.create.mockResolvedValue({
      id: 'u2',
      email: 'proveedor@empresa.com',
      nombre: 'Proveedor',
    });
    prisma.rol.findUniqueOrThrow.mockResolvedValue({ id: 'rol-prov' });

    const resultado = await servicio.aceptarInvitacion({
      token: 'token-de-invitacion-suficientemente-largo',
      password: 'una contraseña larga y segura',
      nombre: 'Proveedor',
    });

    const { data } = tx.usuario.create.mock.calls[0][0];
    expect(data).toMatchObject({
      email: 'proveedor@empresa.com',
      estado: 'ACTIVO',
      proveedorId: 'prov-1',
    });
    expect(data.roles.create).toEqual([{ rolId: 'rol-prov' }]);
    expect(resultado.id).toBe('u2');
  });

  it('rechaza una invitación consumida, vencida o ya usada', async () => {
    tx.invitacionProveedor.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      servicio.aceptarInvitacion({
        token: 'token-de-invitacion-suficientemente-largo',
        password: 'una contraseña larga y segura',
        nombre: 'Proveedor',
      }),
    ).rejects.toMatchObject({ response: { code: 'TOKEN_INVALIDO' } });
    expect(tx.usuario.create).not.toHaveBeenCalled();
  });

  it('informa conflicto si la cuenta ya existe al aceptar la invitación', async () => {
    tx.invitacionProveedor.updateMany.mockResolvedValue({ count: 1 });
    tx.invitacionProveedor.findUniqueOrThrow.mockResolvedValue({
      id: 'inv-1',
      email: 'a@b.com',
      proveedorId: 'prov-1',
    });
    tx.usuario.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' }));

    await expect(
      servicio.aceptarInvitacion({
        token: 'token-de-invitacion-suficientemente-largo',
        password: 'una contraseña larga y segura',
        nombre: 'Proveedor',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('el reenvío es silencioso si la cuenta no espera verificación', async () => {
    prisma.usuario.findUnique.mockResolvedValue({
      id: 'u3',
      nombre: 'Ya activo',
      estado: 'ACTIVO',
    });

    await servicio.reenviarVerificacion('activo@entidad.gob.gt');

    expect(mail.send).not.toHaveBeenCalled();
  });
});
