import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

describe('identity migration', () => {
  const migrationRoot = join(process.cwd(), 'prisma', 'migrations');
  const userId = '497f6eca-6276-4993-bfeb-53cbbbba6f08';
  let database: PGlite;

  beforeEach(() => {
    database = new PGlite();
  });

  afterEach(async () => {
    await database.close();
  });

  it('creates session and requester profile tables without losing role assignments', async () => {
    const migrations = (await readdir(migrationRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && /^\d{14}_/.test(entry.name))
      .map((entry) => entry.name)
      .sort();
    const identityMigration = migrations.pop();
    expect(identityMigration).toBe('20261124030000_identity_access_sessions');

    for (const migration of migrations) {
      await database.exec(
        await readFile(join(migrationRoot, migration, 'migration.sql'), 'utf8'),
      );
    }

    const requesterRole = await database.query<{ id: string }>(
      `SELECT id FROM roles WHERE codigo = 'USUARIO'`,
    );
    expect(requesterRole.rows).toHaveLength(1);
    const roleId = requesterRole.rows[0].id;

    await database.query(
      'INSERT INTO usuarios (id, email, password_hash, nombre) VALUES ($1, $2, $3, $4)',
      [
        userId,
        'migration-test@example.org',
        'not-a-real-credential',
        'Migration Test',
      ],
    );
    await database.query(
      'INSERT INTO usuarios_roles (usuario_id, rol_id) VALUES ($1, $2)',
      [userId, roleId],
    );
    await database.exec(
      await readFile(
        join(migrationRoot, identityMigration, 'migration.sql'),
        'utf8',
      ),
    );

    const preservedAssignment = await database.query<{
      usuarioId: string;
      rolId: string;
      codigo: string;
    }>(
      `SELECT u.id AS "usuarioId", ur.rol_id AS "rolId", r.codigo
       FROM usuarios u
       JOIN usuarios_roles ur ON ur.usuario_id = u.id
       JOIN roles r ON r.id = ur.rol_id
       WHERE u.id = $1`,
      [userId],
    );
    expect(preservedAssignment.rows).toEqual([
      { usuarioId: userId, rolId: roleId, codigo: 'SOLICITANTE' },
    ]);

    const identityTables = await database.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name IN ('instituciones_solicitantes', 'perfiles_solicitantes', 'sesiones_usuario')
       ORDER BY table_name`,
    );
    expect(identityTables.rows.map(({ table_name }) => table_name)).toEqual([
      'instituciones_solicitantes',
      'perfiles_solicitantes',
      'sesiones_usuario',
    ]);

    const sessionIndexes = await database.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'sesiones_usuario'`,
    );
    expect(sessionIndexes.rows.map(({ indexname }) => indexname)).toContain(
      'sesiones_usuario_token_hash_key',
    );
    expect(sessionIndexes.rows.map(({ indexname }) => indexname)).toContain(
      'sesiones_usuario_usuario_id_vence_en_idx',
    );

    const identityField = await database.query<{ is_nullable: string }>(
      `SELECT is_nullable
       FROM information_schema.columns
       WHERE table_name = 'perfiles_solicitantes'
         AND column_name = 'dpi_cifrado'`,
    );
    expect(identityField.rows).toEqual([{ is_nullable: 'YES' }]);
  }, 30_000);
});
