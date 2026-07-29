// lib/duplicates/similarity.ts
// String similarity for the duplicate-records scanner (see
// app/api/duplicates/scan/route.ts). Dice's coefficient over character
// bigrams -- the same metric Postgres's pg_trgm `similarity()` is built on
// (trigrams there, bigrams here; close enough to keep tuned thresholds in
// the same ballpark as the RPCs this replaces), with no extra dependency.

export function normalize(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function bigramCounts(s: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const gram = s.slice(i, i + 2);
    counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }
  return counts;
}

// 0..1, higher = more similar. Exact (normalized) match short-circuits to 1
// so single-character/short fields (too short to have any bigrams) still
// compare sensibly instead of always scoring 0.
export function similarity(a: unknown, b: unknown): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const countsA = bigramCounts(na);
  const countsB = bigramCounts(nb);
  const totalA = na.length - 1;
  const totalB = nb.length - 1;
  if (totalA <= 0 || totalB <= 0) return 0;

  let overlap = 0;
  for (const [gram, countA] of countsA) {
    const countB = countsB.get(gram);
    if (countB) overlap += Math.min(countA, countB);
  }
  return (2 * overlap) / (totalA + totalB);
}
