import {it} from 'vitest';
import {layerDefinitions,loadLayer} from '../src/live-layers';
import {restrictedLayers} from '../src/restricted-layers';
it.skipIf(!process.env.LIVE_LAYER)('checks a real layer without substituting fixtures',async()=>{
  const definition=[...layerDefinitions,...restrictedLayers(process.env)].find(d=>d.id===process.env.LIVE_LAYER)!;
  const result=await loadLayer(definition,{mode:'live',now:new Date()});
  console.log(JSON.stringify({id:result.id,endpoint:result.endpoint,fetchedAt:result.fetchedAt,error:result.error,
    records:result.events.length,points:result.events.filter(e=>e.geometry?.type==='Point').length,
    lines:result.events.filter(e=>e.geometry?.type.includes('LineString')).length,
    polygons:result.events.filter(e=>e.geometry?.type.includes('Polygon')).length,
    sampleTitle:result.events[0]?.title.value},null,2));
},30000);
