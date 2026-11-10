import { z } from 'zod';

/**
 * Every setting the server reads comes through here.
 * If something required is missing or malformed, the server stops at startup
 * with a clear message instead of failing later in the middle of a request.
 */
const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  // A Postgres connection string (Neon in production). Empty means: use the embedded database.
  DATABASE_URL: z.preprocess(emptyToUndefined, z.string().startsWith('postgres').optional()),
  // Where the embedded database keeps its files when DATABASE_URL is empty.
  PGLITE_DIR: z.string().min(1).default('./pgdata'),
  LOG_LEVEL: z.enum(['silent', 'error', 'warn', 'info', 'debug']).default('info'),
  // Optional until the phase that uses them.
  ANTHROPIC_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  GITHUB_TOKEN: z.preprocess(emptyToUndefined, z.string().optional()),
  AI_MODEL_SMART: z.string().default('claude-sonnet-5-5'),
  AI_MODEL_FAST: z.string().default('claude-haiku-5-5'),
  AI_DAILY_LIMIT: z.coerce.number().int().min(0).default(20),
  AI_MONTHLY_BUDGET_USD: z.coerce.number().min(0).default(20),
  APP_ORIGIN: z.preprocess(emptyToUndefined, z.url().optional()),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid server/.env settings:\n${lines.join('\n')}`);
  }
  return parsed.data;
}
