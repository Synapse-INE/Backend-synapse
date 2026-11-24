-- CreateEnum
CREATE TYPE "modalidad_solicitud" AS ENUM ('CONTRATO_ABIERTO', 'SUBASTA_ELECTRONICA_INVERSA', 'BIENES_SUMINISTROS_IMPORTADOS');

-- CreateEnum
CREATE TYPE "estado_comision_importacion" AS ENUM ('PENDIENTE', 'EN_CONFORMACION', 'CONFORMADA', 'FINALIZADA');

-- CreateEnum
CREATE TYPE "tipo_representante_solicitante" AS ENUM ('TITULAR', 'SUPLENTE');

-- CreateEnum
CREATE TYPE "tipo_adjunto_solicitud" AS ENUM ('FORMATO_S00', 'FORMATO_S11', 'FORMATO_S21', 'FORMATO_S22', 'SOLICITUD_FORMAL_DGAE', 'SOLICITUD_CONFORMACION_COMISION', 'NOMBRAMIENTO_REPRESENTANTES', 'JUSTIFICACION_COTIZACIONES', 'JUSTIFICACION_SIGES', 'COTIZACION_PROVEEDOR', 'FICHA_TECNICA', 'FOTOGRAFIA_PRODUCTO', 'OTRO');

-- CreateEnum
CREATE TYPE "tipo_justificacion_solicitud" AS ENUM ('COTIZACIONES_INSUFICIENTES', 'NO_UTILIZA_CATALOGO_SIGES');

-- CreateEnum
CREATE TYPE "estado_proveedor_solicitud" AS ENUM ('PENDIENTE', 'CONFIRMADO', 'DESCARTADO');

-- AlterTable
ALTER TABLE "precios_proveedor" ALTER COLUMN "monto" TYPE DECIMAL(14,3);
ALTER TABLE "referencias_ine" ALTER COLUMN "precio_referencia" TYPE DECIMAL(14,3);

ALTER TABLE "solicitudes_precio"
    ADD COLUMN "modalidad" "modalidad_solicitud",
    ADD COLUMN "unidad_ejecutora" VARCHAR(240),
    ADD COLUMN "fecha_formulario" DATE,
    ADD COLUMN "enlace_nombre" VARCHAR(160),
    ADD COLUMN "enlace_cargo" VARCHAR(160),
    ADD COLUMN "autoridad_nombre" VARCHAR(160),
    ADD COLUMN "autoridad_cargo" VARCHAR(160);

ALTER TABLE "solicitudes_adjuntos"
    ADD COLUMN "tipo" "tipo_adjunto_solicitud" NOT NULL DEFAULT 'OTRO',
    ADD COLUMN "producto_solicitud_id" UUID,
    ADD COLUMN "cotizacion_id" UUID,
    ADD COLUMN "justificacion_id" UUID;

-- CreateTable
CREATE TABLE "productos_solicitud" (
    "id" UUID NOT NULL,
    "solicitud_id" UUID NOT NULL,
    "numero" INTEGER NOT NULL,
    "nombre" VARCHAR(240) NOT NULL,
    "codigo_siges" VARCHAR(100),
    "especificaciones_tecnicas" TEXT,
    "unidad_medida" VARCHAR(120),
    "cantidad" DECIMAL(14,3),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "productos_solicitud_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comisiones_importacion" (
    "id" UUID NOT NULL,
    "solicitud_id" UUID NOT NULL,
    "estado" "estado_comision_importacion" NOT NULL DEFAULT 'PENDIENTE',
    "formada_en" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comisiones_importacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "representantes_solicitante" (
    "id" UUID NOT NULL,
    "comision_id" UUID NOT NULL,
    "tipo" "tipo_representante_solicitante" NOT NULL,
    "nombre" VARCHAR(160) NOT NULL,
    "correo" VARCHAR(320) NOT NULL,
    "telefono" VARCHAR(40) NOT NULL,
    "direccion_notificaciones" VARCHAR(500) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "representantes_solicitante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cotizaciones_importacion" (
    "id" UUID NOT NULL,
    "comision_id" UUID NOT NULL,
    "numero" INTEGER NOT NULL,
    "numero_cotizacion" VARCHAR(120),
    "proveedor_nombre" VARCHAR(240) NOT NULL,
    "sitio_web" VARCHAR(500),
    "correo_proveedor" VARCHAR(320),
    "codigo_pais_telefono" VARCHAR(8),
    "telefono_proveedor" VARCHAR(40),
    "fecha_consulta" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cotizaciones_importacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cotizaciones_productos" (
    "id" UUID NOT NULL,
    "cotizacion_id" UUID NOT NULL,
    "producto_solicitud_id" UUID NOT NULL,
    "especificaciones_cotizacion" TEXT,
    "fabricante" VARCHAR(240),
    "pais_origen" VARCHAR(120),
    "moneda" CHAR(3) NOT NULL,
    "precio_fob_total" DECIMAL(14,3) NOT NULL,
    "flete" DECIMAL(14,3),
    "seguro" DECIMAL(14,3),
    "otros_gastos" DECIMAL(14,3),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cotizaciones_productos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "justificaciones_solicitud" (
    "id" UUID NOT NULL,
    "solicitud_id" UUID NOT NULL,
    "producto_solicitud_id" UUID,
    "tipo" "tipo_justificacion_solicitud" NOT NULL,
    "motivo" TEXT NOT NULL,
    "autoridad_nombre" VARCHAR(160) NOT NULL,
    "autoridad_cargo" VARCHAR(160) NOT NULL,
    "creada_por_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "justificaciones_solicitud_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proveedores_solicitud" (
    "id" UUID NOT NULL,
    "solicitud_id" UUID NOT NULL,
    "proveedor_id" UUID,
    "nombre_razon_social" VARCHAR(240) NOT NULL,
    "nit" VARCHAR(40),
    "direccion" VARCHAR(500),
    "telefono" VARCHAR(40),
    "estado" "estado_proveedor_solicitud" NOT NULL DEFAULT 'PENDIENTE',
    "confirmado_por_id" UUID,
    "confirmado_en" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proveedores_solicitud_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proveedores_solicitud_productos" (
    "proveedor_solicitud_id" UUID NOT NULL,
    "producto_solicitud_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proveedores_solicitud_productos_pkey" PRIMARY KEY ("proveedor_solicitud_id","producto_solicitud_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "productos_solicitud_solicitud_id_numero_key" ON "productos_solicitud"("solicitud_id", "numero");
CREATE INDEX "productos_solicitud_codigo_siges_idx" ON "productos_solicitud"("codigo_siges");
CREATE UNIQUE INDEX "comisiones_importacion_solicitud_id_key" ON "comisiones_importacion"("solicitud_id");
CREATE UNIQUE INDEX "representantes_solicitante_comision_id_tipo_key" ON "representantes_solicitante"("comision_id", "tipo");
CREATE UNIQUE INDEX "cotizaciones_importacion_comision_id_numero_key" ON "cotizaciones_importacion"("comision_id", "numero");
CREATE INDEX "cotizaciones_importacion_proveedor_nombre_idx" ON "cotizaciones_importacion"("proveedor_nombre");
CREATE UNIQUE INDEX "cotizaciones_productos_cotizacion_id_producto_solicitud_id_key" ON "cotizaciones_productos"("cotizacion_id", "producto_solicitud_id");
CREATE INDEX "cotizaciones_productos_producto_solicitud_id_idx" ON "cotizaciones_productos"("producto_solicitud_id");
CREATE INDEX "justificaciones_solicitud_solicitud_id_tipo_idx" ON "justificaciones_solicitud"("solicitud_id", "tipo");
CREATE INDEX "justificaciones_solicitud_producto_solicitud_id_idx" ON "justificaciones_solicitud"("producto_solicitud_id");
CREATE INDEX "proveedores_solicitud_solicitud_id_estado_idx" ON "proveedores_solicitud"("solicitud_id", "estado");
CREATE INDEX "proveedores_solicitud_proveedor_id_idx" ON "proveedores_solicitud"("proveedor_id");
CREATE INDEX "proveedores_solicitud_productos_producto_solicitud_id_idx" ON "proveedores_solicitud_productos"("producto_solicitud_id");
CREATE INDEX "solicitudes_adjuntos_producto_solicitud_id_idx" ON "solicitudes_adjuntos"("producto_solicitud_id");
CREATE INDEX "solicitudes_adjuntos_cotizacion_id_idx" ON "solicitudes_adjuntos"("cotizacion_id");
CREATE INDEX "solicitudes_adjuntos_justificacion_id_idx" ON "solicitudes_adjuntos"("justificacion_id");

-- AddForeignKey
ALTER TABLE "productos_solicitud" ADD CONSTRAINT "productos_solicitud_solicitud_id_fkey" FOREIGN KEY ("solicitud_id") REFERENCES "solicitudes_precio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "comisiones_importacion" ADD CONSTRAINT "comisiones_importacion_solicitud_id_fkey" FOREIGN KEY ("solicitud_id") REFERENCES "solicitudes_precio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "representantes_solicitante" ADD CONSTRAINT "representantes_solicitante_comision_id_fkey" FOREIGN KEY ("comision_id") REFERENCES "comisiones_importacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cotizaciones_importacion" ADD CONSTRAINT "cotizaciones_importacion_comision_id_fkey" FOREIGN KEY ("comision_id") REFERENCES "comisiones_importacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cotizaciones_productos" ADD CONSTRAINT "cotizaciones_productos_cotizacion_id_fkey" FOREIGN KEY ("cotizacion_id") REFERENCES "cotizaciones_importacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cotizaciones_productos" ADD CONSTRAINT "cotizaciones_productos_producto_solicitud_id_fkey" FOREIGN KEY ("producto_solicitud_id") REFERENCES "productos_solicitud"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "justificaciones_solicitud" ADD CONSTRAINT "justificaciones_solicitud_solicitud_id_fkey" FOREIGN KEY ("solicitud_id") REFERENCES "solicitudes_precio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "justificaciones_solicitud" ADD CONSTRAINT "justificaciones_solicitud_producto_solicitud_id_fkey" FOREIGN KEY ("producto_solicitud_id") REFERENCES "productos_solicitud"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "justificaciones_solicitud" ADD CONSTRAINT "justificaciones_solicitud_creada_por_id_fkey" FOREIGN KEY ("creada_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "proveedores_solicitud" ADD CONSTRAINT "proveedores_solicitud_solicitud_id_fkey" FOREIGN KEY ("solicitud_id") REFERENCES "solicitudes_precio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "proveedores_solicitud" ADD CONSTRAINT "proveedores_solicitud_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "proveedores_solicitud" ADD CONSTRAINT "proveedores_solicitud_confirmado_por_id_fkey" FOREIGN KEY ("confirmado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "proveedores_solicitud_productos" ADD CONSTRAINT "proveedores_solicitud_productos_proveedor_solicitud_id_fkey" FOREIGN KEY ("proveedor_solicitud_id") REFERENCES "proveedores_solicitud"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "proveedores_solicitud_productos" ADD CONSTRAINT "proveedores_solicitud_productos_producto_solicitud_id_fkey" FOREIGN KEY ("producto_solicitud_id") REFERENCES "productos_solicitud"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "solicitudes_adjuntos" ADD CONSTRAINT "solicitudes_adjuntos_producto_solicitud_id_fkey" FOREIGN KEY ("producto_solicitud_id") REFERENCES "productos_solicitud"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "solicitudes_adjuntos" ADD CONSTRAINT "solicitudes_adjuntos_cotizacion_id_fkey" FOREIGN KEY ("cotizacion_id") REFERENCES "cotizaciones_importacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "solicitudes_adjuntos" ADD CONSTRAINT "solicitudes_adjuntos_justificacion_id_fkey" FOREIGN KEY ("justificacion_id") REFERENCES "justificaciones_solicitud"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TRIGGER productos_solicitud_actualizar_fecha
    BEFORE UPDATE ON "productos_solicitud"
    FOR EACH ROW EXECUTE FUNCTION actualizar_fecha_modificacion();
CREATE TRIGGER comisiones_importacion_actualizar_fecha
    BEFORE UPDATE ON "comisiones_importacion"
    FOR EACH ROW EXECUTE FUNCTION actualizar_fecha_modificacion();
CREATE TRIGGER representantes_solicitante_actualizar_fecha
    BEFORE UPDATE ON "representantes_solicitante"
    FOR EACH ROW EXECUTE FUNCTION actualizar_fecha_modificacion();
