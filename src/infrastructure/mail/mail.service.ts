import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isEmail } from 'class-validator';
import nodemailer from 'nodemailer';

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
}

@Injectable()
export class MailService {
  private transporter?: ReturnType<typeof nodemailer.createTransport>;

  constructor(private readonly config: ConfigService) {}

  async send(message: OutgoingMail): Promise<void> {
    const nodeEnv = this.config.get<string>('NODE_ENV');
    const isTestTransport = nodeEnv === 'test';
    const from = isTestTransport
      ? 'Portal de Precios <no-reply@example.test>'
      : this.config.get<string>('SMTP_FROM')?.trim();

    if (!isEmail(message.to) || /[\r\n]/.test(message.to)) {
      throw new TypeError('El destinatario del correo no es válido.');
    }
    if (!message.subject.trim() || /[\r\n]/.test(message.subject)) {
      throw new TypeError('El asunto del correo no es válido.');
    }
    if (!message.text.trim()) {
      throw new TypeError('El correo debe incluir contenido de texto.');
    }
    if (!from) {
      throw new Error(
        'El correo no está configurado. Define SMTP_HOST y SMTP_FROM.',
      );
    }

    await this.getTransporter(isTestTransport).sendMail({
      from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
      ...(message.attachments ? { attachments: message.attachments } : {}),
    });
  }

  private getTransporter(isTestTransport: boolean) {
    if (this.transporter) return this.transporter;

    if (isTestTransport) {
      this.transporter = nodemailer.createTransport({ jsonTransport: true });
      return this.transporter;
    }

    const host = this.config.get<string>('SMTP_HOST')?.trim();
    const user = this.config.get<string>('SMTP_USER')?.trim();
    const password = this.config.get<string>('SMTP_PASSWORD');
    if (!host) {
      throw new Error(
        'El correo no está configurado. Define SMTP_HOST y SMTP_FROM.',
      );
    }
    if (Boolean(user) !== Boolean(password)) {
      throw new Error(
        'La autenticación SMTP requiere configurar SMTP_USER y SMTP_PASSWORD juntos.',
      );
    }

    const secure = this.config.get<boolean>('SMTP_SECURE') ?? false;
    this.transporter = nodemailer.createTransport({
      host,
      port: this.config.get<number>('SMTP_PORT') ?? 587,
      secure,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      ...(!secure ? { requireTLS: true } : {}),
      ...(user && password ? { auth: { user, pass: password } } : {}),
    });
    return this.transporter;
  }
}
