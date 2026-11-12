import {alertSounds,alertSoundOrDefault,playAlert} from './alert-sounds';
import type {AlertSound} from './alert-sounds';
import {useEffect,useRef,useState} from 'react';
import type {CSSProperties, FormEvent} from 'react';

export type HeaderLogo={id:string;name:string;hasLogo:boolean;revision:number};
export type Branding={buttonColor?:string; backgroundColor?:string; hasLogo?:boolean; alertSound?:AlertSound};
type EventSummary={id:string;name:string;tables:number;open:number};
type Call={id:string;table_no:number;kind:string;status:string;judge:string;created:number;responded_at:number|null;updated:number};
type Tournament={event:EventSummary & {created:number;wait_highlight_minutes:number;branding:Branding};calls:Call[]};
const defaults={buttonColor:'#c2df9f',backgroundColor:'#101713'};
const eventLink=(id:string,view:string)=>'/?event='+encodeURIComponent(id)+'&view='+view;
export const logoUrl=(id:string)=>'/api/data?logo='+encodeURIComponent(id);

function textColor(color:string){
 const channels=[1,3,5].map(start=>parseInt(color.slice(start,start+2),16)/255)
  .map(value=>value<=0.04045?value/12.92:((value+0.055)/1.055)**2.4);
 return channels[0]*0.2126+channels[1]*0.7152+channels[2]*0.0722>0.179?'#111111':'#ffffff';
}
export function brandingStyle(branding:Branding):CSSProperties{
 return {
  '--event-background':branding.backgroundColor,
  '--event-foreground':branding.backgroundColor?textColor(branding.backgroundColor):undefined,
  '--event-button':branding.buttonColor,
  '--event-button-text':branding.buttonColor?textColor(branding.buttonColor):undefined,
 } as CSSProperties;
}

async function request<T>(path:string,body?:object):Promise<T>{
 const response=await fetch(path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:undefined);
 const data=await response.json();
 if(!response.ok)throw Error(data.error||'Please try again.');
 return data;
}
async function prepareLogo(file:File){
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>10*1024*1024)
  throw Error('Choose a PNG, JPEG or WebP image under 10 MB.');
 const bitmap=await createImageBitmap(file);
 try{
  const canvas=document.createElement('canvas');
  const context=canvas.getContext('2d');
  if(!context)throw Error('This browser could not prepare the logo.');
  for(const size of [320,240,160,128]){
   const scale=Math.min(1,size/Math.max(bitmap.width,bitmap.height));
   canvas.width=Math.max(1,Math.round(bitmap.width*scale));
   canvas.height=Math.max(1,Math.round(bitmap.height*scale));
   context.drawImage(bitmap,0,0,canvas.width,canvas.height);
   const image=canvas.toDataURL('image/png');
   if(image.length<=128000)return image;
  }
  throw Error('Choose a smaller logo image.');
 }finally{bitmap.close();}
}

function duration(milliseconds:number){
 const seconds=Math.max(0,Math.floor(milliseconds/1000));
 return Math.floor(seconds/60)+'m '+seconds%60+'s';
}

function TournamentDetails({id,onLogoChange}:{id:string;onLogoChange:(logo:HeaderLogo)=>void}){
 const [data,setData]=useState<Tournament|null>(null);
 const [colors,setColors]=useState(defaults);
 const [sound,setSound]=useState<AlertSound>('default');
 const previewAudio=useRef<AudioContext|null>(null);
 useEffect(()=>()=>{void previewAudio.current?.close().catch(()=>{})},[]);
 const [logo,setLogo]=useState<string|null|undefined>();
 const [revision,setRevision]=useState(0);
 const [waitMinutes,setWaitMinutes]=useState<string|null>(null);
 const [waitNotice,setWaitNotice]=useState('');
 const [page,setPage]=useState(0);
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState('');
 useEffect(()=>{
  let active=true;
  request<Tournament>('/api/data?manage='+encodeURIComponent(id)).then(result=>{
   if(!active)return;
   setData(result);
   onLogoChange({id,name:result.event.name,hasLogo:!!result.event.branding.hasLogo,revision:0});
   setColors({...defaults,...result.event.branding});
   setSound(alertSoundOrDefault(result.event.branding.alertSound));
  }).catch(error=>{if(active)setNotice(error.message)});
  return()=>{active=false};
 },[id,onLogoChange]);

 async function save(event:FormEvent){
  event.preventDefault();
  setBusy(true);
  setNotice('');
  try{
   await request('/api/branding',{event:id,...colors,logo,alertSound:sound});
   const next=await request<Tournament>('/api/data?manage='+encodeURIComponent(id));
   setData(next);
   setLogo(undefined);
   setRevision(revision+1);
   onLogoChange({id,name:next.event.name,hasLogo:!!next.event.branding.hasLogo,revision:revision+1});
   setNotice('Branding saved.');
  }catch(error){setNotice((error as Error).message)}
  finally{setBusy(false)}
 }
 async function saveWaitThreshold(event:FormEvent){
  event.preventDefault();
  const minutes=Number(waitMinutes);
  setBusy(true);
  setWaitNotice('');
  try{
   await request('/api/data',{action:'wait_threshold',event:id,minutes});
   setData(previous=>previous&&({...previous,event:{...previous.event,wait_highlight_minutes:minutes}}));
   setWaitMinutes(null);
   setWaitNotice('Wait threshold saved.');
  }catch(error){setWaitNotice((error as Error).message)}
  finally{setBusy(false)}
 }
 if(!data)return <p role="status">{notice||'Loading tournament…'}</p>;
 const {event,calls}=data;
 const logoPreview=logo===undefined?(event.branding.hasLogo?logoUrl(id)+'&v='+revision:''):logo;
 const pageSize=25;
 return <>
  <section className="panel">
   <h2>{event.name}</h2>
   <p>{event.tables} tables · {event.open?'Open':'Closed'} · Created {new Date(event.created).toLocaleDateString()}</p>

   <div className="organizer-stats">
    <span><strong>{calls.length}</strong> Total calls</span>
    {['Waiting','On my way','Resolved'].map(status=><span key={status}><strong>{calls.filter(call=>call.status===status).length}</strong> {status}</span>)}
   </div>
   <div className="actions">
    <a className="button" href={eventLink(id,'judge')}>Judge dashboard</a>
    <a className="button secondary" href={eventLink(id,'signs')}>Print table QR signs</a>
   </div>
  </section>
  <form className="panel" onSubmit={saveWaitThreshold}>
   <h2>Call queue settings</h2>
   <div className="branding-fields">
    <label>Highlight waiting calls after (minutes)
     <input type="number" min={1} max={120} required disabled={busy}
      value={waitMinutes??event.wait_highlight_minutes}
      onChange={e=>setWaitMinutes(e.target.value)}/>
    </label>
   </div>
   <div className="actions">
    <button className="secondary" disabled={busy||waitMinutes===null||waitMinutes===''||Number(waitMinutes)===event.wait_highlight_minutes}>Save wait threshold</button>
   </div>
   {waitNotice&&<p role="status">{waitNotice}</p>}
  </form>
  <form className="panel" onSubmit={save}>
   <h2>Tournament branding</h2>
   <fieldset disabled={busy} className="branding-fields">
    <label>Button color <input type="color" value={colors.buttonColor} onChange={e=>setColors({...colors,buttonColor:e.target.value})}/></label>
    <label>Background color <input type="color" value={colors.backgroundColor} onChange={e=>setColors({...colors,backgroundColor:e.target.value})}/></label>
    <div className="branding-sound">
     <label htmlFor="branding-alert-sound">Call alert sound</label>
     <div className="branding-sound-controls">
      <select id="branding-alert-sound" value={sound} onChange={e=>setSound(alertSoundOrDefault(e.target.value))}>
     {Object.entries(alertSounds).map(([value,preset])=><option value={value} key={value}>{preset.label}</option>)}
    </select>
    <button type="button" className="secondary branding-sound-preview" aria-label="Preview sound" onClick={async()=>{
     try{
      previewAudio.current??=new AudioContext();
      await previewAudio.current.resume();
      playAlert(previewAudio.current,sound);
     }catch{setNotice('Sound unavailable in this browser.')}
    }}>Preview</button>
     </div>
    </div>
    <label>Event logo <input key={revision} type="file" accept="image/png,image/jpeg,image/webp" onChange={async e=>{
     const file=e.target.files?.[0];
     if(!file)return;
     setBusy(true);
     setNotice('');
     try{setLogo(await prepareLogo(file))}catch(error){setNotice((error as Error).message)}
     finally{setBusy(false)}
    }}/></label>
   </fieldset>
   <div className="branding-preview event-branding custom-event-buttons" style={brandingStyle(colors)}>
    {logoPreview&&<img className="event-logo" src={logoPreview} alt="Tournament logo preview"/>}
    <button type="button" className="branding-sample">Button preview</button>
   </div>
   <div className="actions">
    {logoPreview&&<button type="button" className="secondary" disabled={busy} onClick={()=>setLogo(null)}>Remove logo</button>}
    <button disabled={busy}>Save branding</button>
   </div>
   {notice&&<p role="status">{notice}</p>}
  </form>
  <section className="panel">
   <h2>Call records</h2>
   {calls.length===0?<p>No calls yet.</p>:<>
    <div className="organizer-table"><table>
     <thead><tr><th>Table</th><th>Request</th><th>Status</th><th>Judge</th><th>Submitted</th><th>First response</th><th>Time to resolve</th></tr></thead>
     <tbody>{calls.slice(page*pageSize,(page+1)*pageSize).map(call=><tr key={call.id}>
      <td>{call.table_no}</td><td>{call.kind}</td><td>{call.status}</td><td>{call.judge||'—'}</td>
      <td>{new Date(call.created).toLocaleString()}</td>
      <td>{call.responded_at==null?'—':duration(call.responded_at-call.created)}</td>
      <td>{call.status==='Resolved'?duration(call.updated-call.created):'—'}</td>
     </tr>)}</tbody>
    </table></div>
    {calls.length>pageSize&&<div className="actions">
     <button type="button" disabled={page===0} onClick={()=>setPage(page-1)}>Previous</button>
     <span>Page {page+1} of {Math.ceil(calls.length/pageSize)}</span>
     <button type="button" disabled={(page+1)*pageSize>=calls.length} onClick={()=>setPage(page+1)}>Next</button>
    </div>}
   </>}
  </section>
 </>;
}

export default function OrganizerDashboard({selectedId,onLogoChange}:{selectedId:string;onLogoChange:(logo:HeaderLogo)=>void}){
 const [events,setEvents]=useState<EventSummary[]|null>(null);
 const [name,setName]=useState('');
 const [tables,setTables]=useState('50');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 useEffect(()=>{
  request<EventSummary[]>('/api/data?mine=1').then(setEvents).catch(error=>setError(error.message));
 },[]);
 const selected=events?.find(event=>event.id===selectedId)||events?.[0];
 async function create(event:FormEvent){
  event.preventDefault();
  setBusy(true);
  setError('');
  try{
   const result=await request<{id:string;key:string}>('/api/data',{action:'create',name,tables:Number(tables)});
   sessionStorage.setItem('staff-'+result.id,result.key);
   location.href=eventLink(result.id,'organizer');
  }catch(error){setError((error as Error).message);setBusy(false)}
 }
 return <>
  <h1>Organizer dashboard</h1>
  {error&&<p role="status">{error}</p>}
  {events===null?<p>{error?<a href="/?view=login">Sign in to manage tournaments</a>:'Loading tournaments…'}</p>:<>
   <form className="panel" onSubmit={create}>
    <h2>Create a tournament</h2>
    <div className="judge-settings-fields">
     <label>Tournament name<input value={name} onChange={e=>setName(e.target.value)} maxLength={100} required/></label>
     <label>Number of tables<input type="number" value={tables} onChange={e=>setTables(e.target.value)} min={1} max={500} required/></label>
    </div>
    <button disabled={busy||!name.trim()}>Create tournament</button>
   </form>
   {selected&&<>
    <label>Your tournaments <select value={selected.id} onChange={e=>location.href=eventLink(e.target.value,'organizer')}>
     {events.map(event=><option value={event.id} key={event.id}>{event.name}</option>)}
    </select></label>
    <TournamentDetails key={selected.id} id={selected.id} onLogoChange={onLogoChange}/>
   </>}
  </>}
 </>;
}
