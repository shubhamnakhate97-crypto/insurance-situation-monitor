/* SPDX-License-Identifier: MIT */
import type { Connect } from 'vite';
import { createLayerService } from './layer-service';

export function feedServer(env:Record<string,string|undefined>):Connect.NextHandleFunction {
  const service=createLayerService(env);
  return (req,res,next)=>{
    const requestUrl=new URL(req.url??'/', 'http://localhost');
    if(!requestUrl.pathname.startsWith('/api/'))return next();
    res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
    if(req.method!=='GET'){res.statusCode=405;res.end(JSON.stringify({error:'GET only'}));return;}
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
