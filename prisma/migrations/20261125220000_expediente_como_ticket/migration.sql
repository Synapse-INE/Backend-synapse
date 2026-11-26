ALTER TYPE "estado_solicitud" ADD VALUE 'EN_ESPERA';
ALTER TYPE "estado_solicitud" ADD VALUE 'CANCELADA';

ALTER TABLE "solicitudes_precio" ADD COLUMN "estado_al_pausar" "estado_solicitud";

ALTER TABLE "solicitudes_adjuntos" ADD COLUMN "consulta_id" UUID;
ALTER TABLE "solicitudes_adjuntos" ADD COLUMN "entrega_id" UUID;

ALTER TABLE "solicitudes_adjuntos"
  ADD CONSTRAINT "solicitudes_adjuntos_consulta_id_fkey"
  FOREIGN KEY ("consulta_id") REFERENCES "consultas_mercado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "solicitudes_adjuntos"
  ADD CONSTRAINT "solicitudes_adjuntos_entrega_id_fkey"
  FOREIGN KEY ("entrega_id") REFERENCES "entregas_solicitud"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "solicitudes_adjuntos_consulta_id_idx" ON "solicitudes_adjuntos"("consulta_id");
CREATE INDEX "solicitudes_adjuntos_entrega_id_idx" ON "solicitudes_adjuntos"("entrega_id");

CREATE TABLE "solicitud_colaboradores" (
  "solicitud_id" UUID NOT NULL,
  "usuario_id" UUID NOT NULL,
  "agregado_por_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "solicitud_colaboradores_pkey" PRIMARY KEY ("solicitud_id", "usuario_id")
);

ALTER TABLE "solicitud_colaboradores"
  ADD CONSTRAINT "solicitud_colaboradores_solicitud_id_fkey"
  FOREIGN KEY ("solicitud_id") REFERENCES "solicitudes_precio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "solicitud_colaboradores"
  ADD CONSTRAINT "solicitud_colaboradores_usuario_id_fkey"
  FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "solicitud_colaboradores"
  ADD CONSTRAINT "solicitud_colaboradores_agregado_por_id_fkey"
  FOREIGN KEY ("agregado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "solicitud_colaboradores_usuario_id_idx" ON "solicitud_colaboradores"("usuario_id");
