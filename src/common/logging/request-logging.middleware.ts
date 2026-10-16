import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { AppLogger } from './app-logger.service';
import { RequestContextService } from './request-context.service';

const REQUEST_ID_HEADER = 'x-request-id';
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly logger: AppLogger,
  ) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const requestId = this.resolveRequestId(request.header(REQUEST_ID_HEADER));
    const startedAt = performance.now();
    let settled = false;

    response.setHeader(REQUEST_ID_HEADER, requestId);

    this.requestContext.run(requestId, () => {
      response.once('finish', () => {
        if (settled) {
          return;
        }
        settled = true;
        this.logCompletion(request, response, startedAt);
      });

      response.once('close', () => {
        if (settled) {
          return;
        }
        settled = true;
        this.logger.warn('http.request.aborted', 'HTTP request aborted', {
          method: request.method,
          path: request.path,
          durationMs: this.duration(startedAt),
        });
      });

      next();
    });
  }

  private logCompletion(
    request: Request,
    response: Response,
    startedAt: number,
  ): void {
    const isSuccessfulHealthCheck =
      request.method === 'GET' &&
      request.path === '/api/health' &&
      response.statusCode < 400;

    if (isSuccessfulHealthCheck) {
      return;
    }

    const metadata = {
      method: request.method,
      path: request.path,
      statusCode: response.statusCode,
      durationMs: this.duration(startedAt),
    };

    if (response.statusCode >= 500) {
      this.logger.error(
        'http.request.completed',
        'HTTP request completed with a server error',
        undefined,
        metadata,
      );
    } else if (response.statusCode >= 400) {
      this.logger.warn(
        'http.request.completed',
        'HTTP request completed with a client error',
        metadata,
      );
    } else {
      this.logger.info(
        'http.request.completed',
        'HTTP request completed',
        metadata,
      );
    }
  }

  private resolveRequestId(header: string | undefined): string {
    return header !== undefined && SAFE_REQUEST_ID.test(header)
      ? header
      : randomUUID();
  }

  private duration(startedAt: number): number {
    return Number((performance.now() - startedAt).toFixed(2));
  }
}
