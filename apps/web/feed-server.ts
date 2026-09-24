/* SPDX-License-Identifier: MIT */
import type { Connect } from 'vite';
import type { ServerResponse } from 'node:http';
import { createLayerService } from './layer-service';

async function webRequest(req:Connect.IncomingMessage){
  const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk));
  const headers=new Headers();Object.entries(req.headers).forEach(([key,value])=>{if(Array.isArray(value))value.forEach(v=>headers.append(key,v));else if(value)headers.set(key,value);});
  return new Request(new URL(req.url??'/', 'http://localhost:3000'),{method:req.method,headers,body:['GET','HEAD'].includes(req.method??'GET')?undefined:Buffer.concat(chunks)});
}
async function send(response:Response,res:ServerResponse){res.statusCode=response.status;response.headers.forEach((value,key)=>res.setHeader(key,value));res.end(Buffer.from(await response.arrayBuffer()));}

export function feedServer(env:Record<string,string|undefined>):Connect.NextHandleFunction {
  const service=createLayerService(env);
  return (req,res,next)=>{
    const requestUrl=new URL(req.url??'/', 'http://localhost');
    if(!requestUrl.pathname.startsWith('/api/'))return next();
    if(requestUrl.pathname==='/api/platform'){void Promise.all([webRequest(req),import('./platform-api')]).then(([r,m])=>m.handlePlatform(r,env)).then(r=>send(r,res));return;}
    res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
    if(req.method!=='GET'){res.statusCode=405;res.end(JSON.stringify({error:'GET only'}));return;}
    if(requestUrl.pathname==='/api/health'){void import('./platform-store').then(m=>m.platformRepository(env).listFeedSnapshots()).then(snapshots=>{const byId=new Map(snapshots.map(v=>[v.id,v]));const feeds=service.definitions.map(d=>{const s=byId.get(d.id),age=s?.fetchedAt?(Date.now()-Date.parse(s.fetchedAt))/60000:Infinity;return{id:d.id,status:d.disabledReason?'disabled':!s?'cold':s.error?'error':age>(d.cadenceMinutes??5)*2?'stale':'healthy'};});const active=feeds.filter(v=>v.status!=='disabled'),healthy=active.filter(v=>v.status==='healthy').length;res.end(JSON.stringify({status:healthy===active.length?'healthy':healthy?'degraded':'cold',summary:{healthy,total:active.length},feeds}));});return;}
    if(requestUrl.pathname==='/api/layers'){res.end(JSON.stringify(service.definitions.map(({parse,fetchPayload,...meta})=>meta)));return;}
    if(requestUrl.pathname==='/api/screen'){
      const name=requestUrl.searchParams.get('name')?.trim(),lists=requestUrl.searchParams.get('lists')?.split(',')??[];
      if(!name){res.statusCode=400;res.end(JSON.stringify({error:'A name is required'}));return;}
      void service.screen(name,lists).then(v=>res.end(JSON.stringify(v))).catch(()=>{res.statusCode=500;res.end(JSON.stringify({error:'Screening service unavailable'}));});return;
    }
    const match=requestUrl.pathname.match(/^\/api\/layers\/([^/]+)$/);
    if(!match)return next();
    void service.loadPublic(decodeURIComponent(match[1])).then(v=>res.end(JSON.stringify(v))).catch(()=>{res.statusCode=500;res.end(JSON.stringify({id:match[1],events:[],recordCount:0,error:'Feed service unavailable'}));});
  };
}
