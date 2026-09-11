'use strict';
const assert=require('node:assert/strict');
process.env.GROQ_API_KEY='gsk_test_api_0000000000000000';
process.env.DND_SESSION_SECRET='api-test-secret-api-test-secret-1234';
process.env.VERCEL_GIT_COMMIT_SHA='1234567890abcdef';
process.env.VERCEL='1';
const groq=require('./server/groq.cjs');
const handler=require('./api/turn.js');
let ipCounter=0;
async function call(method,body,headers={}){
  const response={statusCode:200,headers:{},body:null,setHeader(key,value){this.headers[key.toLowerCase()]=String(value)},status(code){this.statusCode=code;return this},json(value){this.body=value;return value}};
  const req={method,body,headers:{host:'game.test','x-forwarded-for':`203.0.113.${++ipCounter}`,...headers},socket:{remoteAddress:'127.0.0.1'}};
  await handler(req,response);return response;
}
const plan={kind:'none',ability:'WIS',dc:0,advantage:'normal',proficient:false,resource:'none',stakes:'Conversation.',intent:'Listen and ask a question.'};
const narration=state=>({narrative:'The woman studies you, then answers with guarded hope.',location:state.location,time:'Dusk, moments later',suggestions:['Ask her name','Look at the shoe','Head for the abbey'],memory:state.memory+' The traveller spoke to the woman.',inventory:state.inventory,npcs:['Mara — attitude: wary — worried mother beside the Blackthorn road.'],quests:state.quests,places:state.places,exits:state.exits,factions:state.factions,facts:state.facts,journalEvents:[...state.journalEvents,'Spoke with Mara beside the road.'].slice(-18),conditionsAdded:[],conditionsRemoved:[],danger:state.danger,hpChange:0,goldChange:0,xpGain:1,rest:'none'});
(async()=>{
  let response=await call('GET');assert.equal(response.statusCode,200);assert.equal(response.body.configured,true);assert.equal(response.body.credentialCount,undefined,'public health must not expose provider-key count');assert.equal(response.body.signingMode,undefined,'public health must not expose signing strategy');assert.equal(response.body.build,'1234567890ab');assert.equal(response.body.version,3);
  response=await call('PUT');assert.equal(response.statusCode,405);assert.equal(response.headers.allow,'GET, POST');
  response=await call('POST',{start:true,name:'R',cls:'fighter'},{origin:'https://evil.test'});assert.equal(response.statusCode,403);
  response=await call('POST',{start:true,name:'R',cls:'bard'});assert.equal(response.statusCode,400);
  for(const cls of ['fighter','rogue','wizard']){response=await call('POST',{start:true,name:'  Tester  ',cls});assert.equal(response.statusCode,200);assert.equal(response.body.state.cls,cls);assert.equal(response.body.state.name,'Tester');assert.equal(typeof response.body.save,'string');assert(response.body.state.spatial?.exploration?.nodes?.length>=1);if(cls==='fighter')assert.equal(response.body.state.secondWindReady,true)}
  const start=await call('POST',{start:true,name:'Josh',cls:'fighter'}),save=start.body.save,state=start.body.state;
  response=await call('POST',{action:'',save,requestId:'req-0000000000001'});assert.equal(response.statusCode,400);
  response=await call('POST',{action:'x'.repeat(1001),save,requestId:'req-0000000000002'});assert.equal(response.statusCode,400);
  response=await call('POST',{action:'Look around',save:'bad.save',requestId:'req-0000000000003'});assert.equal(response.statusCode,400);
  response=await call('POST',{action:'Look around',save,requestId:'short'});assert.equal(response.statusCode,400);
  let generates=0;groq.generate=async(messages,schema,options)=>{generates++;return options.stage==='plan'?plan:narration(state)};
  const requestId='req-0000000000010';response=await call('POST',{action:'I examine the woman',save,requestId});assert.equal(response.statusCode,200);assert.equal(response.body.state.turn,1);assert.equal(response.body.state.xp,1);assert.equal(response.body.resolution.kind,'none');assert.equal(generates,2);const firstSave=response.body.save;
  response=await call('POST',{action:'I examine the woman',save,requestId});assert.equal(response.statusCode,200);assert.equal(response.body.save,firstSave);assert.equal(generates,2,'idempotent retry should not call provider again in the same instance');

  const economyStart=await call('POST',{start:true,name:'Economy QA',cls:'fighter'}),economyState=economyStart.body.state;let economyCalls=0;
  groq.generate=async(messages,schema,options)=>{if(options.stage==='plan')return plan;economyCalls++;const safe=narration(economyState);return economyCalls===1?{...safe,narrative:'The stranger refuses your claim and somehow takes your money.',goldChange:-8}:safe};
  response=await call('POST',{action:'I ask the stranger about the road.',save:economyStart.body.save,requestId:'req-0000000000012'});assert.equal(response.statusCode,200);assert.equal(economyCalls,2,'unauthorised economy output must receive exactly one repair attempt');assert.equal(response.body.state.gold,economyState.gold,'conversation cannot silently debit gold');

  const malformedStart=await call('POST',{start:true,name:'Invalid model QA',cls:'fighter'});let narrationCalls=0;groq.generate=async(messages,schema,options)=>options.stage==='plan'?plan:(narrationCalls++,{narrative:'Missing the required world contract.'});response=await call('POST',{action:'Ask a question',save:malformedStart.body.save,requestId:'req-0000000000015'});assert.equal(response.statusCode,502);assert.equal(narrationCalls,2,'invalid model output should receive one bounded repair attempt');assert(!response.body.save,'failed model output must not commit a new save');
  groq.generate=async()=>{throw new groq.ProviderError('Rate limited for test',429,7,{providerStatus:429,providerCode:'rate_limit',stage:'plan'})};const start2=await call('POST',{start:true,name:'R2',cls:'rogue'});response=await call('POST',{action:'I listen',save:start2.body.save,requestId:'req-0000000000020'});assert.equal(response.statusCode,429);assert.equal(response.headers['retry-after'],'7');assert.equal(response.body.retryAfter,7);
  groq.generate=async()=>{throw new Error('internal test failure')};const start3=await call('POST',{start:true,name:'R3',cls:'wizard'});response=await call('POST',{action:'I inspect the road',save:start3.body.save,requestId:'req-0000000000030'});assert.equal(response.statusCode,503);assert.match(response.body.error,/safely resolved/);
  response=await call('POST',{start:'false',name:'R',cls:'fighter'});assert.equal(response.statusCode,400,'only boolean true should enter character-creation path');
  console.log('API checks passed: methods, private health metadata, origin, creation, boundary validation, economy authority repair, signed saves, idempotency and error mapping.');
})().catch(error=>{console.error(error);process.exit(1)});
