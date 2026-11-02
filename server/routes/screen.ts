import {env} from '../runtime.mjs';
export const dynamic='force-dynamic';
const json=(x:any,status=200)=>Response.json(x,{status,headers:{'Cache-Control':'no-store'}});
const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,'0')).join('');
export async function POST(req:Request){try{
 if(!req.headers.get('Content-Type')?.includes('application/json'))return json({error:'JSON required'},415);
 const origin=req.headers.get('Origin');if(origin&&origin!==new URL(req.url).origin)return json({error:'Origin rejected'},403);
 const raw=await req.text();if(raw.length>5000)return json({error:'Request too large'},413);const d=JSON.parse(raw),db=env.DB!;
 const e=await db.prepare('SELECT * FROM events WHERE id=?').bind(d.event).first<any>();if(!e)return json({error:'Event not found'},404);
 if(await hash(req.headers.get('X-Judge-Key')||'')!==e.key_hash)return json({error:'Staff key required'},401);
 if(d.operation==='message'){
 const announcement=String(d.announcement||'').slice(0,500),bcpUrl=String(d.bcpUrl||'').trim();
 if(bcpUrl){try{const u=new URL(bcpUrl);if(u.protocol!=='https:'||!(u.hostname==='bestcoastpairings.com'||u.hostname.endsWith('.bestcoastpairings.com'))||u.username||u.password)throw Error()}catch{return json({error:'Use a public HTTPS Best Coast Pairings event link.'},400)}}
 await db.prepare('UPDATE events SET announcement=?,bcp_url=? WHERE id=?').bind(announcement,bcpUrl,e.id).run();return json({ok:true});}
 if(d.version!==e.timer_updated)return json({error:'Another staff member changed the clock. Refresh and try again.'},409);
 const now=Date.now();let remaining=e.timer_ends!==null&&e.timer_state==='Running'?Math.max(0,e.timer_ends-now):e.timer_remaining,ends:number|null=null,state=e.timer_state,round=e.round;
 if(d.operation==='set'||d.operation==='set_running'){
  const seconds=Number(d.seconds);round=Number(d.round);if(!Number.isInteger(seconds)||seconds<0||seconds>86400||!Number.isInteger(round)||round<1||round>99)return json({error:'Use round 1–99 and a duration up to 24 hours.'},400);
  remaining=seconds*1000;state=d.operation==='set_running'&&remaining>0?'Running':'Paused';
 }else if(d.operation==='resume'){if(!remaining)return json({error:'Set the remaining time before starting.'},400);state='Running'}
 else if(d.operation==='pause')state='Paused';
 else if(d.operation==='add_minute')remaining+=60000;
 else return json({error:'Unknown timer control'},400);
 if(state==='Running')ends=now+remaining;
 const changed=await db.prepare('UPDATE events SET round=?,timer_remaining=?,timer_ends=?,timer_state=?,timer_updated=? WHERE id=? AND timer_updated=?').bind(round,remaining,ends,state,Math.max(now,e.timer_updated+1),e.id,e.timer_updated).run();
 if(!changed.meta.changes)return json({error:'Clock changed on another device. Try again.'},409);
 return json({ok:true});
 }catch{return json({error:'Unable to update display. Please retry.'},500)}}
