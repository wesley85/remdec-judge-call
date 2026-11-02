export function judgeInvitationLink(origin:string,eventId:string,key:string){
 const link=new URL('/',origin);link.searchParams.set('event',eventId);link.searchParams.set('view','judge');
 // The fragment stays out of HTTP requests and is cleared by the receiving page.
 link.hash=new URLSearchParams({staff:key}).toString();return link.href;
}
export function staffKeyFromInvitation(value:string){
 const url=new URL(value);if(url.searchParams.get('view')!=='judge'||!url.searchParams.get('event'))return null;
 const key=new URLSearchParams(url.hash.slice(1)).get('staff');
 return key&&key.length<=256?key:null;
}
export function judgeInvitation(origin:string,eventId:string,eventName:string,key:string){
 const link=judgeInvitationLink(origin,eventId,key);
 return `You're invited to judge ${eventName || 'this event'} on RemDec Judge Call.\n\nOpen your judge dashboard (staff key fills in automatically):\n${link}\n\nStaff access code: ${key}\n\nEnter your judge name and tap Enable sound. If you need the code separately, tap Copy access code on the dashboard. Keep the dashboard open.\n\nStaff only: this invitation grants access to the event's judge queue and screen controls.`;
}
