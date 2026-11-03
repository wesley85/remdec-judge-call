import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {initialize,PostgresStore} from '../server/store.mjs';
import {configure,createApplication} from '../server/application.mjs';

test('public registration, login, isolated event ownership and notifications',async()=>{
 const pg=new PGlite();await initialize(pg);const db=new PostgresStore(pg),notices=[];
 configure({SESSION_SECRET:'public-registration-fixture-secret-at-least32',ADMIN_USERNAME:'LegacyFixture',ADMIN_EMAIL:'legacy@example.test',ADMIN_PASSWORD:'legacy-fixture-password',NODE_ENV:'test'},db);
 const app=createApplication({databasePool:pg,notifyLogin:async(settings,login)=>{notices.push(login)}});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const origin='http://127.0.0.1:'+server.address().port;
 async function api(path,body,cookie=''){
  const r=await fetch(origin+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
 }
 try{
  assert.equal((await api('/api/register',{email:'bad',password:'long-fixture-password'})).status,400);
  assert.equal((await api('/api/register',{email:'a@example.test',password:'short'})).status,400);
  const a=await api('/api/register',{email:' A@example.test ',password:'long-fixture-password'});assert.equal(a.status,201);assert.ok(a.cookie);
  assert.deepEqual((await api('/api/account',null,a.cookie)).data,{email:'a@example.test'});
  assert.equal(notices.length,1);assert.equal(notices[0].email,'a@example.test');assert.equal(notices[0].test,false);assert.equal(notices[0].emailVerified,false);
  assert.equal((await api('/api/register',{email:'A@EXAMPLE.TEST',password:'long-fixture-password'})).status,409);
  const stored=await db.prepare('SELECT password_hash FROM judging_users WHERE email=?').bind('a@example.test').first();assert.match(stored.password_hash,/^scrypt:/);assert.ok(!stored.password_hash.includes('long-fixture-password'));
  assert.equal((await api('/api/login',{username:'a@example.test',password:'wrong'})).status,401);assert.equal(notices.length,1);
  const login=await api('/api/login',{username:'A@EXAMPLE.TEST',password:'long-fixture-password'});assert.equal(login.status,200);assert.equal(notices.length,2);
  const event=await api('/api/data',{action:'create',name:'Account A event',tables:20},a.cookie);assert.equal(event.status,200);
  const b=await api('/api/register',{email:'b@example.test',password:'another-long-fixture-password'});assert.equal(b.status,201);
  assert.deepEqual((await api('/api/data?mine=1',null,b.cookie)).data,[]);
  assert.equal((await api('/api/data?mine=1',null,a.cookie)).data[0].name,'Account A event');
  assert.equal((await api('/api/data',{action:'rotate',event:event.data.id},b.cookie)).status,403);
  assert.equal((await api('/api/data',{action:'rotate',event:event.data.id},a.cookie)).status,200);
  assert.equal((await api('/api/data',{action:'create',name:'Anonymous event',tables:20})).status,401);
  assert.equal((await api('/api/login',{username:'LegacyFixture',password:'legacy-fixture-password'})).status,200);
  const logout=await fetch(origin+'/api/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);
  const x=await fetch(origin+'/api/register',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://outside.example'},body:JSON.stringify({email:'x@example.test',password:'long-fixture-password'})});assert.equal(x.status,403);
 }finally{await new Promise(r=>server.close(r));await pg.close()}
});

test('registration is rate limited before costly password hashing',async()=>{
 const pg=new PGlite();await initialize(pg);configure({SESSION_SECRET:'rate-limit-fixture-secret-32-characters-long',NODE_ENV:'test'},new PostgresStore(pg));
 const server=createApplication().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 try{for(let i=0;i<11;i++){
  const r=await fetch('http://127.0.0.1:'+server.address().port+'/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'bad',password:'short'})});
  assert.equal(r.status,i<10?400:429);
 }}finally{await new Promise(r=>server.close(r));await pg.close()}
});
