import { describe, expect, it } from "vitest";
import { demoEvents, demoSanctions } from "@insurance/engine-core";
import { createSyntheticPortfolio, exposureWeightedAlerts, screenOwnershipChain } from "../src";

describe("pro invariants",()=>{
  it("never creates an alert without touched exposure",()=>{ const portfolio=createSyntheticPortfolio(); portfolio.sites=[]; expect(exposureWeightedAlerts(demoEvents,portfolio)).toEqual([]); });
  it("weights alerts by severity times exposure",()=>{ const alerts=exposureWeightedAlerts(demoEvents,createSyntheticPortfolio()); expect(alerts.length).toBeGreaterThan(0); expect(alerts[0].weightedScore).toBe(alerts[0].severity*alerts[0].exposureAtRisk); });
  it("propagates majority-owned sanctions exposure",()=>{ const book=createSyntheticPortfolio(); const child={...book.entities[0],ultimateParentId:"entity-58",ownershipPercent:60}; expect(screenOwnershipChain(child,book.entities,demoSanctions).ownershipExposed).toBe(true); });
});
