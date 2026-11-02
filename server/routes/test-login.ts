import {env} from '../runtime.mjs';
export const dynamic='force-dynamic';
const eventId='8c8be091-533b-48b2-a533-53ce015a89d0';
const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const json=(data:any,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(req:Request){try{
 if(!req.headers.get('Content-Type')?.includes('application/json'))return json({error:'JSON required'},415);
 const origin=req.headers.get('Origin');if(origin&&origin!==new URL(req.url).origin)return json({error:'Origin rejected'},403);
 const settings=env as unknown as Record<string,string>;const username=settings.TEST_ADMIN_USERNAME,password=settings.TEST_ADMIN_PASSWORD,key=settings.TEST_STAFF_KEY;
 if(!username||!password||!key)return json({error:'Test login is currently disabled.'},503);
 const raw=await req.text();if(raw.length>1500)return json({error:'Invalid login'},400);
 const d=JSON.parse(raw);if(typeof d.username!=='string'||typeof d.password!=='string')return json({error:'Enter your username and password.'},400);
 const now=Date.now(),expires=now+900000;const bucket=await hash(key+':'+(req.headers.get('cf-connecting-ip')||'unknown')+':'+Math.floor(now/900000));
 const db=env.DB!;await db.prepare('DELETE FROM login_attempts WHERE expires < ?').bind(now).run();
 const attempt=await db.prepare('INSERT INTO login_attempts(bucket,count,expires) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=judging_login_attempts.count+1 RETURNING count').bind(bucket,expires).first<{count:number}>();
 if(!attempt||attempt.count>20)return json({error:'Too many attempts. Please try again in 15 minutes.'},429);
 const a=await hash(d.username+'\0'+d.password),b=await hash(username+'\0'+password);let difference=0;for(let i=0;i<a.length;i++)difference|=a.charCodeAt(i)^b.charCodeAt(i);
 if(difference)return json({error:'Incorrect username or password.'},401);
 const keyHash=await hash(key);
 await db.prepare('INSERT INTO events(id,owner,name,tables,key_hash,open,created) VALUES(?,?,?,?,?,1,?) ON CONFLICT(id) DO UPDATE SET key_hash=excluded.key_hash').bind(eventId,'test-practice-only','Practice Event — TestAdmin',50,keyHash,now).run();
 return json({id:eventId,key});
 }catch{return json({error:'Could not sign in. Please retry.'},500)}}
