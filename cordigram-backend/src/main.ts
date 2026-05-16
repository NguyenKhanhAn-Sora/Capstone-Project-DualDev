import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { ConfigService } from './config/config.service';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const config = app.get(ConfigService);

  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: [
      config.frontendUrl,
      config.adminUrl,
      ...config.corsExtraOrigins,
    ],
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

  // Allow up to 15 minutes for video upload + eager transcoding
  const server = app.getHttpServer();
  server.timeout = 900_000;
  server.keepAliveTimeout = 900_000;

  await app.listen(config.port, () => {
    console.log(`Server is running on port ${config.port}`);
  });
}
bootstrap();
