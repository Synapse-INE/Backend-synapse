/**
 * Crea (o actualiza) un usuario trabajador INE para pruebas locales.
 * Uso: npx tsx scripts/crear-trabajador-prueba.ts
 */
import 'dotenv/config';
import argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/infrastructure/database/generated/client.js';

const ROL_TRABAJADOR = '10000000-0000-4000-8000-000000000002';

const email = process.env.SEED_TRABAJADOR_EMAIL ?? 'trabajador.prueba@ine.gt';
const password = process.env.SEED_TRABAJADOR_PASSWORD ?? 'TrabajadorPrueba2026!';
const nombre = process.env.SEED_TRABAJADOR_NOMBRE ?? 'Analista de Prueba INE';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL no está definida en .env');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main() {
  const passwordHash = await argon2.hash(password);
  const existente = await prisma.usuario.findUnique({
    where: { email },
    select: { id: true, nombre: true, estado: true },
  });

  if (existente) {
    await prisma.usuario.update({
      where: { id: existente.id },
      data: {
        passwordHash,
        nombre,
        estado: 'ACTIVO',
        emailVerificadoEn: new Date(),
      },
    });
    const yaRol = await prisma.usuarioRol.count({
      where: { usuarioId: existente.id, rolId: ROL_TRABAJADOR },
    });
    if (yaRol === 0) {
      await prisma.usuarioRol.create({
        data: { usuarioId: existente.id, rolId: ROL_TRABAJADOR },
      });
    }
    console.log('Trabajador actualizado para pruebas:');
    console.log({ id: existente.id, email, password, nombre });
    return;
  }

  const usuario = await prisma.usuario.create({
    data: {
      email,
      passwordHash,
      nombre,
      estado: 'ACTIVO',
      emailVerificadoEn: new Date(),
      roles: { create: { rolId: ROL_TRABAJADOR } },
    },
    select: { id: true },
  });

  console.log('Trabajador creado para pruebas:');
  console.log({ id: usuario.id, email, password, nombre });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());