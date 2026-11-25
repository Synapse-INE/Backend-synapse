ALTER TYPE "estado_usuario" ADD VALUE 'PENDIENTE_APROBACION' AFTER 'PENDIENTE_VERIFICACION';

CREATE TYPE "estado_revision_solicitante" AS ENUM ('PENDIENTE', 'VERIFICADO', 'RECHAZADO');

UPDATE "roles"
SET "codigo" = 'SOLICITANTE', "nombre" = 'Solicitante'
WHERE "codigo" = 'USUARIO';

CREATE TABLE "instituciones_solicitantes" (
    "id" UUID NOT NULL,
    "nombre_oficial" VARCHAR(240) NOT NULL,
    "nit" VARCHAR(20),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instituciones_solicitantes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "perfiles_solicitantes" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "institucion_id" UUID NOT NULL,
    "cargo" VARCHAR(160),
    "dpi_cifrado" VARCHAR(512),
    "estado_revision" "estado_revision_solicitante" NOT NULL DEFAULT 'PENDIENTE',
    "revisado_por_id" UUID,
    "revisado_en" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "perfiles_solicitantes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sesiones_usuario" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "csrf_token_hash" CHAR(64) NOT NULL,
    "vence_en" TIMESTAMPTZ(6) NOT NULL,
    "revocada_en" TIMESTAMPTZ(6),
    "creada_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimo_acceso_en" TIMESTAMPTZ(6),

    CONSTRAINT "sesiones_usuario_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "solicitudes_precio"
ADD COLUMN "institucion_solicitante_id" UUID;

CREATE UNIQUE INDEX "instituciones_solicitantes_nit_key"
ON "instituciones_solicitantes"("nit");

CREATE UNIQUE INDEX "perfiles_solicitantes_usuario_id_key"
ON "perfiles_solicitantes"("usuario_id");

CREATE INDEX "perfiles_solicitantes_institucion_id_estado_revision_idx"
ON "perfiles_solicitantes"("institucion_id", "estado_revision");

CREATE INDEX "perfiles_solicitantes_revisado_por_id_idx"
ON "perfiles_solicitantes"("revisado_por_id");

CREATE UNIQUE INDEX "sesiones_usuario_token_hash_key"
ON "sesiones_usuario"("token_hash");

CREATE INDEX "sesiones_usuario_usuario_id_vence_en_idx"
ON "sesiones_usuario"("usuario_id", "vence_en");

CREATE INDEX "solicitudes_precio_institucion_solicitante_id_idx"
ON "solicitudes_precio"("institucion_solicitante_id");

ALTER TABLE "perfiles_solicitantes"
ADD CONSTRAINT "perfiles_solicitantes_usuario_id_fkey"
FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "perfiles_solicitantes"
ADD CONSTRAINT "perfiles_solicitantes_institucion_id_fkey"
FOREIGN KEY ("institucion_id") REFERENCES "instituciones_solicitantes"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "perfiles_solicitantes"
ADD CONSTRAINT "perfiles_solicitantes_revisado_por_id_fkey"
FOREIGN KEY ("revisado_por_id") REFERENCES "usuarios"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sesiones_usuario"
ADD CONSTRAINT "sesiones_usuario_usuario_id_fkey"
FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "solicitudes_precio"
ADD CONSTRAINT "solicitudes_precio_institucion_solicitante_id_fkey"
FOREIGN KEY ("institucion_solicitante_id") REFERENCES "instituciones_solicitantes"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TRIGGER instituciones_solicitantes_actualizar_fecha
    BEFORE UPDATE ON "instituciones_solicitantes"
    FOR EACH ROW EXECUTE FUNCTION actualizar_fecha_modificacion();

CREATE TRIGGER perfiles_solicitantes_actualizar_fecha
    BEFORE UPDATE ON "perfiles_solicitantes"
    FOR EACH ROW EXECUTE FUNCTION actualizar_fecha_modificacion();
