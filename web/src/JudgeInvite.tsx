'use client';
import {useEffect,useState} from 'react';
import QRCode from 'qrcode';
import {judgeInvitation,judgeInvitationLink} from '../lib/judge-invitation';
export default function JudgeInvite({eventId,eventName,staffKey,origin}:{eventId:string,eventName:string,staffKey:string,origin:string}){
 const [notice,Notice]=useState('');
 const message=origin?judgeInvitation(origin,eventId,eventName,staffKey):'';
 const link=origin?judgeInvitationLink(origin,eventId,staffKey):'';
 const [qr, setQr] = useState<{link:string; image:string}|null>(null);
 const [qrError, setQrError] = useState('');
 useEffect(() => {
  if (!link || !staffKey) return;
  let active = true;
  QRCode.toDataURL(link, {width:320, margin:4, errorCorrectionLevel:'M'}).then(
   (image:string) => { if (active) setQr({link, image}); },
   () => { if (active) setQrError(link); }
  );
  return () => { active = false; };
 }, [link, staffKey]);
 async function copy(value:string,label:string){try{await navigator.clipboard.writeText(value);Notice(label+' copied.')}catch{Notice('Clipboard unavailable. Expand Plain text invitation below and select the text to copy it.')}}
 return <section className="panel judgeinvite"><div className="eyebrow">STAFF INVITATIONS</div><h2>Invite another judge</h2><p>Copy the invitation and share it with your judges. The invitation link fills in their staff key automatically.</p><button type="button" disabled={!staffKey||!origin} onClick={()=>copy(message,'Invitation')}>Copy invitation</button><p className="muted">Share with event staff only. The invitation includes access to the judge queue and screen controls.</p><details><summary>Show judge QR code</summary><p>Ask a judge to scan this with their phone camera. It opens the judge dashboard and fills in the staff key.</p>{qr?.link===link&&staffKey?<img src={qr.image} alt="Judge invitation QR code" width={260} height={260} style={{display:'block',maxWidth:'100%',height:'auto'}}/>:<p role="status">{qrError===link?'QR code unavailable. Use the invitation link below.':'Preparing QR code…'}</p>}</details><details><summary>Preview invitation & access code</summary><p>Judge dashboard: <a href={link}>Open invitation link ↗</a></p><p>Staff access code — tap to copy:</p><button type="button" className="copy-access-code" aria-label="Copy access code" title="Tap to copy access code" onClick={()=>copy(staffKey,'Access code')}><code>{staffKey}</code><span>Copy access code</span></button><p>Enter your judge name, enable sound, and keep the dashboard open.</p></details><details><summary>Plain text invitation</summary><textarea aria-label="Judge invitation preview" readOnly value={message} onFocus={e=>e.target.select()}/></details>{notice&&<p role="status" className="invite-notice">{notice}</p>}</section>
}
