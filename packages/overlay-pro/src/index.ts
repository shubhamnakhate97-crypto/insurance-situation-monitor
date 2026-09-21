/* PROPRIETARY — Copyright (c) 2026. All rights reserved. */
import { INVESTIGATION_DISCLAIMER, screenSanctions, type Position, type Provenance, type SanctionsRecord, type SituationEvent } from "@insurance/engine-core";

export type Tier = "anonymous" | "free-registered" | "pro";
export interface Entitlement { userId: string; tier: Tier; source: "demo" | "stripe" | "none"; expiresAt?: string }
export interface Site { id: string; clientId: string; name: string; address: string; position: Position; sumInsured: number; perilCover: string[]; country: string; provenance: Provenance }
export interface Entity { id: string; clientId: string; name: string; jurisdiction: string; resolvedId?: string; sumInsured: number; ultimateParentId?: string; ownershipPercent?: number; provenance: Provenance }
export interface Vessel { id: string; clientId: string; name: string; imo: string; position: Position; cargoValue: number; route: string; provenance: Provenance }
export interface SupplyChain { id: string; clientId: string; name: string; supplierEntityIds: string[]; provenance: Provenance }
export interface Portfolio { sites: Site[]; entities: Entity[]; vessels: Vessel[]; supplyChains: SupplyChain[] }
export interface PortfolioAlert { id: string; eventId: string; eventTitle: string; exposureAtRisk: number; severity: number; weightedScore: number; touchedSiteIds: string[]; provenance: Provenance[]; disclaimer: typeof INVESTIGATION_DISCLAIMER }

export function requirePro(entitlement: Entitlement): void {
  if (entitlement.tier !== "pro" || (entitlement.expiresAt && new Date(entitlement.expiresAt) < new Date())) {
    throw new Error("PRO_ENTITLEMENT_REQUIRED");
  }
}

const radians = (value: number) => value * Math.PI / 180;
export function distanceKm(a: Position, b: Position): number {
  const dLat = radians(b.lat - a.lat); const dLon = radians(b.lon - a.lon);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function exposureWeightedAlerts(events: SituationEvent[], portfolio: Portfolio, radiusKm = 650): PortfolioAlert[] {
  return events.flatMap<PortfolioAlert>((event) => {
    if (!event.position) return [];
    const touched = portfolio.sites.filter((site) => site.perilCover.includes(event.kind) && distanceKm(site.position, event.position!.value) <= radiusKm);
    const exposureAtRisk = touched.reduce((sum, site) => sum + site.sumInsured, 0);
    if (exposureAtRisk <= 0) return [];
    return [{
      id: `alert-${event.id}`,
      eventId: event.id,
      eventTitle: event.title.value,
      exposureAtRisk,
      severity: event.severity.value,
      weightedScore: event.severity.value * exposureAtRisk,
      touchedSiteIds: touched.map((site) => site.id),
      provenance: [event.severity.provenance, ...touched.map((site) => site.provenance)],
      disclaimer: INVESTIGATION_DISCLAIMER,
    }];
  }).sort((a, b) => b.weightedScore - a.weightedScore);
}

export function accumulations(portfolio: Portfolio) {
  const byCountry = Object.entries(portfolio.sites.reduce<Record<string, number>>((out, site) => ({ ...out, [site.country]: (out[site.country] ?? 0) + site.sumInsured }), {})).sort((a,b)=>b[1]-a[1]);
  const byPeril = Object.entries(portfolio.sites.reduce<Record<string, number>>((out, site) => { site.perilCover.forEach((p) => out[p] = (out[p] ?? 0) + site.sumInsured); return out; }, {})).sort((a,b)=>b[1]-a[1]);
  const byParent = Object.entries(portfolio.entities.reduce<Record<string, number>>((out, entity) => ({ ...out, [entity.ultimateParentId ?? entity.id]: (out[entity.ultimateParentId ?? entity.id] ?? 0) + entity.sumInsured }), {})).sort((a,b)=>b[1]-a[1]);
  return { byCountry, byPeril, byParent };
}

export function screenOwnershipChain(entity: Entity, allEntities: Entity[], records: SanctionsRecord[]) {
  const chain: Entity[] = [entity]; let current = entity;
  const seen = new Set([entity.id]);
  while (current.ultimateParentId && !seen.has(current.ultimateParentId)) {
    const parent = allEntities.find((candidate) => candidate.id === current.ultimateParentId);
    if (!parent) break;
    chain.push(parent); seen.add(parent.id); current = parent;
  }
  const results = chain.map((member) => ({ entity: member, screening: screenSanctions(member.name, records) }));
  const ownershipExposed = results.some((result, index) => index > 0 && (chain[index - 1].ownershipPercent ?? 0) >= 50 && result.screening.status === "MATCH");
  return { chain: results, ownershipExposed, status: results.some((r) => r.screening.status === "MATCH") || ownershipExposed ? "MATCH" : results.some((r) => r.screening.status === "POSSIBLE") ? "POSSIBLE" : "CLEAR", disclaimer: INVESTIGATION_DISCLAIMER };
}

export function stressScenario(portfolio: Portfolio, footprint: Position[], severity: number) {
  const minLat = Math.min(...footprint.map(p=>p.lat)); const maxLat = Math.max(...footprint.map(p=>p.lat));
  const minLon = Math.min(...footprint.map(p=>p.lon)); const maxLon = Math.max(...footprint.map(p=>p.lon));
  const touched = portfolio.sites.filter(s=>s.position.lat>=minLat&&s.position.lat<=maxLat&&s.position.lon>=minLon&&s.position.lon<=maxLon);
  const exposureAtRisk = touched.reduce((sum,s)=>sum+s.sumInsured,0);
  return { exposureAtRisk, severityWeightedExposure: exposureAtRisk * severity, touchedSites: touched, disclaimer: INVESTIGATION_DISCLAIMER };
}

export function generateDailyBrief(alerts: PortfolioAlert[], portfolio: Portfolio): string {
  const top = alerts[0];
  if (!top) return `No portfolio alerts: no insured exposure intersects monitored event footprints. ${INVESTIGATION_DISCLAIMER}`;
  return `${top.eventTitle} is the leading book signal, intersecting ${top.touchedSiteIds.length} sites and ${money(top.exposureAtRisk)} of declared sum insured. Review limits, coverage and data quality before action. ${INVESTIGATION_DISCLAIMER}`;
}

export const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(value);

export interface ImportIssue { row: number; field: string; message: string }
export function parseSitesCsv(csv: string, clientId: string, provenance: Provenance): { rows: Site[]; issues: ImportIssue[] } {
  const [headerLine = "", ...lines] = csv.trim().split(/\r?\n/); const headers = headerLine.split(",").map(s=>s.trim());
  const required = ["name","address","lat","lon","sum_insured","peril_cover"];
  const issues: ImportIssue[] = required.filter(h=>!headers.includes(h)).map(field=>({row:1,field,message:"Required column missing"}));
  if (issues.length) return { rows: [], issues };
  const rows: Site[] = [];
  lines.forEach((line,index)=>{ const values=line.split(",").map(s=>s.trim()); const get=(key:string)=>values[headers.indexOf(key)]; const lat=Number(get("lat")); const lon=Number(get("lon")); const sum=Number(get("sum_insured"));
    if(!get("name")||!Number.isFinite(lat)||!Number.isFinite(lon)||!Number.isFinite(sum)||sum<=0){issues.push({row:index+2,field:"row",message:"Name, valid coordinates and positive sum_insured required"});return;}
    rows.push({id:`import-${index+1}`,clientId,name:get("name"),address:get("address"),position:{lat,lon},sumInsured:sum,perilCover:get("peril_cover").split("|") ,country:"Imported",provenance});
  }); return {rows,issues};
}

const seedProvenance: Provenance = { sourceName: "Synthetic portfolio generator v1", sourceUrl: "https://github.com/example/insurance-situation-monitor/blob/main/packages/overlay-pro/src/index.ts", fetchedAt: "2026-09-21T06:00:00.000Z", licenseNote: "Fictional data" };
const cities = [
  ["Mumbai","India",19.08,72.88],["Chennai","India",13.08,80.27],["Kolkata","India",22.57,88.36],["Bhubaneswar","India",20.30,85.82],["Hyderabad","India",17.39,78.49],["Delhi","India",28.61,77.21],["Ahmedabad","India",23.02,72.57],["Singapore","Singapore",1.35,103.82],["Dubai","UAE",25.2,55.27],["Rotterdam","Netherlands",51.92,4.48],["Houston","USA",29.76,-95.37],["Tokyo","Japan",35.68,139.65],["Sydney","Australia",-33.87,151.21],["London","UK",51.51,-0.13],["São Paulo","Brazil",-23.55,-46.63],
] as const;
export function createSyntheticPortfolio(): Portfolio {
  const clients=["client-a","client-b","client-c"];
  const sites: Site[] = Array.from({length:150},(_,i)=>{const city=cities[i%cities.length];return{id:`site-${i+1}`,clientId:clients[i%3],name:`${city[0]} Facility ${String(i+1).padStart(3,"0")}`,address:`${10+i} Industrial Estate, ${city[0]}`,position:{lat:city[2]+((i%7)-3)*.06,lon:city[3]+((i%5)-2)*.07},sumInsured:5_000_000+(i%18)*2_750_000,perilCover:i%4===0?["cyclone","flood","wildfire"]:["cyclone","earthquake","flood"],country:city[1],provenance:seedProvenance}});
  const entities: Entity[] = Array.from({length:60},(_,i)=>({id:`entity-${i+1}`,clientId:clients[i%3],name:i===57?"Northstar Meridian Trading LLC":`Synthetic ${["Manufacturing","Logistics","Energy","Retail"][i%4]} Holdings ${i+1}`,jurisdiction:cities[i%cities.length][1],resolvedId:`LEI-SYN-${String(i+1).padStart(4,"0")}`,sumInsured:2_000_000+(i%11)*1_800_000,ultimateParentId:i<50?`entity-${51+(i%10)}`:undefined,ownershipPercent:i<50?51+(i%4)*10:undefined,provenance:seedProvenance}));
  const vessels: Vessel[] = Array.from({length:10},(_,i)=>({id:`vessel-${i+1}`,clientId:clients[i%3],name:`MV Synthetic Horizon ${i+1}`,imo:`IMO${9000000+i}`,position:{lat:chokepointPositions[i%5][0],lon:chokepointPositions[i%5][1]},cargoValue:12_000_000+i*3_000_000,route:["Hormuz–Singapore","Suez–Rotterdam","Malacca–Tokyo"][i%3],provenance:seedProvenance}));
  const supplyChains: SupplyChain[] = clients.map((clientId,i)=>({id:`chain-${i+1}`,clientId,name:`Client ${String.fromCharCode(65+i)} critical suppliers`,supplierEntityIds:entities.filter(e=>e.clientId===clientId).slice(0,8).map(e=>e.id),provenance:seedProvenance}));
  return {sites,entities,vessels,supplyChains};
}
const chokepointPositions=[[26.5,56.2],[30.4,32.3],[12.6,43.3],[2.5,101.5],[9.1,-79.7]] as const;

export class StripeTestBillingAdapter {
  readonly mode = "test";
  constructor(private secretKey?: string, private priceId?: string) {}
  async createCheckout(userId: string) {
    if (!this.secretKey || !this.priceId) throw new Error("STRIPE_TEST_KEYS_REQUIRED_TODO(me)");
    return { userId, mode: this.mode, priceId: this.priceId, url: "TODO(me): create Stripe Checkout session server-side" };
  }
}
