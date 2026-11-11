import { factBankRoutes } from './routes/factBank';
import { importRoutes } from './routes/imports';
import { GitHubClient } from './services/github';
import express, { Router, type Express } from 'express';
import helmet from 'helmet';
import pino, { type Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import type { Env } from './config/env';
import type { Db } from './db/client';
import { apiNotFound, errorHandler } from './middleware/errors';
import { checkOrigin } from './middleware/origin';
import { requestId } from './middleware/requestId';
import { authRoutes } from './routes/auth';
import { healthRoutes } from './routes/health';
import { meRoutes } from './routes/me';

export interface AppDeps {
  db: Db;
  env: Env;
  logger?: Logger;
  github?: GitHubClient;
}

/**
 * Builds the Express app without starting it.
 * index.ts calls this and listens; tests call it with an in-memory database.
 */
export function createApp({ db, env, logger, github }: AppDeps): Express {
  const log =
    logger ??
    pino({
      level: env.LOG_LEVEL,
      // Readable one-line logs while developing, plain JSON in production.
      ...(env.NODE_ENV === 'development'
        ? { transport: { target: 'pino-pretty', options: { ignore: 'pid,hostname' } } }
        : {}),
    });
  const secureCookies = env.NODE_ENV === 'production';

  const app = express();
  app.disable('x-powered-by');
  app.use(requestId);
  app.use(
    pinoHttp({
      logger: log,
      genReqId: (req) => (req as express.Request).requestId,
      // Log only what is needed to follow a request. Never headers, cookies or bodies.
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  app.use(helmet());
  app.use(express.json({ limit: '1mb' }));

  const api = Router();
  api.use(checkOrigin(env.APP_ORIGIN));
  api.use(healthRoutes(db));
  api.use(authRoutes(db, secureCookies));
  api.use(meRoutes(db, secureCookies));
  api.use(factBankRoutes(db, secureCookies));
  api.use(importRoutes(db, env, github ?? new GitHubClient(env.GITHUB_TOKEN)));
  api.use(apiNotFound);

  app.use('/api/v1', api);
  app.use('/api', apiNotFound);
  app.use(errorHandler(log));
  return app;
}
