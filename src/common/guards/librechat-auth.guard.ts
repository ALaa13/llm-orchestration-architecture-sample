import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { AppLogger } from '../logging';
import type { ApplicationConfig } from '../../config/configuration';

const LIBRECHAT_KEY_HEADER = 'x-architecture-sample-key';

@Injectable()
export class LibreChatAuthGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService<ApplicationConfig, true>,
    private readonly logger: AppLogger,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const suppliedKey = request.headers[LIBRECHAT_KEY_HEADER];
    const configuredKey = this.config.get('security.libreChatApiKey', {
      infer: true,
    });

    if (
      typeof suppliedKey !== 'string' ||
      !this.keysMatch(suppliedKey, configuredKey)
    ) {
      this.logger.warn(
        'security.librechat_auth.rejected',
        'LibreChat request rejected',
        {
          method: request.method,
          path: request.path,
          outcome: 'unauthorized',
        },
      );
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Unauthorized',
      });
    }

    return true;
  }

  private keysMatch(suppliedKey: string, configuredKey: string): boolean {
    const supplied = Buffer.from(suppliedKey, 'utf8');
    const configured = Buffer.from(configuredKey, 'utf8');

    return (
      supplied.length === configured.length &&
      timingSafeEqual(supplied, configured)
    );
  }
}
