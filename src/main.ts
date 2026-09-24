import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './app-setup.js';
import { AppConfigService } from './common/config/app-config.service.js';
import { createLogger } from './common/observability/json-logger.js';

async function bootstrap(): Promise<void> {
  // Buffered until configuration is read, so the first lines come out in
  // whichever format this environment wants rather than two different ones.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(AppConfigService);

  app.useLogger(createLogger(config.structuredLogs));
  configureApp(app);

  await app.listen(config.port);
  new Logger('Bootstrap').log(`Garner API listening on port ${config.port}`);
}

await bootstrap();
