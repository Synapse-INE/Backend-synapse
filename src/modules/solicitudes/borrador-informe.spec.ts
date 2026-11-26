import { describe, expect, it } from 'vitest';
import { borradorInforme } from './borrador-informe.js';

describe('borradorInforme', () => {
  it('reúne el informe técnico y el oficio en un solo texto', () => {
    const texto = borradorInforme({
      codigo: 'PR-2026-000004',
      titulo: 'Insumos',
      institucion: 'Hospital',
      destinatario: 'Unidad receptora',
      elaboradoPor: 'Ana Analista',
      fecha: '2026-11-25',
      productos: [
        {
          numero: 1,
          nombre: 'Jeringa',
          unidadMedida: 'Unidad',
          cantidad: '100',
          precioAdoptado: null,
          moneda: null,
        },
      ],
      estadisticas: {
        productos: [
          {
            productoSolicitudId: 'p1',
            nombre: 'Jeringa',
            unidadMedida: 'Unidad',
            incluidos: [],
            excluidos: [],
            media: null,
            mediana: null,
            moda: null,
            interpretacion: 'La gráfica de Jeringa no tiene precios comparables.',
            grafica: '<svg></svg>',
          },
        ],
      },
    });

    expect(texto).toContain('Instituto Nacional de Estadística');
    expect(texto).toContain('Informe técnico');
    expect(texto).toContain('Oficio');
    expect(texto).toContain('pendiente de confirmación del analista');
    expect(texto).toContain('no tiene precios comparables');
    expect(texto).not.toContain('DIGAE');
  });
});
