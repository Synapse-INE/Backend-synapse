import { describe, expect, it } from 'vitest';
import { armarResumen } from './publicacion.resumen.js';

describe('armarResumen', () => {
  it('arma doce meses, la modalidad principal y los productos recientes', () => {
    const resumen = armarResumen({
      total: 100,
      vigentes: 20,
      ultimaPublicacion: new Date('2026-07-24T06:00:00.000Z'),
      modalidades: [
        { etiqueta: 'Contrato Abierto', n: 90 },
        { etiqueta: 'Sin tipo', n: 1 },
        { etiqueta: 'Subasta Electrónica Inversa', n: 9 },
      ],
      categorias: [{ etiqueta: 'Salud e insumos hospitalarios', n: 40 }],
      meses: [{ mes: '2026-07', n: 8 }],
      recientes: [
        {
          id: 'p1',
          producto: 'Guantes',
          caracteristicas: 'Talla M',
          presentacion: 'Caja',
          precioReferencia: { toString: () => '42.500' },
          fechaPublicacion: new Date('2026-07-24T06:00:00.000Z'),
          vigenciaHasta: null,
          nog: '123',
          eventoOriginal: null,
          categoriaOriginal: 'Salud',
          tipoModalidad: { nombre: 'Contrato Abierto' },
        },
      ],
      hoy: new Date('2026-11-25T18:00:00.000Z'),
    });

    expect(resumen.modalidadPrincipal).toMatchObject({ etiqueta: 'Contrato Abierto', porcentaje: 90 });
    expect(resumen.modalidades.map((fila) => fila.etiqueta)).not.toContain('Sin tipo');
    expect(resumen.meses).toHaveLength(12);
    expect(resumen.meses.at(-1)).toMatchObject({ clave: '2026-11', n: 0 });
    expect(resumen.meses.find((fila) => fila.clave === '2026-07')?.n).toBe(8);
    expect(resumen.recientes[0]).toMatchObject({
      producto: 'Guantes',
      precio: 42.5,
      fechaPublicacion: '2026-07-24',
      modalidad: 'Contrato Abierto',
    });
    expect(resumen.ultimaPublicacion).toBe('2026-07-24');
  });
});
