export const supportRecipient = 'remdeccreations@gmail.com';
const maxScreenshotBytes = 2 * 1024 * 1024;

export function supportMessage(body){
 const clean = (value, max) => typeof value === 'string' && value.trim().length <= max ? value.trim() : '';
 const name = clean(body?.name, 100);
 const email = clean(body?.email, 254);
 const phone = clean(body?.phone, 50);
 const issue = clean(body?.issue, 5000);
 if(!name || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) || !issue)
  throw Error('Enter your name, a valid email, and a description of the issue.');
 if(body.phone && !phone) throw Error('Enter a phone number of 50 characters or fewer.');

 const message = {
  to: [supportRecipient],
  reply_to: email,
  subject: 'RemDec Judge Call support ticket',
  text: ['Name: '+name, 'Email: '+email, ...(phone?['Phone: '+phone]:[]), '', issue].join('\n'),
 };
 if(body.screenshot){
  const match = typeof body.screenshot === 'string' && /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(body.screenshot);
  if(!match) throw Error('Attach a PNG, JPEG, or WebP screenshot.');
  const bytes = Buffer.from(match[2], 'base64');
  if(bytes.length > maxScreenshotBytes) throw Error('The screenshot must be 2 MB or smaller.');
  const valid = {
   png: bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a',
   jpeg: bytes.subarray(0, 3).toString('hex') === 'ffd8ff',
   webp: bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP',
  };
  if(!valid[match[1]]) throw Error('The screenshot file does not match its image format.');
  message.attachments = [{filename:'screenshot.'+(match[1]==='jpeg'?'jpg':match[1]),content:match[2]}];
 }
 return message;
}

export async function sendSupportTicket(settings, message){
 const from = settings.SUPPORT_NOTIFY_FROM || settings.LOGIN_NOTIFY_FROM;
 if(!settings.RESEND_API_KEY || !from) return false;
 const response = await fetch('https://api.resend.com/emails', {
  method:'POST',
  headers:{Authorization:'Bearer '+settings.RESEND_API_KEY,'Content-Type':'application/json'},
  body:JSON.stringify({...message,from}),
  signal:AbortSignal.timeout(10000),
 });
 if(!response.ok) console.error('Support email rejected by provider:', response.status);
 return response.ok;
}
