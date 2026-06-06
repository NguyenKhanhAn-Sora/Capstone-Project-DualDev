import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { ConfigService } from './config/config.service';
import cookieParser from 'cookie-parser';
import express from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const config = app.get(ConfigService);

  const corsOrigins = [
    config.frontendUrl,
    config.adminUrl,
    ...config.corsExtraOrigins,
  ].filter((origin, index, list) => {
    const value = origin?.trim();
    return Boolean(value) && list.indexOf(origin) === index;
  });

  // CORS must be registered first so error responses from any later middleware
  // still include Access-Control-Allow-Origin headers
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-device-info',
      'x-device-id',
      'x-login-method',
      'x-admin-preview-token',
      'x-cordigram-upload-context',
    ],
  });

  app.use(cookieParser());

  // Increase JSON/urlencoded body limit (multipart/file uploads are handled by multer separately)
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Allow up to 15 minutes for video upload + eager transcoding
  const server = app.getHttpServer();
  server.timeout = 900_000;
  server.keepAliveTimeout = 900_000;

  await app.listen(config.port, () => {
    console.log(`Server is running on port ${config.port}`);
  });
}
bootstrap();
