import { NestFactory } from '@nestjs/core';
import { resolve } from 'node:path';
import { AppModule } from '../app.module.js';
import { ImportadorINEService } from '../modules/referencias-ine/importador-ine.service.js';

function argumento(nombre: string) {
  const indice = process.argv.indexOf(nombre);
  return indice >= 0 ? process.argv[indice + 1] : undefined;
}

const archivo = argumento('--archivo');
const usuarioId = argumento('--usuario-id');

if (!archivo) {
  throw new Error(
    'Uso: npm run import:ine -- --archivo <ruta.xlsx> [--usuario-id <uuid>]',
  );
}

const app = await NestFactory.createApplicationContext(AppModule);
try {
  const importador = app.get(ImportadorINEService);
  const resultado = await importador.importar({
    archivo: resolve(archivo),
    usuarioId,
  });
  process.stdout.write(`${JSON.stringify(resultado)}\n`);
} finally {
  await app.close();
}
