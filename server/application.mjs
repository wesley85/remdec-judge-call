import express from 'express';
import path from 'node:path';
import QRCode from 'qrcode';
import {createHmac} from 'node:crypto';
import {env,requestContext} from './runtime.mjs';
import {equalSecret,signSession,readSession,cookieValue} from './auth.mjs';
import {GET as dataGET,POST as dataPOST} from './routes/data.mjs';
import {POST as screenPOST} from './routes/screen.mjs';
import {POST as testPOST} from './routes/test-login.mjs';
export function configure(settings,database){
 Object.assign(env,settings,{DB:database});
 if(!env.SESSION_SECRET||env.SESSION_SECRET.length<32)throw Error('SESSION_SECRET must contain at least 32 characters.');
 if(env.TEST_ADMIN_PASSWORD){env.TEST_ADMIN_USERNAME=env.TEST_ADMIN_USERNAME||'TestAdmin';env.TEST_STAFF_KEY=env.TEST_STAFF_KEY||createHmac('sha256',env.SESSION_SECRET).update('practice:'+env.TEST_ADMIN_PASSWORD).digest('hex')}
}
export function createApplication({databasePool,staticDirectory=path.resolve('dist/web')}={}){
 const app=express();app.disable('x-powered-by');app.set('trust proxy',1);
 app.use((req,res,next)=>{res.set('X-Content-Type-Options','nosniff');res.set('Referrer-Policy','no-referrer');next()});
 app.use('/api',(req,res,next)=>{
  res.set('Cache-Control','no-store');
  if(req.method!=='GET'&&req.method!=='HEAD'){
   if(!req.is('application/json'))return res.status(415).json({error:'JSON required'});
   const expected=env.APP_ORIGIN||`${req.protocol}://${req.get('host')}`;
   if(req.get('Origin')&&req.get('Origin')!==expected)return res.status(403).json({error:'Origin rejected'});
  }
  next();
 });
 app.use(express.json({limit:'6kb'}));
 app.get('/healthz',async(req,res)=>{try{if(databasePool)await databasePool.query('SELECT 1');res.json({status:'ok'})}catch{res.status(503).json({status:'database unavailable'})}});
 app.post('/api/login',async(req,res)=>{
  if(!env.ADMIN_USERNAME||!env.ADMIN_PASSWORD)return res.status(503).json({error:'Organizer sign-in has not been configured. Use the practice login for testing.'});
  const stamp=Date.now(),key=createHmac('sha256',env.SESSION_SECRET).update('organizer:'+req.ip+':'+Math.floor(stamp/900000)).digest('hex');
  try{
   await env.DB.prepare('DELETE FROM login_attempts WHERE expires < ?').bind(stamp).run();
   const attempt=await env.DB.prepare('INSERT INTO login_attempts(bucket,count,expires) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=judging_login_attempts.count+1 RETURNING count').bind(key,stamp+900000).first();
   if(attempt.count>20)return res.status(429).json({error:'Too many attempts. Try again in 15 minutes.'});
   if(!equalSecret(req.body.username||'',env.ADMIN_USERNAME)||!equalSecret(req.body.password||'',env.ADMIN_PASSWORD))return res.status(401).json({error:'Incorrect username or password.'});
   const cookie=signSession('organizer:'+env.ADMIN_USERNAME,env.SESSION_SECRET);
   res.setHeader('Set-Cookie',`judging_session=${cookie}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${env.NODE_ENV==='production'?'; Secure':''}`);res.json({ok:true});
  }catch{res.status(500).json({error:'Could not sign in. Please retry.'})}
 });
 app.post('/api/logout',(req,res)=>{res.setHeader('Set-Cookie','judging_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');res.json({ok:true})});
 async function dispatch(req,res,handler){
  try{
   const headers=new Headers();for(const [k,v] of Object.entries(req.headers))if(v&&typeof v==='string'&&!['host','content-length','cf-connecting-ip','oai-authenticated-user-id','oai-authenticated-user-email'].includes(k))headers.set(k,v);
   // A caller cannot spoof the source used for login throttling.
   headers.set('cf-connecting-ip',req.ip||'unknown');
   const url=(env.APP_ORIGIN||`${req.protocol}://${req.get('host')}`)+req.originalUrl;
   const request=new Request(url,{method:req.method,headers,...(req.method==='GET'?{}:{body:JSON.stringify(req.body)})});
   const user=readSession(cookieValue(req.headers.cookie,'judging_session'),env.SESSION_SECRET);
   const result=await requestContext.run({user},()=>handler(request));
   result.headers.forEach((v,k)=>res.set(k,v));res.status(result.status).send(Buffer.from(await result.arrayBuffer()));
  }catch{res.status(500).json({error:'Unable to process request. Please retry.'})}
 }
 app.get('/api/data',(req,res)=>dispatch(req,res,dataGET));app.post('/api/data',(req,res)=>dispatch(req,res,dataPOST));
 app.post('/api/screen',(req,res)=>dispatch(req,res,screenPOST));app.post('/api/test-login',(req,res)=>dispatch(req,res,testPOST));
 app.get('/api/qr',async(req,res)=>{const id=String(req.query.event||''),table=Number(req.query.table);if(!/^[a-f0-9-]{36}$/.test(id)||!Number.isInteger(table)||table<1||table>500)return res.status(400).send('Invalid QR request');try{const origin=env.APP_ORIGIN||`${req.protocol}://${req.get('host')}`;const link=origin+'/?event='+encodeURIComponent(id)+'&table='+table;res.type('svg').set('Cache-Control','public,max-age=3600').send(await QRCode.toString(link,{type:'svg',margin:4,width:240,errorCorrectionLevel:'M'}))}catch{res.status(500).send('Unable to generate QR')}});
 app.use('/api',(req,res)=>res.status(404).json({error:'Not found'}));
 app.use(express.static(staticDirectory));
 app.use((req,res)=>{if(req.method==='GET')res.sendFile(path.join(staticDirectory,'index.html'));else res.status(404).send('Not found')});
 app.use((err,req,res,next)=>res.status(err.status===413?413:400).json({error:err.status===413?'Request too large':'Invalid request'}));
 return app;
}
