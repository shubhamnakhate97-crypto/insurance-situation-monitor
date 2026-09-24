/* SPDX-License-Identifier: MIT */
import { usgsEarthquakeAdapter } from '../../packages/engine-core/src/adapters.js';
import { createSyntheticPortfolio, exposureWeightedAlerts, type Portfolio } from '../../packages/overlay-pro/src/index.js';
import { requestUser } from '../../apps/web/auth.js';
import { platformRepository } from '../../apps/web/platform-store.js';
export default {async fetch(request:Request){
  if(request.method!=='GET')return Response.json({error:'GET only'},{status:405});const user=await requestUser(request,process.env);if(!user)return Response.json({error:'Authentication required'},{status:401});
  const repo=platformRepository(process.env),books=await repo.listPortfolios(user.id),base=createSyntheticPortfolio(),portfolio:Portfolio=books.length?{...base,sites:books.flatMap(b=>b.sites)}:base;
  const events=await usgsEarthquakeAdapter.load({mode:'live',now:new Date()}),preferences=await repo.getPreferences(user.id),states=await repo.listAlertStates(user.id),stateMap=new Map(states.map(s=>[s.alertId,s]));
  const alerts=exposureWeightedAlerts(events,portfolio).filter(a=>a.severity>=preferences.severityThreshold).filter(a=>{const s=stateMap.get(a.id);return !s||s.status==='open'||(s.status==='snoozed'&&s.snoozedUntil&&Date.parse(s.snoozedUntil)<Date.now());}).slice(0,preferences.topN);
  const output=user.role==='broker'?alerts.map(a=>({...a,touchedSiteIds:a.touchedSiteIds.map(()=>'client-site')})):alerts;
  return Response.json({generatedAt:new Date().toISOString(),role:user.role,alerts:output,disclaimer:alerts[0]?.disclaimer??'Indicators for investigation, not underwriting, pricing, or reserving decisions.'},{headers:{'Cache-Control':'no-store'}});
}};
