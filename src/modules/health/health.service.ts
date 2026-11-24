import { Injectable } from '@nestjs/common';

@Injectable()
export class HealthService {
  getStatus() {
    return {
      estado: 'ok',
      servicio: 'portal-precios-api',
    };
  }
}
