'use strict';
const assert=require('node:assert/strict');
process.env.GROQ_API_KEY='gsk_test_api_0000000000000000';
process.env.DND_SESSION_SECRET='api-test-secret-api-test-secret-1234';
process.env.VERCEL_GIT_COMMIT_SHA='1234567890abcdef';
const groq=require('./server/groq.cjs');
const handler=require('./api/turn.js');
let ipCounter=0;
async function call(method,body,headers={}){
  const response={statusCode:200,headers:{},body:null,setHeader(k,v){this.headers[k.toLowerCase()]=String(v)},status(n){this.statusCode=n;return this},json(v){this.body=v;return v}};
  const req={method,body,headers:{host:'game.test','x-forwarded-for':`203.0.113.${++ipCounter}`,...headers},socket:{remoteAddress:'127.0.0.1'}};
  await handler(req,response);return response;
}
const narration=state=>({narrative:'The woman studies you, then answers with guarded hope.',location:state.location,time:'Dusk, moments later',suggestions:['Ask her name','Look at the shoe','Head for the abbey'],memory:state.memory+' The traveller spoke to the woman.',inventory:state.inventory,npcs:['Mara: worried mother beside the Blackthorn road.'],quests:state.quests,places:state.places,hpChange:0,goldChange:0,xpGain:1,rest:'none'});
(async()=>{
  let r=await call('GET');assert.equal(r.statusCode,200);assert.equal(r.body.configured,true);assert.equal(r.body.build,'1234567890ab');assert.equal(r.body.version,3);
  r=await call('PUT');assert.equal(r.statusCode,405);assert.equal(r.headers.allow,'GET, POST');
  r=await call('POST',{start:true,name:'R',cls:'fighter'},{origin:'https://evil.test'});assert.equal(r.statusCode,403);
  r=await call('POST',{start:true,name:'R',cls:'bard'});assert.equal(r.statusCode,400);
  for(const cls of ['fighter','rogue','wizard']){r=await call('POST',{start:true,name:'  Tester  ',cls});assert.equal(r.statusCode,200);assert.equal(r.body.state.cls,cls);assert.equal(r.body.state.name,'Tester');assert.equal(typeof r.body.save,'string');if(cls==='fighter')assert.equal(r.body.state.secondWindReady,true)}
  const start=await call('POST',{start:true,name:'Josh',cls:'fighter'});const save=start.body.save,state=start.body.state;
  r=await call('POST',{action:'',save,requestId:'req-0000000000001'});assert.equal(r.statusCode,400);
  r=await call('POST',{action:'x'.repeat(1001),save,requestId:'req-0000000000002'});assert.equal(r.statusCode,400);
  r=await call('POST',{action:'Look around',save:'bad.save',requestId:'req-0000000000003'});assert.equal(r.statusCode,400);
  r=await call('POST',{action:'Look around',save,requestId:'short'});assert.equal(r.statusCode,400);

  let generates=0;
  groq.generate=async(messages,schema,options)=>{generates++;if(options.stage==='plan')return {kind:'none',ability:'WIS',dc:10,advantage:'normal',proficient:false,resource:'none',stakes:'Conversation.',intent:'Examine the woman.'};return narration(state)};
  const requestId='req-0000000000010';
  r=await call('POST',{action:'I examine the woman',save,requestId});assert.equal(r.statusCode,200);assert.equal(r.body.state.turn,1);assert.equal(r.body.state.xp,1);assert.equal(r.body.resolution.kind,'none');assert.equal(generates,2);
  const firstSave=r.body.save;
  r=await call('POST',{action:'I examine the woman',save,requestId});assert.equal(r.statusCode,200);assert.equal(r.body.save,firstSave);assert.equal(generates,2,'idempotent retry should not call provider again in the same instance');

  groq.generate=async()=>{throw new groq.ProviderError('Rate limited for test',429,7,{providerStatus:429,providerCode:'rate_limit',stage:'plan'})};
  const start2=await call('POST',{start:true,name:'R2',cls:'rogue'});r=await call('POST',{action:'I listen',save:start2.body.save,requestId:'req-0000000000020'});assert.equal(r.statusCode,429);assert.equal(r.headers['retry-after'],'7');assert.equal(r.body.retryAfter,7);

  groq.generate=async()=>{throw new Error('internal test failure')};
  const start3=await call('POST',{start:true,name:'R3',cls:'wizard'});r=await call('POST',{action:'I inspect the road',save:start3.body.save,requestId:'req-0000000000030'});assert.equal(r.statusCode,503);assert.match(r.body.error,/safely resolved/);

  r=await call('POST',{start:'false',name:'R',cls:'fighter'});assert.equal(r.statusCode,400,'only boolean true should enter character-creation path');
  console.log('API checks passed: methods, origin, creation, validation, signed saves, turn pipeline, idempotency and error mapping.');
})().catch(error=>{console.error(error);process.exit(1)});
