import { describe, expect, it } from 'vitest';
import { correoInvitacion } from './correo-invitacion.js';

describe('correoInvitacion', () => {
  it('incluye el enlace en texto y HTML con el botón', () => {
    const token = 'abc123';
    const enlace = `https://portal.example.test/aceptar-invitacion?token=${token}`;
    const { text, html } = correoInvitacion({
      enlace,
      horas: 72,
      empresa: 'Papelería Demo',
    });

    expect(text).toContain(enlace);
    expect(text).toContain('Papelería Demo');
    expect(html).toContain('Completar registro');
    expect(html).toContain('aceptar-invitacion?token=abc123');
    expect(html).toContain('Papelería Demo');
    expect(html).not.toContain('<script');
  });
});