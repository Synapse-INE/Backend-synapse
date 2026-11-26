import { readDemoSeedConfiguration } from '../src/scripts/seed-demo.js';

const validEnvironment = (): NodeJS.ProcessEnv => ({
  DEMO_SEED_ENABLED: 'true',
  DEMO_SEED_ENVIRONMENT: 'isolated-evaluation',
  DEMO_SEED_CONFIRMATION: 'SEED_ISOLATED_EVALUATION_DATABASE',
  DEMO_SEED_DATABASE_NAME: 'precios_referencia_evaluation',
  DATABASE_URL:
    'postgresql://test:test@localhost:5432/precios_referencia_evaluation',
  DEMO_ADMIN_PASSWORD: 'demo-admin-password-1',
  DEMO_JEFE_PASSWORD: 'demo-jefe-password-2',
  DEMO_TRABAJADOR_INE_PASSWORD: 'demo-worker-password-3',
  DEMO_PROVEEDOR_PASSWORD: 'demo-provider-password-4',
  DEMO_SOLICITANTE_PASSWORD: 'demo-requester-password-5',
});

describe('readDemoSeedConfiguration', () => {
  it('requires explicit evaluation and confirmation flags', () => {
    const environment = validEnvironment();
    delete environment.DEMO_SEED_CONFIRMATION;

    expect(() => readDemoSeedConfiguration(environment)).toThrow(
      'Confirma la base aislada',
    );
  });

  it('rejects a shared or mismatched database name', () => {
    const environment = validEnvironment();
    environment.DEMO_SEED_DATABASE_NAME = 'precios_referencia';

    expect(() => readDemoSeedConfiguration(environment)).toThrow(
      'base dedicada',
    );
  });

  it('requires unique credentials of sufficient length', () => {
    const environment = validEnvironment();
    environment.DEMO_PROVEEDOR_PASSWORD = environment.DEMO_ADMIN_PASSWORD;

    expect(() => readDemoSeedConfiguration(environment)).toThrow(
      'contraseña distinta',
    );
  });

  it('returns all five role accounts for a dedicated evaluation database', () => {
    const configuration = readDemoSeedConfiguration(validEnvironment());

    expect(configuration.accounts.map(({ role }) => role)).toEqual([
      'ADMIN',
      'JEFE',
      'TRABAJADOR_INE',
      'PROVEEDOR',
      'SOLICITANTE',
    ]);
  });
});
