import { BadRequestException, ValidationPipe } from '@nestjs/common';

export function crearValidationPipe() {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) =>
      new BadRequestException({
        code: 'VALIDACION_FALLIDA',
        detail: 'Uno o más campos no cumplen el contrato.',
        errors: errors.flatMap((error) =>
          Object.values(error.constraints ?? {}).map((message) => ({
            field: error.property,
            message,
          })),
        ),
      }),
  });
}
