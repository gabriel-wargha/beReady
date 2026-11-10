import { defineConfig } from 'drizzle-kit';

// Only used to generate SQL migrations from schema.ts. It does not need a database connection.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
});
