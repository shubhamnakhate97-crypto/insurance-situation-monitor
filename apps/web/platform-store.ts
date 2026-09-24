/* SPDX-License-Identifier: MIT */
import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import { randomUUID } from 'node:crypto';
import type { Site } from '../../packages/overlay-pro/src/index.js';
import type { LayerResult } from '../../packages/engine-core/src/live-layers.js';

export type UserRole='insurer'|'broker'|'reinsurer'|'admin';
export interface PlatformUser {id:string;email:string;role:UserRole;accountId:string;passwordHash:string;createdAt:string}
export interface PortfolioBook {id:string;userId:string;name:string;sites:Site[];createdAt:string;deletedAt?:string}
export interface AlertPreference {userId:string;severityThreshold:number;topN:number;emailEnabled:boolean;webhookUrl?:string;updatedAt:string}
export interface AlertState {alertId:string;userId:string;status:'open'|'acknowledged'|'dismissed'|'snoozed';snoozedUntil?:string;updatedAt:string}
export interface AuditEntry {id:string;userId:string;action:string;entityType:string;entityId:string;detail:Record<string,unknown>;createdAt:string}
export interface SavedScenario {id:string;userId?:string;name:string;peril:string;footprint:{lat:number;lon:number}[];severity:number;methodology:string;sourceUrl:string;createdAt:string}

export interface PlatformRepository {
  readonly persistent:boolean;
  ensureSchema():Promise<void>;
  createUser(input:Omit<PlatformUser,'id'|'createdAt'>):Promise<PlatformUser>;
  findUserByEmail(email:string):Promise<PlatformUser|undefined>;
  findUserById(id:string):Promise<PlatformUser|undefined>;
  listUsers():Promise<Omit<PlatformUser,'passwordHash'>[]>;
  savePortfolio(userId:string,name:string,sites:Site[]):Promise<PortfolioBook>;
  listPortfolios(userId:string):Promise<PortfolioBook[]>;
  softDeletePortfolio(userId:string,id:string):Promise<boolean>;
  getPreferences(userId:string):Promise<AlertPreference>;
  savePreferences(value:AlertPreference):Promise<AlertPreference>;
  listAlertStates(userId:string):Promise<AlertState[]>;
  saveAlertState(value:AlertState):Promise<AlertState>;
  saveFeedSnapshot(result:LayerResult,latencyMs:number):Promise<void>;
  getFeedSnapshot(id:string):Promise<(LayerResult&{latencyMs?:number})|undefined>;
  listFeedSnapshots():Promise<(LayerResult&{latencyMs?:number})[]>;
  saveScenario(value:SavedScenario):Promise<SavedScenario>;
  listScenarios(userId?:string):Promise<SavedScenario[]>;
  audit(entry:Omit<AuditEntry,'id'|'createdAt'>):Promise<void>;
  listAudit(userId?:string):Promise<AuditEntry[]>;
}

const defaultPreference=(userId:string):AlertPreference=>({userId,severityThreshold:.45,topN:10,emailEnabled:false,updatedAt:new Date().toISOString()});
const memory={users:new Map<string,PlatformUser>(),books:new Map<string,PortfolioBook>(),preferences:new Map<string,AlertPreference>(),states:new Map<string,AlertState>(),feeds:new Map<string,LayerResult&{latencyMs?:number}>(),scenarios:new Map<string,SavedScenario>(),audit:[] as AuditEntry[]};

class MemoryRepository implements PlatformRepository {
  readonly persistent=false;
  async ensureSchema(){}
  async createUser(input:Omit<PlatformUser,'id'|'createdAt'>){const user={...input,id:randomUUID(),createdAt:new Date().toISOString()};memory.users.set(user.id,user);return user;}
  async findUserByEmail(email:string){return [...memory.users.values()].find(u=>u.email===email.toLowerCase());}
  async findUserById(id:string){return memory.users.get(id);}
  async listUsers(){return [...memory.users.values()].map(({passwordHash,...u})=>u);}
  async savePortfolio(userId:string,name:string,sites:Site[]){const value={id:randomUUID(),userId,name,sites,createdAt:new Date().toISOString()};memory.books.set(value.id,value);return value;}
  async listPortfolios(userId:string){return [...memory.books.values()].filter(b=>b.userId===userId&&!b.deletedAt);}
  async softDeletePortfolio(userId:string,id:string){const value=memory.books.get(id);if(!value||value.userId!==userId)return false;value.deletedAt=new Date().toISOString();return true;}
  async getPreferences(userId:string){return memory.preferences.get(userId)??defaultPreference(userId);}
  async savePreferences(value:AlertPreference){memory.preferences.set(value.userId,value);return value;}
  async listAlertStates(userId:string){return [...memory.states.values()].filter(s=>s.userId===userId);}
  async saveAlertState(value:AlertState){memory.states.set(`${value.userId}:${value.alertId}`,value);return value;}
  async saveFeedSnapshot(result:LayerResult,latencyMs:number){memory.feeds.set(result.id,{...result,latencyMs});}
  async getFeedSnapshot(id:string){return memory.feeds.get(id);}
  async listFeedSnapshots(){return [...memory.feeds.values()];}
  async saveScenario(value:SavedScenario){memory.scenarios.set(value.id,value);return value;}
  async listScenarios(userId?:string){return [...memory.scenarios.values()].filter(s=>!s.userId||s.userId===userId);}
  async audit(input:Omit<AuditEntry,'id'|'createdAt'>){memory.audit.push({...input,id:randomUUID(),createdAt:new Date().toISOString()});}
  async listAudit(userId?:string){return memory.audit.filter(a=>!userId||a.userId===userId);}
}

let schemaPromise:Promise<void>|undefined;
class PostgresRepository implements PlatformRepository {
  readonly persistent=true;
  constructor(private sql:NeonQueryFunction<false,false>){}
  ensureSchema(){return schemaPromise??=(async()=>{
    await this.sql`CREATE TABLE IF NOT EXISTS sw_users (id text primary key,email text unique not null,password_hash text not null,role text not null,account_id text not null,created_at timestamptz not null default now())`;
    await this.sql`CREATE TABLE IF NOT EXISTS sw_portfolios (id text primary key,user_id text not null references sw_users(id),name text not null,sites jsonb not null,created_at timestamptz not null default now(),deleted_at timestamptz)`;
    await this.sql`CREATE TABLE IF NOT EXISTS sw_alert_preferences (user_id text primary key references sw_users(id),severity_threshold real not null,top_n integer not null,email_enabled boolean not null default false,webhook_url text,updated_at timestamptz not null default now())`;
    await this.sql`CREATE TABLE IF NOT EXISTS sw_alert_state (user_id text not null references sw_users(id),alert_id text not null,status text not null,snoozed_until timestamptz,updated_at timestamptz not null default now(),primary key(user_id,alert_id))`;
    await this.sql`CREATE TABLE IF NOT EXISTS sw_feed_snapshots (feed_id text primary key,fetched_at timestamptz,attempted_at timestamptz not null,events jsonb not null,record_count integer,error text,latency_ms integer,endpoint text not null,updated_at timestamptz not null default now())`;
    await this.sql`CREATE TABLE IF NOT EXISTS sw_scenarios (id text primary key,user_id text,name text not null,peril text not null,footprint jsonb not null,severity real not null,methodology text not null,source_url text not null,created_at timestamptz not null default now())`;
    await this.sql`CREATE TABLE IF NOT EXISTS sw_audit_log (id text primary key,user_id text not null,action text not null,entity_type text not null,entity_id text not null,detail jsonb not null,created_at timestamptz not null default now())`;
  })();}
  private async ready(){await this.ensureSchema();}
  async createUser(input:Omit<PlatformUser,'id'|'createdAt'>){await this.ready();const id=randomUUID();const rows=await this.sql`INSERT INTO sw_users(id,email,password_hash,role,account_id) VALUES(${id},${input.email.toLowerCase()},${input.passwordHash},${input.role},${input.accountId}) RETURNING id,email,password_hash,role,account_id,created_at`;return userRow(rows[0]);}
  async findUserByEmail(email:string){await this.ready();const rows=await this.sql`SELECT * FROM sw_users WHERE email=${email.toLowerCase()} LIMIT 1`;return rows[0]?userRow(rows[0]):undefined;}
  async findUserById(id:string){await this.ready();const rows=await this.sql`SELECT * FROM sw_users WHERE id=${id} LIMIT 1`;return rows[0]?userRow(rows[0]):undefined;}
  async listUsers(){await this.ready();const rows=await this.sql`SELECT id,email,role,account_id,created_at FROM sw_users ORDER BY created_at DESC`;return rows.map((r:any)=>({id:r.id,email:r.email,role:r.role,accountId:r.account_id,createdAt:new Date(r.created_at).toISOString()}));}
  async savePortfolio(userId:string,name:string,sites:Site[]){await this.ready();const id=randomUUID();const rows=await this.sql`INSERT INTO sw_portfolios(id,user_id,name,sites) VALUES(${id},${userId},${name},${JSON.stringify(sites)}::jsonb) RETURNING *`;return bookRow(rows[0]);}
  async listPortfolios(userId:string){await this.ready();const rows=await this.sql`SELECT * FROM sw_portfolios WHERE user_id=${userId} AND deleted_at IS NULL ORDER BY created_at DESC`;return rows.map(bookRow);}
  async softDeletePortfolio(userId:string,id:string){await this.ready();const rows=await this.sql`UPDATE sw_portfolios SET deleted_at=now() WHERE id=${id} AND user_id=${userId} AND deleted_at IS NULL RETURNING id`;return rows.length>0;}
  async getPreferences(userId:string){await this.ready();const rows=await this.sql`SELECT * FROM sw_alert_preferences WHERE user_id=${userId}`;return rows[0]?preferenceRow(rows[0]):defaultPreference(userId);}
  async savePreferences(v:AlertPreference){await this.ready();const rows=await this.sql`INSERT INTO sw_alert_preferences(user_id,severity_threshold,top_n,email_enabled,webhook_url,updated_at) VALUES(${v.userId},${v.severityThreshold},${v.topN},${v.emailEnabled},${v.webhookUrl??null},now()) ON CONFLICT(user_id) DO UPDATE SET severity_threshold=excluded.severity_threshold,top_n=excluded.top_n,email_enabled=excluded.email_enabled,webhook_url=excluded.webhook_url,updated_at=now() RETURNING *`;return preferenceRow(rows[0]);}
  async listAlertStates(userId:string){await this.ready();const rows=await this.sql`SELECT * FROM sw_alert_state WHERE user_id=${userId}`;return rows.map(stateRow);}
  async saveAlertState(v:AlertState){await this.ready();const rows=await this.sql`INSERT INTO sw_alert_state(user_id,alert_id,status,snoozed_until,updated_at) VALUES(${v.userId},${v.alertId},${v.status},${v.snoozedUntil??null},now()) ON CONFLICT(user_id,alert_id) DO UPDATE SET status=excluded.status,snoozed_until=excluded.snoozed_until,updated_at=now() RETURNING *`;return stateRow(rows[0]);}
  async saveFeedSnapshot(r:LayerResult,latencyMs:number){await this.ready();await this.sql`INSERT INTO sw_feed_snapshots(feed_id,fetched_at,attempted_at,events,record_count,error,latency_ms,endpoint,updated_at) VALUES(${r.id},${r.fetchedAt??null},${r.attemptedAt},${JSON.stringify(r.events)}::jsonb,${r.recordCount??r.events.length},${r.error??null},${latencyMs},${r.endpoint},now()) ON CONFLICT(feed_id) DO UPDATE SET fetched_at=excluded.fetched_at,attempted_at=excluded.attempted_at,events=excluded.events,record_count=excluded.record_count,error=excluded.error,latency_ms=excluded.latency_ms,endpoint=excluded.endpoint,updated_at=now()`;}
  async getFeedSnapshot(id:string){await this.ready();const rows=await this.sql`SELECT * FROM sw_feed_snapshots WHERE feed_id=${id}`;return rows[0]?feedRow(rows[0]):undefined;}
  async listFeedSnapshots(){await this.ready();const rows=await this.sql`SELECT * FROM sw_feed_snapshots ORDER BY feed_id`;return rows.map(feedRow);}
  async saveScenario(v:SavedScenario){await this.ready();await this.sql`INSERT INTO sw_scenarios(id,user_id,name,peril,footprint,severity,methodology,source_url,created_at) VALUES(${v.id},${v.userId??null},${v.name},${v.peril},${JSON.stringify(v.footprint)}::jsonb,${v.severity},${v.methodology},${v.sourceUrl},${v.createdAt}) ON CONFLICT(id) DO UPDATE SET name=excluded.name,peril=excluded.peril,footprint=excluded.footprint,severity=excluded.severity,methodology=excluded.methodology,source_url=excluded.source_url`;return v;}
  async listScenarios(userId?:string){await this.ready();const rows=userId?await this.sql`SELECT * FROM sw_scenarios WHERE user_id IS NULL OR user_id=${userId} ORDER BY name`:await this.sql`SELECT * FROM sw_scenarios WHERE user_id IS NULL ORDER BY name`;return rows.map(scenarioRow);}
  async audit(v:Omit<AuditEntry,'id'|'createdAt'>){await this.ready();await this.sql`INSERT INTO sw_audit_log(id,user_id,action,entity_type,entity_id,detail) VALUES(${randomUUID()},${v.userId},${v.action},${v.entityType},${v.entityId},${JSON.stringify(v.detail)}::jsonb)`;}
  async listAudit(userId?:string){await this.ready();const rows=userId?await this.sql`SELECT * FROM sw_audit_log WHERE user_id=${userId} ORDER BY created_at DESC LIMIT 250`:await this.sql`SELECT * FROM sw_audit_log ORDER BY created_at DESC LIMIT 250`;return rows.map((r:any)=>({id:r.id,userId:r.user_id,action:r.action,entityType:r.entity_type,entityId:r.entity_id,detail:r.detail,createdAt:new Date(r.created_at).toISOString()}));}
}

const userRow=(r:any):PlatformUser=>({id:r.id,email:r.email,passwordHash:r.password_hash,role:r.role,accountId:r.account_id,createdAt:new Date(r.created_at).toISOString()});
const bookRow=(r:any):PortfolioBook=>({id:r.id,userId:r.user_id,name:r.name,sites:r.sites,createdAt:new Date(r.created_at).toISOString(),deletedAt:r.deleted_at?new Date(r.deleted_at).toISOString():undefined});
const preferenceRow=(r:any):AlertPreference=>({userId:r.user_id,severityThreshold:Number(r.severity_threshold),topN:Number(r.top_n),emailEnabled:!!r.email_enabled,webhookUrl:r.webhook_url??undefined,updatedAt:new Date(r.updated_at).toISOString()});
const stateRow=(r:any):AlertState=>({alertId:r.alert_id,userId:r.user_id,status:r.status,snoozedUntil:r.snoozed_until?new Date(r.snoozed_until).toISOString():undefined,updatedAt:new Date(r.updated_at).toISOString()});
const feedRow=(r:any):LayerResult&{latencyMs?:number}=>({id:r.feed_id,endpoint:r.endpoint,fetchedAt:r.fetched_at?new Date(r.fetched_at).toISOString():undefined,attemptedAt:new Date(r.attempted_at).toISOString(),events:r.events??[],recordCount:Number(r.record_count??0),error:r.error??undefined,latencyMs:Number(r.latency_ms??0),cached:true});
const scenarioRow=(r:any):SavedScenario=>({id:r.id,userId:r.user_id??undefined,name:r.name,peril:r.peril,footprint:r.footprint,severity:Number(r.severity),methodology:r.methodology,sourceUrl:r.source_url,createdAt:new Date(r.created_at).toISOString()});

let repository:PlatformRepository|undefined;
export function platformRepository(env:Record<string,string|undefined>=process.env){
  if(repository)return repository;
  const url=env.DATABASE_URL;
  repository=url?.startsWith('postgres')?new PostgresRepository(neon(url)):new MemoryRepository();
  return repository;
}
