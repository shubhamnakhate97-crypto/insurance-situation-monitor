/* SPDX-License-Identifier: MIT */
import { createLayerService } from '../../apps/web/layer-service';

const service=createLayerService(process.env);
export default function handler(req:any,res:any) {
  if(req.method!=='GET')return res.status(405).json({error:'GET only'});
  return res.status(200).json(service.definitions.map(({parse,fetchPayload,...meta})=>meta));
}
