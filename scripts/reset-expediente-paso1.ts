import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/infrastructure/database/generated/client.js';

const codigo = process.argv[2] || 'PR-2026-000006';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL no está definida en .env');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main() {
  const actual = await prisma.solicitudPrecio.findUnique({
    where: { codigo },
    select: { id: true, codigo: true, estado: true },
  });
  if (!actual) {
    console.error(`No existe expediente ${codigo}`);
    process.exit(1);
  }

  const actor = await prisma.usuario.findFirst({
    where: {
      roles: { some: { rol: { codigo: { in: ['ADMIN', 'JEFE'] } } } },
      estado: 'ACTIVO',
    },
    select: { id: true, nombre: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.solicitudPrecio.update({
      where: { id: actual.id },
      data: { estado: 'RECIBIDA' },
    });
    await tx.solicitudHistorial.create({
      data: {
        solicitudId: actual.id,
        actorId: actor?.id ?? actual.id,
        accion: 'Reinicio para pruebas',
        estadoAnterior: actual.estado,
        estadoNuevo: 'RECIBIDA',
        detalle: 'Estado devuelto a Recibida (paso 1) para testeo del flujo en bandeja.',
      },
    });
  });

  console.log(`OK: ${codigo} pasó de ${actual.estado} → RECIBIDA`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());