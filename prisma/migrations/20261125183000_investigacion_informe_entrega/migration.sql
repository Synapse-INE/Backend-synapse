-- Investigación, análisis, informe y entrega del expediente.
-- El precio oficial lo escribe una persona. Estas tablas no calculan estadísticas.

CREATE TYPE "tipo_fuente_consulta" AS ENUM ('CATALOGO_INE', 'INSTITUCION', 'EMPRESA', 'OTRA');
CREATE TYPE "tipo_informe_solicitud" AS ENUM ('INFORME_TECNICO', 'OFICIO');
CREATE TYPE "estado_informe_solicitud" AS ENUM ('BORRADOR', 'EMITIDO');
CREATE TYPE "medio_entrega" AS ENUM ('DIGITAL', 'FISICA', 'CD');

CREATE TABLE "fuentes_consulta" (
    "id" UUID NOT NULL,
    "nombre" VARCHAR(200) NOT NULL,
    "tipo" "tipo_fuente_consulta" NOT NULL,
    "pais" CHAR(2) NOT NULL DEFAULT 'GT',
    "dominio" VARCHAR(253),
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "nota" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fuentes_consulta_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fuentes_consulta_pais_gt" CHECK ("pais" = 'GT'),
    CONSTRAINT "fuentes_consulta_dominio_gt" CHECK (
        "dominio" IS NULL OR "dominio" ~ '^[a-z0-9-]+(\.[a-z0-9-]+)*\.gt$'
    )
);

CREATE INDEX "fuentes_consulta_activa_tipo_idx" ON "fuentes_consulta"("activa", "tipo");

INSERT INTO "fuentes_consulta" (
    "id", "nombre", "tipo", "pais", "activa", "nota"
) VALUES (
    '10000000-0000-4000-8000-0000000000f1',
    'Catálogo de precios de referencia del INE',
    'CATALOGO_INE',
    'GT',
    true,
    'Fuente interna. Registrar una boleta no adopta solo el precio del catálogo.'
);

CREATE TABLE "consultas_mercado" (
    "id" UUID NOT NULL,
    "solicitud_id" UUID NOT NULL,
    "fuente_id" UUID NOT NULL,
    "fecha_consulta" DATE NOT NULL,
    "nota" VARCHAR(1000),
    "evidencia" VARCHAR(500),
    "registrada_por_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "consultas_mercado_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "consultas_mercado_solicitud_id_fecha_consulta_idx"
    ON "consultas_mercado"("solicitud_id", "fecha_consulta");

ALTER TABLE "consultas_mercado"
    ADD CONSTRAINT "consultas_mercado_solicitud_id_fkey"
    FOREIGN KEY ("solicitud_id") REFERENCES "solicitudes_precio"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "consultas_mercado"
    ADD CONSTRAINT "consultas_mercado_fuente_id_fkey"
    FOREIGN KEY ("fuente_id") REFERENCES "fuentes_consulta"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "consultas_mercado"
    ADD CONSTRAINT "consultas_mercado_registrada_por_id_fkey"
    FOREIGN KEY ("registrada_por_id") REFERENCES "usuarios"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "precios_consultados" (
    "id" UUID NOT NULL,
    "consulta_id" UUID NOT NULL,
    "producto_solicitud_id" UUID NOT NULL,
    "precio" DECIMAL(14,3) NOT NULL,
    "moneda" CHAR(3) NOT NULL DEFAULT 'GTQ',
    "unidad_medida" VARCHAR(120) NOT NULL,
    "referencia_ine_id" UUID,
    "es_atipico" BOOLEAN NOT NULL DEFAULT false,
    "observacion" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "precios_consultados_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "precios_consultados_precio_positivo" CHECK ("precio" > 0)
);

CREATE INDEX "precios_consultados_consulta_id_idx" ON "precios_consultados"("consulta_id");
CREATE INDEX "precios_consultados_producto_solicitud_id_idx" ON "precios_consultados"("producto_solicitud_id");
CREATE INDEX "precios_consultados_referencia_ine_id_idx" ON "precios_consultados"("referencia_ine_id");

ALTER TABLE "precios_consultados"
    ADD CONSTRAINT "precios_consultados_consulta_id_fkey"
    FOREIGN KEY ("consulta_id") REFERENCES "consultas_mercado"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "precios_consultados"
    ADD CONSTRAINT "precios_consultados_producto_solicitud_id_fkey"
    FOREIGN KEY ("producto_solicitud_id") REFERENCES "productos_solicitud"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "precios_consultados"
    ADD CONSTRAINT "precios_consultados_referencia_ine_id_fkey"
    FOREIGN KEY ("referencia_ine_id") REFERENCES "referencias_ine"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "validaciones_analisis" (
    "id" UUID NOT NULL,
    "solicitud_id" UUID NOT NULL,
    "producto_solicitud_id" UUID NOT NULL,
    "precio_adoptado" DECIMAL(14,3) NOT NULL,
    "moneda" CHAR(3) NOT NULL DEFAULT 'GTQ',
    "unidad_medida" VARCHAR(120) NOT NULL,
    "criterio" VARCHAR(1000) NOT NULL,
    "nota_atipicos" VARCHAR(1000),
    "confirmada" BOOLEAN NOT NULL DEFAULT false,
    "confirmada_por_id" UUID,
    "confirmada_en" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "validaciones_analisis_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "validaciones_analisis_precio_positivo" CHECK ("precio_adoptado" > 0)
);

CREATE UNIQUE INDEX "validaciones_analisis_solicitud_id_producto_solicitud_id_key"
    ON "validaciones_analisis"("solicitud_id", "producto_solicitud_id");
CREATE INDEX "validaciones_analisis_producto_solicitud_id_idx"
    ON "validaciones_analisis"("producto_solicitud_id");

ALTER TABLE "validaciones_analisis"
    ADD CONSTRAINT "validaciones_analisis_solicitud_id_fkey"
    FOREIGN KEY ("solicitud_id") REFERENCES "solicitudes_precio"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "validaciones_analisis"
    ADD CONSTRAINT "validaciones_analisis_producto_solicitud_id_fkey"
    FOREIGN KEY ("producto_solicitud_id") REFERENCES "productos_solicitud"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "validaciones_analisis"
    ADD CONSTRAINT "validaciones_analisis_confirmada_por_id_fkey"
    FOREIGN KEY ("confirmada_por_id") REFERENCES "usuarios"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "informes_solicitud" (
    "id" UUID NOT NULL,
    "solicitud_id" UUID NOT NULL,
    "tipo" "tipo_informe_solicitud" NOT NULL,
    "version" INTEGER NOT NULL,
    "destinatario" VARCHAR(240) NOT NULL,
    "resumen" TEXT NOT NULL,
    "estado" "estado_informe_solicitud" NOT NULL DEFAULT 'BORRADOR',
    "elaborado_por_id" UUID NOT NULL,
    "emitido_en" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "informes_solicitud_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "informes_solicitud_solicitud_id_tipo_version_key"
    ON "informes_solicitud"("solicitud_id", "tipo", "version");
CREATE INDEX "informes_solicitud_solicitud_id_estado_idx"
    ON "informes_solicitud"("solicitud_id", "estado");

ALTER TABLE "informes_solicitud"
    ADD CONSTRAINT "informes_solicitud_solicitud_id_fkey"
    FOREIGN KEY ("solicitud_id") REFERENCES "solicitudes_precio"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "informes_solicitud"
    ADD CONSTRAINT "informes_solicitud_elaborado_por_id_fkey"
    FOREIGN KEY ("elaborado_por_id") REFERENCES "usuarios"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "entregas_solicitud" (
    "id" UUID NOT NULL,
    "solicitud_id" UUID NOT NULL,
    "informe_id" UUID,
    "medio" "medio_entrega" NOT NULL,
    "destinatario" VARCHAR(240) NOT NULL,
    "fecha_entrega" DATE NOT NULL,
    "constancia" VARCHAR(1000) NOT NULL,
    "registrada_por_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "entregas_solicitud_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "entregas_solicitud_solicitud_id_fecha_entrega_idx"
    ON "entregas_solicitud"("solicitud_id", "fecha_entrega");
CREATE INDEX "entregas_solicitud_informe_id_idx" ON "entregas_solicitud"("informe_id");

ALTER TABLE "entregas_solicitud"
    ADD CONSTRAINT "entregas_solicitud_solicitud_id_fkey"
    FOREIGN KEY ("solicitud_id") REFERENCES "solicitudes_precio"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "entregas_solicitud"
    ADD CONSTRAINT "entregas_solicitud_informe_id_fkey"
    FOREIGN KEY ("informe_id") REFERENCES "informes_solicitud"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "entregas_solicitud"
    ADD CONSTRAINT "entregas_solicitud_registrada_por_id_fkey"
    FOREIGN KEY ("registrada_por_id") REFERENCES "usuarios"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
