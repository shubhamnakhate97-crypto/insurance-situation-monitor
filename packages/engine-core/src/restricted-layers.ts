/* SPDX-License-Identifier: MIT */
import { request, sourcedEvent, type LayerDefinition } from './live-layers';
import type { SituationEvent } from './types';
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
export function restrictedLayers(env:Record<string,string|undefined>):LayerDefinition[] {
  const group='Restricted (keyed / licensed)';
  const key=(name:string)=>{const v=env[name];return v&&!v.includes('TODO')?v:undefined;};
  const firms=key('VITE_FIRMS_MAP_KEY'),openId=key('OPENSKY_CLIENT_ID'),openSecret=key('OPENSKY_CLIENT_SECRET'),ais=key('AISSTREAM_API_KEY');
  return [
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
