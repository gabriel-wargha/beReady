import type { List } from '@beready/shared';
import { api } from './client';
/** Fetch all pages so filters, grouping and editors do not silently hide older facts. */
export async function all<T>(path: string): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await api<List<T>>('GET', `${path}${path.includes('?') ? '&' : '?'}limit=100&offset=${offset}`);
    rows.push(...page.data); if (rows.length >= page.page.total) return rows;
  }
}
