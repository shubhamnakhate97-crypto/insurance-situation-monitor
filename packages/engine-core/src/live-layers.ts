/* SPDX-License-Identifier: MIT */
import { fact } from './provenance';
import { INVESTIGATION_DISCLAIMER, type EventKind, type SituationEvent } from './types';
import type { AdapterContext } from './adapters';
import { parseUsgsGeoJson } from './adapters';
import { XMLParser } from 'fast-xml-parser';
export const xml = new XMLParser({ignoreAttributes:false,parseTagValue:false});
export const array = (v:any):any[] => v == null ? [] : Array.isArray(v) ? v : [v];

export interface LayerDefinition {
  id: string; name: string; source: string; endpoint: string; group: string; color: string;
  defaultOn: boolean; cadenceMinutes?: number; note?: string; format?: 'xml'|'text'; timeoutMs?:number;
  disabledReason?: string;
  parse: (payload: any, fetchedAt: string) => SituationEvent[];
  fetchPayload?: (fetcher: typeof fetch) => Promise<any>;
}
export interface LayerResult {
  id: string; endpoint: string; fetchedAt?: string; attemptedAt: string;
  events: SituationEvent[]; error?: string; cached?: boolean; warnings?:string[]; endpoints?:string[];
}
export function sourcedEvent(id: string, title: string, kind: EventKind, source: string, url: string, at: string,
  geometry: SituationEvent['geometry'], summary = '', severity = 0.5, observed = at): SituationEvent {
  const p = { sourceName: source, sourceUrl: url, fetchedAt: at };
  const coordinates = geometry?.type === 'Point' ? geometry.coordinates as number[] : undefined;
  return { id, kind, title: fact(title,p), observedAt: fact(observed,p), severity: fact(severity,p),
    summary: fact(summary,p), geometry, position: coordinates && Number.isFinite(coordinates[0]) && Number.isFinite(coordinates[1])
      ? fact({lon:coordinates[0],lat:coordinates[1]},p) : undefined,
    status: 'monitoring', tags: [source], disclaimer: INVESTIGATION_DISCLAIMER };
}
export const layerDefinitions: LayerDefinition[] = [];
export async function request(url:string, fetcher:typeof fetch=fetch, format?:'xml'|'text',timeoutMs=25000):Promise<any> {
  const response=await fetcher(url,{signal:AbortSignal.timeout(timeoutMs)});
  if(!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return format==='xml'?xml.parse(await response.text()):format==='text'?await response.text():response.json();
}
const cache = new Map<string, { expires: number; result: LayerResult }>();
const pending = new Map<string, Promise<LayerResult>>();
export async function loadLayer(definition: LayerDefinition, context: AdapterContext): Promise<LayerResult> {
  const key = definition.id + definition.endpoint;
  const cached = cache.get(key);
  if (cached && cached.expires > context.now.getTime()) return {...cached.result,cached:true};
  if (pending.has(key)) return pending.get(key)!;
  const operation = (async (): Promise<LayerResult> => {
    const attemptedAt = context.now.toISOString();
    try {
      if (context.mode !== 'live') throw new Error('Live mode required');
      if (definition.disabledReason) throw new Error(definition.disabledReason);
      const fetcher = context.fetcher ?? fetch;
      const payload = definition.fetchPayload ? await definition.fetchPayload(fetcher) : await request(definition.endpoint,fetcher,definition.format,definition.timeoutMs);
      const fetchedAt = new Date().toISOString();
      const events = definition.parse(payload, fetchedAt);
      const result = {id:definition.id,endpoint:definition.endpoint,attemptedAt,fetchedAt,events,warnings:payload?.warnings as string[]|undefined,endpoints:payload?.endpoints as string[]|undefined};
      cache.set(key,{expires:Date.now()+(definition.cadenceMinutes??5)*60000,result});
      return result;
    } catch(error) {
      return {id:definition.id,endpoint:definition.endpoint,attemptedAt,events:[],error:error instanceof Error?error.message:String(error)};
    }
  })();
  pending.set(key,operation);
  try { return await operation; } finally { pending.delete(key); }
}

export const GDACS_URL = 'https://www.gdacs.org/xml/rss.xml';
export function parseGdacs(payload:any, at:string):SituationEvent[] {
  if(payload.rss) return array(payload.rss.channel?.item).flatMap((p:any,i:number)=>{
    const point=String(p['georss:point']??'').trim().split(/\s+/).map(Number);
    if(point.length!==2 || !point.every(Number.isFinite)) return [];
    const kinds:Record<string,EventKind>={EQ:'earthquake',TC:'cyclone',FL:'flood',VO:'volcano',DR:'drought',WF:'wildfire'};
    return [sourcedEvent(`gdacs-${p['gdacs:eventtype']}-${p['gdacs:eventid']??i}`,p.title,kinds[p['gdacs:eventtype']]??'weather','GDACS',p.link??GDACS_URL,at,{type:'Point',coordinates:[point[1],point[0]]},p.description??'',({Red:.9,Orange:.65,Green:.3} as Record<string,number>)[p['gdacs:alertlevel']]??.5,p.pubDate??at)];
  });
  if(!Array.isArray(payload.features)) throw new Error('Expected GDACS FeatureCollection');
  const kinds: Record<string,EventKind> = {EQ:'earthquake',TC:'cyclone',FL:'flood',VO:'volcano',DR:'drought',WF:'wildfire'};
  return payload.features.filter((f:any)=>f.geometry).map((f:any,i:number)=>{
    const p=f.properties??{};
    return sourcedEvent(`gdacs-${p.eventtype}-${p.eventid??i}`,p.name??p.eventname??p.description??'GDACS alert',kinds[p.eventtype]??'weather',
      'GDACS',p.url?.report??p.url??GDACS_URL,at,f.geometry,p.description??p.htmldescription??'',
      ({Red:0.9,Orange:0.65,Green:0.3} as Record<string,number>)[p.alertlevel]??0.5,p.fromdate??at);
  });
}
layerDefinitions.push({id:'gdacs',name:'Multi-hazard alerts',source:'GDACS',endpoint:GDACS_URL,group:'Natural perils',color:'#ff78b1',defaultOn:true,format:'xml',parse:parseGdacs});

export const NHC_URL='https://www.nhc.noaa.gov/CurrentStorms.json';
export const NHC_GIS='https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather/MapServer';
export function parseNhc(payload:any,at:string):SituationEvent[] {
  if(!Array.isArray(payload.activeStorms)) throw new Error('Expected NHC activeStorms');
  return payload.activeStorms.flatMap((s:any)=>{
    const url=s.publicAdvisory?.url??NHC_URL;
    const point=sourcedEvent(`nhc-${s.id}`,`${s.name} · ${s.classification}`,'cyclone','NOAA NHC',url,at,
      {type:'Point',coordinates:[s.longitudeNumeric,s.latitudeNumeric]},`Wind ${s.intensity} kt; pressure ${s.pressure} hPa. NHC Atlantic/Eastern/Central Pacific coverage.`,Math.min(1,Number(s.intensity)/150),s.lastUpdate);
    return [point,...(payload.tracks??[]).filter((t:any)=>t.properties?.binnumber===s.binNumber).map((t:any)=>sourcedEvent(`${point.id}-forecast`,`${s.name} · forecast track (not observed)`,'cyclone','NOAA NHC',url,at,t.geometry,'Forecast centreline, not a hazard footprint or loss estimate.',point.severity.value,s.lastUpdate))];
  });
}
layerDefinitions.push({id:'nhc',name:'Cyclones & forecast tracks',source:'NOAA NHC',endpoint:NHC_URL,group:'Natural perils',color:'#e668ff',defaultOn:true,parse:parseNhc,
  fetchPayload:async(fetcher)=>{
    const data=await request(NHC_URL,fetcher);
    if(!data.activeStorms?.length) return data;
    const warnings:string[]=[];
    const endpoints=[NHC_URL,`${NHC_GIS}?f=pjson`];
    let metadata:any;
    try{metadata=await request(`${NHC_GIS}?f=pjson`,fetcher);}catch{return {...data,warnings:['Forecast track catalogue unavailable; current positions only.']};}
    const tracks=await Promise.all(data.activeStorms.map(async(s:any)=>{
      const layer=metadata.layers.find((l:any)=>l.name===`${s.binNumber} Forecast Track`);
      try{if(!layer)return [];const url=`${NHC_GIS}/${layer.id}/query?where=1%3D1&outFields=*&outSR=4326&f=geojson`;endpoints.push(url);return (await request(url,fetcher)).features;}catch{warnings.push(`${s.binNumber} forecast track unavailable; current position retained.`);return [];}
    }));
    return {...data,tracks:tracks.flat(),warnings,endpoints};
  }});

export const GDELT_URL='https://api.gdeltproject.org/api/v2/geo/geo?query=%28protest%20OR%20conflict%20OR%20unrest%29&mode=PointData&format=GeoJSON&timespan=72h';
export function parseGdelt(data:any,at:string):SituationEvent[] {
  if(!Array.isArray(data.features)) throw new Error('Expected GDELT GeoJSON');
  return data.features.filter((f:any)=>f.geometry?.type==='Point').map((f:any,i:number)=>sourcedEvent(`gdelt-${i}`,f.properties?.name??'Reported unrest location','conflict','GDELT',GDELT_URL,at,f.geometry,
    `Media-mentioned location, NOT a verified incident or precise footprint. Mentions: ${f.properties?.count??'not supplied'}.`,0.5));
}
layerDefinitions.push({id:'gdelt',name:'Media-mentioned unrest · 72h',source:'GDELT',endpoint:GDELT_URL,group:'Geopolitical & sanctions',color:'#da5349',defaultOn:false,parse:parseGdelt});

export const OFAC_URL='https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.XML';
export const UN_URL='https://scsanctions.un.org/resources/xml/en/consolidated.xml';
export const EU_URL='https://webgate.ec.europa.eu/fsd/fsf/public/files/xmlFullSanctionsList_1_1/content?token=dG9rZW4tMjAxNw';
function designation(id:string,name:string,aliases:string[],program:string,source:string,url:string,at:string) {
  const event=sourcedEvent(id,name,'sanctions',source,url,at,undefined,`${program}; aliases: ${aliases.join('; ')}`);
  event.tags=aliases; return event;
}
export function parseOfac(data:any,at:string):SituationEvent[] {
  if(!data.sdnList) throw new Error('Expected OFAC SDN XML');
  return array(data.sdnList.sdnEntry).map(p=>designation(`ofac-${p.uid}`,[p.firstName,p.lastName].filter(Boolean).join(' '),array(p.akaList?.aka).map(a=>[a.firstName,a.lastName].filter(Boolean).join(' ')),array(p.programList?.program).join(', '),'OFAC SDN',OFAC_URL,at));
}
export function parseUn(data:any,at:string):SituationEvent[] {
  if(!data.CONSOLIDATED_LIST) throw new Error('Expected UN consolidated XML');
  const root=data.CONSOLIDATED_LIST;
  return [...array(root.INDIVIDUALS?.INDIVIDUAL),...array(root.ENTITIES?.ENTITY)].map(p=>designation(`un-${p.DATAID}`,[p.FIRST_NAME,p.SECOND_NAME,p.THIRD_NAME,p.FOURTH_NAME].filter(Boolean).join(' '),[...array(p.INDIVIDUAL_ALIAS),...array(p.ENTITY_ALIAS)].map(a=>a.ALIAS_NAME).filter(Boolean),p.UN_LIST_TYPE??'UN Security Council','UN Security Council',UN_URL,at));
}
export function parseEu(data:any,at:string):SituationEvent[] {
  if(!data.export) throw new Error('Expected EU sanctions XML');
  return array(data.export.sanctionEntity).map(p=>{const names=array(p.nameAlias).map(a=>a['@_wholeName']).filter(Boolean);return designation(`eu-${p['@_logicalId']}`,names[0]??'Unnamed EU entry',names.slice(1),array(p.regulation).map(r=>r['@_programme']).join(', '),'EU consolidated sanctions',EU_URL,at);});
}
for(const [id,name,endpoint,parse] of [['ofac','OFAC SDN',OFAC_URL,parseOfac],['eu','EU consolidated sanctions',EU_URL,parseEu],['un','UN Security Council',UN_URL,parseUn]] as const)
  layerDefinitions.push({id,name,source:name,endpoint,parse,format:'xml',timeoutMs:60000,cadenceMinutes:1440,group:'Geopolitical & sanctions',color:'#d9a85d',defaultOn:false,note:'Name screening only. No invented location; absence of a match is not clearance.'});

export const VOLCANO_URL='https://volcano.si.edu/news/WeeklyVolcanoRSS.xml';
export function parseVolcano(data:any,at:string):SituationEvent[] {
  if(!data.rss?.channel) throw new Error('Expected volcano RSS');
  return array(data.rss.channel.item).flatMap((p:any,i:number)=>{
    const coords=String(p['georss:point']??'').trim().split(/\s+/).map(Number);
    if(coords.length!==2||!coords.every(Number.isFinite)) return [];
    return [sourcedEvent(`volcano-${i}`,p.title,'volcano','Smithsonian / USGS GVP',typeof p.guid==='string'?p.guid:p.guid?.['#text']??p.link,at,{type:'Point',coordinates:[coords[1],coords[0]]},'Weekly activity report. Not a comprehensive eruption inventory; follow the source for hazard guidance.',0.5,p.pubDate)];
  });
}
layerDefinitions.push({id:'volcano',name:'Weekly volcanic activity',source:'Smithsonian / USGS GVP',endpoint:VOLCANO_URL,group:'Natural perils',color:'#e49a43',defaultOn:true,cadenceMinutes:60,format:'xml',parse:parseVolcano});

export const AQ_CITIES=[['Delhi',28.61,77.21],['Mumbai',19.08,72.88],['London',51.51,-0.13],['New York',40.71,-74.01],['Beijing',39.9,116.4],['Singapore',1.35,103.82],['Sydney',-33.87,151.21],['Lagos',6.52,3.38],['Sao Paulo',-23.55,-46.63],['Dubai',25.2,55.27]] as const;
export const AQ_URL=`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${AQ_CITIES.map(c=>c[1]).join(',')}&longitude=${AQ_CITIES.map(c=>c[2]).join(',')}&current=us_aqi,pm2_5&timezone=GMT`;
export function parseAirQuality(data:any,at:string):SituationEvent[] {
  return array(data).flatMap((p:any,i:number)=>{
    if(!p.current || !Number.isFinite(p.current.us_aqi)) return [];
    return [sourcedEvent(`aq-${i}`,`${AQ_CITIES[i]?.[0]??'Sample'} · US AQI ${p.current.us_aqi}`,'air-quality','Open-Meteo / CAMS',AQ_URL,at,{type:'Point',coordinates:[p.longitude,p.latitude]},`Modelled grid sample, not a station. PM2.5 ${p.current.pm2_5} µg/m³. Free API: non-commercial use only.`,Math.min(1,p.current.us_aqi/300),`${p.current.time}Z`)];
  });
}
layerDefinitions.push({id:'air-quality',name:'City air quality · modelled',source:'Open-Meteo / CAMS',endpoint:AQ_URL,group:'Environmental',color:'#98c557',defaultOn:false,cadenceMinutes:60,parse:parseAirQuality,note:'10 city samples. Free API is non-commercial only; TODO(me): commercial plan before commercial use.'});

export const NWS_URL='https://api.weather.gov/alerts/active';
export function parseNws(data:any,at:string):SituationEvent[] {
  if(!Array.isArray(data.features)) throw new Error('Expected NWS FeatureCollection');
  return data.features.map((f:any)=>{const p=f.properties;return sourcedEvent(`nws-${f.id}`,p.headline??p.event,'weather','NOAA NWS',p['@id']??f.id??NWS_URL,at,f.geometry??undefined,
    `${p.event}; ${p.severity}; ${p.areaDesc}. US coverage only. ${f.geometry?'Source warning polygon.':'No explicit polygon supplied; not plotted.'}`,({Extreme:1,Severe:.8,Moderate:.5,Minor:.2} as Record<string,number>)[p.severity]??.3,p.sent);});
}
layerDefinitions.push({id:'nws',name:'Severe weather · US only',source:'NOAA NWS',endpoint:NWS_URL,group:'Natural perils',color:'#4eb8ed',defaultOn:true,parse:parseNws});

export const SIGNIFICANT_URL='https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_month.geojson';
export function parseSignificant(data:any,at:string):SituationEvent[] {
  if(!Array.isArray(data.features)) throw new Error('Expected USGS FeatureCollection');
  return parseUsgsGeoJson(data,at).map(e=>({...e,id:`significant-${e.id}`,geometry:{type:'Point',coordinates:[e.position!.value.lon,e.position!.value.lat]},summary:fact(`${e.summary.value} USGS significant-event subset; a tsunami flag is NOT an active tsunami warning.`,e.summary.provenance)}));
}
layerDefinitions.push({id:'significant',name:'Significant earthquakes · 30d',source:'USGS',endpoint:SIGNIFICANT_URL,group:'Natural perils',color:'#f33668',defaultOn:true,parse:parseSignificant,note:'Overlaps the earthquake layer. Not an active tsunami warning service.'});

export const WB_URL='https://api.worldbank.org/v2/country/all/indicator/GOV_WGI_PV.EST?source=3&format=json&per_page=400&mrnev=1';
export const BOUNDARIES_URL='https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson';
export function parseWorldBank(data:any,at:string):SituationEvent[] {
  if(!Array.isArray(data.indicator?.[1])||!Array.isArray(data.boundaries?.features)) throw new Error('Expected World Bank indicator and Natural Earth boundaries');
  const rows=new Map(data.indicator[1].filter((r:any)=>r.value!==null).map((r:any)=>[r.countryiso3code,r]));
  return data.boundaries.features.flatMap((f:any)=>{
    const p=f.properties;const row:any=rows.get(p.ADM0_A3)??rows.get(p.ISO_A3);
    if(!row || !Number.isFinite(row.value)) return [];
    const e=sourcedEvent(`wb-${row.countryiso3code}`,`${row.country.value} · political stability ${row.value.toFixed(2)} (${row.date})`,'country-risk','World Bank WGI + Natural Earth',WB_URL,at,f.geometry,
      `GOV_WGI_PV.EST: political stability estimate. Annual contextual indicator, not current-event risk or loss. Higher values indicate better stability. Boundary source: ${BOUNDARIES_URL}; disputed boundaries are illustrative.`,Math.max(0,Math.min(1,(2.5-row.value)/5)),`${row.date}-01-01`);
    return [e];
  });
}
layerDefinitions.push({id:'world-bank',name:'Political stability · annual',source:'World Bank WGI / Natural Earth',endpoint:WB_URL,group:'Geopolitical & sanctions',color:'#986ce0',defaultOn:false,cadenceMinutes:1440,parse:parseWorldBank,
 fetchPayload:async f=>({indicator:await request(WB_URL,f),boundaries:await request(BOUNDARIES_URL,f),endpoints:[WB_URL,BOUNDARIES_URL]})});
