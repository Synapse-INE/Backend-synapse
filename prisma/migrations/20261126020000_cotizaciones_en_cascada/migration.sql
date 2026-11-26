
-- DropForeignKey
ALTER TABLE "cotizaciones_productos" DROP CONSTRAINT "cotizaciones_productos_producto_solicitud_id_fkey";

-- AddForeignKey
ALTER TABLE "cotizaciones_productos" ADD CONSTRAINT "cotizaciones_productos_producto_solicitud_id_fkey" FOREIGN KEY ("producto_solicitud_id") REFERENCES "productos_solicitud"("id") ON DELETE CASCADE ON UPDATE CASCADE;

