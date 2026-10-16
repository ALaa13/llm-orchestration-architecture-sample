import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ChatModule } from './chat/chat.module';
import { LoggingModule } from './common/logging/logging.module';
import { RequestLoggingMiddleware } from './common/logging/request-logging.middleware';
import { ConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
import { PersistenceModule } from './persistence/postgres/persistence.module';

@Module({
  imports: [
    ConfigModule,
    LoggingModule,
    PersistenceModule,
    HealthModule,
    ChatModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLoggingMiddleware).forRoutes('{*path}');
  }
}
