ALTER TYPE "estado_solicitud" ADD VALUE 'BORRADOR' BEFORE 'RECIBIDA';

ALTER TABLE "solicitudes_precio" ADD COLUMN "enviada_en" TIMESTAMPTZ(6);

-- Toda solicitud existente ya había sido recibida.
UPDATE "solicitudes_precio" SET "enviada_en" = "created_at";
