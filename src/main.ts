import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { SessionFileLogger } from './common/logging';
import { enabledLogLevels } from './common/logging/log-levels';
import type { ApplicationConfig } from './config/configuration';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService<ApplicationConfig, true>);
  const apiPrefix = config.get('app.apiPrefix', { infer: true });

  const logLevels = enabledLogLevels(
    config.get('logging.level', { infer: true }),
  );
  app.useLogger(
    new SessionFileLogger(
      config.get('logging.filePath', { infer: true }),
      logLevels,
    ),
  );
  app.flushLogs();

  app.setGlobalPrefix(apiPrefix);
  app.enableCors({
    origin: config.get('app.corsOrigin', { infer: true }),
    credentials: true,
  });
  // Request payloads are validated per route with ZodValidationPipe, so no
  // global validation pipe is registered.
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Architecture Sample Backend')
    .setDescription('Business logic, LLM orchestration, and tool execution API')
    .setVersion('0.1.0')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(`${apiPrefix}/docs`, app, document);

  await app.listen(config.get('app.port', { infer: true }));
}

void bootstrap();
