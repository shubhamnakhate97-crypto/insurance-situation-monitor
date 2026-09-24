/* SPDX-License-Identifier: MIT */
import { createLayerService } from '../../apps/web/layer-service.js';
import { usgsEarthquakeAdapter } from '../../packages/engine-core/src/adapters.js';
import { createSyntheticPortfolio, exposureWeightedAlerts, type Portfolio } from '../../packages/overlay-pro/src/index.js';
import { platformRepository } from '../../apps/web/platform-store.js';
const service=createLayerService(process.env);
export default {async fetch(request:Request){
  const secret=process.env.CRON_SECRET,auth=request.headers.get('authorization');if(!secret||auth!==`Bearer ${secret}`)return Response.json({error:'Unauthorized'},{status:401});
  const started=Date.now(),eligible=service.definitions.filter(d=>!d.disabledReason&&(d.defaultOn||['ofac','eu','un','nvd'].includes(d.id)));
  const loaded=await Promise.all(eligible.map(async d=>({definition:d,result:await service.loadRaw(d.id)}))),settled=loaded.map(({definition:d,result:r})=>({id:d.id,count:r.events.length,fetchedAt:r.fetchedAt,error:r.error}));
  const delivered:string[]=[];const resend=process.env.RESEND_API_KEY,from=process.env.ALERT_FROM_EMAIL,repo=platformRepository(process.env);
  if(resend&&from&&!resend.includes('TODO')&&!from.includes('TODO')){
    const users=await repo.listUsers(),quakes=await usgsEarthquakeAdapter.load({mode:'live',now:new Date()}),events=[...quakes,...loaded.flatMap(v=>v.result.events)];
    for(const user of users){const preference=await repo.getPreferences(user.id);if(!preference.emailEnabled)continue;const books=await repo.listPortfolios(user.id),base=createSyntheticPortfolio(),portfolio:Portfolio=books.length?{...base,sites:books.flatMap(v=>v.sites)}:base;const alerts=exposureWeightedAlerts(events,portfolio).filter(v=>v.severity>=preference.severityThreshold).slice(0,preference.topN);if(!alerts.length)continue;
      const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${resend}`,'Content-Type':'application/json'},body:JSON.stringify({from,to:[user.email],subject:`SignalWatch: ${alerts.length} portfolio indicators`,text:[`Top indicator: ${alerts[0].eventTitle}`,`Exposure context: ${alerts[0].exposureAtRisk}`,`Source: ${alerts[0].provenance[0]?.sourceUrl}`,'Indicators for investigation, not underwriting, pricing, or reserving decisions.'].join('\n')})});if(response.ok)delivered.push(user.id);
    }
  }
  return Response.json({ok:settled.every(v=>!v.error),durationMs:Date.now()-started,feeds:settled,emailDeliveries:delivered.length});
}};
