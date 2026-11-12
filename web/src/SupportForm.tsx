import {useState} from 'react';
import type {FormEvent} from 'react';

function readScreenshot(file:File){
 return new Promise<string>((resolve,reject)=>{
  const reader=new FileReader();
  reader.onload=()=>resolve(String(reader.result));
  reader.onerror=()=>reject(Error('The screenshot could not be read.'));
  reader.readAsDataURL(file);
 });
}

export default function SupportForm(){
 const [busy,setBusy]=useState(false);
 const [sent,setSent]=useState(false);
 const [error,setError]=useState('');
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  const fields=new FormData(event.currentTarget);
  const file=fields.get('screenshot');
  setError('');
  setBusy(true);
  try{
   let screenshot;
   if(file instanceof File&&file.size){
    if(file.size>2*1024*1024)throw Error('The screenshot must be 2 MB or smaller.');
    if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Attach a PNG, JPEG, or WebP screenshot.');
    screenshot=await readScreenshot(file);
   }
   const response=await fetch('/api/support',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
     name:fields.get('name'),phone:fields.get('phone'),email:fields.get('email'),
     issue:fields.get('issue'),screenshot,
    }),
   });
   const result=await response.json();
   if(!response.ok)throw Error(result.error||'The ticket could not be sent.');
   setSent(true);
  }catch(error){setError((error as Error).message)}
  finally{setBusy(false)}
 }
 return <section className="panel player">
  <h1>Tournament Support</h1>
  {sent?<p role="status">Your ticket was sent. We’ll reply to the email address you provided.</p>:<>
   <p>Report a problem with RemDec Judge Call.</p>
   <form onSubmit={submit}>
    <fieldset disabled={busy} style={{border:0,padding:0,margin:0,minWidth:0}}>
     <label>Name <input name="name" autoComplete="name" maxLength={100} required/></label>
     <label>Phone number (optional) <input name="phone" type="tel" autoComplete="tel" maxLength={50}/></label>
     <label>Email <input name="email" type="email" autoComplete="email" maxLength={254} required/></label>
     <label>What’s happening? <textarea className="support-description" name="issue" rows={5} maxLength={5000} required/></label>
     <label>Screenshot (optional, up to 2 MB) <input name="screenshot" type="file" accept="image/png,image/jpeg,image/webp"/></label>
     <button type="submit">{busy?'Sending…':'Send help ticket'}</button>
    </fieldset>
   </form>
   {error&&<p role="alert">{error} You can also email <a href="mailto:remdeccreations@gmail.com">remdeccreations@gmail.com</a>.</p>}
  </>}
 </section>;
}
