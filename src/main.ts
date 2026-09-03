import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './app-setup.js';
import { AppConfigService } from './common/config/app-config.service.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(AppConfigService);

  configureApp(app);

  await app.listen(config.port);
  new Logger('Bootstrap').log(`Garner API listening on port ${config.port}`);
}

await bootstrap();
