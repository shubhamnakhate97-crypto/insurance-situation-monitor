export const INVESTIGATION_DISCLAIMER =
  "Indicator for investigation only — not for underwriting, pricing, or reserving decisions.";

export interface Provenance {
  sourceName: string;
  sourceUrl: string;
  fetchedAt: string;
  licenseNote?: string;
}

export interface Fact<T> {
  value: T;
  provenance: Provenance;
}

export interface Position {
  lat: number;
  lon: number;
}

export type EventKind =
  | "cyclone"
  | "earthquake"
  | "flood"
  | "wildfire"
  | "conflict"
  | "cyber"
  | "sanctions";

export interface SituationEvent {
  id: string;
  kind: EventKind;
  title: Fact<string>;
  observedAt: Fact<string>;
  severity: Fact<number>;
  position?: Fact<Position>;
  footprint?: Fact<Position[]>;
  summary: Fact<string>;
  status: "active" | "monitoring" | "closed";
  tags: string[];
  disclaimer: typeof INVESTIGATION_DISCLAIMER;
}

export interface GeocodeResult {
  query: string;
  position: Position;
  label: string;
  confidence: number;
  lowConfidence: boolean;
  eligibleForHazardScoring: boolean;
  provenance: Provenance;
}

export interface EntityCandidate {
  id: string;
  canonicalName: string;
  aliases: string[];
  jurisdiction?: string;
  score: number;
  provenance: Provenance;
}

export interface ResolutionResult {
  query: string;
  candidates: EntityCandidate[];
  resolution: "AUTO_RESOLVED" | "REVIEW_REQUIRED" | "NO_MATCH";
  resolved?: EntityCandidate;
}

export interface ReviewQueueItem {
  id: string;
  query: string;
  candidates: EntityCandidate[];
  reason: string;
  createdAt: string;
}

export interface SanctionsRecord {
  id: string;
  primaryName: string;
  aliases: string[];
  list: string;
  program: string;
  provenance: Provenance;
}

export interface SanctionsScreening {
  status: "CLEAR" | "POSSIBLE" | "MATCH";
  score: number;
  evidence: Array<{
    matchedName: string;
    list: string;
    program: string;
    provenance: Provenance;
  }>;
  disclaimer: typeof INVESTIGATION_DISCLAIMER;
}
