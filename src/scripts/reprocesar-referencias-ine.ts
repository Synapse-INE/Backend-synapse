import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { ImportadorINEService } from '../modules/referencias-ine/importador-ine.service.js';

function argumento(nombre: string) {
  const indice = process.argv.indexOf(nombre);
  return indice >= 0 ? process.argv[indice + 1] : undefined;
}

const app = await NestFactory.createApplicationContext(AppModule);
try {
  const resultados = await app.get(ImportadorINEService).reprocesar({
    importacionId: argumento('--importacion-id'),
    usuarioId: argumento('--usuario-id'),
  });
  process.stdout.write(`${JSON.stringify(resultados)}\n`);
} finally {
  await app.close();
}
