import { fact } from "./provenance";
import { INVESTIGATION_DISCLAIMER, type SanctionsRecord, type SituationEvent } from "./types";

const fetchedAt = "2026-09-21T06:00:00.000Z";
const ibtracs = { sourceName: "NOAA IBTrACS fixture", sourceUrl: "https://www.ncei.noaa.gov/products/international-best-track-archive", fetchedAt };
const usgs = { sourceName: "USGS FDSN fixture", sourceUrl: "https://earthquake.usgs.gov/fdsnws/event/1/query", fetchedAt };

export const demoEvents: SituationEvent[] = [
  {
    id: "syn-cyclone-varuna",
    kind: "cyclone",
    title: fact("Synthetic Cyclone Varuna", ibtracs),
    observedAt: fact("2026-09-21T03:00:00.000Z", ibtracs),
    severity: fact(0.84, { ...ibtracs, sourceName: "NOAA IBTrACS fixture + demo severity method" }),
    position: fact({ lat: 19.2, lon: 86.1 }, ibtracs),
    footprint: fact([
      { lat: 16.8, lon: 82.8 }, { lat: 22.1, lon: 82.8 }, { lat: 23.2, lon: 88.6 }, { lat: 17.4, lon: 90.2 }, { lat: 16.8, lon: 82.8 },
    ], ibtracs),
    summary: fact("Category 3-equivalent synthetic track approaching Odisha; wind and surge context elevated.", ibtracs),
    status: "active",
    tags: ["wind", "storm-surge", "india", "synthetic"],
    disclaimer: INVESTIGATION_DISCLAIMER,
  },
  {
    id: "eq-aleutians-demo",
    kind: "earthquake",
    title: fact("M6.4 Aleutian Islands monitoring event", usgs),
    observedAt: fact("2026-09-20T20:10:00.000Z", usgs),
    severity: fact(0.61, { ...usgs, sourceName: "USGS magnitude normalized demo method" }),
    position: fact({ lat: 52.1, lon: -171.2 }, usgs),
    summary: fact("Shallow offshore event; no insured-loss estimate is inferred.", usgs),
    status: "monitoring",
    tags: ["earthquake", "offshore"],
    disclaimer: INVESTIGATION_DISCLAIMER,
  },
];

export const demoSanctions: SanctionsRecord[] = [
  {
    id: "ofac-syn-001",
    primaryName: "Northstar Meridian Trading LLC",
    aliases: ["North Star Meridian Trading", "NSM Trading"],
    list: "OFAC SDN synthetic fixture",
    program: "CYBER2 synthetic demo",
    provenance: { sourceName: "OFAC SLS synthetic fixture", sourceUrl: "https://sanctionslistservice.ofac.treas.gov", fetchedAt },
  },
];
