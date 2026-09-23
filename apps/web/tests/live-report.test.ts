/* SPDX-License-Identifier: MIT */
import {it} from 'vitest';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {usgsEarthquakeAdapter} from '@insurance/engine-core';
import {createSyntheticPortfolio} from '@insurance/overlay-pro';

// Opt-in diagnostic, not an offline correctness test. Failures are recorded, never replaced.
it.skipIf(process.env.LIVE_REPORT!=='1')('records actual feed availability and geometry counts',async()=>{
  const at=new Date();const results:any[]=[];
  const count=(r:any)=>({id:r.id,endpoint:r.endpoint,endpoints:r.endpoints??[r.endpoint],fetchedAt:r.fetchedAt??null,liveData:!r.error&&r.events.length>0,records:r.events.length,
    points:r.events.filter((e:any)=>e.geometry?.type==='Point'||(!e.geometry&&e.position)).length,
    lines:r.events.filter((e:any)=>e.geometry?.type?.includes('LineString')).length,
    polygons:r.events.filter((e:any)=>e.geometry?.type?.includes('Polygon')).length,error:r.error??null,warnings:r.warnings??[]});
  const events=await usgsEarthquakeAdapter.load({mode:'live',now:at});
  results.push(count({id:'usgs',events,fetchedAt:events[0]?.title.provenance.fetchedAt,endpoint:`${usgsEarthquakeAdapter.endpoint}?format=geojson&starttime=${new Date(at.getTime()-30*86400000).toISOString().slice(0,10)}&minmagnitude=2.5`}));
  const catalogue=await (await fetch('http://localhost:3000/api/layers')).json();
  for(const layer of catalogue){
    try{const r=await(await fetch(`http://localhost:3000/api/layers/${layer.id}`,{signal:AbortSignal.timeout(90000)})).json();results.push(count(r));}
    catch(e){results.push({id:layer.id,endpoint:layer.endpoint,liveData:false,records:0,points:0,lines:0,polygons:0,error:String(e)});}
    console.log(JSON.stringify(results.at(-1)));
  }
  results.push({id:'portfolio',endpoint:'Local synthetic portfolio generator v1',liveData:false,synthetic:true,records:createSyntheticPortfolio().sites.length,points:150,lines:0,polygons:0});
  const dir=resolve(process.cwd(),'../../outputs');await mkdir(dir,{recursive:true});
  await writeFile(resolve(dir,'live-layer-report.json'),JSON.stringify({checkedAt:at.toISOString(),results},null,2));
},300000);
