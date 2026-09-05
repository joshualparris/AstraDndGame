'use strict';
const assert=require('node:assert/strict');
const W=require('../server/world.cjs');
const P=require('../server/groq.cjs');
const tests=[];
const test=(name,fn)=>tests.push({name,fn});
const plan=(overrides={})=>({kind:'none',ability:'WIS',dc:10,advantage:'normal',proficient:false,resource:'none',stakes:'Observe what happens.',intent:'Act.',...overrides});
const result=(state,overrides={})=>({narrative:'The world answers the action and remains ready for what comes next.',location:state.location,time:state.time,suggestions:['Continue','Look around','Talk'],memory:state.memory,inventory:state.inventory,npcs:state.npcs,quests:state.quests,places:state.places,hpChange:0,goldChange:0,xpGain:0,rest:'none',...overrides});

test('all three open-world classes initialise with bounded resources',()=>{
  const fighter=W.initial('  Rowan  ','fighter'),rogue=W.initial('R','rogue'),wizard=W.initial('W','wizard');
  assert.equal(fighter.name,'Rowan');assert.equal(fighter.hp,24);assert.equal(fighter.secondWindReady,true);assert.equal(fighter.slots,0);
  assert.equal(rogue.hp,18);assert.equal(rogue.secondWindReady,false);assert.equal(rogue.slots,0);
  assert.equal(wizard.hp,14);assert.equal(wizard.slots,3);assert.equal(wizard.secondWindReady,false);assert(wizard.inventory.includes('Spellbook'));
  assert.equal(fighter.prologue,fighter.narrative);
});

test('full-health healing potion is blocked without consumption',()=>{
  const s=W.initial('R','fighter');const out=W.resolve(s,plan({resource:'potion'}),()=>4,'I drink a healing potion.');
  assert.equal(out.resolution.blocked,true);assert.equal(out.state.potions,2);assert.equal(out.state.hp,s.maxHp);
});

test('potion healing is server-applied once, never doubled by narration',()=>{
  const s={...W.initial('R','fighter'),hp:5};const out=W.resolve(s,plan({resource:'potion'}),()=>4,'I drink a healing potion.');
  assert.equal(out.state.hp,15);assert.equal(out.state.potions,1);
  const updated=W.apply(out.state,result(out.state,{hpChange:6}), 'I drink a healing potion.',out.resolution);
  assert.equal(updated.hp,15);
});

test('fighter Second Wind heals, spends, blocks repeat, and refreshes on short rest',()=>{
  const s={...W.initial('R','fighter'),hp:5};const wind=W.resolve(s,plan({resource:'none'}),()=>6,'I use Second Wind.');
  assert.equal(wind.resolution.resource,'secondWind');assert.equal(wind.resolution.blocked,false);assert.equal(wind.resolution.healing,8);assert.equal(wind.state.hp,13);assert.equal(wind.state.secondWindReady,false);
  const repeated=W.resolve(wind.state,plan({resource:'secondWind'}),()=>6,'Second Wind again');assert.equal(repeated.resolution.blocked,true);assert.equal(repeated.state.hp,13);
  const rested=W.apply(wind.state,result(wind.state,{rest:'short',hpChange:6,time:'An hour later'}),'I take a short rest.',{blocked:false,healing:0});
  assert.equal(rested.hp,19);assert.equal(rested.secondWindReady,true);
});

test('legacy fighter saves gain a safe Second Wind state',()=>{
  const legacy=W.initial('R','fighter');delete legacy.secondWindReady;
  const out=W.resolve({...legacy,hp:10},plan(),()=>10,'I look around.');
  assert.equal(out.state.secondWindReady,true);
});

test('rest healing cannot be doubled by positive hpChange',()=>{
  const s={...W.initial('R','rogue'),hp:5};const updated=W.apply(s,result(s,{rest:'short',hpChange:6,time:'An hour later'}),'I take a short rest.',{blocked:false,healing:0});
  assert.equal(updated.hp,11);
});

test('long rest restores wizard slots and health',()=>{
  const s={...W.initial('W','wizard'),hp:2,slots:0};const updated=W.apply(s,result(s,{rest:'long',time:'Morning'}),'I sleep in a safe room for eight hours.',{blocked:false,healing:0});
  assert.equal(updated.hp,updated.maxHp);assert.equal(updated.slots,3);
});

test('blocked actions preserve material state but still advance narrative history',()=>{
  const s={...W.initial('W','wizard'),slots:0,hp:7,gold:9};const blocked=W.resolve(s,plan({resource:'spell'}),()=>10,'I cast a spell.');
  const updated=W.apply(blocked.state,result(blocked.state,{location:'Wrong place',time:'Wrong time',inventory:[],goldChange:50,hpChange:12,xpGain:25}),'I cast a spell.',blocked.resolution);
  assert.equal(updated.location,s.location);assert.equal(updated.time,s.time);assert.deepEqual(updated.inventory,s.inventory);assert.equal(updated.gold,9);assert.equal(updated.hp,7);assert.equal(updated.xp,0);assert.equal(updated.turn,1);assert.equal(updated.history.length,1);
});

test('advantage and disadvantage use the correct die',()=>{
  const s=W.initial('R','rogue');let values=[4,18];const adv=W.resolve(s,plan({kind:'check',ability:'DEX',dc:10,advantage:'advantage'}),()=>values.shift(),'hide');assert.equal(adv.resolution.roll.die,18);assert.equal(adv.resolution.roll.success,true);
  values=[18,4];const dis=W.resolve(s,plan({kind:'check',ability:'DEX',dc:10,advantage:'disadvantage'}),()=>values.shift(),'climb');assert.equal(dis.resolution.roll.die,4);assert.equal(dis.resolution.roll.success,false);
});

test('attack natural 20 succeeds and natural 1 fails regardless of total',()=>{
  const s=W.initial('R','fighter');const crit=W.resolve(s,plan({kind:'attack',ability:'STR',dc:25,proficient:true}),()=>20,'attack');assert.equal(crit.resolution.roll.success,true);assert.equal(crit.resolution.roll.critical,true);
  const one=W.resolve(s,plan({kind:'attack',ability:'STR',dc:5,proficient:true}),()=>1,'attack');assert.equal(one.resolution.roll.success,false);
});

test('state updates remain bounded',()=>{
  const s=W.initial('R','fighter');const huge=Array.from({length:50},(_,i)=>'x'.repeat(300)+i);const updated=W.apply(s,result(s,{narrative:'n'.repeat(8000),location:'l'.repeat(300),time:'t'.repeat(300),memory:'m'.repeat(5000),suggestions:huge,inventory:huge,npcs:huge,quests:huge,places:huge,hpChange:-999,goldChange:999,xpGain:999}),'action',{blocked:false,healing:0});
  assert.equal(updated.narrative.length,5000);assert.equal(updated.location.length,100);assert.equal(updated.memory.length,3500);assert.equal(updated.suggestions.length,4);assert.equal(updated.inventory.length,30);assert.equal(updated.npcs.length,15);assert.equal(updated.quests.length,12);assert.equal(updated.places.length,20);assert.equal(updated.hp,12);assert.equal(updated.gold,60);assert.equal(updated.xp,25);
});

test('history is capped and signed saves reject tampering',()=>{
  let s=W.initial('R','fighter');for(let i=0;i<9;i++)s=W.apply(s,result(s,{narrative:'Turn '+i}),'action '+i,{blocked:false,healing:0});assert.equal(s.history.length,6);assert.equal(s.history[0].action,'action 3');
  const secret='secret-secret-secret-secret-secret-1',save=W.sign(s,secret);assert.deepEqual(W.verify(save,secret),s);assert.throws(()=>W.verify(save+'x',secret));assert.throws(()=>W.verify(save,'different-secret'));
});

test('provider falls back after malformed successful model output',async()=>{
  P.resetForTests();let calls=0;const env={GROQ_API_KEYS:JSON.stringify(['gsk_test_primary_0000000000']),GROQ_MODEL:'model-a',GROQ_FALLBACK_MODEL:'model-b'};
  const fetcher=async()=>{calls++;return {status:200,ok:true,json:async()=>calls===1?{choices:[{finish_reason:'stop',message:{content:'not json'}}]}:{choices:[{finish_reason:'stop',message:{content:'{"ok":true}'}}]}}};
  const schema={type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false};const out=await P.generate([{role:'user',content:'x'}],schema,{env,fetcher,stage:'plan'});assert.deepEqual(out,{ok:true});assert.equal(calls,2);
});

test('provider uses smaller output budget for planning than narration',async()=>{
  P.resetForTests();const seen=[];const env={GROQ_API_KEYS:JSON.stringify(['gsk_test_primary_0000000000']),GROQ_MODEL:'model-a',GROQ_FALLBACK_MODEL:'model-a'};const fetcher=async(url,options)=>{seen.push(JSON.parse(options.body));return {status:200,ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:'{"ok":true}'}}]})}};const schema={type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false};await P.generate([],schema,{env,fetcher,stage:'plan'});P.resetForTests();await P.generate([],schema,{env,fetcher,stage:'narrate'});assert(seen[0].max_completion_tokens<seen[1].max_completion_tokens);assert(seen[0].temperature<seen[1].temperature);
});

(async()=>{let failures=0;for(const t of tests){try{await t.fn();console.log('✓',t.name)}catch(error){failures++;console.error('✗',t.name);console.error(error.stack||error)}}if(failures){console.error(`\n${failures} QA rule test(s) failed.`);process.exit(1)}console.log(`\n${tests.length} QA rule tests passed.`)})().catch(error=>{console.error(error);process.exit(1)});
