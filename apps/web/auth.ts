/* SPDX-License-Identifier: MIT */
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { platformRepository, type PlatformUser, type UserRole } from './platform-store.js';

const COOKIE='signalwatch_session';
const enc=(value:string)=>Buffer.from(value).toString('base64url');
const sign=(value:string,secret:string)=>createHmac('sha256',secret).update(value).digest('base64url');
export function hashPassword(password:string){const salt=randomBytes(16).toString('hex');return `${salt}:${scryptSync(password,salt,64).toString('hex')}`;}
export function verifyPassword(password:string,stored:string){const [salt,hash]=stored.split(':');if(!salt||!hash)return false;const left=scryptSync(password,salt,64),right=Buffer.from(hash,'hex');return left.length===right.length&&timingSafeEqual(left,right);}
export function createSession(user:PlatformUser,secret:string){const body=enc(JSON.stringify({sub:user.id,role:user.role,accountId:user.accountId,exp:Date.now()+7*86400000}));return `${body}.${sign(body,secret)}`;}
export function sessionCookie(token:string,secure=true){return `${COOKIE}=${token}; Path=/; HttpOnly; ${secure?'Secure; ':''}SameSite=Lax; Max-Age=604800`;}
export function clearSessionCookie(secure=true){return `${COOKIE}=; Path=/; HttpOnly; ${secure?'Secure; ':''}SameSite=Lax; Max-Age=0`;}
export async function requestUser(request:Request,env:Record<string,string|undefined>=process.env){
  const secret=env.AUTH_SECRET;if(!secret||secret.startsWith('TODO'))return undefined;
  const cookie=request.headers.get('cookie')??'';const token=cookie.split(';').map(v=>v.trim()).find(v=>v.startsWith(`${COOKIE}=`))?.slice(COOKIE.length+1);
  if(!token)return undefined;const [body,signature]=token.split('.');if(!body||!signature||sign(body,secret)!==signature)return undefined;
  try{const payload=JSON.parse(Buffer.from(body,'base64url').toString());if(payload.exp<Date.now())return undefined;return platformRepository(env).findUserById(payload.sub);}catch{return undefined;}
}
export function publicUser(user:PlatformUser){const {passwordHash,...safe}=user;return safe;}
export function validRole(value:string):value is UserRole{return ['insurer','broker','reinsurer','admin'].includes(value);}
