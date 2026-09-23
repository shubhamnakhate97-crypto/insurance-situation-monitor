import { INVESTIGATION_DISCLAIMER, type SanctionsRecord, type SanctionsScreening } from "./types.js";
import { similarity } from "./entity-resolution.js";

export function screenSanctions(
  name: string,
  records: SanctionsRecord[],
  matchThreshold = 0.92,
  possibleThreshold = 0.68,
): SanctionsScreening {
  const ranked = records
    .map((record) => ({
      record,
      score: Math.max(similarity(name, record.primaryName), ...record.aliases.map((alias) => similarity(name, alias))),
    }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  const status = !best || best.score < possibleThreshold ? "CLEAR" : best.score >= matchThreshold ? "MATCH" : "POSSIBLE";
  return {
    status,
    score: best?.score ?? 0,
    evidence:
      status === "CLEAR" || !best
        ? []
        : [{ matchedName: best.record.primaryName, list: best.record.list, program: best.record.program, provenance: best.record.provenance }],
    disclaimer: INVESTIGATION_DISCLAIMER,
  };
}
