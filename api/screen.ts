/* SPDX-License-Identifier: MIT */
import { createLayerService } from '../apps/web/layer-service';

const service=createLayerService(process.env);
export default {
  async fetch(request:Request) {
    if(request.method!=='GET')return Response.json({error:'GET only'},{status:405});
    const search=new URL(request.url).searchParams;
    const name=(search.get('name')??'').trim();
    const lists=(search.get('lists')??'').split(',').filter(Boolean);
    if(!name)return Response.json({error:'A name is required'},{status:400});
    return Response.json(await service.screen(name,lists));
  }
};
