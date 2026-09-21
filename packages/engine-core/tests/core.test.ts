import { describe, expect, it } from "vitest";
import { assertEventProvenance, demoEvents, demoSanctions, normalizeGeocode, resolveEntity, screenSanctions, toReviewQueue } from "../src";

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
});
