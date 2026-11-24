import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { MailService } from './mail.service.js';

describe('MailService', () => {
  let mailService: MailService;
  let config: Record<string, string | number | boolean | undefined>;

  beforeEach(async () => {
    config = { NODE_ENV: 'test' };
    const moduleRef = await Test.createTestingModule({
      providers: [
        MailService,
        {
          provide: ConfigService,
          useValue: { get: (key: string) => config[key] },
        },
      ],
    }).compile();
    mailService = moduleRef.get(MailService);
  });

  it('sends through the isolated JSON transport during tests', async () => {
    await expect(
      mailService.send({
        to: 'requester@example.org',
        subject: 'Verifica tu correo',
        text: 'Confirma tu dirección de correo.',
      }),
    ).resolves.toBeUndefined();
  });

  it('fails explicitly when SMTP settings are missing outside tests', async () => {
    config.NODE_ENV = 'production';

    await expect(
      mailService.send({
        to: 'requester@example.org',
        subject: 'Verifica tu correo',
        text: 'Confirma tu dirección de correo.',
      }),
    ).rejects.toThrow('Define SMTP_HOST y SMTP_FROM');
  });

  it('rejects incomplete SMTP authentication before connecting', async () => {
    config.NODE_ENV = 'production';
    config.SMTP_HOST = 'smtp.example.org';
    config.SMTP_FROM = 'no-reply@example.org';
    config.SMTP_USER = 'smtp-user';

    await expect(
      mailService.send({
        to: 'requester@example.org',
        subject: 'Verifica tu correo',
        text: 'Confirma tu dirección de correo.',
      }),
    ).rejects.toThrow('SMTP_USER y SMTP_PASSWORD juntos');
  });

  it('rejects invalid addresses and header injection before sending', async () => {
    await expect(
      mailService.send({
        to: 'invalid-address',
        subject: 'Verifica tu correo',
        text: 'Contenido.',
      }),
    ).rejects.toThrow('destinatario');

    await expect(
      mailService.send({
        to: 'requester@example.org',
        subject: 'Asunto\r\nBcc: other@example.org',
        text: 'Contenido.',
      }),
    ).rejects.toThrow('asunto');
  });
});
