import { describe, expect, it } from "vitest";
import { adapterCatalogue, adapterRegistry, assertEventProvenance, demoEvents, demoSanctions, isAdapterEnabled, normalizeGeocode, parseUsgsGeoJson, resolveEntity, screenSanctions, toReviewQueue } from "../src";
import usgsSample from "./fixtures/usgs-sample.json";

const provenance = { sourceName: "GLEIF fixture", sourceUrl: "https://api.gleif.org/api/v1", fetchedAt: "2026-09-21T00:00:00Z" };

describe("safety-critical engine behavior", () => {
  it("requires provenance on every event fact", () => {
    expect(() => demoEvents.forEach(assertEventProvenance)).not.toThrow();
    expect(() => assertEventProvenance({ ...demoEvents[0], summary: { value: "bad", provenance: { ...provenance, sourceUrl: "" } } })).toThrow();
  });

  it("flags low-confidence geocodes and excludes them from scoring", () => {
    const result = normalizeGeocode({ query: "unclear", label: "Possible place", position: { lat: 1, lon: 2 }, importance: 0.41, provenance });
    expect(result.lowConfidence).toBe(true);
    expect(result.eligibleForHazardScoring).toBe(false);
  });

  it("routes sub-threshold entity resolution to human review", () => {
    const result = resolveEntity("North Meridian", [
      { id: "1", canonicalName: "Northstar Meridian Ltd", aliases: [], provenance },
      { id: "2", canonicalName: "North Meridian Shipping", aliases: [], provenance },
    ], 0.95);
    expect(result.resolution).toBe("REVIEW_REQUIRED");
    expect(toReviewQueue(result)?.candidates.length).toBeGreaterThan(0);
  });

  it("returns list and program evidence for sanctions matches", () => {
    const result = screenSanctions("North Star Meridian Trading", demoSanctions);
    expect(result.status).toBe("MATCH");
    expect(result.evidence[0]).toMatchObject({ list: "OFAC SDN synthetic fixture", program: "CYBER2 synthetic demo" });
  });

  it("gives every source an offline fixture adapter and disables restricted sources", async () => {
    expect(Object.keys(adapterRegistry)).toHaveLength(adapterCatalogue.length);
    expect(isAdapterEnabled("open-meteo")).toBe(false);
    expect(isAdapterEnabled("acled")).toBe(false);
    expect(isAdapterEnabled("aisstream")).toBe(false);
    expect(await adapterRegistry["usgs-fdsn"].load({ mode: "fixture", now: new Date() })).toEqual([]);
  });

  it("parses a USGS GeoJSON feature into a sourced earthquake event", () => {
    const [event] = parseUsgsGeoJson(usgsSample as unknown as Parameters<typeof parseUsgsGeoJson>[0], "2026-09-21T10:00:00.000Z");
    expect(event).toMatchObject({ id: "us7000demo", kind: "earthquake", status: "active" });
    expect(event.position?.value).toEqual({ lon: 142.1, lat: 38.2 });
    expect(event.magnitude.value).toBe(5.7);
    expect(event.depthKm.value).toBe(32.4);
    expect(event.title.provenance.sourceName).toBe("USGS FDSN");
  });
});
