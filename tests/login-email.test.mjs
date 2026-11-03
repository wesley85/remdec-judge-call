import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loginMessage,sendLoginNotification} from '../server/login-email.mjs';
const settings={RESEND_API_KEY:'fixture-provider-key',LOGIN_NOTIFY_FROM:'Fixture <notify@example.test>',LOGIN_NOTIFY_TO:'owner@example.test'};
test('test-account notice is explicit; normal notice contains the configured account email',()=>{
 const testEmail=loginMessage({test:true,account:'FixtureTester'});
 assert.match(testEmail.subject,/TEST account/);assert.match(testEmail.text,/shared practice\/test account/);
 const normal=loginMessage({test:false,account:'FixtureAdmin',email:'organizer@example.test'});
 assert.match(normal.subject,/non-test account/);assert.match(normal.text,/Sign-in email: organizer@example.test/);
 assert.match(loginMessage({test:false,account:'FixtureAdmin'}).text,/Not configured/);
});
test('send only to configured recipient, with plain text account details and no credentials',async()=>{
 let payload;
 const result=await sendLoginNotification(settings,{test:true,account:'FixtureTester'},{transport:async(url,init)=>{
  assert.equal(url,'https://api.resend.com/emails');assert.ok(init.signal);payload=JSON.parse(init.body);
  return {ok:true};
 },logger:{info(){},error(){}}});
 assert.equal(result.status,'accepted');assert.deepEqual(payload.to,['owner@example.test']);assert.ok(!JSON.stringify(payload).includes(settings.RESEND_API_KEY));
});
test('unconfigured sending skips transport; provider failures stay contained and redact details',async()=>{
 let calls=0;const transport=async()=>{calls++;throw Error('private detail')};const logs=[];
 assert.equal((await sendLoginNotification({}, {test:true,account:'fixture'}, {transport})).status,'not_configured');assert.equal(calls,0);
 assert.equal((await sendLoginNotification(settings,{test:true,account:'fixture'},{transport,logger:{error:v=>logs.push(v)}})).status,'failed');
 assert.ok(!logs.join().includes('private detail'));
});
