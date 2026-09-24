import { ValidationPipe, VersioningType } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
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

  // Behind a load balancer, `req.ip` is the proxy unless Express is told how
  // many hops to look past — and per-IP rate limiting depends on that address
  // being the client's. Configured rather than assumed: trusting a header
  // nobody sets would let a caller spoof their own address.
  if (config.trustProxyHops > 0) {
    (app as NestExpressApplication).set('trust proxy', config.trustProxyHops);
  }


  // A bounded body, refused before it is parsed. The evidence upload route
  // has its own, larger limit. Set through Nest rather than by reaching for
  // Express's parsers directly, which are not a dependency of this package.
  const httpApp = app as NestExpressApplication;
  httpApp.useBodyParser('json', { limit: config.maxRequestBodyBytes });
  httpApp.useBodyParser('urlencoded', {
    extended: true,
    limit: config.maxRequestBodyBytes,
  });

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
