import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );

  // CORS for the Next.js front-end (Cycle 4). In production, set CORS_ORIGINS
  // to a comma-separated list of trusted origins.
  const config = app.get(ConfigService);
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

  Logger.log(`Sigma PMO API listening on http://localhost:${port}/api`, 'Bootstrap');
}

void bootstrap();
