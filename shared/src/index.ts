/**
 * Shared contract between client and server.
 * Every request body and response shape is defined once here with Zod,
 * so the two sides cannot drift apart. docs/API.md describes the same shapes in words.
 */
import { z } from 'zod';

// ---------- Users and auth ----------

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Must be a valid email').max(254));

export const passwordSchema = z
  .string()
  .min(10, 'Must be at least 10 characters')
  .max(200, 'Must be at most 200 characters');

export const nameSchema = z.string().trim().min(1, 'Name is required').max(100);

export const signupBodySchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: nameSchema,
});
export type SignupBody = z.infer<typeof signupBodySchema>;

export const loginBodySchema = z.object({
  email: emailSchema,
  // No length rule on login: we never tell an attacker what a valid password looks like.
  password: z.string().min(1, 'Password is required').max(200),
});
export type LoginBody = z.infer<typeof loginBodySchema>;

export const updateMeBodySchema = z
  .object({
    name: nameSchema.optional(),
    currentPassword: z.string().min(1).max(200).optional(),
    newPassword: passwordSchema.optional(),
  })
  .refine((b) => b.name !== undefined || b.newPassword !== undefined, {
    message: 'Send a name, a new password, or both',
    path: ['name'],
  })
  .refine((b) => b.newPassword === undefined || b.currentPassword !== undefined, {
    message: 'Current password is required to set a new one',
    path: ['currentPassword'],
  });
export type UpdateMeBody = z.infer<typeof updateMeBodySchema>;

export const userSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  isDemo: z.boolean(),
  createdAt: z.string(), // ISO 8601
});
export type User = z.infer<typeof userSchema>;

// ---------- Health ----------

export const healthSchema = z.object({
  status: z.literal('ok'),
  database: z.literal('ok'),
  uptimeSeconds: z.number(),
});
export type Health = z.infer<typeof healthSchema>;

// ---------- Errors (RFC 9457 problem details) ----------

export const errorCodes = [
  'validation_failed',
  'not_authenticated',
  'invalid_credentials',
  'bad_origin',
  'not_found',
  'email_taken',
  'already_exists',
  'file_too_large',
  'unsupported_file_type',
  'no_text_found',
  'job_not_analyzed',
  'needs_confirmation',
  'rate_limited',
  'ai_daily_limit',
  'ai_bad_response',
  'github_unavailable',
  'ai_paused',
  'internal_error',
] as const;
export type ErrorCode = (typeof errorCodes)[number];

export const problemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number(),
  code: z.enum(errorCodes),
  detail: z.string().optional(),
  errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  requestId: z.string().optional(),
});
export type Problem = z.infer<typeof problemSchema>;

// ---------- Lists ----------

export const pageSchema = z.object({
  limit: z.number(),
  offset: z.number(),
  total: z.number(),
});
export type Page = z.infer<typeof pageSchema>;

export * from './factBank';
export const taskSchema = z.object({
  id: z.string(), type: z.enum(['import_extract', 'github_import']),
  status: z.enum(['queued', 'running', 'succeeded', 'failed']),
  result: z.object({resource: z.literal('import'), id: z.string(), href: z.string()}).nullable(),
  error: problemSchema.nullable(), createdAt: z.string(), finishedAt: z.string().nullable(),
});
export type Task = z.infer<typeof taskSchema>;
export interface AcceptedTask {taskId: string; status: Task['status']}
export interface Usage {aiActionsToday: number; aiDailyLimit: number; resetsAt: string}
