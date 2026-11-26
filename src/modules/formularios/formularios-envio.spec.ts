import { describe, expect, it } from 'vitest';
import { evaluarFormularios, type DatosFormularios } from './formularios-envio.js';

const PRODUCTOS = [
  { id: 'p1', numero: 1 },
  { id: 'p2', numero: 2 },
];

function datos(parcial: Partial<DatosFormularios>): DatosFormularios {
  return {
    modalidad: 'CONTRATO_ABIERTO',
    productos: PRODUCTOS,
    propuestasPorProducto: new Map(),
    cotizacionesPorProducto: new Map(),
    representantes: new Set(),
    justificaciones: [],
    ...parcial,
  };
}

describe('evaluarFormularios', () => {
  it('no exige nada extra en Contrato Abierto', () => {
    expect(evaluarFormularios(datos({}))).toEqual([]);
  });

  it('en Subasta exige tres empresas por producto', () => {
    const errores = evaluarFormularios(
      datos({
        modalidad: 'SUBASTA_ELECTRONICA_INVERSA',
        propuestasPorProducto: new Map([
          ['p1', 3],
          ['p2', 2],
        ]),
      }),
    );

    expect(errores).toEqual([
      expect.objectContaining({ field: 'productos[2].proveedoresPropuestos' }),
    ]);
  });

  it('en importados exige ambos representantes y tres cotizaciones por producto', () => {
    const errores = evaluarFormularios(
      datos({
        modalidad: 'BIENES_SUMINISTROS_IMPORTADOS',
        representantes: new Set(['TITULAR']),
        cotizacionesPorProducto: new Map([['p1', 3]]),
      }),
    );

    expect(errores.map((error) => error.field)).toEqual([
      'representantes.suplente',
      'productos[2].cotizaciones',
    ]);
  });

  it('una justificación de cotizaciones insuficientes exime al producto indicado', () => {
    const errores = evaluarFormularios(
      datos({
        modalidad: 'BIENES_SUMINISTROS_IMPORTADOS',
        representantes: new Set(['TITULAR', 'SUPLENTE']),
        cotizacionesPorProducto: new Map([['p1', 3]]),
        justificaciones: [
          { tipo: 'COTIZACIONES_INSUFICIENTES', productoSolicitudId: 'p2' },
        ],
      }),
    );

    expect(errores).toEqual([]);
  });

  it('una justificación sin producto exime a toda la solicitud, pero otro tipo no', () => {
    const base = {
      modalidad: 'BIENES_SUMINISTROS_IMPORTADOS',
      representantes: new Set(['TITULAR', 'SUPLENTE']),
    };

    expect(
      evaluarFormularios(
        datos({
          ...base,
          justificaciones: [
            { tipo: 'COTIZACIONES_INSUFICIENTES', productoSolicitudId: null },
          ],
        }),
      ),
    ).toEqual([]);
    expect(
      evaluarFormularios(
        datos({
          ...base,
          justificaciones: [
            { tipo: 'NO_UTILIZA_CATALOGO_SIGES', productoSolicitudId: null },
          ],
        }),
      ),
    ).toHaveLength(2);
  });
});
