import { Router } from 'express';
import { and, eq, sql } from 'drizzle-orm';
import { experienceBodySchema, experiencePatchSchema, factBodySchema, factPatchSchema, skillBodySchema, skillPatchSchema, listQuerySchema, confirmationBodySchema, learningPatchSchema, learningStatusSchema } from '@beready/shared';
import type { Db } from '../db/client';
import { experiences, facts, skills, factSkills, learningItems, sources, tasks } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { forUser, invalid, parse, scoped } from '../services/factBank';
import { newId } from '../lib/ids';
import { notFound, ProblemError } from '../lib/problem';

export function factBankRoutes(db: Db, secureCookies: boolean) {
  const r = Router();
  r.use(['/experiences', '/facts', '/skills', '/confirmations', '/learning-items', '/sources'], requireAuth(db, secureCookies));
  for (const kind of ['experiences', 'facts', 'skills'] as const) {
    r.get(`/${kind}`, async (req, res) => {
      const q = parse(listQuerySchema, req.query);
      const sorts = kind === 'experiences' ? ['sortOrder', '-sortOrder', 'title', '-title'] : kind === 'facts' ? ['updatedAt', '-updatedAt', 'text', '-text'] : ['name', '-name'];
      if (q.sort && !sorts.includes(q.sort)) throw invalid('Unsupported sort field');
      if (q.kind && !(kind === 'experiences' ? ['work', 'education', 'project', 'volunteer', 'leadership'] : ['achievement', 'responsibility', 'award', 'education_detail', 'language', 'other']).includes(q.kind)) throw invalid('Invalid kind');
      const data = await forUser(db, req.user!.id).load();
      const rows = data[kind].filter(row => {
        if (q.status && 'status' in row && row.status !== q.status) return false;
        if (q.kind && 'kind' in row && row.kind !== q.kind) return false;
        if (q.category && 'category' in row && row.category !== q.category) return false;
        if (q.experienceId && 'experienceId' in row && row.experienceId !== q.experienceId) return false;
        if (q.q && 'text' in row && !row.text.toLowerCase().includes(q.q.toLowerCase())) return false;
        return true;
      });
      const sort = q.sort ?? (kind === 'experiences' ? 'sortOrder' : kind === 'facts' ? '-updatedAt' : 'name');
      const field = sort.replace(/^-/, '');
      rows.sort((a, b) => {
        const x = (a as unknown as Record<string, unknown>)[field], y = (b as unknown as Record<string, unknown>)[field];
        const order = typeof x === 'number' && typeof y === 'number' ? x-y : String(x).localeCompare(String(y));
        return (sort.startsWith('-') ? -order : order) || a.id.localeCompare(b.id);
      });
      res.json({data: rows.slice(q.offset, q.offset + q.limit), page: {limit: q.limit, offset: q.offset, total: rows.length}});
    });
  }
  r.get('/experiences/:id', async (req, res) => {
    const store = forUser(db, req.user!.id); await store.experience(String(req.params.id));
    const data = await store.load(); res.json({...data.experiences.find(e => e.id === req.params.id), facts: data.facts.filter(f => f.experienceId === req.params.id)});
  });
  r.post('/experiences', async (req, res) => {
    const store = forUser(db, req.user!.id); const id = await store.createExperience(parse(experienceBodySchema, req.body));
    res.status(201).location(`/api/v1/experiences/${id}`).json((await store.load()).experiences.find(e => e.id === id));
  });
  r.patch('/experiences/:id', async (req, res) => {
    const userId = req.user!.id, id = String(req.params.id), store = forUser(db, userId);
    const before = await store.experience(id); const changes = parse(experiencePatchSchema, req.body);
    const merged = parse(experienceBodySchema, {...before, ...changes});
    await db.update(experiences).set(merged).where(scoped(experiences, userId, id));
    res.json((await store.load()).experiences.find(e => e.id === id));
  });
  r.post('/facts', async (req, res) => {
    const userId = req.user!.id, body = parse(factBodySchema, req.body);
    const id = await db.transaction(async tx => {
      const store = forUser(tx, userId); await store.validateLinks(body.experienceId, body.skillIds);
      const source = await store.source('typed', 'Typed by you', body.text), id = newId('fct'), now = new Date();
      const {skillIds, ...fields} = body;
      await tx.insert(facts).values({id, userId, sourceId: source.id, ...fields, status: 'confirmed', confirmedAt: now, updatedAt: now});
      if (skillIds.length) await tx.insert(factSkills).values([...new Set(skillIds)].map(skillId => ({userId, factId: id, skillId})));
      return id;
    });
    res.status(201).location(`/api/v1/facts/${id}`).json((await forUser(db, userId).load()).facts.find(f => f.id === id));
  });
  r.patch('/facts/:id', async (req, res) => {
    const userId = req.user!.id, id = String(req.params.id), body = parse(factPatchSchema, req.body);
    await db.transaction(async tx => {
      const store = forUser(tx, userId), before = await store.fact(id);
      await store.validateLinks(body.experienceId, body.skillIds);
      const {skillIds, ...changes} = body, status = body.status ?? before.status;
      await tx.update(facts).set({...changes, updatedAt: new Date(), confirmedAt: status === 'confirmed' ? (before.confirmedAt ?? new Date()) : null}).where(scoped(facts, userId, id));
      if (skillIds) {
        await tx.delete(factSkills).where(and(eq(factSkills.userId, userId), eq(factSkills.factId, id)));
        if (skillIds.length) await tx.insert(factSkills).values([...new Set(skillIds)].map(skillId => ({userId, factId: id, skillId})));
      }
    });
    res.json((await forUser(db, userId).load()).facts.find(f => f.id === id));
  });
  const saveSkill = async (userId: string, raw: unknown, id?: string) => {
    const store = forUser(db, userId);
    if (id) await store.skill(id);
    const body = id ? parse(skillPatchSchema, raw) : parse(skillBodySchema, raw);
    try {
      if (id) await db.update(skills).set(body).where(scoped(skills, userId, id));
      else {id = newId('skl'); await db.insert(skills).values({id, userId, ...parse(skillBodySchema, body)});}
    } catch (err) {
      if ((err as {cause?: {code?: string}}).cause?.code === '23505' || (err as {code?: string}).code === '23505') throw new ProblemError(409, 'already_exists', 'You already have a skill with this name.');
      throw err;
    }
    return (await store.load()).skills.find(s => s.id === id);
  };
  r.post('/skills', async (req, res) => {const row = await saveSkill(req.user!.id, req.body); res.status(201).location(`/api/v1/skills/${row!.id}`).json(row);});
  r.patch('/skills/:id', async (req, res) => res.json(await saveSkill(req.user!.id, req.body, String(req.params.id))));
  for (const [path, table] of [['experiences', experiences], ['facts', facts], ['skills', skills], ['learning-items', learningItems]] as const) {
    r.delete(`/${path}/:id`, async (req, res) => {
      const deleted = await db.delete(table).where(and(eq(table.userId, req.user!.id), eq(table.id, String(req.params.id)))).returning({id: table.id});
      if (!deleted.length) throw notFound(); res.status(204).end();
    });
  }
  r.get('/confirmations/next', async (req, res) => {
    const data = await forUser(db, req.user!.id).load();
    const waiting = data.facts.filter(f => f.status === 'needs_confirmation' && !data.learning.some(l => l.factId === f.id && l.status !== 'done')).sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
    const fact = waiting[0]; if (!fact) {res.status(204).end(); return;}
    const text = data.sources.find(s => s.id === fact.source.id)?.text ?? '';
    const index = text.toLowerCase().indexOf(fact.text.toLowerCase());
    res.json({fact, experience: data.experiences.find(e => e.id === fact.experienceId) ?? null, sourceSnippet: text.slice(Math.max(0, index - 80), Math.max(0, index - 80) + 600), neededByJobIds: [], remaining: waiting.length});
  });
  r.post('/confirmations/:factId', async (req, res) => {
    const userId = req.user!.id, id = String(req.params.factId), body = parse(confirmationBodySchema, req.body);
    const item = await db.transaction(async tx => {
      const before = await forUser(tx, userId).fact(id);
      const status = body.answer === 'true' ? 'confirmed' : body.answer === 'false' ? 'false' : 'needs_confirmation';
      await tx.update(facts).set({text: body.text ?? before.text, status, confirmedAt: status === 'confirmed' ? new Date() : null, updatedAt: new Date()}).where(scoped(facts, userId, id));
      if (body.answer !== 'learn') return null;
      const row = {id: newId('lrn'), userId, topic: body.text ?? before.text, reason: 'You chose to learn this before confirming it.', status: 'todo' as const, factId: id, jobId: null};
      const [saved] = await tx.insert(learningItems).values(row).onConflictDoUpdate({target: [learningItems.userId, learningItems.factId], set: {status: 'todo', topic: row.topic}}).returning();
      return saved;
    });
    res.json({fact: (await forUser(db, userId).load()).facts.find(f => f.id === id), learningItem: item ? learningView(item) : null});
  });
  r.get('/learning-items', async (req, res) => {
    const status = req.query.status === undefined ? undefined : parse(learningStatusSchema, req.query.status);
    const q = parse(listQuerySchema.omit({status: true}), req.query);
    const rows = (await forUser(db, req.user!.id).load()).learning.filter(l => !status || l.status === status);
    res.json({data: rows.slice(q.offset, q.offset + q.limit).map(learningView), page: {limit: q.limit, offset: q.offset, total: rows.length}});
  });
  r.patch('/learning-items/:id', async (req, res) => {
    const userId = req.user!.id, id = String(req.params.id), body = parse(learningPatchSchema, req.body);
    await forUser(db, userId).learning(id);
    const [row] = await db.update(learningItems).set(body).where(scoped(learningItems, userId, id)).returning();
    res.json({...learningView(row!), ...(body.status === 'done' && row!.factId ? {confirmFactId: row!.factId} : {})});
  });
  r.delete('/sources/:id', async (req, res) => {
    const userId = req.user!.id, id = String(req.params.id);
    await db.transaction(async tx => {
      // Locking the owner also serializes this with starting AI work.
      await tx.execute(sql`select id from users where id = ${userId} for update`);
      const pending = await tx.select().from(tasks).where(eq(tasks.userId, userId));
      for (const task of pending.filter(t => t.status === 'queued' || t.status === 'running')) {
        const imp = await forUser(tx, userId).import(task.input.importId);
        if (imp.sourceId === id) throw new ProblemError(409, 'already_exists', 'Wait for this import to finish before erasing its source text.');
      }
      const rows = await tx.update(sources).set({text: ''}).where(scoped(sources, userId, id)).returning();
      if (!rows.length) throw notFound();
    });
    res.status(204).end();
  });
  return r;
}
function learningView(row: typeof learningItems.$inferSelect) {
  return {id: row.id, topic: row.topic, reason: row.reason, jobId: row.jobId, factId: row.factId, status: row.status};
}
