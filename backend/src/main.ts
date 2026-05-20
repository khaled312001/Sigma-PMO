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
  app.enableShutdownHooks();

  const config = app.get(ConfigService);
  const port = config.get<number>('port') ?? 3001;
  await app.listen(port);

  Logger.log(`Sigma PMO API listening on http://localhost:${port}/api`, 'Bootstrap');
}

void bootstrap();
