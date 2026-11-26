-- El expediente de Contrato Abierto cuelga de la solicitud que ya existe.
-- Los valores nuevos del enum se agregan al final: PostgreSQL no reordena un tipo.

ALTER TYPE "estado_solicitud" ADD VALUE 'PENDIENTE_SUBSANACION';
ALTER TYPE "estado_solicitud" ADD VALUE 'EN_INVESTIGACION';
ALTER TYPE "estado_solicitud" ADD VALUE 'EN_INFORME';
ALTER TYPE "estado_solicitud" ADD VALUE 'EN_ENTREGA';

ALTER TABLE "solicitudes_precio" ADD COLUMN "codigo" VARCHAR(20);
ALTER TABLE "solicitudes_precio" ADD COLUMN "asignada_a_id" UUID;

WITH numeradas AS (
    SELECT
        "id",
        EXTRACT(YEAR FROM "created_at")::int AS anio,
        ROW_NUMBER() OVER (
            PARTITION BY EXTRACT(YEAR FROM "created_at")
            ORDER BY "created_at", "id"
        ) AS n
    FROM "solicitudes_precio"
)
UPDATE "solicitudes_precio" AS solicitud
SET "codigo" = 'PR-' || numeradas.anio || '-' || LPAD(numeradas.n::text, 6, '0')
FROM numeradas
WHERE solicitud."id" = numeradas."id";

ALTER TABLE "solicitudes_precio" ALTER COLUMN "codigo" SET NOT NULL;
CREATE UNIQUE INDEX "solicitudes_precio_codigo_key" ON "solicitudes_precio"("codigo");
CREATE INDEX "solicitudes_precio_asignada_a_id_estado_idx"
    ON "solicitudes_precio"("asignada_a_id", "estado");

ALTER TABLE "solicitudes_precio"
    ADD CONSTRAINT "solicitudes_precio_asignada_a_id_fkey"
    FOREIGN KEY ("asignada_a_id") REFERENCES "usuarios"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "solicitud_correlativo" (
    "anio" INTEGER NOT NULL,
    "ultimo" INTEGER NOT NULL,
    CONSTRAINT "solicitud_correlativo_pkey" PRIMARY KEY ("anio")
);

INSERT INTO "solicitud_correlativo" ("anio", "ultimo")
SELECT EXTRACT(YEAR FROM "created_at")::int, COUNT(*)::int
FROM "solicitudes_precio"
GROUP BY 1;

CREATE TABLE "solicitud_comentarios" (
    "id" UUID NOT NULL,
    "solicitud_id" UUID NOT NULL,
    "autor_id" UUID NOT NULL,
    "contenido" VARCHAR(4000) NOT NULL,
    "es_interno" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "solicitud_comentarios_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "solicitud_comentarios_solicitud_id_created_at_idx"
    ON "solicitud_comentarios"("solicitud_id", "created_at");

ALTER TABLE "solicitud_comentarios"
    ADD CONSTRAINT "solicitud_comentarios_solicitud_id_fkey"
    FOREIGN KEY ("solicitud_id") REFERENCES "solicitudes_precio"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "solicitud_comentarios"
    ADD CONSTRAINT "solicitud_comentarios_autor_id_fkey"
    FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "solicitud_historial" (
    "id" UUID NOT NULL,
    "solicitud_id" UUID NOT NULL,
    "actor_id" UUID,
    "accion" VARCHAR(80) NOT NULL,
    "estado_anterior" VARCHAR(40),
    "estado_nuevo" VARCHAR(40),
    "detalle" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "solicitud_historial_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "solicitud_historial_solicitud_id_created_at_idx"
    ON "solicitud_historial"("solicitud_id", "created_at");

ALTER TABLE "solicitud_historial"
    ADD CONSTRAINT "solicitud_historial_solicitud_id_fkey"
    FOREIGN KEY ("solicitud_id") REFERENCES "solicitudes_precio"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "solicitud_historial"
    ADD CONSTRAINT "solicitud_historial_actor_id_fkey"
    FOREIGN KEY ("actor_id") REFERENCES "usuarios"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
