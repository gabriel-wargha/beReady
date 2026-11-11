import 'dotenv/config';
import { ClaudeClient } from './ai/client';
import { createTaskRunner } from './tasks/runner';
import { GitHubClient } from './services/github';
import { createApp } from './app';
import { loadEnv } from './config/env';
import { createDb } from './db/client';
import { deleteExpiredSessions } from './lib/sessions';

const env = loadEnv(); // stops here with a clear message if .env is wrong
const { db, close } = await createDb({ url: env.DATABASE_URL, pgliteDir: env.PGLITE_DIR });
await deleteExpiredSessions(db);

const github = new GitHubClient(env.GITHUB_TOKEN);
const ai = env.ANTHROPIC_API_KEY ? new ClaudeClient(env.ANTHROPIC_API_KEY) : {send: async () => {throw new Error('Set ANTHROPIC_API_KEY in server/.env to use AI imports.');}};
const runner = createTaskRunner(db, env, ai, github);
const stopWorker = runner.start(error => console.error('Task worker failed', error));
const app = createApp({ db, env, github });
const server = app.listen(env.PORT, () => {
  console.log(`beReady API listening on http://localhost:${env.PORT}/api/v1`);
});

function shutdown() {
  server.close(() => {
    void stopWorker().then(close).finally(() => process.exit(0));
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
