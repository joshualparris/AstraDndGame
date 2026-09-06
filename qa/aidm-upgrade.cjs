'use strict';
const assert=require('node:assert/strict');
const W=require('../server/world.cjs');
const R=require('../server/rules.cjs');
const tests=[];const test=(name,fn)=>tests.push({name,fn});
const plan=(overrides={})=>({kind:'none',ability:'WIS',dc:10,advantage:'normal',proficient:false,resource:'none',stakes:'Something changes.',intent:'Act.',...overrides});
const result=(state,overrides={})=>({narrative:'The world changes, remembers, and waits for the next choice.',location:state.location,time:state.time,suggestions:['Continue','Look around','Talk'],memory:state.memory,inventory:state.inventory,npcs:state.npcs,quests:state.quests,places:state.places,exits:state.exits,factions:state.factions,facts:state.facts,journalEvents:state.journalEvents,conditionsAdded:[],conditionsRemoved:[],danger:state.danger,hpChange:0,goldChange:0,xpGain:0,rest:'none',...overrides});

test('rich identity is bounded and persists in initial state',()=>{
  const s=W.initial('Mara','rogue',{origin:'elf',background:'criminal',tone:'mystery',backstory:'x'.repeat(900),goal:'Find the vanished cartographer.'});
  assert.equal(s.origin,'elf');assert.equal(s.background,'criminal');assert.equal(s.tone,'mystery');assert.equal(s.backstory.length,700);assert.equal(s.goal,'Find the vanished cartographer.');assert(s.facts.some(x=>x.includes('Personal goal')));
});

test('invalid identity choices safely fall back',()=>{
  const s=W.initial('R','fighter',{origin:'space-orc',background:'astronaut',tone:'grimdark'});
  assert.equal(s.origin,'human');assert.equal(s.background,'outlander');assert.equal(s.tone,'balanced');
});

test('legacy v3 saves are upgraded with new AI DM state',()=>{
  const s=W.initial('R','fighter');for(const k of ['origin','background','tone','conditions','deathSaves','exits','factions','facts','journalEvents','danger','lastDamage'])delete s[k];
  const u=W.upgrade(s);assert.equal(u.origin,'human');assert.equal(u.background,'outlander');assert(Array.isArray(u.conditions));assert(Array.isArray(u.exits));assert.equal(u.deathSaves.successes,0);assert.equal(u.danger,'tense');
});

test('background proficiency is applied by the deterministic resolver',()=>{
  const s=W.initial('R','rogue',{background:'criminal'});let rolls=[8];const out=W.resolve(s,plan({kind:'check',ability:'DEX',dc:12,proficient:false}),()=>rolls.shift(),'I pick the lock.');
  assert.equal(out.resolution.roll.modifier,5,'DEX +3 plus level-2 proficiency +2');assert.equal(out.resolution.roll.total,13);assert.equal(out.resolution.roll.success,true);
});

test('poisoned condition forces disadvantage on an attack',()=>{
  const s={...W.initial('R','fighter'),conditions:['poisoned']};let rolls=[18,4,6];const out=W.resolve(s,plan({kind:'attack',ability:'STR',dc:10,proficient:true,advantage:'normal'}),()=>rolls.shift(),'I strike with my longsword.');
  assert.equal(out.resolution.roll.advantage,'disadvantage');assert.deepEqual(out.resolution.roll.dice,[18,4]);assert.equal(out.resolution.roll.die,4);
});

test('opposing advantage and disadvantage cancel',()=>{
  const s={...W.initial('R','rogue'),conditions:['poisoned','invisible']};let rolls=[12,5];const out=W.resolve(s,plan({kind:'attack',ability:'DEX',dc:10,proficient:true,advantage:'normal'}),()=>rolls.shift(),'I attack from invisibility.');
  assert.equal(out.resolution.roll.advantage,'normal');assert.deepEqual(out.resolution.roll.dice,[12]);
});

test('fighter attack damage is server rolled and critical doubles the weapon die',()=>{
  const s=W.initial('R','fighter');let rolls=[20,5,7];const out=W.resolve(s,plan({kind:'attack',ability:'STR',dc:25,proficient:true}),()=>rolls.shift(),'I slash the wraith.');
  assert.equal(out.resolution.roll.critical,true);assert.equal(out.resolution.damage,15);assert.match(out.resolution.damageText,/Longsword/);
});

test('rogue advantage adds deterministic sneak damage',()=>{
  const s=W.initial('R','rogue');let rolls=[14,18,4,6];const out=W.resolve(s,plan({kind:'attack',ability:'DEX',dc:12,proficient:true,advantage:'advantage'}),()=>rolls.shift(),'I fire from hiding.');
  assert.equal(out.resolution.roll.die,18);assert.equal(out.resolution.damage,13);assert.match(out.resolution.damageText,/sneak/i);
});

test('Magic Missile consumes a slot and gets automatic server damage',()=>{
  const s=W.initial('W','wizard');let rolls=[2,3,4];const out=W.resolve(s,plan({resource:'spell',kind:'none'}),()=>rolls.shift(),'I cast Magic Missile at the creature.');
  assert.equal(out.state.slots,2);assert.equal(out.resolution.damage,12);assert.equal(out.resolution.roll,null);assert.match(out.resolution.damageText,/Magic Missile/);
});

test('death-save natural 20 revives the hero at 1 HP',()=>{
  const s={...W.initial('R','fighter'),hp:0,conditions:['unconscious']};const out=W.resolve(s,plan(),()=>20,'I try to stand.');
  assert.equal(out.resolution.kind,'death-save');assert.equal(out.resolution.deathSave.outcome,'revived');assert.equal(out.state.hp,1);assert(!out.state.conditions.includes('unconscious'));
});

test('three death-save successes return play at 1 HP',()=>{
  const s={...W.initial('R','fighter'),hp:0,conditions:['unconscious'],deathSaves:{successes:2,failures:0,stable:false,defeated:false}};const out=W.resolve(s,plan(),()=>10,'I call for help.');
  assert.equal(out.resolution.deathSave.outcome,'stabilised');assert.equal(out.state.hp,1);assert.equal(out.state.deathSaves.successes,3);
});

test('three death-save failures become a playable setback rather than deletion',()=>{
  const s={...W.initial('R','fighter'),hp:0,conditions:['unconscious'],deathSaves:{successes:0,failures:2,stable:false,defeated:false}};const out=W.resolve(s,plan(),()=>2,'I call for help.');
  assert.equal(out.resolution.deathSave.outcome,'setback');assert.equal(out.state.hp,1);assert.equal(out.state.deathSaves.defeated,true);
});

test('condition changes are whitelisted, deduplicated and removable',()=>{
  const s=W.initial('R','fighter');const u=W.apply(s,result(s,{conditionsAdded:['poisoned','POISONED','made-up','prone']}),'I drink swamp water.',{kind:'none',blocked:false,healing:0,damage:0});
  assert.deepEqual(u.conditions.sort(),['poisoned','prone']);const v=W.apply(u,result(u,{conditionsRemoved:['poisoned']}),'I recover.',{kind:'none',blocked:false,healing:0,damage:0});assert.deepEqual(v.conditions,['prone']);
});

test('map, factions, facts and journal lists remain bounded',()=>{
  const s=W.initial('R','fighter'),many=Array.from({length:40},(_,i)=>`entry-${i}-`+'x'.repeat(300));const u=W.apply(s,result(s,{exits:many,factions:many,facts:many,journalEvents:many}),'I study the region.',{kind:'none',blocked:false,healing:0,damage:0});
  assert.equal(u.exits.length,8);assert.equal(u.factions.length,12);assert.equal(u.facts.length,16);assert.equal(u.journalEvents.length,18);assert(u.exits.every(x=>x.length<=120));
});

test('rules module exposes the standard condition vocabulary and identity tables',()=>{
  assert(R.CONDITIONS.includes('poisoned'));assert(R.CONDITIONS.includes('unconscious'));assert.equal(R.ORIGINS.dragonborn,'Dragonborn');assert.equal(R.BACKGROUNDS.sage.name,'Sage');
});

(async()=>{let failures=0;for(const t of tests){try{await t.fn();console.log('✓',t.name)}catch(error){failures++;console.error('✗',t.name);console.error(error.stack||error)}}if(failures){console.error(`\n${failures} AI-DM upgrade test(s) failed.`);process.exit(1)}console.log(`\n${tests.length} AI-DM upgrade tests passed.`)})().catch(error=>{console.error(error);process.exit(1)});
