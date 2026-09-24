/* SPDX-License-Identifier: MIT */
import { randomUUID } from 'node:crypto';
import { createSyntheticPortfolio, parseSitesCsv } from '../../packages/overlay-pro/src/index.js';
import type { Provenance } from '../../packages/engine-core/src/types.js';
import { clearSessionCookie, createSession, hashPassword, publicUser, requestUser, sessionCookie, validRole, verifyPassword } from './auth.js';
import { platformRepository, type AlertState, type UserRole } from './platform-store.js';

const json=(body:unknown,status=200,headers?:HeadersInit)=>Response.json(body,{status,headers});
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
async function body(request:Request){try{return await request.json() as Record<string,unknown>;}catch{return {};}}

export async function handlePlatform(request:Request,env:Record<string,string|undefined>=process.env):Promise<Response>{
  const repo=platformRepository(env),url=new URL(request.url),action=url.searchParams.get('action')??'bootstrap';
  try{
    if(action==='bootstrap'&&request.method==='GET'){
      const user=await requestUser(request,env);const portfolios=user?await repo.listPortfolios(user.id):[];
      const preferences=user?await repo.getPreferences(user.id):undefined;const alertStates=user?await repo.listAlertStates(user.id):[];
      return json({user:user?publicUser(user):null,persistent:repo.persistent,authConfigured:!!env.AUTH_SECRET&&!env.AUTH_SECRET.startsWith('TODO'),portfolios,preferences,alertStates,demoPortfolio:user?undefined:createSyntheticPortfolio()});
    }
    if(action==='register'&&request.method==='POST'){
      const input=await body(request),email=String(input.email??'').trim().toLowerCase(),password=String(input.password??''),requested=String(input.role??'insurer');
      if(!repo.persistent)return json({error:'Registration requires DATABASE_URL. The public demo remains available.'},503);
      if(!env.AUTH_SECRET||env.AUTH_SECRET.startsWith('TODO'))return json({error:'Authentication is not configured.'},503);
      if(!emailPattern.test(email)||password.length<10||!validRole(requested))return json({error:'Valid email, 10+ character password, and role are required.'},400);
      if(await repo.findUserByEmail(email))return json({error:'Account already exists.'},409);
      const admins=(env.ADMIN_EMAILS??'').toLowerCase().split(',').map(v=>v.trim());const role:UserRole=admins.includes(email)?'admin':requested==='admin'?'insurer':requested;
      const user=await repo.createUser({email,passwordHash:hashPassword(password),role,accountId:randomUUID()});
      await repo.audit({userId:user.id,action:'register',entityType:'user',entityId:user.id,detail:{role}});
      const secure=url.protocol==='https:';return json({user:publicUser(user),persistent:true},201,{'Set-Cookie':sessionCookie(createSession(user,env.AUTH_SECRET),secure)});
    }
    if(action==='login'&&request.method==='POST'){
      if(!env.AUTH_SECRET||env.AUTH_SECRET.startsWith('TODO'))return json({error:'Authentication is not configured.'},503);
      const input=await body(request),user=await repo.findUserByEmail(String(input.email??'').trim().toLowerCase());
      if(!user||!verifyPassword(String(input.password??''),user.passwordHash))return json({error:'Invalid email or password.'},401);
      await repo.audit({userId:user.id,action:'login',entityType:'user',entityId:user.id,detail:{}});
      return json({user:publicUser(user)},200,{'Set-Cookie':sessionCookie(createSession(user,env.AUTH_SECRET),url.protocol==='https:')});
    }
    if(action==='logout'&&request.method==='POST')return json({ok:true},200,{'Set-Cookie':clearSessionCookie(url.protocol==='https:')});
    const user=await requestUser(request,env);if(!user)return json({error:'Authentication required.'},401);
    if(action==='portfolio-upload'&&request.method==='POST'){
      const input=await body(request),csv=String(input.csv??''),name=String(input.name??'Imported portfolio').trim().slice(0,120);
      if(Buffer.byteLength(csv)>5_000_000)return json({error:'CSV exceeds the 5 MB limit.'},413);
      const provenance:Provenance={sourceName:`User portfolio upload · ${user.email}`,sourceUrl:'/methodology#portfolio-import',fetchedAt:new Date().toISOString(),licenseNote:'Private user-provided data'};
      const parsed=parseSitesCsv(csv,user.accountId,provenance);if(parsed.issues.length)return json({error:'CSV validation failed.',issues:parsed.issues},400);
      if(!parsed.rows.length||parsed.rows.length>10000)return json({error:'CSV must contain 1–10,000 valid sites.'},400);
      const saved=await repo.savePortfolio(user.id,name||'Imported portfolio',parsed.rows);
      await repo.audit({userId:user.id,action:'portfolio.import',entityType:'portfolio',entityId:saved.id,detail:{rows:parsed.rows.length,name:saved.name}});return json(saved,201);
    }
    if(action==='portfolio-delete'&&request.method==='DELETE'){
      const id=url.searchParams.get('id')??'';const ok=await repo.softDeletePortfolio(user.id,id);if(ok)await repo.audit({userId:user.id,action:'portfolio.delete',entityType:'portfolio',entityId:id,detail:{softDeleted:true}});return json({ok},ok?200:404);
    }
    if(action==='preferences'&&request.method==='POST'){
      const input=await body(request),value=await repo.savePreferences({userId:user.id,severityThreshold:Math.max(0,Math.min(1,Number(input.severityThreshold??.45))),topN:Math.max(1,Math.min(100,Number(input.topN??10))),emailEnabled:!!input.emailEnabled,webhookUrl:typeof input.webhookUrl==='string'?input.webhookUrl:undefined,updatedAt:new Date().toISOString()});
      await repo.audit({userId:user.id,action:'preferences.update',entityType:'alert-preferences',entityId:user.id,detail:{threshold:value.severityThreshold,topN:value.topN,emailEnabled:value.emailEnabled}});return json(value);
    }
    if(action==='alert-state'&&request.method==='POST'){
      const input=await body(request),status=String(input.status??'open') as AlertState['status'];if(!['open','acknowledged','dismissed','snoozed'].includes(status))return json({error:'Invalid alert status.'},400);
      const value=await repo.saveAlertState({userId:user.id,alertId:String(input.alertId??''),status,snoozedUntil:status==='snoozed'?String(input.snoozedUntil??new Date(Date.now()+86400000).toISOString()):undefined,updatedAt:new Date().toISOString()});
      await repo.audit({userId:user.id,action:`alert.${status}`,entityType:'alert',entityId:value.alertId,detail:{snoozedUntil:value.snoozedUntil}});return json(value);
    }
    if(action==='scenario-save'&&request.method==='POST'){
      const input=await body(request),footprint=Array.isArray(input.footprint)?input.footprint as {lat:number;lon:number}[]:[];if(footprint.length<3)return json({error:'At least three footprint points are required.'},400);
      const scenario={id:randomUUID(),userId:user.id,name:String(input.name??'Custom scenario').slice(0,120),peril:String(input.peril??'Other').slice(0,60),footprint,severity:Math.max(0,Math.min(1,Number(input.severity??.5))),methodology:String(input.methodology??'User-defined illustrative footprint; not a catastrophe model.'),sourceUrl:'/methodology#scenarios',createdAt:new Date().toISOString()};
      await repo.saveScenario(scenario);await repo.audit({userId:user.id,action:'scenario.save',entityType:'scenario',entityId:scenario.id,detail:{name:scenario.name}});return json(scenario,201);
    }
    if(action==='audit'&&request.method==='GET'){
      if(user.role!=='admin')return json({error:'Admin role required.'},403);return json(await repo.listAudit());
    }
    if(action==='users'&&request.method==='GET'){
      if(user.role!=='admin')return json({error:'Admin role required.'},403);return json(await repo.listUsers());
    }
    return json({error:'Unknown action or method.'},404);
  }catch(error){console.error(JSON.stringify({level:'error',scope:'platform-api',action,error:error instanceof Error?error.message:String(error)}));return json({error:'Platform service unavailable.'},500);}
}
