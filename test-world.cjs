'use strict';
const assert=require('node:assert/strict'),W=require('./server/world.cjs'),P=require('./server/groq.cjs');
(async()=>{
const state=W.initial('Rowan','wizard'),secret='test-signing-secret';const save=W.sign(state,secret);assert.deepEqual(W.verify(save,secret),state);assert.throws(()=>W.verify(save+'X',secret));assert.throws(()=>W.verify(save,'different'));
const plan={kind:'check',ability:'INT',dc:12,proficient:true,advantage:'normal',resource:'spell',stakes:'Understand the rune.',intent:'Read it.'};const a=W.resolve(state,plan,()=>10);assert.equal(a.resolution.roll.total,15);assert(a.resolution.roll.success);assert.equal(a.state.slots,2);assert.equal(state.slots,3);
const empty={...state,slots:0};assert(W.resolve(empty,plan).resolution.blocked);const potion=W.resolve({...state,hp:1},{...plan,kind:'none',resource:'potion'},()=>4);assert.equal(potion.state.hp,11);assert.equal(potion.state.potions,1);
assert.equal(W.resolve(state,{...plan,kind:'attack',dc:25},()=>20).resolution.roll.success,true);assert.equal(W.resolve(state,{...plan,kind:'attack',dc:5},()=>1).resolution.roll.success,false);
const result={narrative:'A road opens towards Greyhaven.',location:'Greyhaven road',time:'Morning',suggestions:['Walk on'],memory:'Rowan left Blackthorn for Greyhaven.',inventory:state.inventory,npcs:['Dara: river merchant'],quests:['Find passage downriver'],places:['Greyhaven: river port'],hpChange:500,goldChange:500,xpGain:500,rest:'none'};const updated=W.apply(a.state,result,'Leave the village',a.resolution);assert.equal(updated.location,'Greyhaven road');assert.equal(updated.gold,60);assert.equal(updated.xp,25);assert.equal(updated.hp,state.maxHp);assert.equal(updated.turn,1);assert.equal(updated.history.length,1);
const blocked=W.resolve(empty,plan);assert.equal(W.apply(blocked.state,result,'Cast spell',blocked.resolution).gold,10);assert.throws(()=>W.apply(state,{...result,narrative:null},'x',a.resolution));

const schema={type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false};
const messages=[{role:'user',content:'Return JSON.'}];
const providerEnv={GROQ_API_KEYS:JSON.stringify(['gsk_test_primary_0000000000','gsk_test_backup_00000000000']),GROQ_MODEL:'openai/gpt-oss-120b',GROQ_FALLBACK_MODEL:'openai/gpt-oss-20b'};
const ok=()=>({status:200,ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:'{"ok":true}'}}]})});
const err=(status,body={},headers={})=>({status,ok:false,headers:new Headers(headers),json:async()=>body});

// A provider 429 pauses the whole credential pool. Backups are for availability, not quota multiplication.
P.resetForTests();let requests=0;const limited=async()=>{requests++;return err(429,{error:{code:'rate_limit_exceeded'}},{'retry-after':'3'})};
await assert.rejects(P.generate(messages,schema,{env:providerEnv,fetcher:limited}),e=>e.status===429&&e.retryAfter===3);assert.equal(requests,1);
await assert.rejects(P.generate(messages,schema,{env:providerEnv,fetcher:limited}),e=>e.status===429);assert.equal(requests,1);

// Bad credentials fail over to a backup.
P.resetForTests();requests=0;const auth=async()=>{requests++;return requests===1?err(401,{error:{code:'invalid_api_key',message:'bad key'}}):ok()};
assert.deepEqual(await P.generate(messages,schema,{env:providerEnv,fetcher:auth}),{ok:true});assert.equal(requests,2);

// Permission failures try the fallback model, then an availability backup credential.
P.resetForTests();requests=0;const permission=async()=>{requests++;return requests<=2?err(403,{error:{type:'permissions_error',code:'model_permission_blocked_project',message:'blocked'}}):ok()};
assert.deepEqual(await P.generate(messages,schema,{env:providerEnv,fetcher:permission}),{ok:true});assert.equal(requests,3);

// Structured-output 400s get one JSON Object compatibility retry.
P.resetForTests();requests=0;let sawJsonObject=false;const schemaRetry=async(url,options)=>{requests++;const body=JSON.parse(options.body);if(requests===1)return err(400,{error:{type:'invalid_request_error',code:'json_schema_error',message:'structured schema failure'}});sawJsonObject=body.response_format?.type==='json_object';return ok()};
assert.deepEqual(await P.generate(messages,schema,{env:providerEnv,fetcher:schemaRetry}),{ok:true});assert.equal(requests,2);assert.equal(sawJsonObject,true);

// Safe diagnostics retain upstream status/code and stage without exposing a request or key.
P.resetForTests();requests=0;const badRequest=async()=>{requests++;return err(400,{error:{type:'invalid_request_error',code:'bad_request',message:'Invalid request format'}})};
await assert.rejects(P.generate(messages,schema,{env:{...providerEnv,GROQ_FALLBACK_MODEL:'openai/gpt-oss-120b'},fetcher:badRequest,stage:'plan'}),e=>e.status===502&&e.providerStatus===400&&e.providerCode==='bad_request'&&e.stage==='plan');assert.equal(requests,1);

const fs=require('node:fs');for(const file of fs.readdirSync('dist')){assert(!/gsk_[a-zA-Z0-9]{20}/.test(fs.readFileSync('dist/'+file,'utf8')),'No keys in browser assets')}
console.log('Open-world checks passed: signed saves, server dice, resource limits, state bounds, shared provider backoff, credential/model failover, structured-output recovery, safe diagnostics, no browser keys.');
})().catch(e=>{console.error(e);process.exit(1)});
