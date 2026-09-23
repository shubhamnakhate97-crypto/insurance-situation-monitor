import { fact } from "./provenance.js";
import { INVESTIGATION_DISCLAIMER, type Fact, type SituationEvent } from "./types.js";

export interface AdapterContext {
  mode: "fixture" | "live";
  now: Date;
  fetcher?: typeof fetch;
}

export interface FeedAdapter<T = SituationEvent[]> {
  id: string;
  sourceName: string;
  endpoint: string;
  cadenceMinutes: number;
  defaultEnabled: boolean;
  licensePosture: "commercial-safe" | "key-required" | "non-commercial" | "licensed" | "verify";
  load(context: AdapterContext): Promise<T>;
}

export interface AdapterDescriptor {
  id: string;
  sourceName: string;
  endpoint: string;
  cadenceMinutes: number;
  defaultEnabled: boolean;
  licensePosture: FeedAdapter["licensePosture"];
}

export async function withBackoff<T>(operation: () => Promise<T>, attempts = 3, baseMs = 50): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, baseMs * 2 ** attempt));
    }
  }
  throw lastError;
}

export class MemoryCache<T> {
  private value?: { expiresAt: number; data: T };
  get(now = Date.now()): T | undefined {
    return this.value && this.value.expiresAt > now ? this.value.data : undefined;
  }
  set(data: T, ttlMs: number, now = Date.now()): void {
    this.value = { data, expiresAt: now + ttlMs };
  }
}

interface UsgsFeatureCollection {
  type: "FeatureCollection";
  features: Array<{
    id: string;
    geometry: { type: "Point"; coordinates: [number, number, number] } | null;
    properties: {
      mag: number | null;
      place: string | null;
      time: number;
      url: string;
      title?: string;
    };
  }>;
}

export interface UsgsEarthquakeEvent extends SituationEvent {
  magnitude: Fact<number>;
  depthKm: Fact<number>;
  place: Fact<string>;
  eventUrl: Fact<string>;
}

export function parseUsgsGeoJson(payload: UsgsFeatureCollection, fetchedAt: string): UsgsEarthquakeEvent[] {
  return payload.features.flatMap((feature) => {
    if (!feature.geometry || feature.geometry.type !== "Point" || feature.properties.mag === null) return [];
    const [lon, lat, depth] = feature.geometry.coordinates;
    const place = feature.properties.place ?? "Unknown location";
    const provenance = {
      sourceName: "USGS FDSN",
      sourceUrl: feature.properties.url,
      fetchedAt,
      licenseNote: "USGS public-domain earthquake data",
    };
    const magnitude = feature.properties.mag;
    return [{
      id: feature.id,
      kind: "earthquake" as const,
      title: fact(feature.properties.title ?? `M ${magnitude.toFixed(1)} — ${place}`, provenance),
      observedAt: fact(new Date(feature.properties.time).toISOString(), provenance),
      severity: fact(Math.max(0, Math.min(1, magnitude / 8)), provenance),
      position: fact({ lat, lon }, provenance),
      summary: fact(`${place}; magnitude ${magnitude.toFixed(1)}, depth ${depth.toFixed(1)} km.`, provenance),
      status: "active" as const,
      tags: ["earthquake", "usgs", `magnitude-${Math.floor(magnitude)}`],
      disclaimer: INVESTIGATION_DISCLAIMER,
      magnitude: fact(magnitude, provenance),
      depthKm: fact(depth, provenance),
      place: fact(place, provenance),
      eventUrl: fact(feature.properties.url, provenance),
    }];
  });
}

export class UsgsEarthquakeAdapter implements FeedAdapter<UsgsEarthquakeEvent[]> {
  readonly id = "usgs-fdsn";
  readonly sourceName = "USGS FDSN";
  readonly endpoint = "https://earthquake.usgs.gov/fdsnws/event/1/query";
  readonly cadenceMinutes = 5;
  readonly defaultEnabled = true;
  readonly licensePosture = "commercial-safe" as const;
  private cache = new MemoryCache<UsgsEarthquakeEvent[]>();

  async load(context: AdapterContext): Promise<UsgsEarthquakeEvent[]> {
    const cached = this.cache.get(context.now.getTime());
    if (cached !== undefined) return cached;
    if (context.mode === "fixture") return [];
    const startTime = new Date(context.now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const url = `${this.endpoint}?format=geojson&starttime=${startTime}&minmagnitude=2.5`;
    try {
      const fetcher = context.fetcher ?? fetch;
      const payload = await withBackoff(async () => {
        const response = await fetcher(url, { headers: { Accept: "application/geo+json, application/json" } });
        if (!response.ok) throw new Error(`USGS returned ${response.status}`);
        return response.json() as Promise<UsgsFeatureCollection>;
      });
      const events = parseUsgsGeoJson(payload, context.now.toISOString());
      this.cache.set(events, this.cadenceMinutes * 60_000, context.now.getTime());
      return events;
    } catch {
      return [];
    }
  }
}

export const usgsEarthquakeAdapter = new UsgsEarthquakeAdapter();

/**
 * Shared implementation used by every v1 source adapter. A concrete parser is
 * injected per source, while fixture behavior, caching and retry remain uniform.
 */
export class CachedSourceAdapter<T> implements FeedAdapter<T> {
  readonly id: string;
  readonly sourceName: string;
  readonly endpoint: string;
  readonly cadenceMinutes: number;
  readonly defaultEnabled: boolean;
  readonly licensePosture: FeedAdapter["licensePosture"];
  private cache = new MemoryCache<T>();

  constructor(
    descriptor: AdapterDescriptor,
    private fixture: () => T,
    private parseLive: (response: Response) => Promise<T> = async (response) => response.json() as Promise<T>,
  ) {
    Object.assign(this, descriptor);
    this.id = descriptor.id;
    this.sourceName = descriptor.sourceName;
    this.endpoint = descriptor.endpoint;
    this.cadenceMinutes = descriptor.cadenceMinutes;
    this.defaultEnabled = descriptor.defaultEnabled;
    this.licensePosture = descriptor.licensePosture;
  }

  async load(context: AdapterContext): Promise<T> {
    if (context.mode === "fixture") return this.fixture();
    const cached = this.cache.get(context.now.getTime());
    if (cached !== undefined) return cached;
    const fetcher = context.fetcher ?? fetch;
    const data = await withBackoff(async () => {
      const response = await fetcher(this.endpoint, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`${this.id} returned ${response.status}`);
      return this.parseLive(response);
    });
    this.cache.set(data, this.cadenceMinutes * 60_000, context.now.getTime());
    return data;
  }
}

export const adapterCatalogue = [
  ["usgs-fdsn", "https://earthquake.usgs.gov/fdsnws/event/1/query", 5, true, "commercial-safe"],
  ["gdacs", "https://www.gdacs.org/xml/rss.xml", 15, true, "verify"],
  ["noaa-ibtracs", "https://www.ncei.noaa.gov/products/international-best-track-archive", 360, true, "commercial-safe"],
  ["nasa-firms", "https://firms.modaps.eosdis.nasa.gov/api/area", 15, false, "key-required"],
  ["open-meteo", "https://api.open-meteo.com/v1/forecast", 60, false, "non-commercial"],
  ["ofac", "https://sanctionslistservice.ofac.treas.gov", 1440, true, "commercial-safe"],
  ["eu-sanctions", "https://webgate.ec.europa.eu/fsd/fsf", 1440, true, "commercial-safe"],
  ["un-sanctions", "https://scsanctions.un.org", 1440, true, "commercial-safe"],
  ["gleif", "https://api.gleif.org/api/v1", 1440, true, "commercial-safe"],
  ["sec-edgar", "https://data.sec.gov", 1440, true, "commercial-safe"],
  ["india-mca", "https://api.data.gov.in/resource/{id}", 1440, false, "key-required"],
  ["gdelt", "https://api.gdeltproject.org", 15, true, "commercial-safe"],
  ["nvd", "https://services.nvd.nist.gov/rest/json/cves/2.0", 60, true, "commercial-safe"],
  ["cisa-kev", "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json", 1440, true, "commercial-safe"],
  ["first-epss", "https://api.first.org/data/v1/epss", 1440, true, "commercial-safe"],
  ["world-bank", "https://api.worldbank.org/v2", 43200, true, "commercial-safe"],
  ["acled", "https://api.acleddata.com", 1440, false, "licensed"],
  ["opensanctions", "https://api.opensanctions.org", 1440, false, "licensed"],
  ["opencorporates", "https://api.opencorporates.com", 1440, false, "licensed"],
  ["aisstream", "https://stream.aisstream.io", 1, false, "non-commercial"],
  ["opensky", "https://opensky-network.org/api", 1, false, "non-commercial"],
  ["commercial-geocoder", "TODO(me)", 0, false, "licensed"],
] as const;

const sourceNames: Record<string, string> = {
  "usgs-fdsn": "USGS FDSN", gdacs: "GDACS", "noaa-ibtracs": "NOAA IBTrACS", "nasa-firms": "NASA FIRMS",
  "open-meteo": "Open-Meteo", ofac: "OFAC Sanctions List Service", "eu-sanctions": "EU Consolidated Sanctions",
  "un-sanctions": "UN Security Council Sanctions", gleif: "GLEIF LEI", "sec-edgar": "SEC EDGAR", "india-mca": "India MCA data.gov.in",
  gdelt: "GDELT", nvd: "NVD", "cisa-kev": "CISA KEV", "first-epss": "FIRST EPSS", "world-bank": "World Bank",
  acled: "ACLED", opensanctions: "OpenSanctions", opencorporates: "OpenCorporates", aisstream: "aisstream.io", opensky: "OpenSky",
  "commercial-geocoder": "Commercial geocoder",
};

export const adapterRegistry: Record<string, FeedAdapter<unknown>> = Object.fromEntries(
  adapterCatalogue.map(([id, endpoint, cadenceMinutes, defaultEnabled, licensePosture]) => [id, id === "usgs-fdsn"
    ? usgsEarthquakeAdapter
    : new CachedSourceAdapter(
      { id, sourceName: sourceNames[id], endpoint, cadenceMinutes, defaultEnabled, licensePosture },
      () => ({ fixture: true, source: sourceNames[id], records: [] }),
    )]),
);

export function isAdapterEnabled(
  id: string,
  flags: Record<string, boolean> = {},
): boolean {
  const adapter = adapterCatalogue.find(([candidate]) => candidate === id);
  if (!adapter) return false;
  const [, , , defaultEnabled, posture] = adapter;
  if (posture === "non-commercial" || posture === "licensed" || posture === "key-required") return flags[id] === true;
  return flags[id] ?? defaultEnabled;
}
