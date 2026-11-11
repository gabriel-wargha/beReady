import { and, eq, sql } from 'drizzle-orm';
import { commitBodySchema, experienceBodySchema } from '@beready/shared';
import type { Db } from '../db/client';
import { experiences, facts, skills, factSkills, imports, sources, users } from '../db/schema';
import { newId } from '../lib/ids';
import { ProblemError } from '../lib/problem';
import { forUser, invalid, parse, scoped } from './factBank';

export async function commitImport(db: Db, userId: string, id: string, raw: unknown) {
  const body = parse(commitBodySchema, raw);
  return db.transaction(async tx => {
    // Serializes commits (including commits from different imports reusing the same skill).
    await tx.select().from(users).where(eq(users.id, userId)).for('update');
    const store = forUser(tx, userId), imp = await store.import(id);
    if (imp.status !== 'ready' || !imp.proposals) throw new ProblemError(409, 'already_exists', 'This import is already committed or is not ready for review.');
    const p = imp.proposals;
    for (const [rows, proposals] of [[body.experiences, p.experiences], [body.facts, p.facts], [body.skills, p.skills]] as const) {
      if (new Set(rows.map(r => r.ref)).size !== rows.length || rows.some(r => !proposals.some(p => p.ref === r.ref))) throw invalid('Commit references must be unique and exist in this import.');
    }
    // Validate dependencies before writing anything; no detached facts from discarded experiences.
    for (const f of body.facts) {
      const proposed = p.facts.find(x => x.ref === f.ref)!;
      if (proposed.experienceRef && !body.experiences.some(e => e.ref === proposed.experienceRef)) throw invalid('Retain the experience for each selected fact.');
    }
    const experienceIds = new Map<string, string>();
    let experienceCount = 0, skillCount = 0;
    for (const chosen of body.experiences) {
      const proposed = p.experiences.find(e => e.ref === chosen.ref)!;
      const {ref, matchesExperienceId, ...fields} = {...proposed, ...chosen};
      if (matchesExperienceId) {await store.experience(matchesExperienceId); experienceIds.set(ref, matchesExperienceId);}
      else {
        const data = parse(experienceBodySchema, fields), experienceId = newId('exp');
        await tx.insert(experiences).values({id: experienceId, userId, sourceId: imp.sourceId, ...data});
        experienceIds.set(ref, experienceId); experienceCount++;
      }
    }
    const skillIds = new Map<string, string>();
    for (const chosen of body.skills) {
      const proposed = p.skills.find(s => s.ref === chosen.ref)!;
      const {ref: _ref, ...data} = {...proposed, ...chosen};
      const [existing] = await tx.select().from(skills).where(and(eq(skills.userId, userId), sql`lower(${skills.name}) = ${data.name.toLowerCase()}`));
      let skillId = existing?.id;
      if (!skillId) {skillId = newId('skl'); await tx.insert(skills).values({id: skillId, userId, ...data}); skillCount++;}
      // Match facts by the original proposed name even if the reviewer renamed the skill.
      skillIds.set(proposed.name.toLowerCase(), skillId);
    }
    for (const chosen of body.facts) {
      const proposed = p.facts.find(f => f.ref === chosen.ref)!;
      const factId = newId('fct');
      await tx.insert(facts).values({id: factId, userId, sourceId: imp.sourceId, experienceId: proposed.experienceRef ? experienceIds.get(proposed.experienceRef)! : null, text: chosen.text ?? proposed.text, kind: chosen.kind ?? proposed.kind, status: chosen.status, confirmedAt: chosen.status === 'confirmed' ? new Date() : null, updatedAt: new Date()});
      const linked = [...new Set(proposed.skillNames.map(n => skillIds.get(n.toLowerCase())).filter((id): id is string => !!id))];
      if (linked.length) await tx.insert(factSkills).values(linked.map(skillId => ({userId, factId, skillId})));
    }
    await tx.update(imports).set({status: 'committed'}).where(scoped(imports, userId, id));
    return {created: {experiences: experienceCount, facts: body.facts.length, skills: skillCount}};
  });
}
export async function importView(db: Db, userId: string, id: string) {
  const imp = await forUser(db, userId).import(id);
  const [source] = await db.select().from(sources).where(scoped(sources, userId, imp.sourceId));
  return {id: imp.id, status: imp.status, source: {id: source!.id, kind: source!.kind, label: source!.label}, proposals: imp.proposals};
}
