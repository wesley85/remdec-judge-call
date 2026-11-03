import {randomUUID} from 'node:crypto';

const emailPattern=/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
export function loginEmailConfigured(settings){
 return Boolean(settings.RESEND_API_KEY&&settings.LOGIN_NOTIFY_FROM&&emailPattern.test(settings.LOGIN_NOTIFY_TO||''));
}
export function loginMessage({test,account,email,emailVerified,at=new Date()}){
 const kind=test?'TEST account':'non-test account';
 const time=new Intl.DateTimeFormat('en-US',{timeZone:'America/Denver',dateStyle:'full',timeStyle:'long'}).format(at);
 return {
  subject:`RemDec Judge Call: ${kind} used`,
  text:[`A successful sign-in occurred on RemDec Judge Call.`,`Account type: ${kind}`,`Account: ${account}`,
   ...(test?['This was the shared practice/test account.']: [`Sign-in email: ${emailPattern.test(email||'')?email:'Not configured for this username-based account.'}`]),
   ...(emailVerified===false?['Email ownership has not been verified.']:[]),
   `Time: ${time}`].join('\n'),
 };
}
export async function sendLoginNotification(settings,login,{transport=fetch,logger=console}={}){
 if(!loginEmailConfigured(settings))return {status:'not_configured'};
 try{
  const response=await transport('https://api.resend.com/emails',{
   method:'POST',headers:{Authorization:`Bearer ${settings.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':randomUUID()},
   body:JSON.stringify({from:settings.LOGIN_NOTIFY_FROM,to:[settings.LOGIN_NOTIFY_TO],...loginMessage(login)}),
   signal:AbortSignal.timeout(5000),
  });
  // Do not log provider bodies, identifiers, credentials, or account details.
  if(!response.ok){logger.error(`Login notification failed (email provider status ${response.status}).`);return {status:'failed'}}
  logger.info('Login notification accepted by email provider.');return {status:'accepted'};
 }catch{logger.error('Login notification failed (email service unavailable).');return {status:'failed'}}
}
