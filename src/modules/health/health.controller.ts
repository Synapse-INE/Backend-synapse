import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthService } from './health.service.js';

@Controller('salud')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @SkipThrottle()
  getStatus() {
    return this.healthService.getStatus();
  }
}
