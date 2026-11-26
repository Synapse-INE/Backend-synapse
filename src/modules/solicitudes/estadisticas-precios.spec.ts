import { describe, expect, it } from 'vitest';
import { medirProducto } from './estadisticas-precios.js';

const producto = { id: 'p1', nombre: 'Guantes', unidadMedida: 'unidad' };

describe('medirProducto', () => {
  it('excluye atípicos, otra moneda y otra unidad', () => {
    const medidas = medirProducto(producto, [
      { precio: '10', moneda: 'GTQ', unidadMedida: 'unidad', esAtipico: false, fuente: 'Catálogo' },
      { precio: '12.5', moneda: 'GTQ', unidadMedida: 'Unidad', esAtipico: false, fuente: 'Farmacia' },
      { precio: '40', moneda: 'GTQ', unidadMedida: 'unidad', esAtipico: true, fuente: 'Tienda' },
      { precio: '9', moneda: 'USD', unidadMedida: 'unidad', esAtipico: false, fuente: 'Exterior' },
      { precio: '8', moneda: 'GTQ', unidadMedida: 'caja', esAtipico: false, fuente: 'Mayorista' },
    ]);

    expect(medidas.incluidos.map((punto) => punto.precio)).toEqual(['10.000', '12.500']);
    expect(medidas.excluidos.map((punto) => punto.motivo)).toEqual([
      'Marcado como atípico',
      'Otra moneda',
      'Otra unidad de medida',
    ]);
    expect(medidas.media).toBe('11.250');
    expect(medidas.mediana).toBe('11.250');
    expect(medidas.moda).toBeNull();
    expect(medidas.interpretacion).toContain('No hay moda');
    expect(medidas.grafica).toContain('<svg');
    expect(medidas.grafica).not.toContain('<script');
  });

  it('calcula la moda cuando un precio se repite', () => {
    const medidas = medirProducto(producto, [
      { precio: '10', moneda: 'GTQ', unidadMedida: 'unidad', esAtipico: false, fuente: 'A' },
      { precio: '10.000', moneda: 'GTQ', unidadMedida: 'unidad', esAtipico: false, fuente: 'B' },
      { precio: '14', moneda: 'GTQ', unidadMedida: 'unidad', esAtipico: false, fuente: 'C' },
    ]);

    expect(medidas.moda).toBe('10.000');
    expect(medidas.mediana).toBe('10.000');
    expect(medidas.media).toBe('11.333');
  });

  it('no calcula medidas si no hay precios comparables', () => {
    const medidas = medirProducto(producto, []);

    expect(medidas.media).toBeNull();
    expect(medidas.interpretacion).toContain('no tiene precios comparables');
  });
});
