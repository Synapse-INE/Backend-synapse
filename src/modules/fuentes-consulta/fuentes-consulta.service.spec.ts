import { UnprocessableEntityException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FuentesConsultaService } from './fuentes-consulta.service.js';

const personal = {
  sessionId: 's1',
  csrfTokenHash: 'x',
  usuario: { id: 'w1', email: 'a@b.c', nombre: 'A', roles: ['TRABAJADOR_INE'] },
  ownership: { usuarioId: 'w1', proveedorId: null, institucionId: null },
};

describe('FuentesConsultaService', () => {
  const prisma = {
    fuenteConsulta: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  };
  const auditoria = { registrar: vi.fn() };
  let servicio: FuentesConsultaService;

  beforeEach(() => {
    vi.clearAllMocks();
    servicio = new FuentesConsultaService(prisma as never, auditoria as never);
  });

  it('guarda el país en GT y acepta un dominio .gt', async () => {
    prisma.fuenteConsulta.create.mockResolvedValue({ id: 'f1', pais: 'GT' });

    await servicio.crear(
      { nombre: 'Guatecompras', tipo: 'INSTITUCION', dominio: 'WWW.GUATECOMPRAS.GOB.GT' },
      personal,
    );

    expect(prisma.fuenteConsulta.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ pais: 'GT', dominio: 'www.guatecompras.gob.gt' }),
      }),
    );
  });

  it('rechaza un dominio que no es de Guatemala', async () => {
    await expect(
      servicio.crear(
        { nombre: 'Tienda externa', tipo: 'EMPRESA', dominio: 'tienda.com' },
        personal,
      ),
    ).rejects.toMatchObject({ response: { code: 'FUENTE_NO_GUATEMALTECA' } });
    expect(prisma.fuenteConsulta.create).not.toHaveBeenCalled();
  });

  it('rechaza una dirección web completa', async () => {
    await expect(
      servicio.crear(
        { nombre: 'Portal', tipo: 'INSTITUCION', dominio: 'https://ine.gob.gt/precios' },
        personal,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});
