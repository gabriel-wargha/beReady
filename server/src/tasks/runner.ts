import { and, eq, gt, gte, lt, or, sql } from 'drizzle-orm';
import { proposalsSchema, type Proposals, type Usage } from '@beready/shared';
import type { AiClient } from '../ai/client';
import { EXTRACT_PROMPT, EXTRACT_VERSION } from '../ai/prompts/extract';
import type { Db } from '../db/client';
import { aiUsage, facts, imports, sources, tasks, users } from '../db/schema';
import type { Env } from '../config/env';
import { newId } from '../lib/ids';
import { ProblemError } from '../lib/problem';
import { forUser, invalid, scoped } from '../services/factBank';
import type { GitHubClient } from '../services/github';
import { possibleDuplicate } from '../domain/duplicates';

export const dayStart = () => {const d = new Date(); d.setUTCHours(0,0,0,0); return d;};
export async function usage(db: Db, userId: string, limit: number): Promise<Usage> {
  const [row] = await db.select({n: sql<number>`count(*)::int`}).from(tasks).where(and(eq(tasks.userId, userId), gte(tasks.createdAt, dayStart())));
  return {aiActionsToday: row?.n ?? 0, aiDailyLimit: limit, resetsAt: new Date(dayStart().getTime() + 86_400_000).toISOString()};
}
export async function enqueue(db: Db, env: Env, userId: string, input: {kind: typeof sources.$inferSelect['kind']; label: string; text: string; username?: string; repos?: string[]}, key?: string) {
  if (key && (key.length > 200 || !/^[\x21-\x7e]+$/.test(key))) throw invalid('Idempotency-Key must be 1 to 200 printable characters.');
  return db.transaction(async tx => {
    // One owner lock makes quota reservation and idempotency checks atomic across workers.
    await tx.execute(sql`select id from users where id = ${userId} for update`);
    const type = input.kind === 'github' ? 'github_import' : 'import_extract';
    if (key) {
      const [existing] = await tx.select().from(tasks).where(and(eq(tasks.userId, userId), eq(tasks.type, type), eq(tasks.idempotencyKey, key), gt(tasks.createdAt, new Date(Date.now() - 86_400_000))));
      if (existing) return existing;
    }
    const [user] = await tx.select().from(users).where(eq(users.id, userId));
    const u = await usage(tx, userId, user?.isDemo ? 5 : env.AI_DAILY_LIMIT);
    if (u.aiActionsToday >= u.aiDailyLimit) throw new ProblemError(429, 'ai_daily_limit', 'Your AI actions are used up for today.', undefined, {'Retry-After': String(Math.max(1, Math.ceil((Date.parse(u.resetsAt) - Date.now()) / 1000)))});
    const source = await forUser(tx, userId).source(input.kind, input.label, input.text);
    const importId = newId('imp');
    await tx.insert(imports).values({id: importId, userId, sourceId: source.id, status: 'processing'});
    const [task] = await tx.insert(tasks).values({id: newId('tsk'), userId, type, status: 'queued', input: {importId, username: input.username, repos: input.repos}, createdAt: new Date(), idempotencyKey: key ?? null}).returning();
    return task!;
  });
}

export function validateProposals(p: Proposals): Proposals {
  for (const list of [p.experiences, p.facts, p.skills]) if (new Set(list.map(x => x.ref)).size !== list.length) throw new Error('Duplicate refs');
  const refs = new Set(p.experiences.map(e => e.ref));
  const names = new Set(p.skills.map(s => s.name.toLowerCase()));
  for (const e of p.experiences) {
    if ((e.isCurrent && e.endDate) || (e.startDate && e.endDate && e.startDate > e.endDate)) throw new Error('Invalid dates');
  }
  for (const f of p.facts) {
    if (f.experienceRef && !refs.has(f.experienceRef)) throw new Error('Unknown experience ref');
    if (f.skillNames.some(n => !names.has(n.toLowerCase()))) throw new Error('Unknown skill');
  }
  return p;
}
export function createTaskRunner(db: Db, env: Env, ai: AiClient, github: GitHubClient) {
  async function runOne(): Promise<boolean> {
    // SKIP LOCKED plus a lease permits multiple workers and restart recovery. No in-memory queue.
    const claimed = await db.transaction(async tx => {
      const [candidate] = await tx.select().from(tasks).where(or(eq(tasks.status, 'queued'), and(eq(tasks.status, 'running'), lt(tasks.leaseUntil, new Date())))).orderBy(tasks.createdAt).limit(1).for('update', {skipLocked: true});
      if (!candidate) return null;
      const [row] = await tx.update(tasks).set({status: 'running', leaseToken: newId('tsk'), leaseUntil: new Date(Date.now() + 300_000), attempts: candidate.attempts + 1}).where(eq(tasks.id, candidate.id)).returning();
      return row!;
    });
    if (!claimed) return false;
    const task = claimed, userId = task.userId;
    const lease = () => and(eq(tasks.id, task.id), eq(tasks.leaseToken, task.leaseToken!));
    try {
      if (task.attempts > 3) throw new ProblemError(502, 'ai_bad_response', 'This import could not finish after restarting. Please try a new import.');
      const imp = await forUser(db, userId).import(task.input.importId);
      const [source] = await db.select().from(sources).where(scoped(sources, userId, imp.sourceId));
      let text = source!.text;
      if (task.type === 'github_import') {
        const projects = [];
        for (const name of task.input.repos ?? []) projects.push(await github.project(task.input.username!, name));
        text = JSON.stringify(projects);
        await db.update(sources).set({text}).where(scoped(sources, userId, imp.sourceId));
      }
      let proposals: Proposals | undefined;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const answer = await ai.send({model: env.AI_MODEL_FAST, system: EXTRACT_PROMPT + (attempt ? '\nThe previous response failed validation. Check references, dates and the schema carefully.' : ''), text, schema: proposalsSchema});
          // Record tokens even when the response refuses, truncates or fails schema validation.
          await db.insert(aiUsage).values({id: newId('use'), userId, taskId: task.id, model: answer.model, promptVersion: EXTRACT_VERSION, inputTokens: answer.inputTokens, outputTokens: answer.outputTokens, estCostUsd: (answer.inputTokens * env.AI_FAST_INPUT_USD_PER_MILLION + answer.outputTokens * env.AI_FAST_OUTPUT_USD_PER_MILLION) / 1_000_000, createdAt: new Date()});
          if (!answer.complete) throw new Error('Incomplete response');
          proposals = validateProposals(proposalsSchema.parse(answer.data));
          if (task.type === 'github_import' && (proposals.experiences.length !== task.input.repos!.length || proposals.experiences.some(e => e.kind !== 'project' || proposals!.facts.filter(f => f.experienceRef === e.ref).length < 2 || proposals!.facts.filter(f => f.experienceRef === e.ref).length > 4))) throw new Error('Expected one project and 2–4 facts per repository');
          break;
        } catch {if (attempt === 1) throw new ProblemError(502, 'ai_bad_response', 'The AI could not extract valid proposals. Please try again or enter facts by hand.');}
      }
      const existing = await db.select({id: facts.id, text: facts.text}).from(facts).where(eq(facts.userId, userId));
      // Never trust model-provided database IDs.
      for (const e of proposals!.experiences) e.matchesExperienceId = null;
      for (const f of proposals!.facts) f.possibleDuplicateOf = possibleDuplicate(f.text, existing);
      await db.transaction(async tx => {
        const updated = await tx.update(tasks).set({status: 'succeeded', result: {resource: 'import', id: imp.id, href: `/api/v1/imports/${imp.id}`}, error: null, finishedAt: new Date(), leaseUntil: null}).where(lease()).returning();
        if (updated.length) await tx.update(imports).set({status: 'ready', proposals}).where(scoped(imports, userId, imp.id));
      });
    } catch (err) {
      const error = err instanceof ProblemError ? err : new ProblemError(500, 'internal_error', 'Import failed. Please try again.');
      await db.transaction(async tx => {
        const updated = await tx.update(tasks).set({status: 'failed', error: error.toJSON(), result: null, finishedAt: new Date(), leaseUntil: null}).where(lease()).returning();
        if (updated.length) await tx.update(imports).set({status: 'failed'}).where(scoped(imports, userId, task.input.importId));
      });
    }
    return true;
  }
  function start(onError: (error: unknown) => void) {
    let stopped = false, timer: ReturnType<typeof setTimeout> | undefined;
    let active: Promise<void> = Promise.resolve();
    const tick = () => {
      active = (async () => {try {await runOne();} catch (error) {onError(error);} finally {if (!stopped) timer = setTimeout(tick, 1000);}})();
    };
    tick();
    return async () => {stopped = true; clearTimeout(timer); await active;};
  }
  return {runOne, start};
}
