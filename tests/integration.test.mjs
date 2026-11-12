import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {initialize,PostgresStore} from '../server/store.mjs';
import {configure,createApplication} from '../server/application.mjs';
import {signSession,readSession} from '../server/auth.mjs';
let pg,server,base,key,event,receipt,cookie;
const notifications=[];
const origin='http://127.0.0.1';
const judgeA='11111111-1111-4111-8111-111111111111',judgeB='22222222-2222-4222-8222-222222222222';
async function api(path,body,staff='',session='',judgeSession=judgeA){
 const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Judge-Key':staff,'X-Judge-Session':judgeSession,...(session?{Cookie:session}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)});
 const raw=await r.text();let data;try{data=JSON.parse(raw)}catch{data=raw}return {status:r.status,data,headers:r.headers};
}
before(async()=>{
 pg=new PGlite();await initialize(pg);configure({SESSION_SECRET:'fixture-session-secret-32-characters-long',ADMIN_EMAIL:'organizer@example.test',ADMIN_USERNAME:'FixtureAdmin',ADMIN_PASSWORD:'fixture-admin-password',TEST_ADMIN_USERNAME:'FixtureTester',TEST_ADMIN_PASSWORD:'fixture-test-password',NODE_ENV:'test'},new PostgresStore(pg));
 const app=createApplication({databasePool:pg,notifyLogin:async(settings,login)=>{notifications.push(login)}});server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base=origin+':'+server.address().port;
});
after(async()=>{if(server)await new Promise(r=>server.close(r));if(pg)await pg.close()});
test('health, organizer login, session, unauthorized access',async()=>{
 assert.equal((await api('/healthz')).status,200);
 assert.equal((await api('/api/data?mine=1')).status,401);
 assert.equal((await api('/api/login',{username:'FixtureAdmin',password:'wrong'})).status,401);assert.equal(notifications.length,0);
 const login=await api('/api/login',{username:'FixtureAdmin',password:'fixture-admin-password'});assert.equal(login.status,200);assert.deepEqual(notifications.at(-1),{test:false,account:'FixtureAdmin',email:'organizer@example.test'});cookie=login.headers.get('set-cookie').split(';')[0];assert.match(login.headers.get('set-cookie'),/HttpOnly/);
 const create=await api('/api/data',{action:'create',name:'Fixture tournament',tables:50},'',cookie);assert.equal(create.status,200);key=create.data.key;event=create.data.id;
 assert.equal((await api('/api/data?event='+event+'&staff=1')).status,401);
 assert.equal((await api('/api/data?mine=1',null,'',cookie)).data.length,1);
 const token=signSession('fixture','x'.repeat(32),100);assert.equal(readSession(token,'x'.repeat(32),101).userId,'fixture');assert.equal(readSession(token+'x','x'.repeat(32),101),null);assert.equal(readSession(token,'x'.repeat(32),100+9*3600000),null);
});
test('practice login scope and repeat login keep calls',async()=>{
 const prior=notifications.length;assert.equal((await api('/api/test-login',{username:'FixtureTester',password:'wrong'})).status,401);assert.equal(notifications.length,prior);
 const login=await api('/api/test-login',{username:'FixtureTester',password:'fixture-test-password'});assert.equal(login.status,200);
 assert.equal(notifications.at(-1).test,true);assert.equal(notifications.at(-1).account,'FixtureTester');
 const practice=await api('/api/data?event='+login.data.id);assert.equal(practice.data.practice,true);assert.equal(practice.data.tables,50);
 assert.equal((await api('/api/data',{action:'rotate',event:login.data.id},login.data.key)).status,403);
 const repeat=await api('/api/test-login',{username:'FixtureTester',password:'fixture-test-password'});assert.equal(repeat.data.key,login.data.key);
});
test('judge calls, deduplication and single-claim protection',async()=>{
 const req={action:'request',event,table:3,kind:'Private assistance'};
 const first=await api('/api/data',req);assert.equal(first.status,200);receipt=first.data.id;
 const second=await api('/api/data',req);assert.equal(second.data.id,receipt);
 const update={action:'update',event,id:receipt,status:'On my way',judge:'Fixture Judge'};
 assert.equal((await api('/api/data',update)).status,401);
 assert.equal((await api('/api/data',update,key)).status,200);
 assert.equal((await api('/api/data',update,key)).status,409);
 const queue='/api/data?event='+event+'&staff=1';
 assert.equal((await api(queue,null,key)).data.calls[0].claimed_by_me,true);
 const other=(await api(queue,null,key,'',judgeB)).data.calls[0];
 assert.equal(other.claimed_by_me,false);
 assert.equal(other.claim_hash,undefined);
 for(const status of ['On my way','Resolved','Waiting']){
  assert.equal((await api('/api/data',{...update,status},key,'',judgeB)).status,409);
 }
 const claimed=(await api(queue,null,key,cookie)).data;
 assert.equal(claimed.canManage,true);
 const requeue={action:'requeue',event,id:receipt,updated:claimed.calls[0].updated};
 assert.equal((await api('/api/data',requeue,key)).status,403);
 assert.equal((await api('/api/data',{...requeue,updated:requeue.updated-1},key,cookie)).status,409);
 assert.equal((await api('/api/data',requeue,key,cookie)).status,200);
 assert.equal((await api('/api/data?receipt='+receipt)).data.status,'Waiting');
 assert.equal((await api('/api/data',{action:'wait_threshold',event,minutes:2},key)).status,403);
 assert.equal((await api('/api/data',{action:'wait_threshold',event,minutes:0},key,cookie)).status,400);
 assert.equal((await api('/api/data',{action:'wait_threshold',event,minutes:2},key,cookie)).status,200);
 assert.equal((await api(queue,null,key)).data.event.wait_highlight_minutes,2);
 assert.equal((await api('/api/data',update,key,'',judgeB)).status,200);
 assert.equal((await api('/api/data',{...update,status:'Resolved'},key)).status,409);

 assert.equal((await api('/api/data?receipt='+receipt)).data.status,'On my way');
 const screen=await api('/api/data?event='+event+'&display=1');assert.equal(screen.status,200);assert.deepEqual(Object.keys(screen.data.calls[0]).sort(),['created','status','table_no']);assert.equal(screen.data.event.key_hash,undefined);
 assert.equal((await api('/api/data',{...update,status:'Resolved'},key,'',judgeB)).status,200);
 assert.equal((await api('/api/data?receipt='+receipt)).data.status,'Resolved');
 const history=(await api(queue,null,key)).data.calls[0];
 assert.equal(history.judge,'Fixture Judge');
 assert.equal(history.responded_at,claimed.calls[0].responded_at);
 assert.ok(history.updated>=history.responded_at&&history.responded_at>=history.created);
 assert.equal((await api('/api/data',{...req,table:51})).status,400);
});
test('organizer dashboard and print logo are scoped to the event',async()=>{
 const path='/api/data?manage='+event;
 assert.equal((await api(path,null,key)).status,403);
 const owned=await api(path,null,'',cookie);
 assert.equal(owned.status,200);
 assert.ok(owned.data.calls.some(call=>call.id===receipt&&call.status==='Resolved'));
 assert.equal(owned.data.event.key_hash,undefined);
 const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aQ3sAAAAASUVORK5CYII=';
 const colors={event,buttonColor:'#123456',backgroundColor:'#fafafa'};
 assert.equal((await api('/api/branding',colors,key)).status,403);
 assert.equal((await api('/api/branding',{...colors,buttonColor:'red'},'',cookie)).status,400);
 assert.equal((await api('/api/branding',{...colors,logo:'data:image/svg+xml;base64,AAAA'},'',cookie)).status,400);
 assert.equal((await api('/api/branding',{...colors,logo:'data:image/png;base64,'+png},'',cookie)).status,200);
 assert.deepEqual((await api('/api/data?event='+event)).data.branding,{buttonColor:'#123456',backgroundColor:'#fafafa',hasLogo:true});
 const logo=await fetch(base+'/api/data?logo='+event);
 assert.equal(logo.headers.get('content-type'),'image/png');
 assert.equal(Buffer.from(await logo.arrayBuffer()).toString('base64'),png);
 assert.equal((await api('/api/branding',colors,'',cookie)).status,200);
 assert.equal((await api('/api/data?event='+event)).data.branding.hasLogo,true);
 assert.equal((await api('/api/branding',{...colors,logo:null},'',cookie)).status,200);
 assert.equal((await fetch(base+'/api/data?logo='+event)).status,404);
});
test('shared timer, announcement, optimistic concurrency, QR and persistence',async()=>{
 let display=(await api('/api/data?event='+event+'&display=1')).data;
 const timer={event,operation:'set_running',seconds:600,round:2,version:display.timer.updated};
 assert.equal((await api('/api/screen',timer,'wrong')).status,401);
 assert.equal((await api('/api/screen',timer,key)).status,200);
 display=(await api('/api/data?event='+event+'&display=1')).data;assert.equal(display.timer.round,2);assert.equal(display.timer.state,'Running');assert.ok(display.timer.ends>Date.now());
 assert.equal((await api('/api/screen',{...timer,operation:'pause'},key)).status,409);
 assert.equal((await api('/api/screen',{event,operation:'pause',version:display.timer.updated},key)).status,200);
 display=(await api('/api/data?event='+event+'&display=1')).data;assert.equal(display.timer.ends,null);assert.equal(display.timer.state,'Paused');assert.ok(display.timer.remaining<=600000);
 assert.equal((await api('/api/screen',{event,operation:'message',announcement:'Lunch after this round',bcpUrl:'https://www.bestcoastpairings.com/event/example'},key)).status,200);
 assert.equal((await api('/api/data?event='+event+'&display=1')).data.announcement,'Lunch after this round');
 const qr=await api('/api/qr?event='+event+'&table=3');assert.equal(qr.status,200);assert.match(qr.data,/<svg/);
 await initialize(pg);assert.equal((await api('/api/data?event='+event)).data.name,'Fixture tournament');
 const closed=await api('/api/data',{action:'toggle',event},key);assert.equal(closed.status,200);assert.equal((await api('/api/data',{action:'request',event,table:4,kind:'Rules question'})).status,409);
 const logout=await api('/api/logout',{});assert.equal(logout.status,200);assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);
});
test('malformed JSON and cross-origin writes are rejected',async()=>{
 const r=await fetch(base+'/api/data',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://untrusted.example'},body:'{}'});assert.equal(r.status,403);
 const malformed=await fetch(base+'/api/data',{method:'POST',headers:{'Content-Type':'application/json'},body:'{broken'});assert.equal(malformed.status,400);
});
