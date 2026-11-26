import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const ID_VALIDO = /^[A-Za-z0-9._-]{8,64}$/;
const RUTAS_SIN_REGISTRO = new Set(['/api/v1/salud', '/api/v1/salud/listo']);

const logger = new Logger('HTTP');

/**
 * Asigna un identificador a cada petición (se acepta el `x-request-id` del
 * proxy si es válido), lo devuelve en la respuesta y registra una línea por
 * petición. Solo registra método, ruta sin query, estado y duración: nunca
 * cookies, encabezados, cuerpos ni parámetros de consulta (pueden llevar tokens).
 */
export function correlacion(request: Request, response: Response, next: NextFunction) {
  const entrante = request.header('x-request-id');
  const id = entrante && ID_VALIDO.test(entrante) ? entrante : randomUUID();
  response.setHeader('x-request-id', id);
  const inicio = process.hrtime.bigint();

  response.on('finish', () => {
    const ruta = request.originalUrl.split('?')[0];
    if (RUTAS_SIN_REGISTRO.has(ruta)) return;
    const ms = Number(process.hrtime.bigint() - inicio) / 1e6;
    logger.log(
      JSON.stringify({
        requestId: id,
        metodo: request.method,
        ruta,
        estado: response.statusCode,
        ms: Math.round(ms),
      }),
    );
  });
  next();
}
