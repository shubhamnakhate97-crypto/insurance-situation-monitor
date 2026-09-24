import { describe, expect, it } from "vitest";
import { demoEvents, demoSanctions } from "@insurance/engine-core";
import { createSyntheticPortfolio, exposureWeightedAlerts, parseSitesCsv, screenOwnershipChain } from "../src";

describe("pro invariants",()=>{
  it("never creates an alert without touched exposure",()=>{ const portfolio=createSyntheticPortfolio(); portfolio.sites=[]; expect(exposureWeightedAlerts(demoEvents,portfolio)).toEqual([]); });
  it("weights alerts by severity times exposure",()=>{ const alerts=exposureWeightedAlerts(demoEvents,createSyntheticPortfolio()); expect(alerts.length).toBeGreaterThan(0); expect(alerts[0].weightedScore).toBe(alerts[0].severity*alerts[0].exposureAtRisk); });
  it("propagates majority-owned sanctions exposure",()=>{ const book=createSyntheticPortfolio(); const child={...book.entities[0],ultimateParentId:"entity-58",ownershipPercent:60}; expect(screenOwnershipChain(child,book.entities,demoSanctions).ownershipExposed).toBe(true); });
  it('validates bounds, duplicates and quoted fields during CSV import',()=>{const p={sourceName:'test',sourceUrl:'https://example.test',fetchedAt:new Date(0).toISOString()};const parsed=parseSitesCsv('name,address,lat,lon,sum_insured,peril_cover,country\n"Site, One","1 Main St",28,77,1000000,earthquake|flood,India\n"Site, One",duplicate,28,77,1000000,earthquake,India\nBad,bad,91,77,5,earthquake,India','c',p);expect(parsed.rows).toHaveLength(1);expect(parsed.rows[0].name).toBe('Site, One');expect(parsed.issues).toHaveLength(2);});
});
