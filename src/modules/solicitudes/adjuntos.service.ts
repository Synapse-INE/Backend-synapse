import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  Injectable,
  NotFoundException,
  StreamableFile,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedRequest } from '../../common/auth/auth-context.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';

const MAXIMO = 10 * 1024 * 1024;
const PDF = Buffer.from('%PDF');

export type ArchivoRecibido = {
  buffer: Buffer;
  size: number;
  originalname: string;
  mimetype?: string;
};

type Actor = AuthenticatedRequest['auth'];

@Injectable()
export class AdjuntosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async listar(solicitudId: string, actor: Actor) {
    const solicitud = await this.cargar(solicitudId, actor);
    const filas = await this.prisma.solicitudAdjunto.findMany({
      where: { solicitudId, ...this.filtroLectura(actor, solicitud.estado) },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        nombreOriginal: true,
        tamanoBytes: true,
        consultaId: true,
        entregaId: true,
        createdAt: true,
      },
    });
    return { adjuntos: filas };
  }

  async guardar(
    solicitudId: string,
    archivo: ArchivoRecibido | undefined,
    vinculo: { consultaId?: string; entregaId?: string },
    actor: Actor,
  ) {
    if (!archivo?.buffer?.length) {
      throw new UnprocessableEntityException({
        code: 'ARCHIVO_REQUERIDO',
        detail: 'Adjunta un PDF.',
      });
    }
    if (archivo.size > MAXIMO || archivo.buffer.length > MAXIMO) {
      throw new UnprocessableEntityException({
        code: 'ARCHIVO_DEMASIADO_GRANDE',
        detail: 'El PDF no puede pasar de 10 MB.',
      });
    }
    if (!archivo.buffer.subarray(0, PDF.length).equals(PDF)) {
      throw new UnprocessableEntityException({
        code: 'ARCHIVO_NO_PDF',
        detail: 'Solo se aceptan archivos PDF.',
      });
    }

    const solicitud = await this.cargar(solicitudId, actor);
    const personal = this.esPersonal(actor);
    if (vinculo.consultaId && vinculo.entregaId) {
      throw new UnprocessableEntityException({
        code: 'ARCHIVO_AMBIGUO',
        detail: 'El PDF corresponde a la solicitud, a una boleta o a una entrega.',
      });
    }
    if (vinculo.consultaId) {
      this.exigirPersonal(personal);
      this.exigirEstado(solicitud.estado, ['EN_INVESTIGACION', 'EN_ANALISIS'], 'Una evidencia se adjunta durante la investigación o el análisis.');
      const consulta = await this.prisma.consultaMercado.findFirst({
        where: { id: vinculo.consultaId, solicitudId },
        select: { id: true },
      });
      if (!consulta) {
        throw new NotFoundException({
          code: 'CONSULTA_NO_ENCONTRADA',
          detail: 'Esa boleta no pertenece al expediente.',
        });
      }
    } else if (vinculo.entregaId) {
      this.exigirPersonal(personal);
      this.exigirEstado(solicitud.estado, ['EN_ENTREGA'], 'La constancia se adjunta al registrar la entrega.');
      const entrega = await this.prisma.entregaSolicitud.findFirst({
        where: { id: vinculo.entregaId, solicitudId },
        select: { id: true },
      });
      if (!entrega) {
        throw new NotFoundException({
          code: 'ENTREGA_NO_ENCONTRADA',
          detail: 'Esa entrega no pertenece al expediente.',
        });
      }
    } else if (personal || solicitud.creadaPorId !== actor.usuario.id || solicitud.estado !== 'BORRADOR') {
      throw new UnprocessableEntityException({
        code: 'ARCHIVO_NO_EDITABLE',
        detail: 'El PDF de la solicitud se agrega en el borrador, antes de enviarla.',
      });
    }

    const id = randomUUID();
    const objectKey = `${solicitudId}/${id}.pdf`;
    const destino = this.ruta(objectKey);
    await mkdir(path.dirname(destino), { recursive: true });
    await writeFile(destino, archivo.buffer);
    try {
      return await this.prisma.solicitudAdjunto.create({
        data: {
          solicitudId,
          nombreOriginal: this.nombre(archivo.originalname),
          objectKey,
          mimeVerificado: 'application/pdf',
          tamanoBytes: archivo.buffer.length,
          sha256: createHash('sha256').update(archivo.buffer).digest('hex'),
          subidoPorId: actor.usuario.id,
          consultaId: vinculo.consultaId ?? null,
          entregaId: vinculo.entregaId ?? null,
        },
        select: { id: true, nombreOriginal: true, tamanoBytes: true, consultaId: true, entregaId: true },
      });
    } catch (error) {
      await unlink(destino).catch(() => undefined);
      throw error;
    }
  }

  async descargar(solicitudId: string, adjuntoId: string, actor: Actor) {
    const solicitud = await this.cargar(solicitudId, actor);
    const adjunto = await this.prisma.solicitudAdjunto.findFirst({
      where: { id: adjuntoId, solicitudId, ...this.filtroLectura(actor, solicitud.estado) },
    });
    if (!adjunto || !/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf$/.test(adjunto.objectKey)) {
      throw new NotFoundException({
        code: 'ADJUNTO_NO_ENCONTRADO',
        detail: 'Ese archivo no está en el expediente.',
      });
    }
    return new StreamableFile(createReadStream(this.ruta(adjunto.objectKey)), {
      type: 'application/pdf',
      disposition: `attachment; filename="${adjunto.nombreOriginal.replaceAll('"', '')}"`,
    });
  }

  async quitar(solicitudId: string, adjuntoId: string, actor: Actor) {
    const solicitud = await this.cargar(solicitudId, actor);
    if (solicitud.creadaPorId !== actor.usuario.id || solicitud.estado !== 'BORRADOR') {
      throw new UnprocessableEntityException({
        code: 'ARCHIVO_NO_EDITABLE',
        detail: 'Un PDF de la solicitud solo se quita mientras sigue en borrador.',
      });
    }
    const adjunto = await this.prisma.solicitudAdjunto.findFirst({
      where: { id: adjuntoId, solicitudId, consultaId: null, entregaId: null },
    });
    if (!adjunto) {
      throw new NotFoundException({
        code: 'ADJUNTO_NO_ENCONTRADO',
        detail: 'Ese archivo no está en el expediente.',
      });
    }
    await this.prisma.solicitudAdjunto.delete({ where: { id: adjunto.id } });
    await unlink(this.ruta(adjunto.objectKey)).catch(() => undefined);
  }

  private filtroLectura(actor: Actor, estado: string) {
    if (this.esPersonal(actor)) return {};
    if (estado === 'COMPLETADA') return { consultaId: null };
    return { consultaId: null, entregaId: null };
  }

  private async cargar(solicitudId: string, actor: Actor) {
    const personal = this.esPersonal(actor);
    const solicitud = await this.prisma.solicitudPrecio.findFirst({
      where: {
        id: solicitudId,
        ...(personal
          ? { estado: { not: 'BORRADOR' as const } }
          : {
              OR: [
                { creadaPorId: actor.usuario.id },
                ...(actor.ownership.institucionId
                  ? [{ institucionSolicitanteId: actor.ownership.institucionId, estado: { not: 'BORRADOR' as const } }]
                  : []),
              ],
            }),
      },
      select: { id: true, estado: true, creadaPorId: true },
    });
    if (!solicitud) {
      throw new NotFoundException({
        code: 'SOLICITUD_NO_ENCONTRADA',
        detail: 'No se encontró la solicitud.',
      });
    }
    return solicitud;
  }

  private ruta(objectKey: string) {
    const base = this.config.get<string>('ALMACENAMIENTO_DIR') || path.join(process.cwd(), 'storage');
    return path.join(base, objectKey);
  }

  private nombre(original: string) {
    const limpio = path.basename(original || 'documento.pdf').replace(/[^\w.\- ()áéíóúñÁÉÍÓÚÑ]/g, '').slice(0, 240);
    return limpio.toLowerCase().endsWith('.pdf') ? limpio : `${limpio || 'documento'}.pdf`;
  }

  private esPersonal(actor: Actor) {
    return actor.usuario.roles.some((rol) => rol === 'ADMIN' || rol === 'JEFE' || rol === 'TRABAJADOR_INE');
  }

  private exigirPersonal(personal: boolean) {
    if (!personal) {
      throw new UnprocessableEntityException({
        code: 'ARCHIVO_NO_PERMITIDO',
        detail: 'Ese PDF lo adjunta el personal del INE.',
      });
    }
  }

  private exigirEstado(estado: string, permitidos: string[], detail: string) {
    if (!permitidos.includes(estado)) {
      throw new UnprocessableEntityException({ code: 'ETAPA_NO_PERMITE_ACCION', detail });
    }
  }
}
