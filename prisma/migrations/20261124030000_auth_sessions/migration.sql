-- CreateTable
CREATE TABLE "sesiones_autenticacion" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "csrf_token_hash" VARCHAR(64) NOT NULL,
    "vence_en" TIMESTAMPTZ(6) NOT NULL,
    "revocada_en" TIMESTAMPTZ(6),
    "rotada_en" TIMESTAMPTZ(6),
    "creada_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimo_uso_en" TIMESTAMPTZ(6),

    CONSTRAINT "sesiones_autenticacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sesiones_autenticacion_token_hash_key"
    ON "sesiones_autenticacion"("token_hash");
CREATE INDEX "sesiones_autenticacion_usuario_id_vence_en_idx"
    ON "sesiones_autenticacion"("usuario_id", "vence_en");
CREATE INDEX "sesiones_autenticacion_vence_en_idx"
    ON "sesiones_autenticacion"("vence_en");

-- AddForeignKey
ALTER TABLE "sesiones_autenticacion"
    ADD CONSTRAINT "sesiones_autenticacion_usuario_id_fkey"
    FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Add the request origin to new audit events without rewriting historic data.
ALTER TABLE "eventos_auditoria" ADD COLUMN "ip" VARCHAR(45);
