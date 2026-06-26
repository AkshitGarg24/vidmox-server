import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

/**
 * Starts the NestJS application.
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 8080);
}
void bootstrap();
