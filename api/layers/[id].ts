/* SPDX-License-Identifier: MIT */
import { createLayerService } from '../../apps/web/layer-service';

const service=createLayerService(process.env);
export default async function handler(req:any,res:any) {
  if(req.method!=='GET')return res.status(405).json({error:'GET only'});
  const id=Array.isArray(req.query.id)?req.query.id[0]:req.query.id;
  const result=await service.loadPublic(String(id??''));
  return res.status(result.error==='Unknown layer'?404:200).json(result);
}
