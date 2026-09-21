import type { GeocodeResult, Position, Provenance } from "./types";

export interface RawGeocodeCandidate {
  query: string;
  label: string;
  position: Position;
  importance?: number;
  addressType?: string;
  provenance: Provenance;
}

export function normalizeGeocode(
  candidate: RawGeocodeCandidate,
  minimumConfidence = 0.75,
): GeocodeResult {
  const typeWeight = candidate.addressType === "building" ? 0.15 : candidate.addressType === "city" ? 0.08 : 0;
  const confidence = Math.max(0, Math.min(1, (candidate.importance ?? 0.4) + typeWeight));
  return {
    query: candidate.query,
    label: candidate.label,
    position: candidate.position,
    confidence,
    lowConfidence: confidence < minimumConfidence,
    eligibleForHazardScoring: confidence >= minimumConfidence,
    provenance: candidate.provenance,
  };
}

export class DevNominatimGeocoder {
  readonly mode = "development-only";
  private lastRequestAt = 0;
  private cache = new Map<string, GeocodeResult>();

  constructor(private minimumIntervalMs = 1100) {}

  async geocode(query: string, fetcher: typeof fetch = fetch): Promise<GeocodeResult | undefined> {
    const cached = this.cache.get(query.toLowerCase());
    if (cached) return cached;
    const wait = Math.max(0, this.minimumIntervalMs - (Date.now() - this.lastRequestAt));
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    this.lastRequestAt = Date.now();
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
    const response = await fetcher(url, { headers: { "User-Agent": "InsuranceSituationMonitor/1.0" } });
    const [row] = (await response.json()) as Array<Record<string, string>>;
    if (!row) return undefined;
    const result = normalizeGeocode({
      query,
      label: row.display_name,
      position: { lat: Number(row.lat), lon: Number(row.lon) },
      importance: Number(row.importance),
      addressType: row.type,
      provenance: {
        sourceName: "OpenStreetMap Nominatim (development only)",
        sourceUrl: url,
        fetchedAt: new Date().toISOString(),
        licenseNote: "ODbL; Nominatim usage policy applies",
      },
    });
    this.cache.set(query.toLowerCase(), result);
    return result;
  }
}
