import 'dotenv/config';
import { createApp } from './app';
import { loadEnv } from './config/env';
import { createDb } from './db/client';
import { deleteExpiredSessions } from './lib/sessions';

const env = loadEnv(); // stops here with a clear message if .env is wrong
const { db, close } = await createDb({ url: env.DATABASE_URL, pgliteDir: env.PGLITE_DIR });
await deleteExpiredSessions(db);

const app = createApp({ db, env });
const server = app.listen(env.PORT, () => {
  console.log(`beReady API listening on http://localhost:${env.PORT}/api/v1`);
});

function shutdown() {
  server.close(() => {
    void close().finally(() => process.exit(0));
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
