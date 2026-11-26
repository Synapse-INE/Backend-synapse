import { describe, expect, it } from 'vitest';
import { correoVerificacion } from './correo-verificacion.js';

describe('correoVerificacion', () => {
  it('arma el texto y un HTML con el botón y el enlace escapado', () => {
    const enlace = 'https://portal.example.test/verificar-correo?token=abc&siguiente=1';
    const { text, html } = correoVerificacion({
      nombre: 'Ana <Ruiz>\n',
      enlace,
      horas: 24,
    });

    expect(text).toContain('Hola Ana <Ruiz>,');
    expect(text).toContain(enlace);
    expect(html).toContain('Verificar mi correo');
    expect(html).toContain('Ana &lt;Ruiz&gt;');
    expect(html).toContain('abc&amp;siguiente=1');
    expect(html).not.toContain('Ana <Ruiz>');
  });
});
