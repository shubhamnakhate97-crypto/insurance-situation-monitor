import { fact, type Fact, type Position, type Provenance, type SituationEvent } from "@insurance/engine-core";

export interface HistoricalLossEvent {
  id: string;
  name: Fact<string>;
  year: Fact<number>;
  kind: string;
  position: Position;
  lossContext: Fact<string>;
  tags: string[];
}

export interface RdsScenario {
  id: string;
  name: Fact<string>;
  peril: string;
  footprint: Fact<Position[]>;
  narrative: Fact<string>;
  severity: Fact<number>;
}

export interface InsuranceContext {
  returnPeriod: Fact<string>;
  crestaContext: Fact<string>;
  densityProxy: Fact<string>;
  analog: HistoricalLossEvent;
}

const at = "2026-09-21T06:00:00.000Z";
const emdat: Provenance = { sourceName: "EM-DAT public summaries / curated demo", sourceUrl: "https://www.emdat.be/", fetchedAt: at, licenseNote: "Metadata only; verify production reuse rights" };
const lensMethod: Provenance = { sourceName: "Insurance Lenses v1 methodology", sourceUrl: "https://github.com/example/insurance-situation-monitor/blob/main/packages/insurance-lenses/README.md", fetchedAt: at };
const worldPop: Provenance = { sourceName: "WorldPop 2020 density proxy (fixture)", sourceUrl: "https://www.worldpop.org/", fetchedAt: at };

export const historicalLosses: HistoricalLossEvent[] = [
  { id: "odisha-1999", name: fact("1999 Odisha Super Cyclone", emdat), year: fact(1999, emdat), kind: "cyclone", position: { lat: 20.3, lon: 86.8 }, lossContext: fact("Severe wind, surge and infrastructure disruption; values are qualitative in this demo.", emdat), tags: ["india", "cyclone", "surge"] },
  { id: "tohoku-2011", name: fact("2011 Tōhoku earthquake and tsunami", emdat), year: fact(2011, emdat), kind: "earthquake", position: { lat: 38.3, lon: 142.4 }, lossContext: fact("Major coastal earthquake, tsunami and contingent business interruption event.", emdat), tags: ["japan", "earthquake", "tsunami"] },
  { id: "katrina-2005", name: fact("2005 Hurricane Katrina", emdat), year: fact(2005, emdat), kind: "cyclone", position: { lat: 29.2, lon: -89.6 }, lossContext: fact("Wind, storm surge, flood and demand-surge reference event.", emdat), tags: ["usa", "cyclone", "flood"] },
  { id: "turkiye-2023", name: fact("2023 Türkiye–Syria earthquakes", emdat), year: fact(2023, emdat), kind: "earthquake", position: { lat: 37.2, lon: 37.0 }, lossContext: fact("Urban building vulnerability and business interruption reference event.", emdat), tags: ["turkiye", "earthquake"] },
];

export const rdsScenarios: RdsScenario[] = [
  { id: "rds-mumbai-cyclone", name: fact("RDS 01 — Severe cyclone landfall near Mumbai", lensMethod), peril: "Tropical cyclone", footprint: fact([{ lat: 16, lon: 68 }, { lat: 23, lon: 68 }, { lat: 23, lon: 76 }, { lat: 16, lon: 76 }, { lat: 16, lon: 68 }], lensMethod), narrative: fact("Synthetic wind and surge scenario for accumulation exploration; not a modeled loss footprint.", lensMethod), severity: fact(0.88, lensMethod) },
  { id: "rds-tokyo-quake", name: fact("RDS 02 — Tokyo metropolitan earthquake", lensMethod), peril: "Earthquake", footprint: fact([{ lat: 34.5, lon: 138.3 }, { lat: 36.4, lon: 138.3 }, { lat: 36.4, lon: 141.1 }, { lat: 34.5, lon: 141.1 }, { lat: 34.5, lon: 138.3 }], lensMethod), narrative: fact("Synthetic shaking footprint for concentration review; not a catastrophe-model result.", lensMethod), severity: fact(0.91, lensMethod) },
  { id: "rds-suez-blockage", name: fact("RDS 03 — Thirty-day Suez disruption", lensMethod), peril: "Marine", footprint: fact([{ lat: 29.5, lon: 31.8 }, { lat: 31.5, lon: 31.8 }, { lat: 31.5, lon: 33.1 }, { lat: 29.5, lon: 33.1 }, { lat: 29.5, lon: 31.8 }], lensMethod), narrative: fact("Synthetic chokepoint interruption for cargo and delay accumulation exploration.", lensMethod), severity: fact(0.72, lensMethod) },
];

const distance = (a: Position, b: Position) => Math.hypot(a.lat - b.lat, a.lon - b.lon);

export function nearestAnalog(event: SituationEvent): HistoricalLossEvent {
  const position = event.position?.value ?? { lat: 0, lon: 0 };
  const sameKind = historicalLosses.filter((candidate) => candidate.kind === event.kind);
  return (sameKind.length ? sameKind : historicalLosses).sort((a, b) => distance(a.position, position) - distance(b.position, position))[0];
}

export function frameEvent(event: SituationEvent): InsuranceContext {
  const isCyclone = event.kind === "cyclone";
  return {
    returnPeriod: fact(isCyclone ? "Indicative 1-in-75 to 1-in-150 year intensity band" : "Indicative regional recurrence context: uncommon", lensMethod),
    crestaContext: fact(isCyclone ? "India East Coast aggregation zone (illustrative CRESTA-style context)" : "Alaska/Aleutians aggregation zone (illustrative)", lensMethod),
    densityProxy: fact(isCyclone ? "High population and built-asset density near coastal Odisha" : "Low onshore asset-density proxy", worldPop),
    analog: nearestAnalog(event),
  };
}

export const chokepoints = [
  ["Strait of Hormuz", "Elevated monitoring", 26.56, 56.25],
  ["Suez Canal", "Normal watch", 30.45, 32.35],
  ["Bab-el-Mandeb", "Heightened disruption context", 12.58, 43.33],
  ["Strait of Malacca", "Normal watch", 2.5, 101.5],
  ["Panama Canal", "Drought-sensitive transit context", 9.1, -79.7],
] as const;

export const lensProvenance = {
  marine: { sourceName: "GDELT open-events fixture + geographic reference", sourceUrl: "https://www.gdeltproject.org/", fetchedAt: at },
  cyber: { sourceName: "CISA KEV + FIRST EPSS synthetic fixture", sourceUrl: "https://www.cisa.gov/known-exploited-vulnerabilities-catalog", fetchedAt: at },
  cresta: { sourceName: "Insurance Lenses illustrative aggregation reference", sourceUrl: "https://www.cresta.org/", fetchedAt: at, licenseNote: "No licensed CRESTA boundaries redistributed" },
};
