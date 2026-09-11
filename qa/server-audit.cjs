'use strict';
const assert=require('node:assert/strict');
const world=require('../server/world.cjs');
const tactical=require('../server/tactical.cjs');
const groq=require('../server/groq.cjs');
const secret=require('../server/secret.cjs');
const http=require('../server/http.cjs');

(async()=>{
  const stableSecret='stable-session-secret-12345678901234567890';
  const key1='gsk_test_first_0000000000000000',key2='gsk_test_second_000000000000000',key3='gsk_test_third_0000000000000000';
  const legacyEnv={GROQ_API_KEY:key1};
  const legacySecret=secret.campaignSigningSecret(legacyEnv,groq);
  assert.equal(secret.signingMode(legacyEnv),'legacy-provider-derived');
  assert.equal(typeof legacySecret,'string');
  assert.equal(legacySecret.length,64);
  const migrationEnv={...legacyEnv,DND_SESSION_SECRET:stableSecret,DND_SESSION_SECRET_PREVIOUS:JSON.stringify(['previous-stable-session-secret-123456789012345'])};
  const migrationSecrets=secret.campaignSigningSecrets(migrationEnv,groq);
  assert.equal(secret.signingMode(migrationEnv),'explicit');
  assert.equal(migrationSecrets[0],stableSecret,'explicit signing secret must be primary for all new saves');
  assert(migrationSecrets.includes(legacySecret),'legacy provider-derived secret must remain verification-only during migration');
  const legacySave=world.sign(world.initial('Legacy save','fighter'),legacySecret);
  assert(migrationSecrets.some(candidate=>{try{world.verify(legacySave,candidate);return true}catch{return false}}),'existing saves must survive migration to the explicit secret');

  let state=tactical.startEncounter(world.initial('HP invariant','fighter'),'Test foe');
  state.hp=10;
  state=tactical.enrichSpatial(state);
  assert.equal(state.combat.actors.hero.hp,10,'tactical HP must project campaign HP');
  const potionPlan={kind:'none',ability:'WIS',dc:0,advantage:'normal',proficient:false,resource:'potion',stakes:'Recover.',intent:'Drink a healing potion.'};
  const healed=world.resolve(state,potionPlan,()=>4,'I drink a potion.').state;
  assert.equal(healed.hp,20);
  assert.equal(healed.combat.actors.hero.hp,10,'world resolution does not own tactical projection');
  const synced=tactical.enrichSpatial(healed);
  assert.equal(synced.combat.actors.hero.hp,20,'narrative healing must reach tactical state before the next action');
  // Force adjacency so this regression tests the HP source-of-truth invariant rather than a
  // particular enemy archetype's preferred range, pathing or cover behaviour.
  synced.combat.grid.cells={};synced.combat.actors['enemy-1'].x=3;synced.combat.actors['enemy-1'].y=4;synced.combat.actors['enemy-1'].ranged=false;
  const afterEnemy=tactical.endTurn(synced,(min,max)=>max-1).state;
  assert(afterEnemy.hp<20,'a controlled adjacent enemy hit must reduce the healed campaign HP');
  assert.equal(afterEnemy.combat.actors.hero.hp,afterEnemy.hp,'tactical projection must remain equal to campaign HP');

  const schema={type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false};
  const messages=[{role:'user',content:'Return JSON.'}];
  const env={GROQ_API_KEYS:JSON.stringify([key1,key2,key3]),GROQ_MODEL:'openai/gpt-oss-120b',GROQ_FALLBACK_MODEL:'openai/gpt-oss-20b'};
  const ok=()=>({status:200,ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:'{"ok":true}'}}]})});
  const err=status=>({status,ok:false,headers:new Headers(),json:async()=>({error:{code:'upstream_test'}})});
  const seen=[];
  const failover=async(url,options)=>{
    const key=options.headers.Authorization.slice('Bearer '.length);seen.push(key);
    if(key===key1)throw new Error('network unavailable');
    if(key===key2)return err(503);
    return ok();
  };
  assert.deepEqual(await groq.generate(messages,schema,{env,fetcher:failover,providerState:groq.createProviderState()}),{ok:true});
  assert.deepEqual(seen,[key1,key1,key2,key2,key3],'availability failures must exhaust configured credentials in order');

  const timeoutEnv={GROQ_API_KEY:key1,GROQ_MODEL:'openai/gpt-oss-120b',GROQ_FALLBACK_MODEL:'openai/gpt-oss-120b'};
  await assert.rejects(
    groq.generate(messages,schema,{env:timeoutEnv,fetcher:async()=>{const error=new Error('timed out');error.name='TimeoutError';throw error},providerState:groq.createProviderState()}),
    error=>error.providerCode==='network_timeout'&&error.causeCode==='timeout'&&error.status===503
  );

  const badRequest=async()=>({status:400,ok:false,headers:new Headers(),json:async()=>({error:{code:'internal_provider_detail_123',message:'detail'}})});
  await assert.rejects(
    groq.generate(messages,schema,{env:timeoutEnv,fetcher:badRequest,providerState:groq.createProviderState()}),
    error=>error.status===502&&!error.message.includes('internal_provider_detail_123')
  );

  const request={headers:{'x-forwarded-for':'198.51.100.8'},socket:{remoteAddress:'127.0.0.1'}};
  assert.equal(http.clientIp(request,{trustProxy:false}),'127.0.0.1');
  assert.equal(http.clientIp(request,{trustProxy:true}),'198.51.100.8');

  console.log('Server audit regression QA passed: migration-safe signing, HP invariant, ordered credential failover, diagnostic causes and trusted-proxy IP handling.');
})().catch(error=>{console.error(error);process.exit(1)});
