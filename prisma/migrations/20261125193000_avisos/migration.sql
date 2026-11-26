-- Avisos de lo que ya ocurrió en el expediente. No hay plazos ni recordatorios.

CREATE TABLE "notificaciones" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "solicitud_id" UUID NOT NULL,
    "titulo" VARCHAR(160) NOT NULL,
    "detalle" VARCHAR(500) NOT NULL,
    "leida_en" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notificaciones_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notificaciones_usuario_id_leida_en_created_at_idx"
    ON "notificaciones"("usuario_id", "leida_en", "created_at");

ALTER TABLE "notificaciones"
    ADD CONSTRAINT "notificaciones_usuario_id_fkey"
    FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notificaciones"
    ADD CONSTRAINT "notificaciones_solicitud_id_fkey"
    FOREIGN KEY ("solicitud_id") REFERENCES "solicitudes_precio"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
