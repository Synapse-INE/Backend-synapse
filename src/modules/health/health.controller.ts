import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthService } from './health.service.js';
import { Public } from '../auth/decorators/public.decorator.js';

@Controller('salud')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @Public()
  @SkipThrottle()
  getStatus() {
    return this.healthService.getStatus();
  }
}
