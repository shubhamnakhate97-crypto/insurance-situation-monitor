/* SPDX-License-Identifier: MIT */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { layerDefinitions, loadLayer, type LayerResult } from '../../packages/engine-core/src/live-layers.js';
import { restrictedLayers } from '../../packages/engine-core/src/restricted-layers.js';
import { screenSanctions, type SanctionsRecord } from '../../packages/engine-core/src/index.js';
import { platformRepository } from './platform-store.js';

const sanctionsIds=new Set(['ofac','eu','un']);
const pending=new Map<string,Promise<LayerResult>>();

export function createLayerService(env:Record<string,string|undefined>) {
  const definitions=[...layerDefinitions,...restrictedLayers(env)];
  const repository=platformRepository(env);
  const cacheRoot=env.VERCEL ? resolve(tmpdir(),'insurance-monitor-live-layers') : resolve(process.cwd(),'../../data/cache/live-layers');
  async function raw(id:string):Promise<LayerResult> {
    const definition=definitions.find(d=>d.id===id);
    if(!definition)return {id,endpoint:'',attemptedAt:new Date().toISOString(),events:[],error:'Unknown layer'};
    const file=resolve(cacheRoot,`${id}.json`);
    try{
      const persisted=await repository.getFeedSnapshot(id);
      const cadence=(definition.cadenceMinutes??5)*60000;
      if(persisted?.fetchedAt&&Date.now()-Date.parse(persisted.fetchedAt)<cadence&&!persisted.error)return {...persisted,cached:true};
    }catch(error){console.warn(JSON.stringify({type:'feed-cache-read',feed:id,status:'failed',message:error instanceof Error?error.message:String(error)}));}
    if(sanctionsIds.has(id)) {
      try {
        const cached:LayerResult=JSON.parse(await readFile(file,'utf8'));
        if(cached.id===id&&cached.fetchedAt&&Date.now()-Date.parse(cached.fetchedAt)<86400000&&!cached.error)return {...cached,cached:true};
      } catch { /* Cache miss. */ }
    }
    const started=Date.now(),result=await loadLayer(definition,{mode:'live',now:new Date()}),latencyMs=Date.now()-started;
    console.info(JSON.stringify({type:'adapter-run',feed:id,status:result.error?'failed':'success',latencyMs,recordCount:result.events.length,error:result.error}));
    if(!result.error){try{await repository.saveFeedSnapshot({...result,recordCount:result.events.length},latencyMs);}catch(error){console.warn(JSON.stringify({type:'feed-cache-write',feed:id,status:'failed',message:error instanceof Error?error.message:String(error)}));}}
    if(sanctionsIds.has(id)&&!result.error) {
      try{await mkdir(cacheRoot,{recursive:true});await writeFile(file,JSON.stringify(result));}catch{/* Ephemeral/read-only hosts keep the memory cache. */}
    }
    if(result.error){
      try{const stale=await repository.getFeedSnapshot(id);if(stale?.fetchedAt&&!stale.error)return {...stale,cached:true,warnings:[...(stale.warnings??[]),`Upstream refresh failed at ${result.attemptedAt}; showing last known good data from ${stale.fetchedAt}.`]};}catch{/* Fail closed below. */}
    }
    return result;
  }
  async function loadRaw(id:string):Promise<LayerResult> {
    if(!pending.has(id))pending.set(id,raw(id).finally(()=>pending.delete(id)));
    return pending.get(id)!;
  }
  async function loadPublic(id:string):Promise<LayerResult&{recordCount:number}> {
    const result=await loadRaw(id),recordCount=result.events.length;
    return sanctionsIds.has(id)?{...result,events:[],recordCount}:{...result,recordCount};
  }
  async function screen(name:string,ids:string[]) {
    const selected=ids.filter(id=>sanctionsIds.has(id));
    const loaded=await Promise.all(selected.map(id=>loadRaw(id)));
    const records:SanctionsRecord[]=loaded.flatMap(result=>result.events.map(e=>({id:e.id,primaryName:e.title.value,aliases:e.tags,list:e.title.provenance.sourceName,program:e.summary.value,provenance:e.title.provenance})));
    return {screening:screenSanctions(name,records),recordCount:records.length,complete:selected.length===3&&loaded.every(r=>r.fetchedAt&&!r.error),coverage:loaded.map(r=>({id:r.id,count:r.events.length,fetchedAt:r.fetchedAt,error:r.error}))};
  }
  return {definitions,loadPublic,loadRaw,screen};
}
