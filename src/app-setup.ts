import { ValidationPipe, VersioningType } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
} from '@nestjs/swagger';
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

  if (config.corsOrigins.length > 0) {
    app.enableCors({
      origin: config.corsOrigins,
      // The ids a client quotes back when reporting a problem.
      exposedHeaders: ['x-request-id', 'x-trace-id'],
      maxAge: 600,
    });
  }

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
    SwaggerModule.setup('docs', app, buildOpenApiDocument(app), {
      jsonDocumentUrl: 'docs/openapi.json',
    });
  }

  // Lets Nest run OnModuleDestroy hooks (Prisma disconnect, Redis quit, BullMQ
  // worker drain) when the process is asked to stop.
  app.enableShutdownHooks();
}

/**
 * The API contract clients are generated from — served at
 * `/docs/openapi.json` and committed as `openapi.json` by
 * `pnpm run openapi:export`, which CI keeps in step with the code.
 *
 * Operation ids are `<controller><Method>` in camel case (`productsSearch`,
 * `shoppingListsOptimize`), because a generated client turns each one into a
 * function name.
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  return SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Garner API')
      .setDescription(
        'Smart grocery price comparison — REST API for the Garner backend.',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .build(),
    {
      operationIdFactory: (controllerKey, methodKey) =>
        camelCase(controllerKey.replace(/Controller$/, '')) +
        methodKey.charAt(0).toUpperCase() +
        methodKey.slice(1),
    },
  );
}

function camelCase(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1);
}
