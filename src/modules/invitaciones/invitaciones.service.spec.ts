import { BadRequestException, ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashToken } from '../../common/security/tokens.js';
import { InvitacionesService } from './invitaciones.service.js';

describe('InvitacionesService', () => {
  const tx = {
    invitacionProveedor: { updateMany: vi.fn(), create: vi.fn() },
    proveedor: { create: vi.fn() },
  };
  const prisma = {
    usuario: { findUnique: vi.fn() },
    proveedor: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  };
  const mail = { send: vi.fn() };
  const auditoria = { registrarEn: vi.fn() };
  const config = {
    getOrThrow: (clave: string) =>
      ({ FRONTEND_URL: 'https://portal.example.test', INVITATION_TTL_HOURS: 72 })[
        clave
      ],
  };
  let servicio: InvitacionesService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.usuario.findUnique.mockResolvedValue(null);
    prisma.$transaction.mockImplementation(
      (operacion: (cliente: typeof tx) => Promise<unknown>) => operacion(tx),
    );
    tx.proveedor.create.mockResolvedValue({ id: 'prov-nuevo' });
    tx.invitacionProveedor.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: 'inv-1', ...data }),
    );
    servicio = new InvitacionesService(
      prisma as never,
      config as never,
      mail as never,
      auditoria as never,
    );
  });

  it('crea la invitación con un proveedor nuevo y guarda solo el hash del token', async () => {
    const resultado = await servicio.crear(
      {
        email: 'Contacto@Empresa.com',
        nuevoProveedor: { nombreComercial: 'Empresa' },
      },
      'admin-1',
      '203.0.113.2',
    );

    const { data } = tx.invitacionProveedor.create.mock.calls[0][0];
    expect(data).toMatchObject({
      email: 'contacto@empresa.com',
      proveedorId: 'prov-nuevo',
      creadaPorId: 'admin-1',
    });
    const envio = mail.send.mock.calls[0][0];
    expect(envio.html).toContain('Completar registro');
    const token = new URL(envio.text.match(/https:\/\/\S+/)![0]).searchParams.get('token')!;
    expect(hashToken(token)).toBe(data.tokenHash);
    expect(JSON.stringify(resultado)).not.toContain(token);
    expect(resultado.correoEnviado).toBe(true);
  });

  it('informa correoEnviado=false si falla el SMTP, sin deshacer la invitación', async () => {
    mail.send.mockRejectedValue(new Error('SMTP caído'));

    const resultado = await servicio.crear(
      { email: 'a@empresa.com', nuevoProveedor: { nombreComercial: 'Empresa' } },
      'admin-1',
    );

    expect(resultado.correoEnviado).toBe(false);
    expect(tx.invitacionProveedor.create).toHaveBeenCalledOnce();
  });

  it('exige exactamente una forma de indicar el proveedor', async () => {
    await expect(
      servicio.crear({ email: 'a@empresa.com' }, 'admin-1'),
    ).rejects.toThrow(BadRequestException);
    await expect(
      servicio.crear(
        {
          email: 'a@empresa.com',
          proveedorId: '497f6eca-6276-4993-bfeb-53cbbbba6f08',
          nuevoProveedor: { nombreComercial: 'X' },
        },
        'admin-1',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('no invita a un correo que ya tiene cuenta', async () => {
    prisma.usuario.findUnique.mockResolvedValue({ id: 'u1' });

    await expect(
      servicio.crear(
        { email: 'a@empresa.com', nuevoProveedor: { nombreComercial: 'X' } },
        'admin-1',
      ),
    ).rejects.toThrow(ConflictException);
  });
});
