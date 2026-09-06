'use strict';
const assert=require('node:assert/strict');
const characters=require('../server/openworld-classes.cjs');characters.install();
const world=require('../server/world.cjs');
const rules=require('../server/rules.cjs');
const tactical=require('../server/tactical.cjs');
const canon=require('../server/canon.cjs');
const providers=require('../server/providers.cjs');
const engine=require('../dist/engine.js');
const high=(min,max)=>max-1;
function test(name,fn){return Promise.resolve().then(fn).then(()=>console.log('✓',name))}
(async()=>{
  await test('open-world class registry has all six distinct classes',()=>{
    assert.deepEqual(['fighter','rogue','wizard','cleric','paladin','ranger'].filter(x=>engine.classes[x]),['fighter','rogue','wizard','cleric','paladin','ranger']);
    assert.equal(engine.classes.cleric.stats.WIS,3);assert.equal(engine.classes.paladin.ac,18);assert.equal(engine.classes.ranger.weapon,'Longbow');
  });
  await test('new caster starts with signed party-state resources',()=>{
    let s=characters.enrichState(world.initial('Aldric','cleric',{background:'acolyte',goal:'Protect Blackthorn'}),{fresh:true});
    assert.equal(s.slots,3);assert.equal(s.slotsMax,3);assert.equal(s.party.length,1);assert.equal(s.party[0].id,'hero');assert.equal(s.party[0].cls,'cleric');assert(s.inventory.includes('Holy symbol'));
    const token=world.sign(s,'phase2-signing-secret');s=world.verify(token,'phase2-signing-secret');assert.equal(s.party[0].name,'Aldric');
  });
  await test('paladin smite consumes normal spell resource and rolls extra server damage',()=>{
    let s=characters.enrichState(world.initial('Valerius','paladin'),{fresh:true});
    const resolution={kind:'attack',resource:'spell',roll:{success:true,critical:false}};const dmg=rules.attackDamage(s,resolution,high,'I strike and use Divine Smite.');
    assert.equal(dmg.amount,27);assert.match(dmg.text,/Divine Smite/);
  });
  await test('ranger longbow works at tactical range with deterministic cover-aware attack',()=>{
    let s=characters.enrichState(world.initial('Elowen','ranger'),{fresh:true});s=tactical.startEncounter(s,'Bog raider');
    const r=characters.tacticalAttack(s,'enemy-1',high,tactical);assert.equal(r.ok,true);assert(r.state.combat.actors['enemy-1'].hp<12);assert.match(r.summary,/Longbow/);
  });
  await test('long rest restores new spellcaster slots',()=>{
    let s=characters.enrichState(world.initial('Aldric','cleric'),{fresh:true});s.slots=0;s=characters.afterTurn(s,{rest:'long'});assert.equal(s.slots,3);assert.equal(s.party[0].slots,3);
  });
  await test('canonical memory keeps important old truths while bounding noise',()=>{
    let s=characters.enrichState(world.initial('Mira','rogue',{goal:'Find my missing brother'}),{fresh:true});
    s.facts=['I promised Mara I would find Lena.',...Array.from({length:30},(_,i)=>`Minor road detail ${i}`)];s.journalEvents=Array.from({length:20},(_,i)=>`Event ${i}`);s=canon.enrichState(s);
    assert(s.canon.length<=42);assert(s.canon.some(x=>x.importance==='high'&&/promised Mara/.test(x.content)));assert.match(s.canonSummary,/Personal goal/);
  });
  await test('party synchronisation preserves future companion slots',()=>{
    let s=characters.enrichState(world.initial('Hero','fighter'),{fresh:true});s.party.push({id:'companion-1',role:'companion',name:'Tamsin',cls:'fighter',level:2,hp:12,maxHp:12,ac:14,slots:0,slotsMax:0,conditions:[]});s.hp=17;s=characters.syncParty(s);assert.equal(s.party.length,2);assert.equal(s.party[0].hp,17);assert.equal(s.party[1].name,'Tamsin');
  });
  await test('provider abstraction defaults to Groq and preserves signing derivation',()=>{
    const env={GROQ_API_KEY:'gsk_phase2_test_000000000000000',ASTRA_LLM_PROVIDERS:'groq'};assert.deepEqual(providers.order(env),['groq']);assert(providers.signingSecret(env));assert.equal(providers.configured(env),true);
  });
  await test('alternate provider 429 fails closed instead of rotating credentials for quota',async()=>{
    providers.resetForTests();let calls=0;const env={DND_SESSION_SECRET:'01234567890123456789012345678901',ASTRA_LLM_PROVIDERS:'openai',OPENAI_API_KEYS:'key-a,key-b'};
    const fetcher=async()=>{calls++;return {ok:false,status:429,headers:new Headers({'retry-after':'4'}),json:async()=>({error:{code:'rate_limit_exceeded'}})}};
    await assert.rejects(providers._genericGenerate('openai',[{role:'user',content:'x'}],{}, {env,fetcher,stage:'plan'}),e=>e.status===429&&e.retryAfter===4);assert.equal(calls,1);
  });
  console.log('AIDungeonMaster phase 2 checks passed: six classes, party state, canonical memory, tactical profiles and provider abstraction.');
})().catch(e=>{console.error(e);process.exit(1)});
