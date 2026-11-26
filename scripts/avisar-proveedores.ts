/**
 * Abre (o reinicia) el plazo de 2 días de los proveedores para una solicitud ya enviada.
 * Uso: npx tsx scripts/avisar-proveedores.ts PR-2026-000006
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/infrastructure/database/generated/client.js';
import { NotificacionesService } from '../src/modules/notificaciones/notificaciones.service.js';

const codigo = process.argv[2];
if (!codigo) throw new Error('Indica el código, p. ej. PR-2026-000006');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL no está definida en .env');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const solicitud = await prisma.solicitudPrecio.findUnique({
    where: { codigo },
    select: { id: true, codigo: true, titulo: true, productos: { select: { nombre: true } } },
  });
  if (!solicitud) throw new Error(`No existe ${codigo}`);

  const servicio = new NotificacionesService(prisma as never);
  await prisma.$transaction((tx) =>
    servicio.avisarProveedoresActualizarPrecios(tx, {
      solicitudId: solicitud.id,
      codigo: solicitud.codigo,
      tituloExpediente: solicitud.titulo,
      nombresProducto: solicitud.productos.map((producto) => producto.nombre),
    }),
  );

  const avisos = await prisma.avisoPrecioProveedor.findMany({
    where: { solicitudId: solicitud.id },
    select: { venceEn: true, actualizadoEn: true, proveedor: { select: { nombreComercial: true } } },
  });
  for (const aviso of avisos) {
    console.log(
      `${aviso.proveedor.nombreComercial}: ${aviso.actualizadoEn ? 'al día' : 'pendiente'} · vence ${aviso.venceEn.toISOString()}`,
    );
  }
  if (avisos.length === 0) console.log('No hay proveedores activos con cuenta PROVEEDOR activa.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
