import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { AppConfigService } from './app-config.service.js';
import { validateConfig } from './config.schema.js';

/**
 * `.env.<NODE_ENV>` wins over `.env`, so an integration run pointed at the
 * test databases never has to mutate the developer's own `.env`.
 */
const envFilePath = [`.env.${process.env.NODE_ENV ?? 'development'}`, '.env'];

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath,
      validate: validateConfig,
    }),
  ],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
