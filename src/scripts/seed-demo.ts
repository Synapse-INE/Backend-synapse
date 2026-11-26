import 'dotenv/config';
import argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../infrastructure/database/generated/client.js';

const CONFIRMATION_VALUE = 'SEED_ISOLATED_EVALUATION_DATABASE';
const EXPECTED_ENVIRONMENT = 'isolated-evaluation';

const DEMO_ACCOUNTS = [
  {
    role: 'ADMIN',
    email: 'demo.admin@evaluacion.invalid',
    name: 'Administración de demostración',
    passwordVariable: 'DEMO_ADMIN_PASSWORD',
  },
  {
    role: 'JEFE',
    email: 'demo.jefe@evaluacion.invalid',
    name: 'Jefatura de demostración',
    passwordVariable: 'DEMO_JEFE_PASSWORD',
  },
  {
    role: 'TRABAJADOR_INE',
    email: 'demo.analista@evaluacion.invalid',
    name: 'Analista de demostración',
    passwordVariable: 'DEMO_TRABAJADOR_INE_PASSWORD',
  },
  {
    role: 'PROVEEDOR',
    email: 'demo.proveedor@evaluacion.invalid',
    name: 'Proveedor de demostración',
    passwordVariable: 'DEMO_PROVEEDOR_PASSWORD',
  },
  {
    role: 'SOLICITANTE',
    email: 'demo.solicitante@evaluacion.invalid',
    name: 'Solicitante de demostración',
    passwordVariable: 'DEMO_SOLICITANTE_PASSWORD',
  },
] as const;

export type DemoSeedAccount = {
  role: (typeof DEMO_ACCOUNTS)[number]['role'];
  email: string;
  name: string;
  password: string;
};

export function readDemoSeedConfiguration(environment: NodeJS.ProcessEnv): {
  databaseUrl: string;
  accounts: DemoSeedAccount[];
} {
  if (environment.DEMO_SEED_ENABLED !== 'true') {
    throw new Error('El seed requiere DEMO_SEED_ENABLED=true.');
  }
  if (environment.DEMO_SEED_ENVIRONMENT !== EXPECTED_ENVIRONMENT) {
    throw new Error(
      `El seed solo se permite con DEMO_SEED_ENVIRONMENT=${EXPECTED_ENVIRONMENT}.`,
    );
  }
  if (environment.DEMO_SEED_CONFIRMATION !== CONFIRMATION_VALUE) {
    throw new Error(
      `Confirma la base aislada con DEMO_SEED_CONFIRMATION=${CONFIRMATION_VALUE}.`,
    );
  }

  const databaseUrl = environment.DATABASE_URL;
  const configuredDatabaseName = environment.DEMO_SEED_DATABASE_NAME;
  if (!databaseUrl || !configuredDatabaseName) {
    throw new Error(
      'DATABASE_URL y DEMO_SEED_DATABASE_NAME son obligatorios para el seed.',
    );
  }

  let actualDatabaseName: string;
  try {
    const parsedUrl = new URL(databaseUrl);
    if (!['postgres:', 'postgresql:'].includes(parsedUrl.protocol)) {
      throw new Error();
    }
    actualDatabaseName = decodeURIComponent(parsedUrl.pathname.slice(1));
  } catch {
    throw new Error('DATABASE_URL debe ser una URL válida de PostgreSQL.');
  }

  if (
    actualDatabaseName !== configuredDatabaseName ||
    !/(?:_demo|_evaluation)$/i.test(configuredDatabaseName)
  ) {
    throw new Error(
      'El seed exige una base dedicada con sufijo _demo o _evaluation y coincidente con DATABASE_URL.',
    );
  }

  const accounts = DEMO_ACCOUNTS.map((account) => {
    const password = environment[account.passwordVariable];
    if (!password || password.length < 12 || password.length > 128) {
      throw new Error(
        `${account.passwordVariable} debe contener entre 12 y 128 caracteres.`,
      );
    }
    return { ...account, password };
  });

  if (
    new Set(accounts.map(({ password }) => password)).size !== accounts.length
  ) {
    throw new Error('Cada cuenta demo debe tener una contraseña distinta.');
  }

  return { databaseUrl, accounts };
}

export async function seedDemoAccounts(
  prisma: PrismaClient,
  accounts: DemoSeedAccount[],
): Promise<void> {
  const roles = await prisma.rol.findMany({
    where: { codigo: { in: accounts.map(({ role }) => role) } },
    select: { id: true, codigo: true },
  });
  const roleIds = new Map(roles.map(({ id, codigo }) => [codigo, id]));
  const missingRoles = accounts
    .map(({ role }) => role)
    .filter((role) => !roleIds.has(role));
  if (missingRoles.length > 0) {
    throw new Error(
      `Faltan roles requeridos en la base: ${missingRoles.join(', ')}.`,
    );
  }

  for (const account of accounts) {
    const roleId = roleIds.get(account.role);
    if (!roleId) {
      throw new Error(
        `No se encontró el rol ${account.role} después de validarlo.`,
      );
    }

    const existing = await prisma.usuario.findUnique({
      where: { email: account.email },
      select: {
        id: true,
        estado: true,
        emailVerificadoEn: true,
        proveedor: { select: { estado: true } },
        perfilSolicitante: { select: { estadoRevision: true } },
        roles: { select: { rol: { select: { codigo: true } } } },
      },
    });

    if (existing) {
      const currentRoles = existing.roles.map(({ rol }) => rol.codigo);
      if (
        existing.estado !== 'ACTIVO' ||
        !existing.emailVerificadoEn ||
        currentRoles.length !== 1 ||
        currentRoles[0] !== account.role ||
        (account.role === 'PROVEEDOR' &&
          existing.proveedor?.estado !== 'ACTIVO') ||
        (account.role === 'SOLICITANTE' &&
          existing.perfilSolicitante?.estadoRevision !== 'VERIFICADO')
      ) {
        throw new Error(
          `La cuenta ${account.email} existe con un estado o perfil distinto al esperado; no se modificó.`,
        );
      }
      console.info(
        `Cuenta demo verificada: ${account.email} (${account.role}).`,
      );
      continue;
    }

    const now = new Date();
    await prisma.usuario.create({
      data: {
        email: account.email,
        passwordHash: await argon2.hash(account.password),
        nombre: account.name,
        estado: 'ACTIVO',
        emailVerificadoEn: now,
        roles: { create: [{ rolId: roleId }] },
        ...(account.role === 'PROVEEDOR'
          ? {
              proveedor: {
                create: {
                  nombreComercial: 'Proveedor de demostración',
                  razonSocial: 'Proveedor de demostración',
                  correoContacto: account.email,
                },
              },
            }
          : {}),
        ...(account.role === 'SOLICITANTE'
          ? {
              perfilSolicitante: {
                create: {
                  cargo: 'Solicitante de demostración',
                  estadoRevision: 'VERIFICADO',
                  revisadoEn: now,
                  institucion: {
                    create: {
                      nombreOficial: 'Institución de demostración',
                    },
                  },
                },
              },
            }
          : {}),
      },
      select: { id: true },
    });
    console.info(`Cuenta demo creada: ${account.email} (${account.role}).`);
  }
}

async function main(): Promise<void> {
  const { databaseUrl, accounts } = readDemoSeedConfiguration(process.env);
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });

  try {
    await seedDemoAccounts(prisma, accounts);
    console.info('Aprovisionamiento de cuentas demo completado.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'error desconocido';
  console.error(`No se completó el seed de evaluación: ${message}`);
  process.exitCode = 1;
});
