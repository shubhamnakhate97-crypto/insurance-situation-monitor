/* SPDX-License-Identifier: MIT */
import { createLayerService } from '../../apps/web/layer-service.js';

const service=createLayerService(process.env);
export default {
  async fetch(request:Request) {
    if(request.method!=='GET')return Response.json({error:'GET only'},{status:405});
    const id=new URL(request.url).pathname.split('/').filter(Boolean).at(-1)??'';
    const result=await service.loadPublic(decodeURIComponent(id));
    return Response.json(result,{status:result.error==='Unknown layer'?404:200});
  }
};
