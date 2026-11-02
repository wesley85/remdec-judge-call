import {env} from '../runtime.mjs';
import {getOrganizer as getChatGPTUser} from '../runtime.mjs';
export const dynamic='force-dynamic';
const json=(x:any,status=200)=>Response.json(x,{status,headers:{'Cache-Control':'no-store'}});
const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const token=()=>crypto.randomUUID()+crypto.randomUUID();
export async function GET(req:Request){try{
 const db=env.DB!;const q=new URL(req.url).searchParams;
 if(q.get('mine')){const user=await getChatGPTUser();if(!user)return json({error:'Sign in to manage your events.'},401);return json((await db.prepare('SELECT id,name,tables,open FROM events WHERE owner=? ORDER BY created DESC').bind(user.userId).all()).results)}
 if(q.get('receipt'))return json(await db.prepare('SELECT status FROM calls WHERE id=?').bind(q.get('receipt')).first()||{status:'No request'});
 const event=await db.prepare('SELECT * FROM events WHERE id=?').bind(q.get('event')).first<any>();if(!event)return json({error:'Event not found'},404);
 if(q.get('display'))return json({event:{id:event.id,name:event.name,tables:event.tables,open:event.open},timer:{round:event.round,remaining:event.timer_remaining,ends:event.timer_ends,state:event.timer_state,updated:event.timer_updated},announcement:event.announcement,bcpUrl:event.bcp_url,serverNow:Date.now(),calls:(await db.prepare("SELECT table_no,status,created FROM calls WHERE event=? AND status!='Resolved' ORDER BY created").bind(event.id).all()).results});
 if(q.get('staff')){if(await hash(req.headers.get('X-Judge-Key')||'')!==event.key_hash)return json({error:'Staff key is incorrect'},401);return json({event:{id:event.id,name:event.name,tables:event.tables,open:event.open,practice:event.owner==='test-practice-only'},calls:(await db.prepare("SELECT * FROM calls WHERE event=? ORDER BY (status='Resolved') ASC, created DESC LIMIT 1000").bind(event.id).all()).results})}
 return json({id:event.id,name:event.name,tables:event.tables,open:event.open,practice:event.owner==='test-practice-only'});
 }catch{return json({error:'Could not load data. Please retry.'},500)}}
export async function POST(req:Request){try{
 if(!req.headers.get('content-type')?.includes('application/json'))return json({error:'JSON required'},415);
 const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return json({error:'Origin rejected'},403);
 const raw=await req.text();if(raw.length>3000)return json({error:'Request too large'},413);const d=JSON.parse(raw);const db=env.DB!;const now=Date.now();
 if(d.action==='create'){const user=await getChatGPTUser();if(!user)return json({error:'Sign in to create an event.'},401);
 const name=String(d.name||'').trim().slice(0,100);const tables=Number(d.tables);if(!name||!Number.isInteger(tables)||tables<1||tables>500)return json({error:'Enter an event name and 1–500 tables.'},400);
 const count=await db.prepare('SELECT COUNT(*) AS n FROM events WHERE owner=?').bind(user.userId).first<any>();if(count.n>=50)return json({error:'Event limit reached.'},400);
 const id=crypto.randomUUID(),key=token();await db.prepare('INSERT INTO events(id,owner,name,tables,key_hash,open,created) VALUES(?,?,?,?,?,1,?)').bind(id,user.userId,name,tables,await hash(key),now).run();return json({id,key});}
 const event=await db.prepare('SELECT * FROM events WHERE id=?').bind(d.event).first<any>();if(!event)return json({error:'Event not found'},404);
 if(d.action==='rotate'){const user=await getChatGPTUser();if(!user||user.userId!==event.owner)return json({error:'Sign in as the event organizer to reset the key.'},403);const key=token();await db.prepare('UPDATE events SET key_hash=? WHERE id=?').bind(await hash(key),event.id).run();return json({key})}
 if(d.action==='request'){if(!event.open)return json({error:'This event is closed.'},409);const table=Number(d.table);if(!Number.isInteger(table)||table<1||table>event.tables||!['Rules question','Scoring help','Private assistance'].includes(d.kind))return json({error:'Invalid table or request type'},400);
 const old=await db.prepare("SELECT id FROM calls WHERE event=? AND table_no=? AND status!='Resolved'").bind(event.id,table).first<any>();if(old)return json({id:old.id});
 const prev=await db.prepare('SELECT MAX(created) AS stamp FROM calls WHERE event=? AND table_no=?').bind(event.id,table).first<any>();if(prev.stamp&&now-prev.stamp<20000)return json({error:'Please wait a few seconds before calling again.'},429);
 const id=token();await db.prepare("INSERT OR IGNORE INTO calls(id,event,table_no,kind,status,judge,created,updated) VALUES(?,?,?,?,'Waiting','',?,?)").bind(id,event.id,table,d.kind,now,now).run();const saved=await db.prepare("SELECT id FROM calls WHERE event=? AND table_no=? AND status!='Resolved'").bind(event.id,table).first<any>();return json({id:saved.id});}
 if(await hash(req.headers.get('X-Judge-Key')||'')!==event.key_hash)return json({error:'Staff key is incorrect'},401);
 if(d.action==='toggle'){await db.prepare('UPDATE events SET open=1-open WHERE id=?').bind(event.id).run();return json({ok:true})}
 if(d.action==='update'){const name=String(d.judge||'').trim().slice(0,40);if(!['Waiting','On my way','Resolved'].includes(d.status))return json({error:'Invalid status'},400);if(d.status==='On my way'&&!name)return json({error:'Enter your judge name first.'},400);
 const result=await db.prepare(`UPDATE calls SET status=?,judge=?,updated=? WHERE id=? AND event=? AND status ${d.status==='On my way'?"= 'Waiting'":"!= 'Resolved'"}`).bind(d.status,d.status==='Waiting'?'':name,now,d.id,event.id).run();if(!result.meta.changes)return json({error:'This call was already changed. Refreshing the queue.'},409);return json({ok:true})}
 return json({error:'Unknown action'},400);
 }catch{return json({error:'Could not save. Please retry.'},500)}}
