import { createInterface } from 'node:readline';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { PrimerAdminService } from '../modules/administracion/primer-admin.service.js';

function argumento(nombre: string) {
  const indice = process.argv.indexOf(nombre);
  return indice >= 0 ? process.argv[indice + 1] : undefined;
}

/** Lee la contraseña sin mostrarla; nunca se acepta por argumento ni se imprime. */
function pedirContrasena(pregunta: string): Promise<string> {
  return new Promise((resolver) => {
    const entrada = createInterface({ input: process.stdin, terminal: true });
    const salida = process.stdout;
    salida.write(pregunta);
    const original = (entrada as unknown as { _writeToOutput: (s: string) => void })
      ._writeToOutput;
    (entrada as unknown as { _writeToOutput: (s: string) => void })._writeToOutput =
      (texto: string) => {
        if (texto.includes('\n') || texto.includes('\r')) original.call(entrada, texto);
      };
    entrada.question('', (respuesta) => {
      entrada.close();
      salida.write('\n');
      resolver(respuesta);
    });
  });
}

const email = argumento('--email');
const nombre = argumento('--nombre') ?? 'Administrador';
if (!email) {
  process.stderr.write(
    'Uso: npm run crear-admin -- --email <correo> [--nombre "<nombre>"]\n' +
      'La contraseña se pide por entrada oculta, o se toma de ADMIN_PASSWORD.\n',
  );
  process.exit(1);
}

const password =
  process.env.ADMIN_PASSWORD ?? (await pedirContrasena('Contraseña (12 a 128 caracteres): '));

const app = await NestFactory.createApplicationContext(AppModule, {
  logger: ['error'],
});
try {
  const usuario = await app.get(PrimerAdminService).crear({ email, nombre, password });
  process.stdout.write(`Administrador creado: ${usuario.email} (${usuario.id}).\n`);
} catch (error) {
  const respuesta = (
    error as { getResponse?: () => { detail?: string } }
  ).getResponse?.();
  const motivo =
    respuesta?.detail ??
    (error instanceof Error ? error.message : 'error desconocido');
  process.stderr.write(`No se creó el administrador: ${motivo}\n`);
  process.exitCode = 1;
} finally {
  await app.close();
}
