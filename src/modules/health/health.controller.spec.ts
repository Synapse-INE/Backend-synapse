import { HealthService } from './health.service.js';

describe('HealthService', () => {
  it('returns the service health payload', () => {
    expect(new HealthService().getStatus()).toEqual({
      estado: 'ok',
      servicio: 'portal-precios-api',
    });
  });
});
