/** Jaccard overlap ignores punctuation and repeated words. */
export function wordOverlap(a: string, b: string): number {
  const words = (s: string) => new Set(s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
  const x = words(a), y = words(b);
  const union = new Set([...x, ...y]);
  return union.size ? [...x].filter(w => y.has(w)).length / union.size : 0;
}
export function possibleDuplicate(text: string, existing: {id: string; text: string}[]): string | null {
  return existing.map(f => ({id: f.id, score: wordOverlap(text, f.text)})).filter(f => f.score > .8).sort((a, b) => b.score - a.score)[0]?.id ?? null;
}
