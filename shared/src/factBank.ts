import { z } from 'zod';

export const factStatusSchema = z.enum(['confirmed', 'needs_confirmation', 'false']);
export const experienceKindSchema = z.enum(['work', 'education', 'project', 'volunteer', 'leadership']);
export const factKindSchema = z.enum(['achievement', 'responsibility', 'award', 'education_detail', 'language', 'other']);
export const skillCategorySchema = z.enum(['language', 'framework', 'tool', 'spoken_language', 'soft', 'other']);
const short = z.string().trim().max(200);
const calendar = z.iso.date().nullable();
export const experienceFields = z.object({
  kind: experienceKindSchema,
  title: short.min(1),
  organization: short.nullable().default(null),
  location: short.nullable().default(null),
  startDate: calendar.default(null),
  endDate: calendar.default(null),
  isCurrent: z.boolean().default(false),
  url: z.url().max(2000).nullable().default(null),
  sortOrder: z.number().int().min(0).default(0),
});
export function validDates(b: {startDate?: string | null; endDate?: string | null; isCurrent?: boolean}) {
  return !(b.isCurrent && b.endDate) && !(b.startDate && b.endDate && b.endDate < b.startDate);
}
export const experienceBodySchema = experienceFields.refine(validDates, { message: 'Check the start date, end date and current role', path: ['endDate'] });
export const experiencePatchSchema = experienceFields.partial().refine(b => Object.keys(b).length > 0, 'Send at least one field');
export const factBodySchema = z.object({
  text: z.string().trim().min(1).max(500),
  experienceId: z.string().nullable().default(null),
  kind: factKindSchema.default('other'),
  skillIds: z.array(z.string()).max(50).default([]),
});
export const factPatchSchema = factBodySchema.partial().extend({status: factStatusSchema.optional()}).refine(b => Object.keys(b).length > 0, 'Send at least one field');
export const skillBodySchema = z.object({name: z.string().trim().min(1).max(60), category: skillCategorySchema.default('other'), status: factStatusSchema.default('confirmed')});
export const skillPatchSchema = skillBodySchema.partial().refine(b => Object.keys(b).length > 0, 'Send at least one field');
export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  sort: z.string().optional(),
  q: z.string().max(500).optional(),
  status: factStatusSchema.optional(),
  kind: z.string().optional(),
  category: skillCategorySchema.optional(),
  experienceId: z.string().optional(),
});
const ref = z.string().min(1).max(80);
export const proposalsSchema = z.object({
  experiences: z.array(experienceFields.extend({ref, matchesExperienceId: z.string().nullable().default(null)})).max(100),
  facts: z.array(z.object({ref, experienceRef: ref.nullable(), kind: factKindSchema, text: z.string().trim().min(1).max(500), skillNames: z.array(z.string().min(1).max(60)).max(50), possibleDuplicateOf: z.string().nullable().default(null)})).max(500),
  skills: z.array(z.object({ref, name: z.string().trim().min(1).max(60), category: skillCategorySchema})).max(200),
});
export type Proposals = z.infer<typeof proposalsSchema>;
export const importBodySchema = z.object({text: z.string().trim().min(20).max(50_000), label: short.min(1).default('Pasted text')});
export const githubUsernameSchema = z.string().regex(/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i, 'Invalid GitHub username');
export const githubQuerySchema = z.object({username: githubUsernameSchema, includeForks: z.enum(['true', 'false']).default('false')});
export const githubImportSchema = z.object({username: githubUsernameSchema, repos: z.array(z.string().regex(/^[\w.-]{1,100}$/).refine(n => n !== '.' && n !== '..')).min(1).max(10)});
export const commitBodySchema = z.object({
  experiences: z.array(experienceFields.partial().extend({ref, matchesExperienceId: z.string().nullable().optional()})).max(100),
  facts: z.array(z.object({ref, status: factStatusSchema, text: factBodySchema.shape.text.optional(), kind: factKindSchema.optional()})).max(500),
  skills: z.array(skillBodySchema.partial().extend({ref, status: factStatusSchema})).max(200),
});
export const confirmationBodySchema = z.object({answer: z.enum(['true', 'false', 'learn']), text: factBodySchema.shape.text.optional()});
export const learningStatusSchema = z.enum(['todo', 'learning', 'done']);
export const learningPatchSchema = z.object({status: learningStatusSchema.optional(), topic: z.string().trim().min(1).max(500).optional()}).refine(b => Object.keys(b).length > 0, 'Send at least one field');
export const sourceSchema = z.object({id: z.string(), kind: z.enum(['typed', 'pasted', 'pdf', 'docx', 'github', 'answer']), label: z.string()});
export type Source = z.infer<typeof sourceSchema>;
export const factSchema = factBodySchema.extend({id: z.string(), status: factStatusSchema, source: sourceSchema, confirmedAt: z.string().nullable(), updatedAt: z.string()});
export type Fact = z.infer<typeof factSchema>;
export const experienceSchema = experienceFields.extend({id: z.string(), source: sourceSchema, factCounts: z.object({confirmed: z.number(), needsConfirmation: z.number(), false: z.number()})});
export type Experience = z.infer<typeof experienceSchema>;
export const skillSchema = skillBodySchema.extend({id: z.string(), usedIn: z.array(z.string())});
export type Skill = z.infer<typeof skillSchema>;
export const learningItemSchema = z.object({id: z.string(), topic: z.string(), reason: z.string(), jobId: z.string().nullable(), factId: z.string().nullable(), status: learningStatusSchema, confirmFactId: z.string().optional()});
export type LearningItem = z.infer<typeof learningItemSchema>;
export const importSchema = z.object({id: z.string(), status: z.enum(['processing', 'ready', 'committed', 'failed']), source: sourceSchema, proposals: proposalsSchema.nullable()});
export type Import = z.infer<typeof importSchema>;
export interface List<T> { data: T[]; page: {limit: number; offset: number; total: number} }
export interface GitHubRepo {name: string; description: string | null; language: string | null; stars: number; pushedAt: string | null; url: string}
export interface Confirmation {fact: Fact; experience: Experience | null; sourceSnippet: string; neededByJobIds: string[]; remaining: number}
