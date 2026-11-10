import 'dotenv/config';
import { loadEnv } from '../config/env';
import { createDb } from './client';

// `npm run db:migrate` applies pending migrations and exits.
const env = loadEnv();
const { close } = await createDb({ url: env.DATABASE_URL, pgliteDir: env.PGLITE_DIR });
await close();
console.log(`Migrations applied to ${env.DATABASE_URL ? 'DATABASE_URL' : env.PGLITE_DIR}`);
