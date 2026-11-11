import { and, eq } from 'drizzle-orm';
import { experienceBodySchema, type Experience, type Fact, type Skill, type Source } from '@beready/shared';
import type { z } from 'zod';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { Db } from '../db/client';
import { experiences, facts, skills, factSkills, sources, learningItems, imports, tasks } from '../db/schema';
import { newId } from '../lib/ids';
import { notFound, ProblemError } from '../lib/problem';
import { zodToProblem } from '../middleware/validate';

export const invalid = (detail: string) => new ProblemError(400, 'validation_failed', detail);
export function parse<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw zodToProblem(parsed.error);
  return parsed.data;
}
export const scoped = <T extends {userId: AnyPgColumn; id: AnyPgColumn}>(table: T, userId: string, id: string) => and(eq(table.userId, userId), eq(table.id, id));

/** All reads are user-scoped; parent IDs are resolved here before any write. */
export function forUser(db: Db, userId: string) {
  const load = async () => {
    const [e, f, s, links, src, learning] = await Promise.all([
      db.select().from(experiences).where(eq(experiences.userId, userId)),
      db.select().from(facts).where(eq(facts.userId, userId)),
      db.select().from(skills).where(eq(skills.userId, userId)),
      db.select().from(factSkills).where(eq(factSkills.userId, userId)),
      db.select().from(sources).where(eq(sources.userId, userId)),
      db.select().from(learningItems).where(eq(learningItems.userId, userId)),
    ]);
    const source = (id: string): Source => { const row = src.find(s => s.id === id); if (!row) throw notFound(); return {id: row.id, kind: row.kind, label: row.label}; };
    const toFact = (row: typeof facts.$inferSelect): Fact => ({id: row.id, experienceId: row.experienceId, kind: row.kind, text: row.text, status: row.status, skillIds: links.filter(l => l.factId === row.id).map(l => l.skillId), source: source(row.sourceId), confirmedAt: row.confirmedAt?.toISOString() ?? null, updatedAt: row.updatedAt.toISOString()});
    const toExperience = (row: typeof experiences.$inferSelect): Experience => ({id: row.id, kind: row.kind, title: row.title, organization: row.organization, location: row.location, startDate: row.startDate, endDate: row.endDate, isCurrent: row.isCurrent, url: row.url, sortOrder: row.sortOrder, source: source(row.sourceId), factCounts: {confirmed: f.filter(f => f.experienceId === row.id && f.status === 'confirmed').length, needsConfirmation: f.filter(f => f.experienceId === row.id && f.status === 'needs_confirmation').length, false: f.filter(f => f.experienceId === row.id && f.status === 'false').length}});
    const toSkill = (row: typeof skills.$inferSelect): Skill => ({id: row.id, name: row.name, category: row.category, status: row.status, usedIn: [...new Set(links.filter(l => l.skillId === row.id).flatMap(l => f.filter(f => f.id === l.factId && f.status === 'confirmed' && f.experienceId).map(f => f.experienceId!)))]});
    return {experiences: e.map(toExperience), facts: f.map(toFact), skills: s.map(toSkill), sources: src, learning};
  };
  return {
    load,
    async experience(id: string) {const [r] = await db.select().from(experiences).where(scoped(experiences, userId, id)); if (!r) throw notFound(); return r;},
    async fact(id: string) {const [r] = await db.select().from(facts).where(scoped(facts, userId, id)); if (!r) throw notFound(); return r;},
    async skill(id: string) {const [r] = await db.select().from(skills).where(scoped(skills, userId, id)); if (!r) throw notFound(); return r;},
    async import(id: string) {const [r] = await db.select().from(imports).where(scoped(imports, userId, id)); if (!r) throw notFound(); return r;},
    async task(id: string) {const [r] = await db.select().from(tasks).where(scoped(tasks, userId, id)); if (!r) throw notFound(); return r;},
    async learning(id: string) {const [r] = await db.select().from(learningItems).where(scoped(learningItems, userId, id)); if (!r) throw notFound(); return r;},
    async source(kind: typeof sources.$inferSelect['kind'], label: string, text: string) {
      const row = {id: newId('src'), userId, kind, label, text, createdAt: new Date()};
      await db.insert(sources).values(row); return row;
    },
    async validateLinks(experienceId?: string | null, skillIds: string[] = []) {
      const store = forUser(db, userId);
      if (experienceId) await store.experience(experienceId);
      for (const id of skillIds) await store.skill(id);
    },
    async createExperience(body: z.infer<typeof experienceBodySchema>, sourceId?: string) {
      const src = sourceId ?? (await forUser(db, userId).source('typed', 'Typed by you', body.title)).id;
      const row = {id: newId('exp'), userId, sourceId: src, ...body}; await db.insert(experiences).values(row); return row.id;
    },
  };
}
