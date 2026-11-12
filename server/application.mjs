import {supportMessage,sendSupportTicket} from './support-email.mjs';
import express from 'express';
import {registerAccount,authenticateOrganizer,currentAccount} from './accounts.mjs';
import path from 'node:path';
import QRCode from 'qrcode';
import {createHmac} from 'node:crypto';
import {env,requestContext} from './runtime.mjs';
import {signSession,readSession,cookieValue} from './auth.mjs';
import {sendLoginNotification,loginEmailConfigured} from './login-email.mjs';
import {GET as dataGET,POST as dataPOST} from './routes/data.mjs';
import {POST as screenPOST} from './routes/screen.mjs';
import {POST as testPOST} from './routes/test-login.mjs';
export function configure(settings,database){
 Object.assign(env,settings,{DB:database});
 if(!env.SESSION_SECRET||env.SESSION_SECRET.length<32)throw Error('SESSION_SECRET must contain at least 32 characters.');
 if(env.TEST_ADMIN_PASSWORD){env.TEST_ADMIN_USERNAME=env.TEST_ADMIN_USERNAME||'TestAdmin';env.TEST_STAFF_KEY=env.TEST_STAFF_KEY||createHmac('sha256',env.SESSION_SECRET).update('practice:'+env.TEST_ADMIN_PASSWORD).digest('hex')}
}
export function createApplication({databasePool,staticDirectory=path.resolve('dist/web'),notifyLogin=sendLoginNotification,sendSupport=sendSupportTicket}={}){
 async function notify(test,user){
  const account=test?env.TEST_ADMIN_USERNAME:env.ADMIN_USERNAME;
  try{await notifyLogin(env,{test,account,email:test?undefined:(user?.email||env.ADMIN_EMAIL||account),...(user?{account:user.account}:{}),...(user?.emailVerified===false?{emailVerified:false}:{})})}catch{console.error('Login notification failed.');}
 }
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
 app.use('/api/branding',express.json({limit:'140kb'}));
 app.post('/api/support',express.json({limit:'3mb'}),async(req,res)=>{
  let message;
  try{message=supportMessage(req.body)}catch(error){return res.status(400).json({error:error.message})}
  try{
   const now=Date.now();
   const bucket=createHmac('sha256',env.SESSION_SECRET).update('support:'+req.ip+':'+Math.floor(now/900000)).digest('hex');
   await env.DB.prepare('DELETE FROM login_attempts WHERE expires < ?').bind(now).run();
   const attempt=await env.DB.prepare('INSERT INTO login_attempts(bucket,count,expires) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=judging_login_attempts.count+1 RETURNING count').bind(bucket,now+900000).first();
   if(attempt.count>5)return res.status(429).json({error:'Too many tickets. Please try again in 15 minutes.'});
   if(await sendSupport(env,message))return res.json({ok:true});
  }catch{console.error('Support ticket delivery failed.')}
  return res.status(503).json({error:'The ticket could not be emailed right now.'});
 });
 app.use(express.json({limit:'6kb'}));
 app.get('/healthz',async(req,res)=>{try{if(databasePool)await databasePool.query('SELECT 1');res.json({status:'ok',loginEmailNotifications:loginEmailConfigured(env)?'configured':'not_configured'})}catch{res.status(503).json({status:'database unavailable'})}});
 app.post('/api/login',async(req,res)=>{
  const stamp=Date.now(),key=createHmac('sha256',env.SESSION_SECRET).update('organizer:'+req.ip+':'+Math.floor(stamp/900000)).digest('hex');
  try{
   await env.DB.prepare('DELETE FROM login_attempts WHERE expires < ?').bind(stamp).run();
   const attempt=await env.DB.prepare('INSERT INTO login_attempts(bucket,count,expires) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=judging_login_attempts.count+1 RETURNING count').bind(key,stamp+900000).first();
   if(attempt.count>20)return res.status(429).json({error:'Too many attempts. Try again in 15 minutes.'});
   const user=await authenticateOrganizer(env,req.body.username,req.body.password);
   if(!user)return res.status(401).json({error:'Incorrect email or password.'});
   const cookie=signSession(user.userId,env.SESSION_SECRET);
   await notify(false,user);
   res.setHeader('Set-Cookie',`judging_session=${cookie}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${env.NODE_ENV==='production'?'; Secure':''}`);res.json({ok:true});
  }catch{res.status(500).json({error:'Could not sign in. Please retry.'})}
 });
 app.post('/api/register',async(req,res)=>{
  try{
   const stamp=Date.now(),bucket=createHmac('sha256',env.SESSION_SECRET).update('register:'+req.ip+':'+Math.floor(stamp/900000)).digest('hex');
   await env.DB.prepare('DELETE FROM login_attempts WHERE expires < ?').bind(stamp).run();
   const attempt=await env.DB.prepare('INSERT INTO login_attempts(bucket,count,expires) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=judging_login_attempts.count+1 RETURNING count').bind(bucket,stamp+900000).first();
   if(attempt.count>10)return res.status(429).json({error:'Too many registration attempts. Try again in 15 minutes.'});
   const result=await registerAccount(env,req.body.email,req.body.password);
   if(!result.user)return res.status(result.status).json({error:result.error});
   const cookie=signSession(result.user.userId,env.SESSION_SECRET);
   await notify(false,result.user);
   res.setHeader('Set-Cookie',`judging_session=${cookie}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${env.NODE_ENV==='production'?'; Secure':''}`);
   res.status(201).json({ok:true});
  }catch{res.status(500).json({error:'Could not create your account. Please retry.'})}
 });
 app.get('/api/account',async(req,res)=>{
  try{const user=await currentAccount(env,readSession(cookieValue(req.headers.cookie,'judging_session'),env.SESSION_SECRET));res.json(user?{email:user.email}:null)}catch{res.status(500).json({error:'Unable to load your account.'})}
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
   if(handler===testPOST&&result.ok)await notify(true);
   result.headers.forEach((v,k)=>res.set(k,v));res.status(result.status).send(Buffer.from(await result.arrayBuffer()));
  }catch{res.status(500).json({error:'Unable to process request. Please retry.'})}
 }
 app.get('/api/data',(req,res)=>dispatch(req,res,dataGET));app.post('/api/data',(req,res)=>dispatch(req,res,dataPOST));
 app.post('/api/branding',(req,res)=>dispatch(req,res,dataPOST));
 app.post('/api/screen',(req,res)=>dispatch(req,res,screenPOST));app.post('/api/test-login',(req,res)=>dispatch(req,res,testPOST));
 app.get('/api/qr',async(req,res)=>{const id=String(req.query.event||''),table=Number(req.query.table);if(!/^[a-f0-9-]{36}$/.test(id)||!Number.isInteger(table)||table<1||table>500)return res.status(400).send('Invalid QR request');try{const origin=env.APP_ORIGIN||`${req.protocol}://${req.get('host')}`;const link=origin+'/?event='+encodeURIComponent(id)+'&table='+table;res.type('svg').set('Cache-Control','public,max-age=3600').send(await QRCode.toString(link,{type:'svg',margin:4,width:240,errorCorrectionLevel:'M'}))}catch{res.status(500).send('Unable to generate QR')}});
 app.use('/api',(req,res)=>res.status(404).json({error:'Not found'}));
 app.use(express.static(staticDirectory));
 app.use((req,res)=>{if(req.method==='GET')res.sendFile(path.join(staticDirectory,'index.html'));else res.status(404).send('Not found')});
 app.use((err,req,res,next)=>res.status(err.status===413?413:400).json({error:err.status===413?'Request too large':'Invalid request'}));
 return app;
}
