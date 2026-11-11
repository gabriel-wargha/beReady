import { z } from 'zod';
import type { GitHubRepo } from '@beready/shared';
import { notFound, ProblemError } from '../lib/problem';
const repoSchema = z.object({name: z.string(), description: z.string().nullable(), language: z.string().nullable(), stargazers_count: z.number(), pushed_at: z.string().nullable(), html_url: z.url(), fork: z.boolean(), private: z.boolean(), topics: z.array(z.string()).optional()});
export class GitHubClient {
  private cache = new Map<string, {until: number; value: unknown}>();
  constructor(private token?: string, private fetcher: typeof fetch = fetch) {}
  private async get(path: string, optional = false): Promise<unknown> {
    const cached = this.cache.get(path); if (cached && cached.until > Date.now()) return cached.value;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await this.fetcher(`https://api.github.com${path}`, {headers: {Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(this.token ? {Authorization: `Bearer ${this.token}`} : {})}, signal: AbortSignal.timeout(15_000)});
        if (res.status === 404) {if (optional) return null; throw notFound('GitHub user or public repository was not found.');}
        if (!res.ok) throw new Error('GitHub unavailable');
        const value: unknown = await res.json();
        if (this.cache.size >= 200) this.cache.delete(this.cache.keys().next().value!);
        this.cache.set(path, {value, until: Date.now() + 600_000}); return value;
      } catch (err) {if (err instanceof ProblemError) throw err; if (attempt === 1) throw new ProblemError(502, 'github_unavailable', 'GitHub is unavailable or rate limited. Try again later.');}
    }
    throw new ProblemError(502, 'github_unavailable');
  }
  async repos(username: string, includeForks = false): Promise<GitHubRepo[]> {
    const rows: z.infer<typeof repoSchema>[] = [];
    // Explicit bounded pagination; results expose whether the UI reached the cap in its copy.
    for (let page = 1; page <= 10; page++) {
      const parsed = z.array(repoSchema).safeParse(await this.get(`/users/${encodeURIComponent(username)}/repos?sort=pushed&direction=desc&per_page=100&page=${page}`));
      if (!parsed.success) throw new ProblemError(502, 'github_unavailable');
      rows.push(...parsed.data); if (parsed.data.length < 100) break;
    }
    return rows.filter(r => !r.private && (includeForks || !r.fork)).sort((a, b) => (b.pushed_at ?? '').localeCompare(a.pushed_at ?? '')).map(r => ({name: r.name, description: r.description, language: r.language, stars: r.stargazers_count, pushedAt: r.pushed_at, url: r.html_url}));
  }
  async project(username: string, name: string) {
    const path = `/repos/${encodeURIComponent(username)}/${encodeURIComponent(name)}`;
    const parsed = repoSchema.safeParse(await this.get(path));
    if (!parsed.success) throw new ProblemError(502, 'github_unavailable');
    if (parsed.data.private) throw notFound();
    const [langs, readme] = await Promise.all([this.get(`${path}/languages`), this.get(`${path}/readme`, true)]);
    const languages = z.record(z.string(), z.number()).safeParse(langs);
    const content = z.object({content: z.string(), encoding: z.literal('base64')}).safeParse(readme);
    return {name, description: parsed.data.description, topics: parsed.data.topics ?? [], pushedAt: parsed.data.pushed_at, url: parsed.data.html_url, languages: languages.success ? Object.keys(languages.data) : [], readme: content.success ? Buffer.from(content.data.content, 'base64').toString('utf8').slice(0, 12_000) : ''};
  }
}
