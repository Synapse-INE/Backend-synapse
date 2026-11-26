-- CreateTable
CREATE TABLE "avisos_precio_proveedor" (
    "id" UUID NOT NULL,
    "solicitud_id" UUID NOT NULL,
    "proveedor_id" UUID NOT NULL,
    "avisado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vence_en" TIMESTAMPTZ(6) NOT NULL,
    "actualizado_en" TIMESTAMPTZ(6),

    CONSTRAINT "avisos_precio_proveedor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "avisos_precio_proveedor_proveedor_id_actualizado_en_idx" ON "avisos_precio_proveedor"("proveedor_id", "actualizado_en");

-- CreateIndex
CREATE UNIQUE INDEX "avisos_precio_proveedor_solicitud_id_proveedor_id_key" ON "avisos_precio_proveedor"("solicitud_id", "proveedor_id");

-- AddForeignKey
ALTER TABLE "avisos_precio_proveedor" ADD CONSTRAINT "avisos_precio_proveedor_solicitud_id_fkey" FOREIGN KEY ("solicitud_id") REFERENCES "solicitudes_precio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avisos_precio_proveedor" ADD CONSTRAINT "avisos_precio_proveedor_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
