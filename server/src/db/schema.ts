import { sql } from 'drizzle-orm';
import type { Proposals, Problem } from '@beready/shared';
import { boolean, index, integer, jsonb, doublePrecision, uniqueIndex, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

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

const owner = () => text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' });
export const sources = pgTable('sources', {
  id: text('id').primaryKey(), userId: owner(), kind: text('kind').notNull().$type<'typed' | 'pasted' | 'pdf' | 'docx' | 'github' | 'answer'>(),
  label: text('label').notNull(), text: text('text').notNull(), createdAt: time('created_at').notNull(),
}, t => [index('sources_user_idx').on(t.userId)]);
export const imports = pgTable('imports', {
  id: text('id').primaryKey(), userId: owner(), sourceId: text('source_id').notNull().references(() => sources.id),
  status: text('status').notNull().$type<'processing' | 'ready' | 'committed' | 'failed'>(), proposals: jsonb('proposals').$type<Proposals>(),
}, t => [index('imports_user_idx').on(t.userId)]);
export const experiences = pgTable('experiences', {
  id: text('id').primaryKey(), userId: owner(), kind: text('kind').notNull().$type<'work' | 'education' | 'project' | 'volunteer' | 'leadership'>(),
  title: text('title').notNull(), organization: text('organization'), location: text('location'), startDate: text('start_date'), endDate: text('end_date'),
  isCurrent: boolean('is_current').notNull().default(false), url: text('url'), sourceId: text('source_id').notNull().references(() => sources.id), sortOrder: integer('sort_order').notNull().default(0),
}, t => [index('experiences_user_idx').on(t.userId)]);
export const facts = pgTable('facts', {
  id: text('id').primaryKey(), userId: owner(), experienceId: text('experience_id').references(() => experiences.id, {onDelete: 'cascade'}),
  kind: text('kind').notNull().$type<'achievement' | 'responsibility' | 'award' | 'education_detail' | 'language' | 'other'>(), text: text('text').notNull(),
  status: text('status').notNull().$type<'confirmed' | 'needs_confirmation' | 'false'>(), sourceId: text('source_id').notNull().references(() => sources.id),
  confirmedAt: time('confirmed_at'), updatedAt: time('updated_at').notNull(),
}, t => [index('facts_user_idx').on(t.userId)]);
export const skills = pgTable('skills', {
  id: text('id').primaryKey(), userId: owner(), name: text('name').notNull(), category: text('category').notNull().$type<'language' | 'framework' | 'tool' | 'spoken_language' | 'soft' | 'other'>(),
  status: text('status').notNull().$type<'confirmed' | 'needs_confirmation' | 'false'>(),
}, t => [uniqueIndex('skills_user_name_unique').on(t.userId, sql`lower(${t.name})`)]);
export const factSkills = pgTable('fact_skills', {
  userId: owner(), factId: text('fact_id').notNull().references(() => facts.id, {onDelete: 'cascade'}), skillId: text('skill_id').notNull().references(() => skills.id, {onDelete: 'cascade'}),
}, t => [uniqueIndex('fact_skills_unique').on(t.factId, t.skillId), index('fact_skills_user_idx').on(t.userId)]);
export const learningItems = pgTable('learning_items', {
  id: text('id').primaryKey(), userId: owner(), topic: text('topic').notNull(), reason: text('reason').notNull(), jobId: text('job_id'),
  factId: text('fact_id').references(() => facts.id, {onDelete: 'cascade'}), status: text('status').notNull().$type<'todo' | 'learning' | 'done'>(),
}, t => [uniqueIndex('learning_fact_unique').on(t.userId, t.factId)]);
export const tasks = pgTable('tasks', {
  id: text('id').primaryKey(), userId: owner(), type: text('type').notNull().$type<'import_extract' | 'github_import'>(),
  status: text('status').notNull().$type<'queued' | 'running' | 'succeeded' | 'failed'>(),
  input: jsonb('input').notNull().$type<{importId: string; username?: string; repos?: string[]}>(),
  result: jsonb('result').$type<{resource: 'import'; id: string; href: string}>(), error: jsonb('error').$type<Problem>(),
  idempotencyKey: text('idempotency_key'), leaseToken: text('lease_token'), leaseUntil: time('lease_until'), attempts: integer('attempts').notNull().default(0),
  createdAt: time('created_at').notNull(), finishedAt: time('finished_at'),
}, t => [index('tasks_queue_idx').on(t.status, t.leaseUntil), index('tasks_user_idx').on(t.userId, t.createdAt)]);
export const aiUsage = pgTable('ai_usage', {
  id: text('id').primaryKey(), userId: owner(), taskId: text('task_id').notNull().references(() => tasks.id, {onDelete: 'cascade'}),
  model: text('model').notNull(), promptVersion: text('prompt_version').notNull(), inputTokens: integer('input_tokens').notNull(), outputTokens: integer('output_tokens').notNull(),
  estCostUsd: doublePrecision('est_cost_usd').notNull(), createdAt: time('created_at').notNull(),
}, t => [index('usage_user_idx').on(t.userId)]);
