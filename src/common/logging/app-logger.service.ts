import { Injectable, Logger } from '@nestjs/common';
import { RequestContextService } from './request-context.service';

export type LogMetadata = Readonly<Record<string, unknown>>;

@Injectable()
export class AppLogger {
  constructor(private readonly requestContext: RequestContextService) {}

  info(event: string, message: string, metadata: LogMetadata = {}): void {
    new Logger(event).log(this.payload(message, metadata));
  }

  warn(event: string, message: string, metadata: LogMetadata = {}): void {
    new Logger(event).warn(this.payload(message, metadata));
  }

  error(
    event: string,
    message: string,
    error?: Error,
    metadata: LogMetadata = {},
  ): void {
    new Logger(event).error(this.payload(message, metadata), error?.stack);
  }

  debug(event: string, message: string, metadata: LogMetadata = {}): void {
    new Logger(event).debug(this.payload(message, metadata));
  }

  requestId(): string | undefined {
    return this.requestContext.getRequestId();
  }

  private payload(message: string, metadata: LogMetadata): LogMetadata {
    const requestId = this.requestContext.getRequestId();

    return {
      message,
      ...metadata,
      ...(requestId === undefined ? {} : { requestId }),
    };
  }
}
