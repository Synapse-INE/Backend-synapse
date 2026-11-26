import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UsuariosAdminService } from './usuarios-admin.service.js';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const ACTOR_ID = '22222222-2222-4222-8222-222222222222';

function crearServicio(otrosAdministradoresActivos: number) {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    usuario: {
      findUnique: vi.fn().mockResolvedValue({
        id: ADMIN_ID,
        email: 'admin@example.test',
        nombre: 'Admin',
        estado: 'ACTIVO',
        proveedorId: null,
        emailVerificadoEn: new Date(),
        ultimoAccesoEn: null,
        createdAt: new Date(),
        roles: [{ rol: { codigo: 'ADMIN' } }],
        perfilSolicitante: null,
      }),
      count: vi.fn().mockResolvedValue(otrosAdministradoresActivos),
      update: vi.fn(),
    },
    sesionUsuario: { updateMany: vi.fn() },
    rol: { findMany: vi.fn().mockResolvedValue([]) },
    usuarioRol: { deleteMany: vi.fn(), createMany: vi.fn() },
  };
  const prisma = {
    $transaction: vi.fn((operacion: (cliente: typeof tx) => Promise<unknown>) => operacion(tx)),
  };
  const auditoria = { registrarEn: vi.fn() };
  const servicio = new UsuariosAdminService(prisma as never, auditoria as never, {} as never);
  return { servicio, tx, auditoria };
}

describe('UsuariosAdminService · último administrador', () => {
  beforeEach(() => vi.clearAllMocks());

  it('no bloquea al último administrador activo', async () => {
    const { servicio, tx } = crearServicio(0);

    await expect(servicio.bloquear(ADMIN_ID, ACTOR_ID)).rejects.toMatchObject({
      response: { code: 'ULTIMO_ADMINISTRADOR' },
    });
    expect(tx.usuario.update).not.toHaveBeenCalled();
  });

  it('bloquea a un administrador si queda otro activo y revoca sus sesiones', async () => {
    const { servicio, tx, auditoria } = crearServicio(1);

    await expect(servicio.bloquear(ADMIN_ID, ACTOR_ID)).resolves.toEqual({
      id: ADMIN_ID,
      estado: 'BLOQUEADO',
    });
    expect(tx.sesionUsuario.updateMany).toHaveBeenCalled();
    expect(auditoria.registrarEn).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ accion: 'USUARIO_BLOQUEADO' }),
    );
  });

  it('no quita el rol de administrador al último', async () => {
    const { servicio, tx } = crearServicio(0);

    await expect(servicio.asignarRoles(ADMIN_ID, ['JEFE'], ACTOR_ID)).rejects.toMatchObject({
      response: { code: 'ULTIMO_ADMINISTRADOR' },
    });
    expect(tx.usuarioRol.deleteMany).not.toHaveBeenCalled();
  });

  it('rechaza roles desconocidos y listas vacías', async () => {
    const { servicio } = crearServicio(1);

    await expect(servicio.asignarRoles(ADMIN_ID, [], ACTOR_ID)).rejects.toMatchObject({
      status: 422,
    });
    await expect(servicio.asignarRoles(ADMIN_ID, ['SUPERUSUARIO'], ACTOR_ID)).rejects.toMatchObject({
      status: 422,
    });
  });
});
