CREATE SCHEMA IF NOT EXISTS "public";

CREATE TABLE "invitaciones_proveedor" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "vence_en" TIMESTAMPTZ(6) NOT NULL,
    "aceptada_en" TIMESTAMPTZ(6),
    "creada_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitaciones_proveedor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "eventos_auditoria" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "accion" VARCHAR(100) NOT NULL,
    "recurso" VARCHAR(100) NOT NULL,
    "recurso_id" VARCHAR(100),
    "metadatos" JSONB,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eventos_auditoria_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "invitaciones_proveedor_token_hash_key"
    ON "invitaciones_proveedor"("token_hash");
CREATE INDEX "invitaciones_proveedor_email_idx"
    ON "invitaciones_proveedor"("email");
CREATE INDEX "eventos_auditoria_actor_id_creado_en_idx"
    ON "eventos_auditoria"("actor_id", "creado_en");
CREATE INDEX "eventos_auditoria_recurso_recurso_id_creado_en_idx"
    ON "eventos_auditoria"("recurso", "recurso_id", "creado_en");
