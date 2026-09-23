/* SPDX-License-Identifier: MIT */
import { createLayerService } from '../../apps/web/layer-service';

const service=createLayerService(process.env);
export default {
  fetch(request:Request) {
    if(request.method!=='GET')return Response.json({error:'GET only'},{status:405});
    return Response.json(service.definitions.map(({parse,fetchPayload,...meta})=>meta));
  }
};
