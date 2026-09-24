/* SPDX-License-Identifier: MIT */
import { request, sourcedEvent, type LayerDefinition } from './live-layers.js';
import type { SituationEvent } from './types.js';
export const FIRMS_URL='https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/VIIRS_SNPP_NRT/world/1';
export function parseFirms(csv:string,at:string):SituationEvent[] {
  const [header,...lines]=csv.trim().split(/\r?\n/); const columns=header.split(',');
  if(!columns.includes('latitude')||!columns.includes('longitude')) throw new Error('Expected FIRMS hotspot CSV');
  return lines.flatMap((line,i)=>{
    const r=Object.fromEntries(line.split(',').map((v,j)=>[columns[j],v]));
    const lat=Number(r.latitude),lon=Number(r.longitude);
    if(!r.latitude||!r.longitude||!Number.isFinite(lat)||!Number.isFinite(lon)) return [];
    const time=r.acq_time?.padStart(4,'0');
    return [sourcedEvent(`firms-${i}`,'VIIRS thermal anomaly','wildfire','NASA FIRMS','https://firms.modaps.eosdis.nasa.gov/',at,{type:'Point',coordinates:[lon,lat]},`Confidence ${r.confidence}; FRP ${r.frp} MW. Thermal anomaly, not confirmed wildfire or loss footprint.`,.5,`${r.acq_date}T${time?.slice(0,2)}:${time?.slice(2)}:00Z`)];
  });
}
export const OPENSKY_URL='https://opensky-network.org/api/states/all';
export function parseOpenSky(data:any,at:string):SituationEvent[] {
  if(!('states' in data)) throw new Error('Expected OpenSky state vectors');
  return (data.states??[]).flatMap((s:any)=>{
    if(!Number.isFinite(s[5])||!Number.isFinite(s[6])) return [];
    return [sourcedEvent(`opensky-${s[0]}`,String(s[1]??s[0]).trim(),'aviation','OpenSky Network',OPENSKY_URL,at,{type:'Point',coordinates:[s[5],s[6]]},`Aircraft state vector. Origin: ${s[2]}; geometric altitude ${s[13]??'unknown'} m. Not a hazard.`,0,new Date(s[4]*1000).toISOString())];
  });
}
export const AIS_URL='wss://stream.aisstream.io/v0/stream';
export function parseAis(data:any,at:string):SituationEvent[] {
  const vessels=new Map<string,SituationEvent>();
  for(const message of Array.isArray(data)?data:[data]) {
    const p=message.Message?.PositionReport,m=message.MetaData;
    if(!p||!m||!Number.isFinite(p.Latitude)||!Number.isFinite(p.Longitude)||Math.abs(p.Latitude)>90||Math.abs(p.Longitude)>180) continue;
    const id=`ais-${m.MMSI}`;
    vessels.set(id,sourcedEvent(id,m.ShipName?.trim()||`Vessel ${m.MMSI}`,'maritime','aisstream.io','https://aisstream.io/',at,{type:'Point',coordinates:[p.Longitude,p.Latitude]},`AIS broadcast; MMSI ${m.MMSI}; speed ${p.Sog} knots. Coverage incomplete. Not a hazard.`,0,m.time_utc??at));
  }
  return [...vessels.values()];
}
export const GDELT_CLOUD_URL='https://gdeltcloud.com/api/v2/events?event_family=conflict&sort=significance&limit=50';
export function parseGdeltCloud(data:any,at:string):SituationEvent[] {
  const rows=data.data??data.events??[];if(!Array.isArray(rows))throw new Error('Expected GDELT Cloud events');
  return rows.map((row:any,i:number)=>{
    const lat=Number(row.latitude??row.location?.latitude??row.geo?.lat),lon=Number(row.longitude??row.location?.longitude??row.geo?.lon);
    const geometry=Number.isFinite(lat)&&Number.isFinite(lon)?{type:'Point' as const,coordinates:[lon,lat]}:undefined;
    return sourcedEvent(`gdelt-cloud-${row.event_id??row.id??i}`,row.title??row.name??row.summary??'GDELT Cloud event','conflict','GDELT Cloud',row.url??row.story_url??'https://gdeltcloud.com/',at,geometry,
      `${row.summary??row.description??'Structured media-derived event.'} Media-derived context requiring human verification.`,Math.max(0,Math.min(1,Number(row.significance??row.magnitude??5)/10)),row.observed_at??row.event_date??at);
  });
}
export const NVD_URL='https://services.nvd.nist.gov/rest/json/cves/2.0';
export function parseNvd(data:any,at:string):SituationEvent[] {
  if(!Array.isArray(data.vulnerabilities))throw new Error('Expected NVD CVE API 2.0 response');
  return data.vulnerabilities.slice(0,200).map((item:any)=>{const cve=item.cve,metrics=cve.metrics??{};const metric=metrics.cvssMetricV31?.[0]??metrics.cvssMetricV40?.[0]??metrics.cvssMetricV30?.[0]??metrics.cvssMetricV2?.[0];const score=Number(metric?.cvssData?.baseScore??0);const description=cve.descriptions?.find((d:any)=>d.lang==='en')?.value??'No English description supplied.';
    return sourcedEvent(`nvd-${cve.id}`,`${cve.id} · ${metric?.cvssData?.baseSeverity??'UNSCORED'}`,'cyber','NIST NVD',`https://nvd.nist.gov/vuln/detail/${cve.id}`,at,undefined,`${description} CVSS base score ${score||'unscored'}. Disclosure volume is context, not predictive cyber scoring.`,Math.max(0,Math.min(1,score/10)),cve.published??at);});
}
export function parseRbi(data:any,at:string):SituationEvent[] {
  const rows=Array.isArray(data)?data:data.data??data.records??[];if(!Array.isArray(rows))throw new Error('Expected RBI JSON records');
  return rows.slice(0,20).map((r:any,i:number)=>sourcedEvent(`rbi-${r.id??i}`,r.title??r.indicator??'RBI economic indicator','country-risk','Reserve Bank of India',r.url??'https://www.rbi.org.in/',at,undefined,`${r.value??r.description??'Official RBI context record'}. Background context only.`,.3,r.date??at));
}
export function parseTrends(data:any,at:string):SituationEvent[] {
  const rows=data.data??data.interest??data.results??[];if(!Array.isArray(rows))throw new Error('Expected approved trends-provider response');
  return rows.slice(0,50).map((r:any,i:number)=>sourcedEvent(`trend-${r.id??i}`,`${r.term??r.query??'Insurance search demand'} · ${r.region??'unspecified region'}`,'country-risk','Approved Google Trends provider',r.sourceUrl??'https://trends.google.com/',at,undefined,`Search interest ${r.value??r.score??'unavailable'}; demand signal only, subject to provider methodology and terms.`,Math.max(0,Math.min(1,Number(r.value??r.score??0)/100)),r.date??at));
}
export function parseIrdai(data:any,at:string):SituationEvent[] {
  const items=data.rss?.channel?.item??data.feed?.entry??[];const rows=Array.isArray(items)?items:[items];if(!rows.length)throw new Error('Expected IRDAI RSS entries');
  return rows.map((r:any,i:number)=>sourcedEvent(`irdai-${i}-${String(r.guid??r.id??r.link??'').slice(-24)}`,r.title?.['#text']??r.title??'IRDAI regulatory notice','country-risk','IRDAI',r.link?.['@_href']??r.link??'https://irdai.gov.in/',at,undefined,String(r.description??r.summary??'Regulatory notice; review the official publication.'),.45,r.pubDate??r.updated??at));
}
export function restrictedLayers(env:Record<string,string|undefined>):LayerDefinition[] {
  const group='Restricted (keyed / licensed)';
  const key=(name:string)=>{const v=env[name];return v&&!v.includes('TODO')?v:undefined;};
  const firms=key('VITE_FIRMS_MAP_KEY')??key('FIRMS_MAP_KEY'),openId=key('OPENSKY_CLIENT_ID'),openSecret=key('OPENSKY_CLIENT_SECRET'),ais=key('AISSTREAM_API_KEY');
  const gdelt=key('GDELT_API_KEY'),nvd=key('NVD_API_KEY'),rbi=key('RBI_DATA_API_URL'),trendsUrl=key('GOOGLE_TRENDS_API_URL'),trendsKey=key('GOOGLE_TRENDS_API_KEY'),irdai=key('IRDAI_RSS_URL');
  return [
    {id:'gdelt-cloud',name:'Geopolitical events',source:'GDELT Cloud',endpoint:GDELT_CLOUD_URL,group:'Geopolitical & sanctions',color:'#7f3c8d',defaultOn:false,cadenceMinutes:60,parse:parseGdeltCloud,
      note:'Licensed, media-derived context. TODO(me): confirm plan and redistribution rights before enabling.',disabledReason:gdelt?undefined:'Set GDELT_API_KEY for a plan with API access.',fetchPayload:async f=>{const response=await f(GDELT_CLOUD_URL,{headers:{Authorization:`Bearer ${gdelt}`,'Accept':'application/json'},signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error(`GDELT Cloud HTTP ${response.status}`);return response.json();}},
    {id:'nvd',name:'Cyber vulnerability disclosures',source:'NIST NVD',endpoint:NVD_URL,group:'Cyber exposure',color:'#009e73',defaultOn:false,cadenceMinutes:60,parse:parseNvd,
      note:'Keyless at the public low rate; set NVD_API_KEY for production quota. Disclosure climate only; not predictive cyber scoring.',fetchPayload:async f=>{const end=new Date(),start=new Date(end.getTime()-24*3600000);const url=`${NVD_URL}?lastModStartDate=${encodeURIComponent(start.toISOString())}&lastModEndDate=${encodeURIComponent(end.toISOString())}&resultsPerPage=200`;const response=await f(url,{headers:nvd?{apiKey:nvd}:{},signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error(`NVD HTTP ${response.status}`);return response.json();}},
    {id:'rbi',name:'RBI rates and inflation',source:'Reserve Bank of India',endpoint:rbi??'https://www.rbi.org.in/',group:'Economic conditions',color:'#1b9e77',defaultOn:false,cadenceMinutes:1440,parse:parseRbi,
      disabledReason:rbi?undefined:'Set RBI_DATA_API_URL after confirming the official machine-readable RBI endpoint. TODO(me).',fetchPayload:async f=>request(rbi!,f)},
    {id:'social-demand',name:'Insurance search demand',source:'Approved Google Trends provider',endpoint:trendsUrl??'https://trends.google.com/',group:'Social demand',color:'#cc79a7',defaultOn:false,cadenceMinutes:1440,parse:parseTrends,
      note:'Terms-sensitive demand context; never scraped.',disabledReason:trendsUrl&&trendsKey?undefined:'Set GOOGLE_TRENDS_API_URL and GOOGLE_TRENDS_API_KEY for an approved provider. TODO(me).',fetchPayload:async f=>{const response=await f(trendsUrl!,{headers:{Authorization:`Bearer ${trendsKey}`},signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error(`Trends provider HTTP ${response.status}`);return response.json();}},
    {id:'irdai',name:'IRDAI regulatory notices',source:'IRDAI',endpoint:irdai??'https://irdai.gov.in/',group:'Legal and regulatory',color:'#d55e00',defaultOn:false,cadenceMinutes:1440,format:'xml',parse:parseIrdai,
      disabledReason:irdai?undefined:'Set IRDAI_RSS_URL after confirming the official feed. TODO(me); portal scraping is not enabled.'},
    {id:'firms',name:'Wildfire thermal anomalies',source:'NASA FIRMS',endpoint:FIRMS_URL,group,color:'#ff663d',defaultOn:false,parse:parseFirms,
      disabledReason:firms?undefined:'Set VITE_FIRMS_MAP_KEY; free NASA registration required.',
      fetchPayload:async f=>{try{return await request(FIRMS_URL.replace('{MAP_KEY}',encodeURIComponent(firms!)),f,'text');}catch{throw new Error('NASA FIRMS request failed; check key/quota/connectivity.');}}},
    {id:'opensky',name:'Aircraft positions · restricted',source:'OpenSky Network',endpoint:OPENSKY_URL,group,color:'#a3d8ff',defaultOn:false,cadenceMinutes:1,parse:parseOpenSky,
      note:'Non-commercial/licensed terms. TODO(me): review terms before commercial use.',
      disabledReason:env.OPENSKY_LICENSE_ACCEPTED==='true'&&openId&&openSecret?undefined:'Requires OPENSKY_LICENSE_ACCEPTED=true and server-side client credentials.',
      fetchPayload:async f=>{
        const response=await f('https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'client_credentials',client_id:openId!,client_secret:openSecret!}),signal:AbortSignal.timeout(15000)});
        if(!response.ok) throw new Error('OpenSky authentication failed');
        const token=await response.json();
        return request(OPENSKY_URL,(url,init)=>f(url,{...init,headers:{Authorization:`Bearer ${token.access_token}`}}));
      }},
    {id:'ais',name:'Vessel positions · restricted',source:'aisstream.io',endpoint:AIS_URL,group,color:'#7cdedb',defaultOn:false,cadenceMinutes:1,parse:parseAis,
      note:'Non-commercial/licensed terms. TODO(me): review terms before commercial use. Bounded 12-second snapshot.',
      disabledReason:env.AISSTREAM_LICENSE_ACCEPTED==='true'&&ais?undefined:'Requires AISSTREAM_LICENSE_ACCEPTED=true and AISSTREAM_API_KEY (server-side).',
      fetchPayload:async()=>new Promise((resolve,reject)=>{
        const socket=new WebSocket(AIS_URL);const messages:any[]=[];
        const timer=setTimeout(()=>{socket.close();resolve(messages);},12000);
        socket.addEventListener('open',()=>socket.send(JSON.stringify({APIKey:ais,BoundingBoxes:[[[-90,-180],[90,180]]],FilterMessageTypes:['PositionReport']})));
        socket.addEventListener('message',event=>{try{const m=JSON.parse(String(event.data));if(m.error){clearTimeout(timer);socket.close();reject(new Error('AIS subscription rejected'));}else if(messages.length<20000)messages.push(m);}catch{ /* Ignore malformed stream messages. */ }});
        socket.addEventListener('error',()=>{clearTimeout(timer);socket.close();reject(new Error('AIS connection failed'));});
      })},
  ];
}
