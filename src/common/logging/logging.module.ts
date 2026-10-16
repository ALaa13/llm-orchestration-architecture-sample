import { Global, Module } from '@nestjs/common';
import { AppLogger } from './app-logger.service';
import { RequestContextService } from './request-context.service';
import { RequestLoggingMiddleware } from './request-logging.middleware';

@Global()
@Module({
  providers: [AppLogger, RequestContextService, RequestLoggingMiddleware],
  exports: [AppLogger, RequestContextService],
})
export class LoggingModule {}
