/* SPDX-License-Identifier: MIT */
import { describe,expect,it,vi } from 'vitest';
import { xml,parseGdacs,parseNhc,parseGdelt,parseOfac,parseEu,parseUn,parseVolcano,parseAirQuality,parseNws,parseSignificant,parseWorldBank,loadLayer,layerDefinitions } from '../src/live-layers';
import {parseFirms,parseOpenSky,parseAis,restrictedLayers} from '../src/restricted-layers';
const at='2026-09-22T00:00:00Z';
const point={type:'Point',coordinates:[77,28]};
const polygon={type:'Polygon',coordinates:[[[0,0],[1,0],[1,1],[0,0]]]};
const quake={type:'FeatureCollection',features:[{id:'test',geometry:{type:'Point',coordinates:[77,28,12]},properties:{mag:4.1,place:'Sample',time:Date.parse(at),url:'https://earthquake.usgs.gov/earthquakes/eventpage/test'}}]};
// Representative response fragments are test data only; runtime has no fixture fallback.
describe('live source parsers',()=>{
  it('GDACS RSS preserves coordinates, source and event time',()=>{
    const [e]=parseGdacs(xml.parse('<rss><channel><item><title>Flood</title><link>https://gdacs.org/report</link><pubDate>2026-09-21</pubDate><gdacs:eventtype>FL</gdacs:eventtype><gdacs:eventid>1</gdacs:eventid><georss:point>28 77</georss:point></item></channel></rss>'),at);
    expect(e.kind).toBe('flood');expect(e.position?.value).toEqual({lat:28,lon:77});expect(e.title.provenance.fetchedAt).toBe(at);
  });
  it('NHC includes observed position and labelled forecast line',()=>{
    const events=parseNhc({activeStorms:[{id:'al1',name:'Test',classification:'TS',binNumber:'AT1',latitudeNumeric:28,longitudeNumeric:77,intensity:40,pressure:1000,lastUpdate:at}],tracks:[{properties:{binnumber:'AT1'},geometry:{type:'LineString',coordinates:[[77,28],[78,29]]}}]},at);
    expect(events).toHaveLength(2);expect(events[1].geometry?.type).toBe('LineString');expect(events[1].title.value).toContain('forecast');
  });
  it('GDELT locations are media mentions, not verified incidents',()=>{
    const [e]=parseGdelt({features:[{geometry:point,properties:{name:'Delhi',count:12}}]},at);expect(e.summary.value).toContain('NOT a verified incident');expect(e.position?.value.lon).toBe(77);
  });
  it('OFAC parses names, aliases and programs without invented coordinates',()=>{
    const [e]=parseOfac(xml.parse('<sdnList><sdnEntry><uid>1</uid><firstName>Sample</firstName><lastName>Co</lastName><programList><program>TEST</program></programList><akaList><aka><lastName>Alias Co</lastName></aka></akaList></sdnEntry></sdnList>'),at);
    expect(e.title.value).toBe('Sample Co');expect(e.tags).toEqual(['Alias Co']);expect(e.summary.value).toContain('TEST');expect(e.geometry).toBeUndefined();
  });
  it('EU parses XML attributes and program evidence',()=>{
    const [e]=parseEu(xml.parse('<export><sanctionEntity logicalId="42"><nameAlias wholeName="Sample"/><nameAlias wholeName="Alias"/><regulation programme="TEST"/></sanctionEntity></export>'),at);
    expect(e.id).toBe('eu-42');expect(e.tags).toEqual(['Alias']);expect(e.summary.value).toContain('TEST');
  });
  it('UN combines individuals and entities with aliases',()=>{
    const events=parseUn({CONSOLIDATED_LIST:{INDIVIDUALS:{INDIVIDUAL:{DATAID:'1',FIRST_NAME:'A',SECOND_NAME:'B',UN_LIST_TYPE:'TEST',INDIVIDUAL_ALIAS:{ALIAS_NAME:'C'}}},ENTITIES:{ENTITY:{DATAID:'2',FIRST_NAME:'Sample Co'}}}},at);
    expect(events).toHaveLength(2);expect(events[0].title.value).toBe('A B');expect(events[0].tags).toEqual(['C']);
  });
  it('volcano GeoRSS uses the report permalink and weekly date',()=>{
    const [e]=parseVolcano(xml.parse('<rss><channel><item><title>Volcano weekly</title><guid isPermaLink="true">https://volcano.si.edu/report</guid><pubDate>2026-09-17</pubDate><georss:point>28 77</georss:point></item></channel></rss>'),at);
    expect(e.position?.value).toEqual({lat:28,lon:77});expect(e.observedAt.value).toBe('2026-09-17');expect(e.title.provenance.sourceUrl).toBe('https://volcano.si.edu/report');
  });
  it('air quality distinguishes valid modelled values from nulls',()=>{
    const events=parseAirQuality([{latitude:28,longitude:77,current:{time:'2026-09-22T00:00',us_aqi:100,pm2_5:25}},{current:{us_aqi:null}}],at);
    expect(events).toHaveLength(1);expect(events[0].summary.value).toContain('Modelled');expect(events[0].severity.value).toBeCloseTo(1/3);
  });
  it('NWS keeps source polygons and does not geocode area descriptions',()=>{
    const events=parseNws({features:[{id:'a',geometry:polygon,properties:{event:'Flood Warning',severity:'Severe',sent:at}},{id:'b',geometry:null,properties:{event:'Wind',severity:'Moderate',sent:at}}]},at);
    expect(events[0].geometry).toEqual(polygon);expect(events[1].geometry).toBeUndefined();
  });
  it('significant USGS events retain magnitude/depth and avoid tsunami-warning claims',()=>{
    const [e]=parseSignificant(quake,at);expect(e.geometry).toEqual(point);expect(e.summary.value).toContain('NOT an active tsunami warning');
  });
  it('World Bank joins real indicator values by country code, excludes null/no-data',()=>{
    const events=parseWorldBank({indicator:[{},[{countryiso3code:'IND',country:{value:'India'},date:'2024',value:-.8},{countryiso3code:'USA',value:null}]],boundaries:{features:[{properties:{ADM0_A3:'IND'},geometry:polygon},{properties:{ADM0_A3:'USA'},geometry:polygon}]}},at);
    expect(events).toHaveLength(1);expect(events[0].title.value).toContain('2024');expect(events[0].severity.value).toBeCloseTo(.66);
  });
  it('FIRMS parses thermal hotspot CSV and rejects invalid-key responses',()=>{
    const [e]=parseFirms('latitude,longitude,confidence,frp,acq_date,acq_time\n28,77,n,10,2026-09-22,530',at);expect(e.position?.value.lat).toBe(28);expect(e.observedAt.value).toBe('2026-09-22T05:30:00Z');expect(()=>parseFirms('Invalid key',at)).toThrow();
  });
  it('OpenSky state vectors exclude missing coordinates',()=>{
    const events=parseOpenSky({states:[['abc','TEST','India',0,1790035200,77,28,false],['def','NULL','India',0,1,null,null]]},at);expect(events).toHaveLength(1);expect(events[0].position?.value.lon).toBe(77);
  });
  it('AIS deduplicates vessel positions and excludes unavailable sentinel coordinates',()=>{
    const m={MetaData:{MMSI:123,ShipName:'TEST',time_utc:at},Message:{PositionReport:{Latitude:28,Longitude:77,Sog:12}}};
    expect(parseAis([m,m,{...m,Message:{PositionReport:{Latitude:91,Longitude:181}}}],at)).toHaveLength(1);
  });
});
describe('feed isolation and cache',()=>{
  it('caches a successful response with the original fetch timestamp',async()=>{
    const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({features:[]})});const d={...layerDefinitions.find(d=>d.id==='gdelt')!,id:'cache-test'};
    const first=await loadLayer(d,{mode:'live',now:new Date(),fetcher});const second=await loadLayer(d,{mode:'live',now:new Date(),fetcher});
    expect(fetcher).toHaveBeenCalledTimes(1);expect(second.cached).toBe(true);expect(second.fetchedAt).toBe(first.fetchedAt);
  });
  it('returns no events on errors without poisoning another feed',async()=>{
    const d=layerDefinitions.find(d=>d.id==='gdelt')!;const failed=await loadLayer({...d,id:'bad-test'},{mode:'live',now:new Date(),fetcher:vi.fn().mockRejectedValue(new Error('offline'))});
    const good=await loadLayer({...d,id:'good-test'},{mode:'live',now:new Date(),fetcher:vi.fn().mockResolvedValue({ok:true,json:async()=>({features:[{geometry:point,properties:{name:'sample'}}]})})});
    expect(failed.events).toEqual([]);expect(failed.fetchedAt).toBeUndefined();expect(good.events).toHaveLength(1);
  });
  it.each(restrictedLayers({}))('$id never calls the network without keys/licence acceptance',async d=>{
    const fetcher=vi.fn();const result=await loadLayer(d,{mode:'live',now:new Date(),fetcher});expect(result.events).toEqual([]);expect(result.error).toBeTruthy();expect(fetcher).not.toHaveBeenCalled();
  });
});
