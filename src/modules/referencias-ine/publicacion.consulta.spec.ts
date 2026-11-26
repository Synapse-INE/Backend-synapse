import { describe, expect, it } from 'vitest';
import { corteDe, dondePublicacion, paginasDe, SIN_CATEGORIA } from './publicacion.consulta.js';

describe('consulta pública', () => {
  it('recorta la página y cuenta las páginas', () => {
    expect(corteDe({ limite: 5, pagina: 2 })).toEqual({ limite: 5, pagina: 2, salto: 5 });
    expect(corteDe({})).toEqual({ limite: 20, pagina: 1, salto: 0 });
    expect(paginasDe(1456, 20)).toBe(73);
    expect(paginasDe(0, 20)).toBe(1);
  });

  it('arma el filtro por categoría, producto y texto', () => {
    const { donde } = dondePublicacion({
      categoria: 'Salud e insumos hospitalarios',
      producto: 'guante',
      texto: 'nitrilo',
      fecha: '2026-07-06',
    });
    expect(donde.categoriaOriginal).toBe('Salud e insumos hospitalarios');
    expect(donde.producto).toMatchObject({ contains: 'guante' });
    expect(donde.fechaPublicacion).toEqual(new Date('2026-07-06T00:00:00.000Z'));
    expect(donde.AND).toBeDefined();
  });

  it('trata la categoría vacía como filas sin texto', () => {
    const { donde } = dondePublicacion({ categoria: SIN_CATEGORIA });
    expect(donde.OR).toEqual([{ categoriaOriginal: null }, { categoriaOriginal: '' }]);
  });
});
