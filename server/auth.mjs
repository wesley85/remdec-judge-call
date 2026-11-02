import {createHmac,createHash,timingSafeEqual} from 'node:crypto';
export function equalSecret(a,b){const left=createHash('sha256').update(String(a)).digest(),right=createHash('sha256').update(String(b)).digest();return timingSafeEqual(left,right)}
export function signSession(userId,secret,now=Date.now()){
 const data=Buffer.from(JSON.stringify({userId,expires:now+8*3600000})).toString('base64url');
 return data+'.'+createHmac('sha256',secret).update(data).digest('base64url');
}
export function readSession(cookie,secret,now=Date.now()){
 if(!cookie||!secret)return null;const [data,sig,...rest]=cookie.split('.');if(!data||!sig||rest.length)return null;
 const expected=createHmac('sha256',secret).update(data).digest('base64url');if(!equalSecret(sig,expected))return null;
 try{const payload=JSON.parse(Buffer.from(data,'base64url'));return typeof payload.userId==='string'&&Number.isFinite(payload.expires)&&payload.expires>now?{userId:payload.userId}:null}catch{return null}
}
export function cookieValue(header,name){const part=String(header||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='));return part?.slice(name.length+1)||null}
