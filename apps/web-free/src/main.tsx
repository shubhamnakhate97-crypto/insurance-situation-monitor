import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./styles.css";
import { demoEvents, INVESTIGATION_DISCLAIMER, type Position, type Provenance } from "@insurance/engine-core";
import { chokepoints, frameEvent, historicalLosses, lensProvenance, rdsScenarios } from "@insurance/insurance-lenses";

type Lens = "natcat" | "marine" | "cyber" | "violence" | "sanctions";

const formatTime = (value: string) => new Intl.DateTimeFormat("en", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" }).format(new Date(value));

function Source({ p }: { p: Provenance }) {
  return <a className="source" href={p.sourceUrl} target="_blank" rel="noreferrer" title={p.licenseNote}>↗ {p.sourceName} · {formatTime(p.fetchedAt)}</a>;
}

function MapPanel({ onDrop, dropped }: { onDrop: (p: Position) => void; dropped?: Position }) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  useEffect(() => {
    if (!host.current || map.current) return;
    const instance = new maplibregl.Map({
      container: host.current,
      center: [62, 22], zoom: 1.75,
      attributionControl: false,
      style: { version: 8, sources: {}, layers: [{ id: "ocean", type: "background", paint: { "background-color": "#0a1820" } }] },
    });
    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    instance.on("load", () => {
      instance.addSource("land", { type: "geojson", data: { type: "FeatureCollection", features: [
        { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[-168,72],[-50,72],[-52,7],[-82,8],[-115,30],[-168,55],[-168,72]]] } },
        { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[-82,13],[-34,13],[-48,-56],[-76,-52],[-82,13]]] } },
        { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[-10,36],[40,70],[170,64],[150,5],[105,-7],[42,10],[-18,30],[-10,36]]] } },
        { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[-18,34],[52,34],[46,-35],[15,-35],[-18,10],[-18,34]]] } },
        { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[112,-10],[155,-10],[151,-45],[113,-40],[112,-10]]] } },
      ] } });
      instance.addLayer({ id: "land-fill", type: "fill", source: "land", paint: { "fill-color": "#102b32", "fill-outline-color": "#1d4650" } });
      demoEvents.filter((event) => event.position).forEach((event) => {
        const el = document.createElement("div"); el.className = `map-marker ${event.kind}`; el.title = event.title.value;
        new maplibregl.Marker({ element: el }).setLngLat([event.position!.value.lon, event.position!.value.lat]).addTo(instance);
      });
    });
    instance.on("click", (event) => onDrop({ lat: event.lngLat.lat, lon: event.lngLat.lng }));
    map.current = instance;
    return () => { instance.remove(); map.current = null; };
  }, [onDrop]);
  useEffect(() => {
    if (!map.current || !dropped) return;
    const el = document.createElement("div"); el.className = "pin-marker";
    const marker = new maplibregl.Marker({ element: el }).setLngLat([dropped.lon, dropped.lat]).addTo(map.current);
    return () => { marker.remove(); };
  }, [dropped]);
  return <div className="map" ref={host}><div className="map-hint">Click anywhere to run one location check</div></div>;
}

function EventCard() {
  const event = demoEvents[0];
  const context = frameEvent(event);
  return <article className="event-card">
    <div className="eyebrow"><span className="pulse"/> ACTIVE CAT EVENT · SYNTHETIC DEMO</div>
    <div className="event-title"><div><h2>{event.title.value}</h2><Source p={event.title.provenance}/></div><div className="severity"><b>{Math.round(event.severity.value * 100)}</b><span>context index</span></div></div>
    <p>{event.summary.value}</p><Source p={event.summary.provenance}/>
    <div className="context-grid">
      <div><label>RETURN-PERIOD CONTEXT</label><strong>{context.returnPeriod.value}</strong><Source p={context.returnPeriod.provenance}/></div>
      <div><label>AGGREGATION CONTEXT</label><strong>{context.crestaContext.value}</strong><Source p={context.crestaContext.provenance}/></div>
      <div><label>ASSET / POPULATION PROXY</label><strong>{context.densityProxy.value}</strong><Source p={context.densityProxy.provenance}/></div>
      <div className="analog"><label>NEAREST HISTORICAL ANALOG</label><strong>{context.analog.name.value}</strong><span>{context.analog.lossContext.value}</span><Source p={context.analog.lossContext.provenance}/></div>
    </div>
    <div className="disclaimer">ⓘ {INVESTIGATION_DISCLAIMER}</div>
  </article>;
}

function LensPanel({ lens }: { lens: Lens }) {
  if (lens === "natcat") return <EventCard/>;
  if (lens === "marine") return <section className="panel"><div className="panel-head"><div><div className="eyebrow">MARINE CHOKEPOINT WATCH</div><h2>Five passages, one accumulation view</h2></div><span className="live-pill">OPEN FEEDS ONLY</span></div><div className="chokepoints">{chokepoints.map(([name,status,lat,lon])=><div className="choke" key={name}><span className="status-dot"/><div><strong>{name}</strong><small>{status}</small></div><span>{lat.toFixed(1)}°, {lon.toFixed(1)}°</span></div>)}</div><Source p={lensProvenance.marine}/><div className="disclaimer">ⓘ {INVESTIGATION_DISCLAIMER} AIS remains disabled.</div></section>;
  if (lens === "cyber") return <section className="panel"><div className="eyebrow">THIS WEEK’S CYBER CLIMATE</div><h2>Exploitation pressure is elevated</h2><div className="cyber-grid"><div><b>7</b><span>new KEV entries</span></div><div><b>3</b><span>CVEs above 0.8 EPSS</span></div><div><b>2</b><span>ransomware-linked</span></div></div><div className="cve"><strong>CVE-2026-DEMO</strong><span>Edge-device authentication bypass · synthetic fixture</span><em>EPSS 0.91</em></div><Source p={lensProvenance.cyber}/><div className="disclaimer">ⓘ {INVESTIGATION_DISCLAIMER}</div></section>;
  const scaffold = lens === "violence" ? ["Political violence / SRCC", "GDELT signal summaries are ready; ACLED remains license-gated."] : ["Sanctions / placeability", "Official-list screening and review queue are ready; legal decisions remain human."];
  return <section className="panel scaffold"><div className="eyebrow">BETA LENS</div><h2>{scaffold[0]}</h2><p>{scaffold[1]}</p><button>Enable preview</button><div className="review"><span>HUMAN REVIEW QUEUE</span><strong>North Meridian Trading</strong><small>2 ranked candidates · top confidence 0.78 · no silent resolution</small></div><div className="disclaimer">ⓘ {INVESTIGATION_DISCLAIMER}</div></section>;
}

function App() {
  const [lens, setLens] = useState<Lens>("natcat");
  const [pin, setPin] = useState<Position>();
  const [upgrade, setUpgrade] = useState(false);
  const [watch, setWatch] = useState(false);
  const drop = (position: Position) => pin ? setUpgrade(true) : setPin(position);
  return <main>
    <header><div className="brand"><div className="brand-mark">S</div><div><strong>SIGNALWATCH</strong><span>INSURANCE SITUATION MONITOR</span></div></div><nav><a href="#monitor">Monitor</a><a href="#scenarios">RDS library</a><a href="#history">Loss timeline</a><a href="#reference">References</a></nav><div className="header-actions"><button className="ghost" onClick={()=>setWatch(true)}>Follow a region</button><button className="upgrade" onClick={()=>setUpgrade(true)}>Portfolio overlay <span>PRO</span></button></div></header>
    <section className="ticker"><span>GLOBAL WATCH</span><div>◉ 2 active cat events</div><div>△ 3 chokepoints elevated</div><div>⌁ 7 new KEV entries</div><time>UPDATED 06:00 UTC · FIXTURE MODE</time></section>
    <section className="hero" id="monitor"><div><div className="kicker">THE MORNING RISK PICTURE</div><h1>See the event.<br/><em>Understand the insurance context.</em></h1><p>Live catastrophe and specialty signals, framed for P&amp;C practitioners—with every fact sourced and every uncertainty visible.</p></div><div className="hero-stat"><span>ACTIVE GLOBAL SIGNALS</span><b>12</b><small>across 5 open-source feeds</small><Source p={demoEvents[0].observedAt.provenance}/></div></section>
    <div className="lens-tabs">{([['natcat','Nat-cat / Property'],['marine','Marine chokepoints'],['cyber','Cyber threat-weather'],['violence','Political violence / SRCC'],['sanctions','Sanctions / Placeability']] as [Lens,string][]).map(([id,label])=><button className={lens===id?'active':''} onClick={()=>setLens(id)} key={id}>{label}{(id==='violence'||id==='sanctions')&&<span>BETA</span>}</button>)}</div>
    <section className="workspace"><MapPanel onDrop={drop} dropped={pin}/><aside><LensPanel lens={lens}/>{pin&&<div className="location-card"><div className="eyebrow">YOUR ONE-LOCATION CHECK</div><h3>{pin.lat.toFixed(3)}°, {pin.lon.toFixed(3)}°</h3><div className="risk-row"><span>Wind</span><b>Moderate</b></div><div className="risk-row"><span>Flood</span><b>Elevated</b></div><div className="risk-row"><span>Nearby active events</span><b>1 within 750 km</b></div><Source p={{sourceName:'User-supplied pin + Insurance Lenses fixture method',sourceUrl:'https://github.com/example/insurance-situation-monitor',fetchedAt:new Date().toISOString()}}/><button onClick={()=>setUpgrade(true)}>Add another location →</button><div className="disclaimer">ⓘ {INVESTIGATION_DISCLAIMER}</div></div>}</aside></section>
    <section className="reference" id="scenarios"><div className="section-title"><div><span>SCENARIO LIBRARY</span><h2>Realistic Disaster Scenarios</h2></div><p>Load a canonical footprint for accumulation conversations.</p></div><div className="cards">{rdsScenarios.map(s=><article key={s.id}><span>{s.peril}</span><h3>{s.name.value}</h3><p>{s.narrative.value}</p><Source p={s.name.provenance}/><button>Load on map</button></article>)}</div></section>
    <section className="reference split" id="history"><div><span>MAJOR LOSS TIMELINE</span><h2>Analogs that anchor the conversation</h2><input placeholder="Search events, peril, country…"/></div><div className="timeline">{historicalLosses.map(e=><div key={e.id}><b>{e.year.value}</b><div><strong>{e.name.value}</strong><small>{e.lossContext.value}</small><Source p={e.lossContext.provenance}/></div></div>)}</div></section>
    <section className="reference country" id="reference"><div><span>COUNTRY &amp; CRESTA-STYLE REFERENCES</span><h2>Aggregation context, without false precision</h2></div>{['India — East Coast wind & surge','Japan — Pacific quake & tsunami','United States — Gulf wind & flood'].map(x=><button key={x}>{x}<i>→</i></button>)}<Source p={lensProvenance.cresta}/></section>
    <footer><div className="brand"><div className="brand-mark">S</div><div><strong>SIGNALWATCH</strong><span>OPEN-CORE · AGPL-3.0</span></div></div><p>{INVESTIGATION_DISCLAIMER}</p><a href="https://github.com/example/insurance-situation-monitor">Source &amp; methodology ↗</a></footer>
    {(upgrade||watch)&&<div className="modal-backdrop" onClick={()=>{setUpgrade(false);setWatch(false)}}><div className="modal" onClick={e=>e.stopPropagation()}><button className="close" onClick={()=>{setUpgrade(false);setWatch(false)}}>×</button>{watch?<><div className="eyebrow">FREE REGION WATCH</div><h2>Follow Odisha coast</h2><p>Get an email when a cat event crosses your selected severity threshold. This follows a region—not a portfolio.</p><input placeholder="work@email.com"/><select><option>Alert at context index 60+</option><option>Alert at context index 75+</option></select><button className="primary" onClick={()=>setWatch(false)}>Create free watch</button><Source p={demoEvents[0].observedAt.provenance}/></>:<><div className="eyebrow">PORTFOLIO OVERLAY · PRO</div><h2>One pin is a check.<br/>A whole book is a decision surface.</h2><p>Import sites, entities, vessels and suppliers. Rank events by exposure at risk, inspect accumulation, and screen the ownership chain.</p><ul><li>Exposure-weighted alerts</li><li>Book-wide accumulation</li><li>RDS stress tests</li><li>Client-scoped dashboards</li></ul><button className="primary">Open synthetic pro demo</button><small>No second location was added to the free workspace.</small></>}</div></div>}
  </main>;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App/></React.StrictMode>);
