import { describe, expect, it } from 'vitest';
import { medirAtencion } from './atencion.js';

const enviada = '2026-11-01T18:00:00.000Z';

describe('medirAtencion', () => {
  it('da 15 días corridos desde el envío y marca el día del vencimiento', () => {
    const alEnviar = medirAtencion(
      { estado: 'RECIBIDA', enviadaEn: enviada },
      new Date('2026-11-01T18:00:00.000Z'),
    );
    expect(alEnviar).toMatchObject({
      dias: 15,
      venceEn: '2026-11-16',
      diasRestantes: 15,
      situacion: 'EN_PLAZO',
    });

    const elDia = medirAtencion(
      { estado: 'EN_ANALISIS', enviadaEn: enviada },
      new Date('2026-11-16T18:00:00.000Z'),
    );
    expect(elDia?.situacion).toBe('VENCE_HOY');
    expect(elDia?.diasRestantes).toBe(0);

    const tarde = medirAtencion(
      { estado: 'EN_ESPERA', enviadaEn: enviada },
      new Date('2026-11-18T18:00:00.000Z'),
    );
    expect(tarde).toMatchObject({ diasRestantes: -2, situacion: 'VENCIDA' });
  });

  it('detiene el conteo mientras la entidad corrige y lo reanuda al reenviar', () => {
    const historial = [
      { estadoNuevo: 'PENDIENTE_SUBSANACION', createdAt: '2026-11-05T15:00:00.000Z' },
      { estadoNuevo: 'RECIBIDA', createdAt: '2026-11-07T15:00:00.000Z' },
    ];
    const medida = medirAtencion(
      { estado: 'EN_REVISION', enviadaEn: enviada, historial },
      new Date('2026-11-16T18:00:00.000Z'),
    );
    expect(medida).toMatchObject({ venceEn: '2026-11-18', diasRestantes: 2, situacion: 'EN_PLAZO' });
  });

  it('no sigue consumiendo días mientras la corrección sigue abierta', () => {
    const medida = medirAtencion(
      {
        estado: 'PENDIENTE_SUBSANACION',
        enviadaEn: enviada,
        historial: [{ estadoNuevo: 'PENDIENTE_SUBSANACION', createdAt: '2026-11-05T15:00:00.000Z' }],
      },
      new Date('2026-11-16T18:00:00.000Z'),
    );
    expect(medida).toMatchObject({ diasRestantes: 11, situacion: 'EN_SUBSANACION' });
  });

  it('congela el resultado al cerrar el expediente', () => {
    const aTiempo = medirAtencion(
      {
        estado: 'COMPLETADA',
        enviadaEn: enviada,
        historial: [{ estadoNuevo: 'COMPLETADA', createdAt: '2026-11-10T15:00:00.000Z' }],
      },
      new Date('2026-12-01T18:00:00.000Z'),
    );
    expect(aTiempo?.situacion).toBe('ATENDIDA');

    const tarde = medirAtencion(
      {
        estado: 'COMPLETADA',
        enviadaEn: enviada,
        historial: [{ estadoNuevo: 'COMPLETADA', createdAt: '2026-11-20T15:00:00.000Z' }],
      },
      new Date('2026-12-01T18:00:00.000Z'),
    );
    expect(tarde?.situacion).toBe('ATENDIDA_FUERA_DE_PLAZO');
  });

  it('un borrador no tiene tiempo de atención', () => {
    expect(medirAtencion({ estado: 'BORRADOR', enviadaEn: null })).toBeNull();
  });
});
