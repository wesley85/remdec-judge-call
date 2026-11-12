import {env} from '../runtime.mjs';
import {getOrganizer as getChatGPTUser} from '../runtime.mjs';
export const dynamic='force-dynamic';
const json=(x:any,status=200)=>Response.json(x,{status,headers:{'Cache-Control':'no-store'}});
const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,'0')).join('');
async function claimIdentity(req:Request){
 const value=req.headers.get('X-Judge-Session')||'';
 return /^[a-f0-9-]{36}$/.test(value)?hash(value):null;
}
const token=()=>crypto.randomUUID()+crypto.randomUUID();
const brandingView=(event:any)=>({...event.branding,hasLogo:Boolean(event.logo_data)});
const colorPattern=/^#[0-9a-f]{6}$/i;
function validLogo(value:unknown){
 if(typeof value!=='string'||value.length>128000||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value))return false;
 const bytes=Buffer.from(value.slice('data:image/png;base64,'.length),'base64');
 return bytes.length>=33&&bytes.subarray(0,8).toString('hex')==='89504e470d0a1a0a'&&bytes.toString('ascii',12,16)==='IHDR'&&
  [bytes.readUInt32BE(16),bytes.readUInt32BE(20)].every(size=>size>0&&size<=320);
}
export async function GET(req:Request){try{
 const db=env.DB!;const q=new URL(req.url).searchParams;
 if(q.get('mine')){const user=await getChatGPTUser();if(!user)return json({error:'Sign in to manage your events.'},401);return json((await db.prepare('SELECT id,name,tables,open FROM events WHERE owner=? ORDER BY created DESC').bind(user.userId).all()).results)}
 if(q.get('receipt'))return json(await db.prepare('SELECT status FROM calls WHERE id=?').bind(q.get('receipt')).first()||{status:'No request'});
 const event=await db.prepare('SELECT * FROM events WHERE id=?').bind(q.get('manage')||q.get('logo')||q.get('event')).first<any>();if(!event)return json({error:'Event not found'},404);
 if(q.get('logo')){
  if(!event.logo_data)return json({error:'Logo not found'},404);
  return new Response(Buffer.from(event.logo_data.split(',')[1],'base64'),{headers:{'Content-Type':'image/png','Cache-Control':'no-store'}});
 }
 if(q.get('manage')){
  const owner=await getChatGPTUser();
  if(owner?.userId!==event.owner)return json({error:'Sign in as the event organizer.'},403);
  const calls=await db.prepare('SELECT id,table_no,kind,status,judge,created,responded_at,updated FROM calls WHERE event=? ORDER BY created DESC').bind(event.id).all();
  return json({event:{id:event.id,name:event.name,tables:event.tables,open:event.open,created:event.created,wait_highlight_minutes:event.wait_highlight_minutes,branding:brandingView(event)},calls:calls.results});
 }
 if(q.get('display'))return json({event:{id:event.id,name:event.name,tables:event.tables,open:event.open},timer:{round:event.round,remaining:event.timer_remaining,ends:event.timer_ends,state:event.timer_state,updated:event.timer_updated},announcement:event.announcement,bcpUrl:event.bcp_url,serverNow:Date.now(),calls:(await db.prepare("SELECT table_no,status,created FROM calls WHERE event=? AND status!='Resolved' ORDER BY created").bind(event.id).all()).results});
 if(q.get('staff')){if(await hash(req.headers.get('X-Judge-Key')||'')!==event.key_hash)return json({error:'Staff key is incorrect'},401);const organizer=await getChatGPTUser();return json({canManage:organizer?.userId===event.owner,event:{id:event.id,name:event.name,tables:event.tables,open:event.open,wait_highlight_minutes:event.wait_highlight_minutes,alertSound:event.branding?.alertSound,practice:event.owner==='test-practice-only'},calls:(await db.prepare("SELECT id,event,table_no,kind,status,judge,created,updated,responded_at,(claim_hash=?) AS claimed_by_me FROM calls WHERE event=? ORDER BY (status='Resolved') ASC, created DESC LIMIT 1000").bind(await claimIdentity(req),event.id).all()).results})}
 return json({id:event.id,name:event.name,tables:event.tables,open:event.open,practice:event.owner==='test-practice-only',branding:brandingView(event)});
 }catch{return json({error:'Could not load data. Please retry.'},500)}}
export async function POST(req:Request){try{
 if(!req.headers.get('content-type')?.includes('application/json'))return json({error:'JSON required'},415);
 const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return json({error:'Origin rejected'},403);
 const raw=await req.text();const brandingRequest=new URL(req.url).pathname==='/api/branding';if(raw.length>(brandingRequest?140000:3000))return json({error:'Request too large'},413);const d=JSON.parse(raw);const db=env.DB!;const now=Date.now();
 if(!brandingRequest&&d.action==='create'){const user=await getChatGPTUser();if(!user)return json({error:'Sign in to create an event.'},401);
 const name=String(d.name||'').trim().slice(0,100);const tables=Number(d.tables);if(!name||!Number.isInteger(tables)||tables<1||tables>500)return json({error:'Enter an event name and 1–500 tables.'},400);
 const count=await db.prepare('SELECT COUNT(*) AS n FROM events WHERE owner=?').bind(user.userId).first<any>();if(count.n>=50)return json({error:'Event limit reached.'},400);
 const id=crypto.randomUUID(),key=token();await db.prepare('INSERT INTO events(id,owner,name,tables,key_hash,open,created) VALUES(?,?,?,?,?,1,?)').bind(id,user.userId,name,tables,await hash(key),now).run();return json({id,key});}
 const event=await db.prepare('SELECT * FROM events WHERE id=?').bind(d.event).first<any>();if(!event)return json({error:'Event not found'},404);
 if(brandingRequest){
  const owner=await getChatGPTUser();
  if(owner?.userId!==event.owner)return json({error:'Sign in as the event organizer.'},403);
  if(typeof d.buttonColor!=='string'||typeof d.backgroundColor!=='string'||!colorPattern.test(d.buttonColor)||!colorPattern.test(d.backgroundColor))return json({error:'Choose valid colors.'},400);
  if(d.logo!==undefined&&d.logo!==null&&!validLogo(d.logo))return json({error:'Upload a valid logo image.'},400);
  if(d.alertSound!==undefined&&!['default','chime','double','low'].includes(d.alertSound))return json({error:'Choose a valid alert sound.'},400);
  const branding=JSON.stringify({buttonColor:d.buttonColor,backgroundColor:d.backgroundColor,alertSound:d.alertSound});
  await db.prepare('UPDATE events SET branding=branding || ?::jsonb,logo_data=CASE WHEN ? THEN ? ELSE logo_data END WHERE id=?')
   .bind(branding,d.logo!==undefined,d.logo??null,event.id).run();
  return json({ok:true});
 }
 if(d.action==='rotate'){const user=await getChatGPTUser();if(!user||user.userId!==event.owner)return json({error:'Sign in as the event organizer to reset the key.'},403);const key=token();await db.prepare('UPDATE events SET key_hash=? WHERE id=?').bind(await hash(key),event.id).run();return json({key})}
 if(d.action==='requeue'||d.action==='wait_threshold'){
  const organizer=await getChatGPTUser();
  if(organizer?.userId!==event.owner)return json({error:'Only the event organizer can do this.'},403);
  if(d.action==='wait_threshold'){
   const minutes=d.minutes;
   if(!Number.isInteger(minutes)||minutes<1||minutes>120)return json({error:'Enter a wait threshold from 1 to 120 minutes.'},400);
   await db.prepare('UPDATE events SET wait_highlight_minutes=? WHERE id=?').bind(minutes,event.id).run();
   return json({ok:true});
  }
  const result=await db.prepare("UPDATE calls SET status='Waiting',judge='',claim_hash=NULL,updated=? WHERE id=? AND event=? AND status='On my way' AND updated=?")
   .bind(now,d.id,event.id,d.updated).run();
  if(!result.meta.changes)return json({error:'This call changed. Check the queue and try again.'},409);
  return json({ok:true});
 }
 if(d.action==='request'){if(!event.open)return json({error:'This event is closed.'},409);const table=Number(d.table);if(!Number.isInteger(table)||table<1||table>event.tables||!['Rules question','Scoring help','Private assistance'].includes(d.kind))return json({error:'Invalid table or request type'},400);
 const old=await db.prepare("SELECT id FROM calls WHERE event=? AND table_no=? AND status!='Resolved'").bind(event.id,table).first<any>();if(old)return json({id:old.id});
 const prev=await db.prepare('SELECT MAX(created) AS stamp FROM calls WHERE event=? AND table_no=?').bind(event.id,table).first<any>();if(prev.stamp&&now-prev.stamp<20000)return json({error:'Please wait a few seconds before calling again.'},429);
 const id=token();await db.prepare("INSERT OR IGNORE INTO calls(id,event,table_no,kind,status,judge,created,updated) VALUES(?,?,?,?,'Waiting','',?,?)").bind(id,event.id,table,d.kind,now,now).run();const saved=await db.prepare("SELECT id FROM calls WHERE event=? AND table_no=? AND status!='Resolved'").bind(event.id,table).first<any>();return json({id:saved.id});}
 if(await hash(req.headers.get('X-Judge-Key')||'')!==event.key_hash)return json({error:'Staff key is incorrect'},401);
 if(d.action==='toggle'){await db.prepare('UPDATE events SET open=1-open WHERE id=?').bind(event.id).run();return json({ok:true})}
 if(d.action==='update'){
  const identity=await claimIdentity(req);
  if(!identity)return json({error:'Refresh the judge dashboard before updating a call.'},400);
  if(!['Waiting','On my way','Resolved'].includes(d.status))return json({error:'Invalid status'},400);

  let result;
  if(d.status==='On my way'){
   const name=String(d.judge||'').trim().slice(0,40);
   if(!name)return json({error:'Enter your judge name first.'},400);
   result=await db.prepare("UPDATE calls SET status='On my way',judge=?,claim_hash=?,updated=?,responded_at=COALESCE(responded_at,?) WHERE id=? AND event=? AND status='Waiting'")
    .bind(name,identity,now,now,d.id,event.id).run();
  }else{
   result=await db.prepare("UPDATE calls SET status=?,judge=CASE WHEN ?='Waiting' THEN '' ELSE judge END,claim_hash=NULL,updated=? WHERE id=? AND event=? AND status='On my way' AND claim_hash=?")
    .bind(d.status,d.status,now,d.id,event.id,identity).run();
  }
  if(!result.meta.changes)return json({error:'This call changed or is assigned to another judge.'},409);
  return json({ok:true});
 }
 return json({error:'Unknown action'},400);
 }catch{return json({error:'Could not save. Please retry.'},500)}}
