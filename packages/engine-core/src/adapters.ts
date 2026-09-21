import type { SituationEvent } from "./types";

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

export const adapterRegistry: Record<string, CachedSourceAdapter<unknown>> = Object.fromEntries(
  adapterCatalogue.map(([id, endpoint, cadenceMinutes, defaultEnabled, licensePosture]) => [id, new CachedSourceAdapter(
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
