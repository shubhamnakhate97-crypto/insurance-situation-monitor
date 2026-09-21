import type { Fact, Provenance, SituationEvent } from "./types";

export function fact<T>(value: T, provenance: Provenance): Fact<T> {
  if (!provenance.sourceName || !provenance.sourceUrl || !provenance.fetchedAt) {
    throw new Error("Every fact requires sourceName, sourceUrl and fetchedAt");
  }
  return { value, provenance };
}

export function assertEventProvenance(event: SituationEvent): void {
  const facts = [event.title, event.observedAt, event.severity, event.summary];
  if (event.position) facts.push(event.position as never);
  if (event.footprint) facts.push(event.footprint as never);
  for (const item of facts) {
    fact(item.value, item.provenance);
  }
}
