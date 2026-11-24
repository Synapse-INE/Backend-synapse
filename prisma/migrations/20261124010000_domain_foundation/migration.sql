-- CreateEnum
CREATE TYPE "estado_usuario" AS ENUM ('PENDIENTE_VERIFICACION', 'ACTIVO', 'BLOQUEADO', 'DESACTIVADO');

-- CreateEnum
CREATE TYPE "estado_proveedor" AS ENUM ('ACTIVO', 'INACTIVO');

-- CreateEnum
CREATE TYPE "estado_producto_proveedor" AS ENUM ('BORRADOR', 'PUBLICADO', 'PAUSADO', 'RETIRADO');

-- CreateEnum
CREATE TYPE "formato_importacion" AS ENUM ('XLSX', 'CSV', 'JSON');

-- CreateEnum
CREATE TYPE "estado_importacion" AS ENUM ('EN_PROCESO', 'COMPLETADA', 'PARCIAL', 'FALLIDA');

-- CreateEnum
CREATE TYPE "estado_fila_importacion" AS ENUM ('PENDIENTE', 'NORMALIZADA', 'REVISAR', 'RECHAZADA');

-- CreateEnum
CREATE TYPE "estado_solicitud" AS ENUM ('RECIBIDA', 'EN_REVISION', 'EN_ANALISIS', 'COMPLETADA', 'RECHAZADA');

-- CreateEnum
CREATE TYPE "modo_requisito" AS ENUM ('EXACTO', 'PREFERIDO', 'MINIMO');

-- CreateEnum
CREATE TYPE "fuente_requisito" AS ENUM ('MANUAL', 'IA');

-- CreateEnum
CREATE TYPE "estado_requisito" AS ENUM ('PENDIENTE', 'APROBADO', 'RECHAZADO');

-- CreateEnum
CREATE TYPE "estado_alias_modalidad" AS ENUM ('PENDIENTE', 'CONFIRMADO', 'DESCARTADO');

-- AlterTable
ALTER TABLE "invitaciones_proveedor" ADD COLUMN     "creada_por_id" UUID,
ADD COLUMN     "proveedor_id" UUID;

-- CreateTable
CREATE TABLE "usuarios" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "nombre" VARCHAR(160) NOT NULL,
    "estado" "estado_usuario" NOT NULL DEFAULT 'PENDIENTE_VERIFICACION',
    "proveedor_id" UUID,
    "email_verificado_en" TIMESTAMPTZ(6),
    "ultimo_acceso_en" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "codigo" VARCHAR(40) NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios_roles" (
    "usuario_id" UUID NOT NULL,
    "rol_id" UUID NOT NULL,
    "asignado_por_id" UUID,
    "asignado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuarios_roles_pkey" PRIMARY KEY ("usuario_id","rol_id")
);

-- CreateTable
CREATE TABLE "tokens_verificacion_correo" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "vence_en" TIMESTAMPTZ(6) NOT NULL,
    "consumido_en" TIMESTAMPTZ(6),
    "creada_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tokens_verificacion_correo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proveedores" (
    "id" UUID NOT NULL,
    "nombre_comercial" VARCHAR(200) NOT NULL,
    "razon_social" VARCHAR(240),
    "correo_contacto" VARCHAR(320),
    "estado" "estado_proveedor" NOT NULL DEFAULT 'ACTIVO',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proveedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "productos_proveedor" (
    "id" UUID NOT NULL,
    "proveedor_id" UUID NOT NULL,
    "codigo_proveedor" VARCHAR(100),
    "nombre" VARCHAR(240) NOT NULL,
    "descripcion" TEXT,
    "presentacion" VARCHAR(160),
    "categoria_original" VARCHAR(160),
    "atributos" JSONB,
    "estado" "estado_producto_proveedor" NOT NULL DEFAULT 'BORRADOR',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "productos_proveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "precios_proveedor" (
    "id" UUID NOT NULL,
    "producto_proveedor_id" UUID NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL,
    "moneda" CHAR(3) NOT NULL DEFAULT 'GTQ',
    "fecha_precio" DATE,
    "vigencia_hasta" DATE,
    "registrado_por_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "precios_proveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "importaciones_proveedor" (
    "id" UUID NOT NULL,
    "proveedor_id" UUID NOT NULL,
    "nombre_archivo" VARCHAR(255) NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "formato" "formato_importacion" NOT NULL,
    "estado" "estado_importacion" NOT NULL DEFAULT 'EN_PROCESO',
    "filas_leidas" INTEGER NOT NULL DEFAULT 0,
    "filas_aceptadas" INTEGER NOT NULL DEFAULT 0,
    "filas_con_observaciones" INTEGER NOT NULL DEFAULT 0,
    "filas_rechazadas" INTEGER NOT NULL DEFAULT 0,
    "iniciada_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completada_en" TIMESTAMPTZ(6),
    "usuario_id" UUID,

    CONSTRAINT "importaciones_proveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "filas_importacion_proveedor" (
    "id" UUID NOT NULL,
    "importacion_id" UUID NOT NULL,
    "numero_fila" INTEGER NOT NULL,
    "datos_originales" JSONB NOT NULL,
    "estado" "estado_fila_importacion" NOT NULL DEFAULT 'PENDIENTE',
    "errores" JSONB,
    "producto_proveedor_id" UUID,
    "precio_proveedor_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "filas_importacion_proveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "importaciones_ine" (
    "id" UUID NOT NULL,
    "nombre_archivo" VARCHAR(255) NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "formato" "formato_importacion" NOT NULL,
    "estado" "estado_importacion" NOT NULL DEFAULT 'EN_PROCESO',
    "encabezados_originales" JSONB,
    "filas_leidas" INTEGER NOT NULL DEFAULT 0,
    "filas_aceptadas" INTEGER NOT NULL DEFAULT 0,
    "filas_con_observaciones" INTEGER NOT NULL DEFAULT 0,
    "filas_rechazadas" INTEGER NOT NULL DEFAULT 0,
    "iniciada_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completada_en" TIMESTAMPTZ(6),
    "usuario_id" UUID,

    CONSTRAINT "importaciones_ine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "filas_importacion_ine" (
    "id" UUID NOT NULL,
    "importacion_id" UUID NOT NULL,
    "numero_fila" INTEGER NOT NULL,
    "datos_originales" JSONB NOT NULL,
    "estado" "estado_fila_importacion" NOT NULL DEFAULT 'PENDIENTE',
    "errores" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "filas_importacion_ine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tipos_modalidad" (
    "id" UUID NOT NULL,
    "codigo" VARCHAR(80) NOT NULL,
    "nombre" VARCHAR(160) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tipos_modalidad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alias_modalidad" (
    "id" UUID NOT NULL,
    "valor_original" VARCHAR(240) NOT NULL,
    "clave_normalizada" VARCHAR(240) NOT NULL,
    "tipo_modalidad_id" UUID,
    "estado" "estado_alias_modalidad" NOT NULL DEFAULT 'PENDIENTE',
    "revisado_por_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alias_modalidad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referencias_ine" (
    "id" UUID NOT NULL,
    "fila_importacion_id" UUID NOT NULL,
    "tipo_modalidad_id" UUID,
    "modalidad_original" VARCHAR(240),
    "referencia_contrato" VARCHAR(100),
    "nog" VARCHAR(100),
    "evento_original" VARCHAR(240),
    "correlativo" VARCHAR(100),
    "producto" TEXT,
    "caracteristicas" TEXT,
    "presentacion" VARCHAR(240),
    "precio_referencia" DECIMAL(14,2),
    "moneda" CHAR(3) NOT NULL DEFAULT 'GTQ',
    "fecha_publicacion" DATE,
    "vigencia_hasta" DATE,
    "categoria_original" VARCHAR(240),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referencias_ine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitudes_precio" (
    "id" UUID NOT NULL,
    "titulo" VARCHAR(200) NOT NULL,
    "institucion_solicitante" VARCHAR(240) NOT NULL,
    "descripcion" TEXT NOT NULL,
    "estado" "estado_solicitud" NOT NULL DEFAULT 'RECIBIDA',
    "creada_por_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "solicitudes_precio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitudes_adjuntos" (
    "id" UUID NOT NULL,
    "solicitud_id" UUID NOT NULL,
    "nombre_original" VARCHAR(255) NOT NULL,
    "object_key" VARCHAR(512) NOT NULL,
    "mime_verificado" VARCHAR(120) NOT NULL,
    "tamano_bytes" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "subido_por_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "solicitudes_adjuntos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requisitos_solicitud" (
    "id" UUID NOT NULL,
    "solicitud_id" UUID NOT NULL,
    "nombre" VARCHAR(160) NOT NULL,
    "valor" VARCHAR(500) NOT NULL,
    "unidad" VARCHAR(80),
    "modo" "modo_requisito" NOT NULL DEFAULT 'EXACTO',
    "obligatorio" BOOLEAN NOT NULL DEFAULT true,
    "fuente" "fuente_requisito" NOT NULL DEFAULT 'MANUAL',
    "estado" "estado_requisito" NOT NULL DEFAULT 'PENDIENTE',
    "aprobado_por_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "requisitos_solicitud_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE INDEX "usuarios_proveedor_id_idx" ON "usuarios"("proveedor_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_codigo_key" ON "roles"("codigo");

-- CreateIndex
CREATE INDEX "usuarios_roles_rol_id_idx" ON "usuarios_roles"("rol_id");

-- CreateIndex
CREATE UNIQUE INDEX "tokens_verificacion_correo_token_hash_key" ON "tokens_verificacion_correo"("token_hash");

-- CreateIndex
CREATE INDEX "tokens_verificacion_correo_usuario_id_vence_en_idx" ON "tokens_verificacion_correo"("usuario_id", "vence_en");

-- CreateIndex
CREATE INDEX "productos_proveedor_proveedor_id_estado_idx" ON "productos_proveedor"("proveedor_id", "estado");

-- CreateIndex
CREATE INDEX "productos_proveedor_updated_at_idx" ON "productos_proveedor"("updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "productos_proveedor_proveedor_id_codigo_proveedor_key" ON "productos_proveedor"("proveedor_id", "codigo_proveedor");

-- CreateIndex
CREATE INDEX "precios_proveedor_producto_proveedor_id_created_at_idx" ON "precios_proveedor"("producto_proveedor_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "precios_proveedor_vigencia_hasta_idx" ON "precios_proveedor"("vigencia_hasta");

-- CreateIndex
CREATE INDEX "importaciones_proveedor_proveedor_id_iniciada_en_idx" ON "importaciones_proveedor"("proveedor_id", "iniciada_en");

-- CreateIndex
CREATE UNIQUE INDEX "importaciones_proveedor_proveedor_id_sha256_key" ON "importaciones_proveedor"("proveedor_id", "sha256");

-- CreateIndex
CREATE UNIQUE INDEX "filas_importacion_proveedor_precio_proveedor_id_key" ON "filas_importacion_proveedor"("precio_proveedor_id");

-- CreateIndex
CREATE INDEX "filas_importacion_proveedor_producto_proveedor_id_idx" ON "filas_importacion_proveedor"("producto_proveedor_id");

-- CreateIndex
CREATE UNIQUE INDEX "filas_importacion_proveedor_importacion_id_numero_fila_key" ON "filas_importacion_proveedor"("importacion_id", "numero_fila");

-- CreateIndex
CREATE UNIQUE INDEX "importaciones_ine_sha256_key" ON "importaciones_ine"("sha256");

-- CreateIndex
CREATE INDEX "importaciones_ine_iniciada_en_idx" ON "importaciones_ine"("iniciada_en");

-- CreateIndex
CREATE UNIQUE INDEX "filas_importacion_ine_importacion_id_numero_fila_key" ON "filas_importacion_ine"("importacion_id", "numero_fila");

-- CreateIndex
CREATE UNIQUE INDEX "tipos_modalidad_codigo_key" ON "tipos_modalidad"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "alias_modalidad_clave_normalizada_key" ON "alias_modalidad"("clave_normalizada");

-- CreateIndex
CREATE INDEX "alias_modalidad_tipo_modalidad_id_idx" ON "alias_modalidad"("tipo_modalidad_id");

-- CreateIndex
CREATE INDEX "alias_modalidad_estado_idx" ON "alias_modalidad"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "referencias_ine_fila_importacion_id_key" ON "referencias_ine"("fila_importacion_id");

-- CreateIndex
CREATE INDEX "referencias_ine_tipo_modalidad_id_idx" ON "referencias_ine"("tipo_modalidad_id");

-- CreateIndex
CREATE INDEX "referencias_ine_nog_idx" ON "referencias_ine"("nog");

-- CreateIndex
CREATE INDEX "referencias_ine_categoria_original_idx" ON "referencias_ine"("categoria_original");

-- CreateIndex
CREATE INDEX "referencias_ine_precio_referencia_idx" ON "referencias_ine"("precio_referencia");

-- CreateIndex
CREATE INDEX "referencias_ine_fecha_publicacion_idx" ON "referencias_ine"("fecha_publicacion");

-- CreateIndex
CREATE INDEX "referencias_ine_vigencia_hasta_idx" ON "referencias_ine"("vigencia_hasta");

-- CreateIndex
CREATE INDEX "solicitudes_precio_estado_created_at_idx" ON "solicitudes_precio"("estado", "created_at");

-- CreateIndex
CREATE INDEX "solicitudes_precio_creada_por_id_created_at_idx" ON "solicitudes_precio"("creada_por_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "solicitudes_adjuntos_object_key_key" ON "solicitudes_adjuntos"("object_key");

-- CreateIndex
CREATE INDEX "solicitudes_adjuntos_solicitud_id_idx" ON "solicitudes_adjuntos"("solicitud_id");

-- CreateIndex
CREATE INDEX "requisitos_solicitud_solicitud_id_idx" ON "requisitos_solicitud"("solicitud_id");

-- CreateIndex
CREATE INDEX "invitaciones_proveedor_proveedor_id_idx" ON "invitaciones_proveedor"("proveedor_id");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios_roles" ADD CONSTRAINT "usuarios_roles_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios_roles" ADD CONSTRAINT "usuarios_roles_rol_id_fkey" FOREIGN KEY ("rol_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios_roles" ADD CONSTRAINT "usuarios_roles_asignado_por_id_fkey" FOREIGN KEY ("asignado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tokens_verificacion_correo" ADD CONSTRAINT "tokens_verificacion_correo_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitaciones_proveedor" ADD CONSTRAINT "invitaciones_proveedor_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitaciones_proveedor" ADD CONSTRAINT "invitaciones_proveedor_creada_por_id_fkey" FOREIGN KEY ("creada_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_auditoria" ADD CONSTRAINT "eventos_auditoria_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productos_proveedor" ADD CONSTRAINT "productos_proveedor_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "precios_proveedor" ADD CONSTRAINT "precios_proveedor_producto_proveedor_id_fkey" FOREIGN KEY ("producto_proveedor_id") REFERENCES "productos_proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "precios_proveedor" ADD CONSTRAINT "precios_proveedor_registrado_por_id_fkey" FOREIGN KEY ("registrado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "importaciones_proveedor" ADD CONSTRAINT "importaciones_proveedor_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "importaciones_proveedor" ADD CONSTRAINT "importaciones_proveedor_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "filas_importacion_proveedor" ADD CONSTRAINT "filas_importacion_proveedor_importacion_id_fkey" FOREIGN KEY ("importacion_id") REFERENCES "importaciones_proveedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "filas_importacion_proveedor" ADD CONSTRAINT "filas_importacion_proveedor_producto_proveedor_id_fkey" FOREIGN KEY ("producto_proveedor_id") REFERENCES "productos_proveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "filas_importacion_proveedor" ADD CONSTRAINT "filas_importacion_proveedor_precio_proveedor_id_fkey" FOREIGN KEY ("precio_proveedor_id") REFERENCES "precios_proveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "importaciones_ine" ADD CONSTRAINT "importaciones_ine_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "filas_importacion_ine" ADD CONSTRAINT "filas_importacion_ine_importacion_id_fkey" FOREIGN KEY ("importacion_id") REFERENCES "importaciones_ine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alias_modalidad" ADD CONSTRAINT "alias_modalidad_tipo_modalidad_id_fkey" FOREIGN KEY ("tipo_modalidad_id") REFERENCES "tipos_modalidad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alias_modalidad" ADD CONSTRAINT "alias_modalidad_revisado_por_id_fkey" FOREIGN KEY ("revisado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referencias_ine" ADD CONSTRAINT "referencias_ine_fila_importacion_id_fkey" FOREIGN KEY ("fila_importacion_id") REFERENCES "filas_importacion_ine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referencias_ine" ADD CONSTRAINT "referencias_ine_tipo_modalidad_id_fkey" FOREIGN KEY ("tipo_modalidad_id") REFERENCES "tipos_modalidad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_precio" ADD CONSTRAINT "solicitudes_precio_creada_por_id_fkey" FOREIGN KEY ("creada_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_adjuntos" ADD CONSTRAINT "solicitudes_adjuntos_solicitud_id_fkey" FOREIGN KEY ("solicitud_id") REFERENCES "solicitudes_precio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_adjuntos" ADD CONSTRAINT "solicitudes_adjuntos_subido_por_id_fkey" FOREIGN KEY ("subido_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisitos_solicitud" ADD CONSTRAINT "requisitos_solicitud_solicitud_id_fkey" FOREIGN KEY ("solicitud_id") REFERENCES "solicitudes_precio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisitos_solicitud" ADD CONSTRAINT "requisitos_solicitud_aprobado_por_id_fkey" FOREIGN KEY ("aprobado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "roles" ("id", "codigo", "nombre") VALUES
    ('10000000-0000-4000-8000-000000000001', 'ADMIN', 'Administrador'),
    ('10000000-0000-4000-8000-000000000002', 'TRABAJADOR_INE', 'Trabajador INE'),
    ('10000000-0000-4000-8000-000000000003', 'PROVEEDOR', 'Proveedor'),
    ('10000000-0000-4000-8000-000000000004', 'USUARIO', 'Usuario');

INSERT INTO "tipos_modalidad" ("id", "codigo", "nombre") VALUES
    ('20000000-0000-4000-8000-000000000001', 'CONTRATO_ABIERTO', 'Contrato Abierto'),
    ('20000000-0000-4000-8000-000000000002', 'SUBASTA_ELECTRONICA_INVERSA', 'Subasta Electrónica Inversa'),
    ('20000000-0000-4000-8000-000000000003', 'BIENES_SUMINISTROS_IMPORTADOS', 'Bienes y Suministros Importados');

INSERT INTO "alias_modalidad" ("id", "valor_original", "clave_normalizada", "tipo_modalidad_id", "estado") VALUES
    ('30000000-0000-4000-8000-000000000001', 'Contrato Abierto', 'contratoabierto', '20000000-0000-4000-8000-000000000001', 'CONFIRMADO'),
    ('30000000-0000-4000-8000-000000000002', 'Subasta Electrónica Inversa', 'subastaelectronicainversa', '20000000-0000-4000-8000-000000000002', 'CONFIRMADO'),
    ('30000000-0000-4000-8000-000000000003', 'Bienes y Suministros Importados', 'bienesysuministrosimportados', '20000000-0000-4000-8000-000000000003', 'CONFIRMADO');

CREATE OR REPLACE FUNCTION actualizar_fecha_modificacion()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;

CREATE TRIGGER usuarios_actualizar_fecha
    BEFORE UPDATE ON "usuarios"
    FOR EACH ROW EXECUTE FUNCTION actualizar_fecha_modificacion();
CREATE TRIGGER proveedores_actualizar_fecha
    BEFORE UPDATE ON "proveedores"
    FOR EACH ROW EXECUTE FUNCTION actualizar_fecha_modificacion();
CREATE TRIGGER productos_proveedor_actualizar_fecha
    BEFORE UPDATE ON "productos_proveedor"
    FOR EACH ROW EXECUTE FUNCTION actualizar_fecha_modificacion();
CREATE TRIGGER referencias_ine_actualizar_fecha
    BEFORE UPDATE ON "referencias_ine"
    FOR EACH ROW EXECUTE FUNCTION actualizar_fecha_modificacion();
CREATE TRIGGER solicitudes_precio_actualizar_fecha
    BEFORE UPDATE ON "solicitudes_precio"
    FOR EACH ROW EXECUTE FUNCTION actualizar_fecha_modificacion();
CREATE TRIGGER requisitos_solicitud_actualizar_fecha
    BEFORE UPDATE ON "requisitos_solicitud"
    FOR EACH ROW EXECUTE FUNCTION actualizar_fecha_modificacion();
