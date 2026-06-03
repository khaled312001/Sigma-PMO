import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as express from 'express';
import helmet from 'helmet';
import { Logger as PinoLogger } from 'nestjs-pino';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  // bufferLogs: true so any logs before the pino logger is wired up are buffered.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(PinoLogger));

  const config = app.get(ConfigService);
  const bodyLimit = config.get<string>('bodyLimit') ?? '25mb';

  // Body size limits — replace Nest's default 100kb. Applied before any route.
  app.use(express.json({ limit: bodyLimit }));
  app.use(express.urlencoded({ extended: true, limit: bodyLimit }));

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

  // CORS for the front-end. Set CORS_ORIGINS to a comma-separated list in prod.
  const corsOrigins = (config.get<string>('corsOrigins') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : ['http://localhost:3000'],
    credentials: false,
  });

  app.enableShutdownHooks();

  const port = config.get<number>('port') ?? 3001;
  await app.listen(port);
}

void bootstrap();
