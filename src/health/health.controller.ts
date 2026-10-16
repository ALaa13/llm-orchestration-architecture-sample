import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

export interface HealthResponse {
  status: 'ok';
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Check whether the service is healthy' })
  @ApiOkResponse({ schema: { example: { status: 'ok' } } })
  getHealth(): HealthResponse {
    return { status: 'ok' };
  }
}
