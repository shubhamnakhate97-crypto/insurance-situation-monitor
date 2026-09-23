import type { EntityCandidate, ResolutionResult, ReviewQueueItem } from "./types.js";

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

function bigrams(value: string): Set<string> {
  const normalized = normalize(value);
  return new Set(Array.from({ length: Math.max(0, normalized.length - 1) }, (_, i) => normalized.slice(i, i + 2)));
}

export function similarity(left: string, right: string): number {
  if (normalize(left) === normalize(right)) return 1;
  const a = bigrams(left);
  const b = bigrams(right);
  if (!a.size || !b.size) return 0;
  const overlap = [...a].filter((token) => b.has(token)).length;
  return (2 * overlap) / (a.size + b.size);
}

export function resolveEntity(
  query: string,
  entities: Omit<EntityCandidate, "score">[],
  threshold = 0.9,
): ResolutionResult {
  const candidates = entities
    .map((entity) => ({
      ...entity,
      score: Math.max(similarity(query, entity.canonicalName), ...entity.aliases.map((alias) => similarity(query, alias))),
    }))
    .filter((candidate) => candidate.score >= 0.25)
    .sort((a, b) => b.score - a.score);
  if (!candidates.length) return { query, candidates, resolution: "NO_MATCH" };
  const best = candidates[0];
  const ambiguous = candidates[1] && best.score - candidates[1].score < 0.05;
  if (best.score >= threshold && !ambiguous) {
    return { query, candidates, resolution: "AUTO_RESOLVED", resolved: best };
  }
  return { query, candidates, resolution: "REVIEW_REQUIRED" };
}

export function toReviewQueue(result: ResolutionResult, now = new Date().toISOString()): ReviewQueueItem | undefined {
  if (result.resolution !== "REVIEW_REQUIRED") return undefined;
  return {
    id: `review-${normalize(result.query)}-${now.slice(0, 10)}`,
    query: result.query,
    candidates: result.candidates,
    reason: "Top candidate is below the auto-resolution threshold or too close to another candidate.",
    createdAt: now,
  };
}
