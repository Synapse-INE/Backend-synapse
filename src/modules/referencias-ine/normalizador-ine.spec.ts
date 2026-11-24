import { describe, expect, it } from 'vitest';
import { claveModalidad, normalizarFilaINE } from './normalizador-ine.js';

describe('normalizarFilaINE', () => {
  it('conserva tres decimales y normaliza los marcadores de ausencia', () => {
    const resultado = normalizarFilaINE({
      correlativo: '001',
      modalidadPrincipal: 'Contrato Abierto',
      nog: 'NA',
      eventoOriginal: 'Evento fuente',
      modalidadRepetida: 'Contrato Abierto',
      producto: 'Producto',
      caracteristicas: 'Características',
      presentacion: 'Unidad',
      precioReferencia: '1,347.990',
      fechaPublicacion: '10/11/2023',
      categoriaOriginal: 'NA',
      vigenciaHasta: null,
    });

    expect(resultado.errores).toEqual([]);
    expect(resultado.datos).toMatchObject({
      correlativo: '001',
      nog: null,
      categoriaOriginal: null,
      precioReferencia: '1347.990',
      tipoModalidadCodigo: 'CONTRATO_ABIERTO',
    });
    expect(resultado.datos.fechaPublicacion?.toISOString()).toBe(
      '2023-11-10T00:00:00.000Z',
    );
  });

  it('preserva la fila para revisión cuando el precio o fecha no son válidos', () => {
    const resultado = normalizarFilaINE({
      correlativo: null,
      modalidadPrincipal: 'Sin Dato',
      nog: '123',
      eventoOriginal: 'Evento',
      modalidadRepetida: 'Otra modalidad',
      producto: 'Producto',
      caracteristicas: null,
      presentacion: 'Unidad',
      precioReferencia: 'precio pendiente',
      fechaPublicacion: '30/11/-0001',
      categoriaOriginal: 'Categoría',
      vigenciaHasta: '31/02/2024',
    });

    expect(resultado.datos.precioReferencia).toBeNull();
    expect(resultado.datos.fechaPublicacion).toBeNull();
    expect(resultado.datos.vigenciaHasta).toBeNull();
    expect(resultado.errores).toEqual(
      expect.arrayContaining([
        { campo: 'modalidad', codigo: 'MODALIDADES_NO_COINCIDEN' },
        { campo: 'precioReferencia', codigo: 'PRECIO_INVALIDO' },
        { campo: 'fechaPublicacion', codigo: 'FECHA_INVALIDA' },
        { campo: 'vigenciaHasta', codigo: 'FECHA_INVALIDA' },
      ]),
    );
  });

  it('genera una clave de alias independiente de acentos y separadores', () => {
    expect(claveModalidad('Subasta Electrónica-Inversa')).toBe(
      'subastaelectronicainversa',
    );
  });
});
