/* SPDX-License-Identifier: MIT */
import { createLayerService } from '../apps/web/layer-service.js';
import { platformRepository } from '../apps/web/platform-store.js';
const service=createLayerService(process.env);
export default {async fetch(request:Request){
  if(request.method!=='GET')return Response.json({error:'GET only'},{status:405});
  const snapshots=await platformRepository(process.env).listFeedSnapshots().catch(()=>[]),byId=new Map(snapshots.map(v=>[v.id,v]));
  const feeds=service.definitions.map(d=>{const s=byId.get(d.id),ageMinutes=s?.fetchedAt?(Date.now()-Date.parse(s.fetchedAt))/60000:undefined,stale=ageMinutes===undefined||ageMinutes>(d.cadenceMinutes??5)*2;return{id:d.id,source:d.source,cadenceMinutes:d.cadenceMinutes??5,status:d.disabledReason?'disabled':s?.error?'error':stale?'stale':'healthy',fetchedAt:s?.fetchedAt,recordCount:s?.recordCount??s?.events.length??0,latencyMs:s?.latencyMs,error:s?.error,disabledReason:d.disabledReason};});
  const operational=feeds.filter(f=>f.status!=='disabled'),healthy=operational.filter(f=>f.status==='healthy').length;
  return Response.json({status:operational.length&&healthy===operational.length?'healthy':healthy?'degraded':'cold',checkedAt:new Date().toISOString(),persistent:platformRepository(process.env).persistent,summary:{healthy,total:operational.length},feeds},{headers:{'Cache-Control':'no-store'}});
}};
