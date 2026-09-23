/* SPDX-License-Identifier: MIT */
import { createLayerService } from '../apps/web/layer-service';

const service=createLayerService(process.env);
export default async function handler(req:any,res:any) {
  if(req.method!=='GET')return res.status(405).json({error:'GET only'});
  const name=String(req.query.name??'').trim();
  const lists=String(req.query.lists??'').split(',').filter(Boolean);
  if(!name)return res.status(400).json({error:'A name is required'});
  return res.status(200).json(await service.screen(name,lists));
}
