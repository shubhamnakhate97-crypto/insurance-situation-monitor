/* SPDX-License-Identifier: MIT */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { usgsEarthquakeAdapter } from '../packages/engine-core/src/adapters.js';
import { accumulations, createSyntheticPortfolio, exposureWeightedAlerts, type Portfolio } from '../packages/overlay-pro/src/index.js';
import { requestUser } from '../apps/web/auth.js';
import { platformRepository } from '../apps/web/platform-store.js';
const escape=(v:unknown)=>`"${String(v??'').replaceAll('"','""')}"`;
export default {async fetch(request:Request){
  const user=await requestUser(request,process.env);if(!user)return Response.json({error:'Authentication required'},{status:401});const repo=platformRepository(process.env),books=await repo.listPortfolios(user.id),base=createSyntheticPortfolio(),portfolio:Portfolio=books.length?{...base,sites:books.flatMap(b=>b.sites)}:base;
  const events=await usgsEarthquakeAdapter.load({mode:'live',now:new Date()}),alerts=exposureWeightedAlerts(events,portfolio).slice(0,100),format=new URL(request.url).searchParams.get('format')??'csv';
  await repo.audit({userId:user.id,action:'export',entityType:'portfolio',entityId:books[0]?.id??'synthetic-demo',detail:{format,alerts:alerts.length}});
  if(format==='csv'){const lines=['alert_id,event,weighted_score,severity,exposure_at_risk,touched_sites,source_url',...alerts.map(a=>[a.id,a.eventTitle,a.weightedScore,a.severity,a.exposureAtRisk,a.touchedSiteIds.length,a.provenance[0]?.sourceUrl].map(escape).join(','))];return new Response(lines.join('\n'),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="signalwatch-alerts.csv"'}});}
  if(format!=='pdf')return Response.json({error:'format must be csv or pdf'},{status:400});
  const pdf=await PDFDocument.create(),page=pdf.addPage([612,792]),font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold),acc=accumulations(portfolio);let y=750;page.drawText('SignalWatch portfolio situation brief',{x:44,y,size:18,font:bold,color:rgb(.04,.24,.22)});y-=28;page.drawText(`Generated ${new Date().toISOString()} · role ${user.role}`,{x:44,y,size:9,font});y-=25;page.drawText(`Sites ${portfolio.sites.length} · open ranked indicators ${alerts.length}`,{x:44,y,size:11,font:bold});y-=22;page.drawText(`Top country accumulation: ${acc.byCountry[0]?.[0]??'n/a'} · ${acc.byCountry[0]?.[1]??0}`,{x:44,y,size:9,font});y-=30;
  for(const alert of alerts.slice(0,12)){page.drawText(`${alert.eventTitle.slice(0,62)} · score ${alert.weightedScore.toFixed(0)}`,{x:44,y,size:9,font});y-=15;}
  page.drawText('Indicators for investigation, not underwriting, pricing, or reserving decisions.',{x:44,y:32,size:8,font,color:rgb(.45,.2,.1)});const bytes=await pdf.save();return new Response(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer,{headers:{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="signalwatch-brief.pdf"'}});
}};
