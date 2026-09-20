import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

import { AppModule } from "./app/app.module";
import { appGlobalMiddleware } from "./app/useGlobal";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configuredClientOrigin = process.env.CLIENT_ORIGIN;
  app.enableCors({
    origin: [
      /^http:\/\/localhost(:\d+)?$/,
      ...(configuredClientOrigin ? [configuredClientOrigin] : []),
    ],
  });

  appGlobalMiddleware(app);
  const config = new DocumentBuilder()
    .setTitle("PhraseWeave Swagger")
    .setDescription("The PhraseWeave API description")
    .setVersion("v1.0")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("/swagger", app, document);
  await app.listen(process.env.PORT || 3001);
}

bootstrap();
