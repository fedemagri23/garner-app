import { ValidationPipe, VersioningType } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppConfigService } from './common/config/app-config.service.js';

/**
 * Everything that turns a bare Nest application into *this* API: security
 * headers, URI versioning, input validation and OpenAPI.
 *
 * It lives apart from `main.ts` so integration tests boot the same
 * configuration the process does. A pipe or guard configured only in `main.ts`
 * would be invisible to tests, and the suite would pass on an app that does
 * not behave like the deployed one.
 */
export function configureApp(app: INestApplication): void {
  const config = app.get(AppConfigService);

  app.use(helmet());

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  app.useGlobalPipes(
    new ValidationPipe({
      // Unknown properties are rejected rather than stripped, so a client
      // cannot smuggle fields past a DTO into a use case.
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  if (config.swaggerEnabled) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Garner API')
        .setDescription(
          'Smart grocery price comparison — REST API for the Garner backend.',
        )
        .setVersion('1.0')
        .addBearerAuth()
        .build(),
    );

    SwaggerModule.setup('docs', app, document, {
      jsonDocumentUrl: 'docs/openapi.json',
    });
  }

  // Lets Nest run OnModuleDestroy hooks (Prisma disconnect, Redis quit, BullMQ
  // worker drain) when the process is asked to stop.
  app.enableShutdownHooks();
}
