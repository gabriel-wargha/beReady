import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeApp, signUp, type TestContext, validUser } from './helpers';
import { FakeAiClient } from '../src/ai/fake';
import { createTaskRunner } from '../src/tasks/runner';
import { loadEnv } from '../src/config/env';
import { GitHubClient } from '../src/services/github';
import { imports, sources } from '../src/db/schema';

let ctx: TestContext, cookie: string;
const base = '/api/v1';
beforeEach(async () => {ctx = await makeApp(); ({cookie} = await signUp(ctx.app));});
const post = (path: string, body: unknown) => request(ctx.app).post(base + path).set('Cookie',cookie).send(body);
const patch = (path: string, body: unknown) => request(ctx.app).patch(base + path).set('Cookie',cookie).send(body);
const get = (path: string) => request(ctx.app).get(base + path).set('Cookie',cookie);
async function fixtureImport() {
  const task = await post('/imports',{text: 'Alex Rivera worked at Example College and used Excel.'});
  const worker = createTaskRunner(ctx.db,loadEnv({NODE_ENV:'test'}),await FakeAiClient.fromFixture(),new GitHubClient());
  await worker.runOne();
  const status = await get(`/tasks/${task.body.taskId}`);
  expect(status.body.status).toBe('succeeded');
  return (await get(`/imports/${status.body.result.id}`)).body;
}

describe('manual fact bank', () => {
  it('creates typed confirmed facts, links skill evidence and cascades experience deletion', async () => {
    const exp = await post('/experiences',{kind:'work',title:'Help desk'});
    const skill = await post('/skills',{name:'Excel'});
    const fact = await post('/facts',{text:'Resolved 120 student support requests', experienceId:exp.body.id, skillIds:[skill.body.id]});
    expect(fact.status).toBe(201); expect(fact.body).toMatchObject({status:'confirmed',source:{kind:'typed'}});
    expect(fact.body.confirmedAt).toBeTruthy();
    expect((await get('/skills')).body.data[0].usedIn).toEqual([exp.body.id]);
    expect((await get(`/experiences/${exp.body.id}`)).body.facts).toHaveLength(1);
    await patch(`/facts/${fact.body.id}`,{text:'Resolved 130 student support requests'});
    expect((await get('/facts?q=130&status=confirmed')).body.page.total).toBe(1);
    await request(ctx.app).delete(`${base}/experiences/${exp.body.id}`).set('Cookie',cookie).expect(204);
    expect((await get('/facts')).body.page.total).toBe(0);
    expect((await get('/skills')).body.data[0].usedIn).toEqual([]);
  });
  it('validates merged date patches, enum filters, pagination and skill uniqueness', async () => {
    expect((await post('/experiences',{kind:'work',title:'Invalid',startDate:'2026-04-01',endDate:'2026-01-01'})).status).toBe(400);
    const exp = await post('/experiences',{kind:'work',title:'Valid',startDate:'2026-01-01',endDate:'2026-04-01'});
    expect((await patch(`/experiences/${exp.body.id}`,{isCurrent:true})).status).toBe(400);
    expect((await patch(`/experiences/${exp.body.id}`,{isCurrent:true,endDate:null})).status).toBe(200);
    await post('/skills',{name:'Excel'});
    expect((await post('/skills',{name:' excel '})).status).toBe(409);
    expect((await get('/facts?status=imaginary')).status).toBe(400);
    expect((await get('/facts?limit=-1')).status).toBe(400);
    expect((await get('/facts?sort=userId')).status).toBe(400);
    await post('/facts',{text:'Alpha'}); await post('/facts',{text:'Beta'});
    const page = await get('/facts?limit=1&offset=1&sort=text');
    expect(page.body.page).toEqual({limit:1,offset:1,total:2}); expect(page.body.data[0].text).toBe('Beta');
  });
});

describe('review and confirmation', () => {
  it('starts every extracted item as a proposal and commits chosen statuses with provenance', async () => {
    const imp = await fixtureImport();
    expect((await get('/facts')).body.data).toEqual([]);
    expect(imp.proposals.facts[0].experienceRef).toBe('e1');
    const commit = await post(`/imports/${imp.id}/commit`,{experiences:[{ref:'e1'}],facts:[{ref:'f1',status:'confirmed'},{ref:'f2',status:'needs_confirmation',text:'Maintained help desk schedule'}],skills:[{ref:'s1',status:'confirmed'}]});
    expect(commit.status).toBe(201); expect(commit.body.created).toEqual({experiences:1,facts:2,skills:1});
    const rows = (await get('/facts')).body.data;
    expect(rows.every((f: {source: {id: string}}) => f.source.id === imp.source.id)).toBe(true);
    expect(rows.map((f: {status: string}) => f.status).sort()).toEqual(['confirmed','needs_confirmation']);
    expect((await post(`/imports/${imp.id}/commit`,{experiences:[],facts:[],skills:[]})).status).toBe(409);
  });
  it('rejects bad refs and detached facts atomically and does not link discarded skills', async () => {
    const imp = await fixtureImport();
    for (const body of [{experiences:[{ref:'bad'}],facts:[],skills:[]},{experiences:[],facts:[{ref:'f1',status:'confirmed'}],skills:[]}]) {
      expect((await post(`/imports/${imp.id}/commit`,body)).status).toBe(400);
      expect((await get('/experiences')).body.data).toEqual([]);
    }
    expect((await post(`/imports/${imp.id}/commit`,{experiences:[{ref:'e1'}],facts:[{ref:'f1',status:'needs_confirmation'}],skills:[]})).status).toBe(201);
    expect((await get('/facts')).body.data[0].skillIds).toEqual([]);
  });
  it('learn defers a fact, done asks for confirmation, true confirms and false blocks it', async () => {
    const imp = await fixtureImport();
    await post(`/imports/${imp.id}/commit`,{experiences:[{ref:'e1'}],facts:[{ref:'f1',status:'needs_confirmation'}],skills:[{ref:'s1',status:'needs_confirmation'}]});
    const next = await get('/confirmations/next');
    expect(next.body.sourceSnippet).toContain('Alex Rivera');
    const id = next.body.fact.id;
    const learn = await post(`/confirmations/${id}`,{answer:'learn'});
    expect(learn.body.fact.status).toBe('needs_confirmation');
    expect(learn.body.learningItem.status).toBe('todo');
    expect((await get('/confirmations/next')).status).toBe(204);
    expect((await get('/skills')).body.data[0].usedIn).toEqual([]);
    const done = await patch(`/learning-items/${learn.body.learningItem.id}`,{status:'done'});
    expect(done.body.confirmFactId).toBe(id);
    expect((await get('/confirmations/next')).body.fact.id).toBe(id);
    const yes = await post(`/confirmations/${id}`,{answer:'true',text:'Resolved 120 support requests'});
    expect(yes.body.fact).toMatchObject({text:'Resolved 120 support requests',status:'confirmed'});
    expect((await get('/skills')).body.data[0].usedIn).toHaveLength(1);
    const no = await post(`/confirmations/${id}`,{answer:'false'});
    expect(no.body.fact.status).toBe('false'); expect(no.body.fact.confirmedAt).toBeNull();
    expect((await get('/confirmations/next')).status).toBe(204);
  });
  it('erases source text without deleting source metadata or fact text', async () => {
    const imp = await fixtureImport();
    await request(ctx.app).delete(`${base}/sources/${imp.source.id}`).set('Cookie',cookie).expect(204);
    const [row] = await ctx.db.select().from(sources).where(eq(sources.id,imp.source.id));
    expect(row!.text).toBe(''); expect((await get(`/imports/${imp.id}`)).body.source.label).toBe('Pasted text');
  });
});

describe('ownership for every Phase 2 resource', () => {
  it('returns 404 for another account on all resource reads, mutations and foreign links', async () => {
    const exp = (await post('/experiences',{kind:'work',title:'Private role'})).body;
    const skill = (await post('/skills',{name:'Private skill'})).body;
    const fact = (await post('/facts',{text:'Private achievement',experienceId:exp.id})).body;
    const task = (await post('/imports',{text:'Private text to extract for this account'})).body;
    const [imp] = await ctx.db.select().from(imports);
    const learn = (await post(`/confirmations/${fact.id}`,{answer:'learn'})).body.learningItem;
    const {cookie: other} = await signUp(ctx.app,{...validUser,email:'blake@example.com'});
    async function denied(method: 'get' | 'post' | 'patch' | 'delete', path: string, body?: unknown) {
      const response = await request(ctx.app)[method](base + path).set('Cookie',other).send(body);
      expect(response.status, `${method} ${path}: ${JSON.stringify(response.body)}`).toBe(404);
    }
    await denied('get',`/experiences/${exp.id}`); await denied('patch',`/experiences/${exp.id}`,{title:'Hacked'}); await denied('delete',`/experiences/${exp.id}`);
    await denied('patch',`/facts/${fact.id}`,{status:'confirmed'}); await denied('delete',`/facts/${fact.id}`);
    await denied('patch',`/skills/${skill.id}`,{name:'Hacked'}); await denied('delete',`/skills/${skill.id}`);
    await denied('get',`/imports/${imp!.id}`); await denied('post',`/imports/${imp!.id}/commit`,{experiences:[],facts:[],skills:[]});
    await denied('get',`/tasks/${task.taskId}`); await denied('post',`/confirmations/${fact.id}`,{answer:'true'});
    await denied('patch',`/learning-items/${learn.id}`,{status:'done'}); await denied('delete',`/learning-items/${learn.id}`);
    await denied('delete',`/sources/${fact.source.id}`);
    await denied('post','/facts',{text:'Foreign exp',experienceId:exp.id}); await denied('post','/facts',{text:'Foreign skill',skillIds:[skill.id]});
    for (const path of ['/facts','/skills','/experiences','/learning-items']) {
      const list = await request(ctx.app).get(base+path).set('Cookie',other); expect(list.body.data).toEqual([]);
    }
    expect((await request(ctx.app).get(`${base}/confirmations/next`).set('Cookie',other)).status).toBe(204);
  });
});
