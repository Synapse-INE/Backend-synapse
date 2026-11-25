import { describe, expect, it } from 'vitest';
import { borradorInforme } from './borrador-informe.js';

describe('borradorInforme', () => {
  it('deja pendiente el producto que el analista todavía no confirma', () => {
    const texto = borradorInforme({
      tipo: 'OFICIO',
      codigo: 'PR-2026-000004',
      titulo: 'Insumos',
      institucion: 'Hospital',
      destinatario: 'Unidad receptora',
      consultas: 0,
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
    });

    expect(texto).toContain('Borrador de oficio');
    expect(texto).toContain('pendiente de confirmación del analista');
    expect(texto).not.toContain('DIGAE');
  });
});
