import { boolean, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Phase 1 tables. Each later phase adds its own tables in its own migration.
 * All timestamps are stored with a time zone and exposed as Date objects.
 */
const time = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const users = pgTable('users', {
  id: text('id').primaryKey(), // usr_...
  email: text('email').notNull().unique(), // always stored lowercased
  passwordHash: text('password_hash').notNull(), // Argon2id, never the password
  name: text('name').notNull(),
  isDemo: boolean('is_demo').notNull().default(false),
  demoExpiresAt: time('demo_expires_at'),
  createdAt: time('created_at').notNull(),
});

export const sessions = pgTable(
  'sessions',
  {
    // SHA-256 hash of the token in the cookie. The token itself is never stored.
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: time('expires_at').notNull(),
    createdAt: time('created_at').notNull(),
  },
  (t) => [index('sessions_user_id_idx').on(t.userId)],
);

export type UserRow = typeof users.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
