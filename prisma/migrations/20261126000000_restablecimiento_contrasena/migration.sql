
-- CreateTable
CREATE TABLE "tokens_restablecimiento_contrasena" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "vence_en" TIMESTAMPTZ(6) NOT NULL,
    "consumido_en" TIMESTAMPTZ(6),
    "creada_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tokens_restablecimiento_contrasena_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tokens_restablecimiento_contrasena_token_hash_key" ON "tokens_restablecimiento_contrasena"("token_hash");

-- CreateIndex
CREATE INDEX "tokens_restablecimiento_contrasena_usuario_id_vence_en_idx" ON "tokens_restablecimiento_contrasena"("usuario_id", "vence_en");

-- AddForeignKey
ALTER TABLE "tokens_restablecimiento_contrasena" ADD CONSTRAINT "tokens_restablecimiento_contrasena_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

