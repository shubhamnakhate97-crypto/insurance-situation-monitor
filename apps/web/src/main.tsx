/* SPDX-License-Identifier: MIT */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import maplibregl, { type GeoJSONSource } from 'maplibre-gl';
import type { FeatureCollection, Geometry } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';
import { INVESTIGATION_DISCLAIMER, usgsEarthquakeAdapter, type SanctionsScreening, type UsgsEarthquakeEvent, type SituationEvent, type LayerDefinition, type LayerResult, type Provenance } from '@insurance/engine-core';
import { nearestAnalog, rdsScenarios } from '@insurance/insurance-lenses';
import { accumulations, createSyntheticPortfolio, exposureWeightedAlerts, money, stressScenario, type Site } from '@insurance/overlay-pro';

type LayerMeta=Omit<LayerDefinition,'parse'|'fetchPayload'>;
const quakeMeta:LayerMeta={id:'usgs',name:'Earthquakes M2.5+ · 30d',source:'USGS FDSN',endpoint:usgsEarthquakeAdapter.endpoint,group:'Natural perils',color:'#f0c35b',defaultOn:true};
const siteMeta:LayerMeta={id:'portfolio',name:'Insured sites · SYNTHETIC',source:'Synthetic portfolio generator v1',endpoint:'https://github.com/shubhamnakhate97-crypto/insurance-situation-monitor/tree/main/packages/overlay-pro',group:'Portfolio',color:'#6f7cff',defaultOn:true};
const groups=['Natural perils','Geopolitical & sanctions','Environmental','Portfolio','Restricted (keyed / licensed)'];
const geometry=(e:SituationEvent):Geometry|undefined=>(e.geometry as Geometry|undefined)??(e.position?{type:'Point',coordinates:[e.position.value.lon,e.position.value.lat]}:undefined);
function geoJson(events:SituationEvent[]):FeatureCollection {
  return {type:'FeatureCollection',features:events.flatMap(e=>{const g=geometry(e);return g?[{type:'Feature' as const,id:e.id,geometry:g,properties:{id:e.id,severity:e.severity.value,magnitude:(e as UsgsEarthquakeEvent).magnitude?.value??0}}]:[];})};
}
function sourceLink(p:Provenance):HTMLAnchorElement {
  const link=document.createElement('a');link.href=/^https?:\/\//i.test(p.sourceUrl)?p.sourceUrl:'#';link.target='_blank';link.rel='noreferrer';
  link.textContent=`Source: ${p.sourceName} · fetched ${p.fetchedAt}`;return link;
}
function Citation({p}:{p:Provenance}){return <small><a href={p.sourceUrl} target="_blank" rel="noreferrer">Source: {p.sourceName} · fetched {p.fetchedAt}</a></small>;}
function popup(event:SituationEvent):HTMLDivElement {
  const root=document.createElement('div');root.className='quake-popup';
  const title=document.createElement('h2');title.textContent=event.title.value;root.append(title);
  const add=(text:string)=>{const p=document.createElement('p');p.textContent=text;root.append(p);};
  add(event.summary.value.replace(/<[^>]+>/g,' ').slice(0,1300));add(`Observed / source reference date: ${event.observedAt.value}`);
  if(event.kind==='earthquake'||event.kind==='cyclone') {
    add('Insurance context: investigate property and business-interruption exposure. Return period is not estimated from this feed; not a loss estimate.');
    if(event.position){const a=nearestAnalog(event);add(`Nearest reference in the small curated same-peril library: ${a.name.value} (illustrative, not calibrated).`);root.append(sourceLink(a.name.provenance));}
  }else add('Context only — not a loss estimate or a verified insured event.');
  root.append(sourceLink(event.title.provenance));add(INVESTIGATION_DISCLAIMER);return root;
}

function WorldMap({definitions,results,enabled,sites,onStatus}:{definitions:LayerMeta[];results:Record<string,LayerResult>;enabled:Record<string,boolean>;sites:Site[];onStatus:(s:string)=>void}) {
  const container=useRef<HTMLDivElement>(null),mapRef=useRef<maplibregl.Map|null>(null);
  const latest=useRef({definitions,results,enabled,sites});latest.current={definitions,results,enabled,sites};
  const [ready,setReady]=useState(false);
  useEffect(()=>{
    if(!container.current)return;
    const map=new maplibregl.Map({container:container.current,center:[20,18],zoom:1.4,minZoom:1,attributionControl:false,style:{version:8,sources:{osm:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,maxzoom:19,attribution:'© OpenStreetMap contributors'}},layers:[{id:'basemap',type:'raster',source:'osm'}]}});
    mapRef.current=map;map.addControl(new maplibregl.NavigationControl(),'top-right');map.addControl(new maplibregl.AttributionControl({compact:true}),'bottom-right');
    map.on('load',()=>setReady(true));map.on('idle',()=>{if(map.isSourceLoaded('osm'))onStatus('Basemap tiles loaded');});
    map.on('error',e=>{if('sourceId' in e&&e.sourceId==='osm')onStatus('Basemap tile request failed');});
    map.on('click',click=>{
      const active=latest.current.definitions.filter(d=>latest.current.enabled[d.id]).flatMap(d=>['point','line','fill'].map(t=>`${d.id}-${t}`)).filter(id=>map.getLayer(id));
      const hit=map.queryRenderedFeatures(click.point,{layers:active})[0];if(!hit)return;
      const layer=String(hit.source),id=String(hit.properties.id);
      if(layer==='portfolio'){
        const site=latest.current.sites.find(s=>s.id===id);if(!site)return;
        const node=document.createElement('div');node.className='quake-popup';const title=document.createElement('h2');title.textContent=site.name;
        const detail=document.createElement('p');detail.textContent=`SYNTHETIC · ${site.country} · ${money(site.sumInsured)} sum insured`;
        node.append(title,detail,sourceLink(site.provenance));new maplibregl.Popup({maxWidth:'360px'}).setLngLat(click.lngLat).setDOMContent(node).addTo(map);
      }else{
        const event=latest.current.results[layer]?.events.find(e=>e.id===id);if(event)new maplibregl.Popup({maxWidth:'360px'}).setLngLat(click.lngLat).setDOMContent(popup(event)).addTo(map);
      }
    });
    return()=>{setReady(false);map.remove();mapRef.current=null;};
  },[onStatus]);
  useEffect(()=>{
    const map=mapRef.current;if(!ready||!map)return;
    for(const d of definitions){
      const data:FeatureCollection=d.id==='portfolio'?{type:'FeatureCollection',features:sites.map(s=>({type:'Feature',id:s.id,geometry:{type:'Point',coordinates:[s.position.lon,s.position.lat]},properties:{id:s.id,severity:0,magnitude:0}}))}:geoJson(results[d.id]?.events??[]);
      const source=map.getSource(d.id) as GeoJSONSource|undefined;if(source)source.setData(data);else map.addSource(d.id,{type:'geojson',data});
    }
    // Polygon fills always below lines/points, independent of fetch completion order.
    for(const type of ['fill','line','point'] as const)for(const d of definitions){
      const id=`${d.id}-${type}`;
      if(!map.getLayer(id)){
        if(type==='fill')map.addLayer({id,type:'fill',source:d.id,filter:['==',['geometry-type'],'Polygon'],paint:{'fill-color':d.id==='world-bank'?['interpolate',['linear'],['get','severity'],0,'#4bc9b4',.5,'#d6bc67',1,'#b73f62']:d.color,'fill-opacity':.27}});
        if(type==='line')map.addLayer({id,type:'line',source:d.id,filter:['==',['geometry-type'],'LineString'],paint:{'line-color':d.color,'line-width':3}});
        if(type==='point')map.addLayer({id,type:'circle',source:d.id,filter:['==',['geometry-type'],'Point'],paint:{'circle-color':d.id==='usgs'?['interpolate',['linear'],['get','magnitude'],2.5,'#62d5c4',4,'#f0c35b',6,'#f0785e',8,'#b92f45']:d.color,'circle-radius':d.id==='usgs'?['interpolate',['linear'],['get','magnitude'],2.5,3,4,5,6,10,8,16]:d.id==='portfolio'?4:6,'circle-opacity':.85,'circle-stroke-color':'#fff','circle-stroke-width':.8}});
        map.on('mouseenter',id,()=>{map.getCanvas().style.cursor='pointer';});map.on('mouseleave',id,()=>{map.getCanvas().style.cursor='';});
      }
      map.setLayoutProperty(id,'visibility',enabled[d.id]?'visible':'none');map.moveLayer(id);
    }
  },[definitions,results,enabled,sites,ready]);
  return <div ref={container} className="world-map" aria-label="Live multi-source world map"/>;
}

function App(){
  const [definitions,setDefinitions]=useState<LayerMeta[]>([quakeMeta,siteMeta]),[results,setResults]=useState<Record<string,LayerResult>>({});
  const [enabled,setEnabled]=useState<Record<string,boolean>>({usgs:true,portfolio:true}),[loading,setLoading]=useState<Record<string,boolean>>({});
  const [mapStatus,setMapStatus]=useState('Loading basemap…'),[catalogueError,setCatalogueError]=useState('');
  const [query,setQuery]=useState(''),[screenQuery,setScreenQuery]=useState('');
  const [screening,setScreening]=useState<SanctionsScreening>(),[screeningLoading,setScreeningLoading]=useState(false),[screenError,setScreenError]=useState('');
  const [deskOpen,setDeskOpen]=useState(false);
  const pending=useRef(new Set<string>());const portfolio=useMemo(()=>createSyntheticPortfolio(),[]);
  const load=useCallback(async(id:string)=>{
    if(id==='portfolio'||pending.current.has(id))return;pending.current.add(id);setLoading(s=>({...s,[id]:true}));let result:LayerResult;
    try{
      if(id==='usgs'){
        const now=new Date(),events=await usgsEarthquakeAdapter.load({mode:'live',now});
        result={id,events,endpoint:`${quakeMeta.endpoint}?format=geojson&starttime=${new Date(now.getTime()-30*86400000).toISOString().slice(0,10)}&minmagnitude=2.5`,attemptedAt:now.toISOString(),fetchedAt:events[0]?.title.provenance.fetchedAt,error:events.length?undefined:'USGS returned no events; feed may be unavailable.'};
      }else{
        const response=await fetch(`/api/layers/${id}`,{signal:AbortSignal.timeout(90000)});if(!response.ok)throw new Error(`Feed service HTTP ${response.status}`);
        result=await response.json();if(!Array.isArray(result.events))throw new Error('Invalid feed response');
      }
    }catch(error){result={id,events:[],endpoint:'',attemptedAt:new Date().toISOString(),error:error instanceof Error?error.message:String(error)};}
    setResults(s=>({...s,[id]:result}));setLoading(s=>({...s,[id]:false}));pending.current.delete(id);
  },[]);
  useEffect(()=>{
    void load('usgs');fetch('/api/layers').then(r=>{if(!r.ok)throw new Error('Feed service unavailable');return r.json();}).then((meta:LayerMeta[])=>{
      if(!Array.isArray(meta))throw new Error('Invalid feed catalogue');setDefinitions([quakeMeta,...meta,siteMeta]);
      setEnabled(s=>({...s,...Object.fromEntries(meta.map(d=>[d.id,d.defaultOn&&!d.disabledReason]))}));meta.filter(d=>d.defaultOn&&!d.disabledReason).forEach(d=>void load(d.id));
    }).catch(()=>setCatalogueError('Feed catalogue unavailable. Run the Vite server; static-only hosting cannot serve feeds. USGS and portfolio remain independent.'));
  },[load]);
  useEffect(()=>{const timer=setInterval(()=>{definitions.filter(d=>enabled[d.id]&&!d.disabledReason).forEach(d=>void load(d.id));},60000);return()=>clearInterval(timer);},[definitions,enabled,load]);
  const toggle=(d:LayerMeta)=>{setEnabled(s=>({...s,[d.id]:!s[d.id]}));if(!enabled[d.id]&&!d.disabledReason)void load(d.id);};
  const quakeEvents=(results.usgs?.events??[]) as UsgsEarthquakeEvent[];
  const alerts=useMemo(()=>exposureWeightedAlerts(quakeEvents,portfolio),[quakeEvents,portfolio]);
  const concentration=useMemo(()=>accumulations(portfolio),[portfolio]);
  const scenario=useMemo(()=>stressScenario(portfolio,rdsScenarios[0].footprint.value,rdsScenarios[0].severity.value),[portfolio]);
  const sanctionsIds=['ofac','eu','un'].filter(id=>enabled[id]);
  const sanctionsRecordCount=sanctionsIds.reduce((sum,id)=>sum+(results[id]?.recordCount??results[id]?.events.length??0),0);
  const complete=['ofac','eu','un'].every(id=>enabled[id]&&results[id]?.fetchedAt&&!results[id]?.error);
  const submitScreen=async(name:string)=>{
    setScreenQuery(name);setScreening(undefined);setScreenError('');setScreeningLoading(true);
    try{const response=await fetch(`/api/screen?name=${encodeURIComponent(name)}&lists=${encodeURIComponent(sanctionsIds.join(','))}`,{signal:AbortSignal.timeout(90000)});if(!response.ok)throw new Error(`Screening service HTTP ${response.status}`);const body=await response.json();setScreening(body.screening);}
    catch(error){setScreenError(error instanceof Error?error.message:String(error));}
    finally{setScreeningLoading(false);}
  };
  return <main className="map-shell">
    <WorldMap definitions={definitions} results={results} enabled={enabled} sites={portfolio.sites} onStatus={setMapStatus}/>
    <section className="map-panel"><div className="brand"><span>SW</span><div><b>SIGNALWATCH</b><small>INSURANCE SITUATION MONITOR</small></div></div>
      <h1>Global situation<br/><em>live layers</em></h1><p className="intro">Real source reports alongside a clearly synthetic insured book.</p>
      <div className="status" role="status">{mapStatus} · {quakeEvents.length.toLocaleString()} USGS earthquakes</div>{catalogueError&&<p role="alert">{catalogueError}</p>}
      <div className="layer-controls">{groups.map(group=><details key={group} open={group==='Natural perils'||group==='Portfolio'}><summary>{group}</summary>{definitions.filter(d=>d.group===group).map(d=>{
        const r=results[d.id],count=d.id==='portfolio'?portfolio.sites.length:r?.events.filter(e=>!!geometry(e)).length??0;
        return <div className="layer-row" key={d.id}><label><input type="checkbox" checked={!!enabled[d.id]} disabled={!!d.disabledReason} onChange={()=>toggle(d)}/><i style={{background:d.color}}/><span>{d.name}</span></label>
          <small>{d.source} · {d.id==='portfolio'?`${count} synthetic sites`:loading[d.id]?'fetching…':r?.error?'unavailable':r?`${count} map features / ${r.recordCount??r.events.length} records`:'not loaded'}</small>
          {d.id==='world-bank'&&<small>Shading: teal = higher stability; rose = lower. Annual data, not live incidents.</small>}
          {d.note&&<small>{d.note}</small>}{d.disabledReason&&<small className="feed-error">Disabled: {d.disabledReason}</small>}
          {r?.warnings?.map(w=><small className="feed-error" key={w}>{w}</small>)}
          {r?.error&&<><small className="feed-error">{r.error}</small><button onClick={()=>void load(d.id)}>Retry {d.source}</button></>}
          {r?.fetchedAt&&<a href={r.endpoint||d.endpoint} target="_blank" rel="noreferrer">Source: {d.source} · fetched {r.fetchedAt}</a>}
          {d.id==='portfolio'&&<a href={siteMeta.endpoint} target="_blank" rel="noreferrer">Source: synthetic generator · generated {portfolio.sites[0].provenance.fetchedAt}</a>}
        </div>;
      })}</details>)}</div>
    </section>
    <button className="desk-toggle" aria-expanded={deskOpen} onClick={()=>setDeskOpen(s=>!s)}>{deskOpen?'Close desk':'Investigation desk'}</button>
    <aside className={`portfolio-panel ${deskOpen?'desk-open':'desk-closed'}`}><header><div><span>SYNTHETIC BOOK · LIVE CONTEXT</span><h2>Investigation desk</h2></div><b>{portfolio.sites.length} sites</b></header>
      <section><label>EARTHQUAKE EXPOSURE SCREEN</label><h3>{alerts.length} proximity indicators</h3>{alerts[0]?<p>{alerts[0].eventTitle} · {money(alerts[0].exposureAtRisk)} declared exposure within 650 km</p>:<p>No earthquake within the illustrative screening radius of covered sites.</p>}<small>650 km is not a shaking footprint.</small>{alerts[0]&&<Citation p={alerts[0].provenance[0]}/>}<Citation p={portfolio.sites[0].provenance}/></section>
      <section><label>TOP COUNTRY ACCUMULATION</label><h3>{concentration.byCountry[0]?.[0]} · {money(concentration.byCountry[0]?.[1]??0)}</h3><Citation p={portfolio.sites[0].provenance}/></section>
      <section><label>LIVE SANCTIONS NAME SCREEN</label><p>Enable OFAC, EU and UN in the layer controls. Records without source coordinates are not plotted.</p>
        <form onSubmit={e=>{e.preventDefault();void submitScreen(query.trim());}}><input aria-label="Company or person name" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Company or person name"/><button disabled={!query.trim()||!sanctionsRecordCount||screeningLoading}>{screeningLoading?'Screening…':'Screen name'}</button></form>
        <p>{sanctionsRecordCount.toLocaleString()} loaded names · {complete?'All three lists loaded':'INCOMPLETE list coverage'}</p>{screenError&&<p className="feed-error">{screenError}</p>}
        {screening&&<><h3>{screening.status==='CLEAR'?'No candidate in loaded lists':`${screening.status} — review required`}</h3><p>Not compliance clearance. {screenQuery}</p>{screening.evidence.map((e,i)=><p key={i}>{e.matchedName} · {e.list}<br/><a href={e.provenance.sourceUrl} target="_blank" rel="noreferrer">Source · fetched {e.provenance.fetchedAt}</a></p>)}</>}
      </section>
      <section><label>SCENARIO STRESS · SYNTHETIC</label><h3>{rdsScenarios[0].name.value}</h3><p>{scenario.touchedSites.length} sites · {money(scenario.exposureAtRisk)} declared exposure in illustrative footprint</p><Citation p={rdsScenarios[0].name.provenance}/><Citation p={portfolio.sites[0].provenance}/></section>
    </aside>
    <footer className="provenance"><div>Source: USGS FDSN · fetched {results.usgs?.fetchedAt??'pending / unavailable'}</div><div className="disclaimer">{INVESTIGATION_DISCLAIMER}</div></footer>
  </main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
