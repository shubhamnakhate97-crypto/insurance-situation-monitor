/* SPDX-License-Identifier: MIT */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { layerDefinitions, loadLayer, type LayerResult } from '../../packages/engine-core/src/live-layers.js';
import { restrictedLayers } from '../../packages/engine-core/src/restricted-layers.js';
import { screenSanctions, type SanctionsRecord } from '../../packages/engine-core/src/index.js';

const sanctionsIds=new Set(['ofac','eu','un']);
const pending=new Map<string,Promise<LayerResult>>();

export function createLayerService(env:Record<string,string|undefined>) {
  const definitions=[...layerDefinitions,...restrictedLayers(env)];
  const cacheRoot=env.VERCEL ? resolve(tmpdir(),'insurance-monitor-live-layers') : resolve(process.cwd(),'../../data/cache/live-layers');
  async function raw(id:string):Promise<LayerResult> {
    const definition=definitions.find(d=>d.id===id);
    if(!definition)return {id,endpoint:'',attemptedAt:new Date().toISOString(),events:[],error:'Unknown layer'};
    const file=resolve(cacheRoot,`${id}.json`);
    if(sanctionsIds.has(id)) {
      try {
        const cached:LayerResult=JSON.parse(await readFile(file,'utf8'));
        if(cached.id===id&&cached.fetchedAt&&Date.now()-Date.parse(cached.fetchedAt)<86400000&&!cached.error)return {...cached,cached:true};
      } catch { /* Cache miss. */ }
    }
    const result=await loadLayer(definition,{mode:'live',now:new Date()});
    if(sanctionsIds.has(id)&&!result.error) {
      try{await mkdir(cacheRoot,{recursive:true});await writeFile(file,JSON.stringify(result));}catch{/* Ephemeral/read-only hosts keep the memory cache. */}
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
  return {definitions,loadPublic,screen};
}
