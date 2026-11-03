import {randomBytes,randomUUID,scrypt as scryptCallback,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {equalSecret} from './auth.mjs';
const scrypt=promisify(scryptCallback);
const emailPattern=/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
export const normalizeEmail=value=>typeof value==='string'?value.trim().toLowerCase():'';
async function derive(password,salt){return scrypt(password,salt,64,{N:16384,r:8,p:1,maxmem:32*1024*1024})}
export async function passwordHash(password){const salt=randomBytes(16).toString('hex');return `scrypt:${salt}:${(await derive(password,salt)).toString('hex')}`}
async function passwordMatches(password,encoded){
 const [scheme,salt,hash]=String(encoded||'').split(':');
 const expected=scheme==='scrypt'&&/^[a-f0-9]{128}$/.test(hash||'')?Buffer.from(hash,'hex'):Buffer.alloc(64);
 const actual=await derive(password,salt||'missing-account-padding');
 return timingSafeEqual(actual,expected)&&scheme==='scrypt';
}
function account(row){return {userId:row.id,email:row.email,account:row.email,emailVerified:false}}
export async function registerAccount(settings,email,password){
 email=normalizeEmail(email);
 if(!emailPattern.test(email)||email.length>254)return {status:400,error:'Enter a valid email address.'};
 if(typeof password!=='string'||password.length<12||password.length>128)return {status:400,error:'Use a password between 12 and 128 characters.'};
 if(settings.ADMIN_USERNAME&&normalizeEmail(settings.ADMIN_USERNAME)===email)return {status:409,error:'This account already exists. Sign in instead.'};
 const encoded=await passwordHash(password);
 const row=await settings.DB.prepare('INSERT INTO judging_users(id,email,password_hash,created) VALUES(?,?,?,?) ON CONFLICT(email) DO NOTHING RETURNING id,email').bind(randomUUID(),email,encoded,Date.now()).first();
 return row?{user:account(row)}:{status:409,error:'This account already exists. Sign in instead.'};
}
export async function authenticateOrganizer(settings,identifier,password){
 if(typeof identifier!=='string'||typeof password!=='string'||identifier.length>254||password.length>128)return null;
 if(settings.ADMIN_USERNAME&&settings.ADMIN_PASSWORD&&equalSecret(identifier,settings.ADMIN_USERNAME)&&equalSecret(password,settings.ADMIN_PASSWORD))return {userId:'organizer:'+settings.ADMIN_USERNAME,account:settings.ADMIN_USERNAME,email:settings.ADMIN_EMAIL||settings.ADMIN_USERNAME};
 const row=await settings.DB.prepare('SELECT id,email,password_hash FROM judging_users WHERE email=?').bind(normalizeEmail(identifier)).first();
 const matches=await passwordMatches(password,row?.password_hash);
 return row&&matches?account(row):null;
}
export async function currentAccount(settings,user){
 if(!user)return null;
 const row=await settings.DB.prepare('SELECT id,email FROM judging_users WHERE id=?').bind(user.userId).first();
 if(row)return account(row);
 if(settings.ADMIN_USERNAME&&user.userId==='organizer:'+settings.ADMIN_USERNAME)return {userId:user.userId,email:settings.ADMIN_EMAIL||settings.ADMIN_USERNAME,account:settings.ADMIN_USERNAME};
 return null;
}
