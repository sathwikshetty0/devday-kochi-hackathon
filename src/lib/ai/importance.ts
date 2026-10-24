export const IMPORTANT_MIN_SCORE = 75;
export const KEEP_MIN_SCORE = 50;

/**
 * Keeps "important" strict no matter what the model says: only parts scoring at least 75 that are
 * also in the top third by score. If nothing qualifies, the single best part (60+) is marked.
 */
export function enforceImportance<T extends { score: number; important: boolean }>(items: T[]): T[] {
  const quota = Math.max(1, Math.ceil(items.length / 3));
  const ranked = items
    .map((item, i) => ({ i, score: item.score }))
    .sort((a, b) => b.score - a.score);
  const allowed = new Set(ranked.slice(0, quota).filter((r) => r.score >= IMPORTANT_MIN_SCORE).map((r) => r.i));
  if (!allowed.size && ranked[0] && ranked[0].score >= 60) allowed.add(ranked[0].i);
  return items.map((item, i) => ({ ...item, important: allowed.has(i) }));
}
