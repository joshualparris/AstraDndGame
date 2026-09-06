'use strict';
const assert=require('node:assert/strict');
const {test,run,load,initial,world,plan,result}=require('./codex-harness.cjs');
const providers=load('server/providers.cjs');
const env={GROQ_API_KEY:'gsk_codex_fake_primary',GROQ_API_KEYS:'["gsk_codex_fake_backup"]',GROQ_MODEL:'primary',GROQ_FALLBACK_MODEL:'fallback',ASTRA_LLM_PROVIDERS:'groq,openai',OPENAI_API_KEY:'codex-fake-openai'};
const response=(status,content)=>({ok:status===200,status,headers:new Headers({'retry-after':'2'}),json:async()=>status===200?{choices:[{message:{content}}]}:{error:{code:'qa_failure'}}});
for(const failure of ['timeout','500','malformed'])test('P01 Groq '+failure+' uses fallback model',async()=>{providers.resetForTests();const models=[];const r=await providers.generate([],{}, {env,fetcher:async(url,options)=>{models.push(JSON.parse(options.body).model);if(models.length===1){if(failure==='timeout')throw new DOMException('Timed out','TimeoutError');return failure==='500'?response(500):response(200,'{')}return response(200,'{"ok":true}')}});assert(r.ok);assert.deepEqual(models,['primary','fallback'])});
test('P02 credential rejection tries next key',async()=>{providers.resetForTests();let calls=0;const r=await providers.generate([],{}, {env,fetcher:async()=>++calls===1?response(401):response(200,'{"ok":true}')});assert(r.ok);assert.equal(calls,2)});
test('P03 complete Groq failure tries next provider',async()=>{providers.resetForTests();const urls=[];const r=await providers.generate([],{}, {env,fetcher:async(url)=>{urls.push(url);return url.includes('groq')?response(500):response(200,'{"ok":true}')}});assert(r.ok);assert(urls.at(-1).includes('openai'))});
test('P04 rate limit stops with retry information',async()=>{providers.resetForTests();let calls=0;await assert.rejects(providers.generate([],{}, {env,fetcher:async()=>{calls++;return response(429)}}),e=>e.status===429&&e.retryAfter===2);assert.equal(calls,1)});
test('P05 all providers exhausted rejects',async()=>{providers.resetForTests();await assert.rejects(providers.generate([],{}, {env,fetcher:async()=>response(500)}))});
test('P06 failed narration preserves original signed save; retry charges once; duplicate cached',async()=>{
 process.env.GROQ_API_KEY='gsk_codex_fake_api';process.env.DND_SESSION_SECRET='codex-fake-api-signing-secret';process.env.ASTRA_LLM_PROVIDERS='groq';
 const handler=load('api/turn.js'),s=initial('wizard'),save=world.sign(s,process.env.DND_SESSION_SECRET),original=providers.generate;let fail=true,calls=0;
 providers.generate=async(m,sc,o)=>{calls++;if(o.stage==='plan')return plan({resource:'spell'});if(fail)throw new providers.ProviderError('Mock unavailable',503);return result(s)};
 const body={save,action:'I cast Shield.',requestId:'codex-provider-retry-0001'};
 const call=async()=>{const res={setHeader(){},status(n){this.code=n;return this},json(v){this.body=v;return v}};await handler({method:'POST',body,headers:{host:'qa.local','x-forwarded-for':'codex-qa'},socket:{}},res);return res};
 try{const bad=await call();assert.equal(bad.code,503);assert.equal(world.verify(save,process.env.DND_SESSION_SECRET).slots,3);assert.equal(bad.body.save,undefined);fail=false;const good=await call();assert.equal(good.code,200);assert.equal(good.body.state.slots,2);assert.equal(good.body.state.turn,1);assert.equal(good.body.state.history.length,1);const count=calls,again=await call();assert.equal(again.body.save,good.body.save);assert.equal(calls,count)}finally{providers.generate=original}
});
run();
