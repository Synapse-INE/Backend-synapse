import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';

type ErrorBody = {
  code?: string;
  detail?: string;
  errors?: Array<{ field: string; message: string }>;
  message?: string | string[];
};

@Catch(HttpException)
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const status = exception.getStatus();
    const body = exception.getResponse();
    const error = typeof body === 'string' ? { detail: body } : (body as ErrorBody);
    const code = error.code ?? this.codeForStatus(status);
    const detail =
      error.detail ??
      (typeof error.message === 'string' ? error.message : undefined) ??
      'La solicitud no pudo completarse.';

    response.status(status).type('application/problem+json').json({
      type: `https://portal-precios-ine.gob.gt/problems/${code.toLowerCase()}`,
      title: HttpStatus[status] ?? 'Error',
      status,
      detail,
      instance: request.originalUrl,
      code,
      ...(error.errors ? { errors: error.errors } : {}),
    });
  }

  private codeForStatus(status: number) {
    const codes: Record<number, string> = {
      [HttpStatus.BAD_REQUEST]: 'SOLICITUD_INVALIDA',
      [HttpStatus.UNAUTHORIZED]: 'NO_AUTENTICADO',
      [HttpStatus.FORBIDDEN]: 'SIN_PERMISO',
      [HttpStatus.NOT_FOUND]: 'NO_ENCONTRADO',
      [HttpStatus.CONFLICT]: 'CONFLICTO',
      [HttpStatus.TOO_MANY_REQUESTS]: 'LIMITE_EXCEDIDO',
    };

    return codes[status] ?? 'ERROR_INTERNO';
  }
}
