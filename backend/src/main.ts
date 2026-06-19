import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as express from 'express';
import helmet from 'helmet';
import { Logger as PinoLogger } from 'nestjs-pino';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';

// UTC is the single source of truth for all server-side time. The DB driver
// stores/reads datetimes in UTC (timezone: 'Z') and the API serialises Dates as
// ISO 8601 with a trailing Z; clients (browser/app) convert to the viewer's own
// timezone on display. Make the process timezone explicit as a final guard.
process.env.TZ = process.env.TZ || 'UTC';

async function bootstrap(): Promise<void> {
  // bufferLogs: true so any logs before the pino logger is wired up are buffered.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(PinoLogger));

  const config = app.get(ConfigService);
  const bodyLimit = config.get<string>('bodyLimit') ?? '25mb';

  // Stripe webhook needs the RAW, unparsed body for signature verification, so
  // it must bypass the JSON parser. Mount express.raw() for exactly that path,
  // then skip the JSON/urlencoded parsers for it (they would consume the stream
  // and break the signature). Every other route keeps the normal parsed body.
  const STRIPE_WEBHOOK_PATH = '/api/v1/billing/webhook';
  const jsonParser = express.json({ limit: bodyLimit });
  const urlencodedParser = express.urlencoded({ extended: true, limit: bodyLimit });

  // Body size limits — replace Nest's default 100kb. Applied before any route.
  app.use(STRIPE_WEBHOOK_PATH, express.raw({ type: '*/*', limit: bodyLimit }));
  app.use((req, res, next) => (req.path === STRIPE_WEBHOOK_PATH ? next() : jsonParser(req, res, next)));
  app.use((req, res, next) => (req.path === STRIPE_WEBHOOK_PATH ? next() : urlencodedParser(req, res, next)));

  // Helmet for security headers (CSP minimal — frontend is a separate origin).
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );

  // OpenAPI / Swagger — live, auto-generated API reference for developers and
  // integrations. UI at /api/v1/docs, machine-readable spec at /api/v1/docs-json.
  // AI features are powered by Anthropic Claude (no OpenAI).
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Sigma PMO API')
    .setDescription(
      'Multi-tenant construction governance OS — REST API (v1). ' +
        'Authenticate with the `x-api-key` header (obtained from POST /auth/login). ' +
        'All data is isolated per company (tenant). AI features use Anthropic Claude.',
    )
    .setVersion('1.0')
    .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'x-api-key')
    .addServer('/api/v1')
    .build();
  const openApiDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/v1/docs', app, openApiDocument, {
    jsonDocumentUrl: 'api/v1/docs-json',
    customSiteTitle: 'Sigma PMO API',
  });

  // CORS for the front-end. Set CORS_ORIGINS to a comma-separated list in prod.
  const corsOrigins = (config.get<string>('corsOrigins') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const defaultDevOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://[::1]:3000',
  ];
  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : defaultDevOrigins,
    credentials: false,
  });

  app.enableShutdownHooks();

  const port = config.get<number>('port') ?? 3001;
  // Bind to all interfaces so the container is reachable from the reverse proxy.
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
