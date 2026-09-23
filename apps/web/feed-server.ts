/* SPDX-License-Identifier: MIT */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Connect } from 'vite';
import { layerDefinitions, loadLayer, type LayerResult } from '../../packages/engine-core/src/live-layers';
import { restrictedLayers } from '../../packages/engine-core/src/restricted-layers';

// Fixed feed catalogue, never an arbitrary-URL proxy. Credentials stay on the server.
export function feedServer(env:Record<string,string|undefined>):Connect.NextHandleFunction {
  const definitions=[...layerDefinitions,...restrictedLayers(env)];
  const diskCache=resolve(process.cwd(),'../../data/cache/live-layers');
  const pending=new Map<string,Promise<LayerResult>>();
  async function fetchLayer(id:string):Promise<LayerResult> {
    const definition=definitions.find(d=>d.id===id)!;
    const persistent=['ofac','eu','un'].includes(id);
    const file=resolve(diskCache,`${id}.json`);
    if(persistent) {
      try {
        const cached:LayerResult=JSON.parse(await readFile(file,'utf8'));
        if(cached.id===id && cached.fetchedAt && Date.now()-Date.parse(cached.fetchedAt)<86400000 && !cached.error) return {...cached,cached:true};
      } catch { /* Missing/corrupt cache: fetch the official list. */ }
    }
    const result=await loadLayer(definition,{mode:'live',now:new Date()});
    if(persistent&&!result.error) {
      try {await mkdir(diskCache,{recursive:true});await writeFile(file,JSON.stringify(result));} catch { /* Read-only hosting still has the memory cache. */ }
    }
    return result;
  }
  return (req,res,next)=>{
    const path=req.url?.split('?')[0];
    if(!path?.startsWith('/api/layers')) return next();
    res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
    if(req.method!=='GET') {res.statusCode=405;res.end(JSON.stringify({error:'GET only'}));return;}
    if(path==='/api/layers') {res.end(JSON.stringify(definitions.map(({parse,fetchPayload,...meta})=>meta)));return;}
    const id=path.slice('/api/layers/'.length);
    if(!definitions.some(d=>d.id===id)) {res.statusCode=404;res.end(JSON.stringify({error:'Unknown layer'}));return;}
    if(!pending.has(id)) pending.set(id,fetchLayer(id).finally(()=>pending.delete(id)));
    void pending.get(id)!.then(result=>res.end(JSON.stringify(result))).catch(()=>{res.statusCode=500;res.end(JSON.stringify({id,events:[],error:'Feed service unavailable'}));});
  };
}
