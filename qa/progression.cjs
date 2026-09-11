'use strict';
const assert=require('node:assert/strict');
const rules=require('../server/rules.cjs');
const world=require('../server/world.cjs');
const validation=require('../dist/state-validation.js');

const test=(name,fn)=>{fn();console.log(`✓ ${name}`)};
const resolution={kind:'none',intent:'',stakes:'',resource:'none',blocked:false,roll:null,healing:0,damage:0,damageText:'',deathSave:null,defeatPenalty:null};
const turn=state=>({narrative:'The road goes on.',location:state.location,time:state.time,suggestions:['Walk on'],memory:state.memory,inventory:state.inventory,npcs:state.npcs,quests:state.quests,places:state.places,exits:state.exits,factions:state.factions,facts:state.facts,journalEvents:state.journalEvents,conditionsAdded:[],conditionsRemoved:[],danger:'safe',hpChange:0,goldChange:0,xpGain:3,rest:'none'});
function grind(state,turns){for(let i=0;i<turns;i++)state=world.apply(state,turn(state),'I press on',resolution);return state}

test('xp thresholds map to levels 2 through 5',()=>{
  assert.deepEqual([0,14,15,34,35,59,60,9999].map(rules.levelForXp),[2,2,3,3,4,4,5,5]);
});

test('crossing a threshold raises level and maximum HP',()=>{
  const start=world.initial('Climber','fighter'),after=grind(start,5);
  assert.equal(after.level,3);
  assert.equal(after.maxHp,start.maxHp+8);
  assert.equal(after.hp,start.hp+8,'new max HP should also heal by the gained maximum');
  assert.deepEqual(after.levelUp,{from:2,to:3,hpGain:8,unlocks:['Improved Critical: attacks now crit on 19 or 20.']});
});

test('level-up reporting is transient and never signed into the save',()=>{
  const levelled=grind(world.initial('Climber','rogue'),5);
  assert.ok(levelled.levelUp);
  assert.equal(world.upgrade(levelled).levelUp,undefined);
  const save=world.sign(levelled,'s'.repeat(40));
  assert.equal(world.verify(save,'s'.repeat(40)).levelUp,undefined);
});

test('old high-XP level-2 campaigns can catch up in one turn',()=>{
  const old=world.initial('Veteran','rogue');old.xp=57;
  const jumped=world.apply(old,turn(old),'I press on',resolution);
  assert.equal(jumped.xp,60);
  assert.equal(jumped.level,5);
  assert.equal(jumped.maxHp,old.maxHp+18,'three rogue levels should add 18 maximum HP');
  assert.equal(jumped.levelUp.from,2);
  assert.equal(jumped.levelUp.to,5);
});

test('progression changes server-owned combat rules without changing level 2',()=>{
  assert.equal(rules.proficiencyBonus(2),2);
  assert.equal(rules.proficiencyBonus(5),3);
  assert.equal(rules.criticalThreshold({cls:'fighter',level:2}),20);
  assert.equal(rules.criticalThreshold({cls:'fighter',level:3}),19);
  assert.equal(rules.sneakDice(2),1);
  assert.equal(rules.sneakDice(3),2);
  assert.equal(rules.sneakDice(5),3);
  assert.equal(rules.fireBoltDice(2),1);
  assert.equal(rules.fireBoltDice(5),2);
  assert.equal(rules.wizardSlots(2),3);
  assert.equal(rules.wizardSlots(5),6);
});

test('levelling is capped at five',()=>{
  const maxed=grind(world.initial('Veteran','wizard'),40);
  assert.equal(maxed.level,rules.MAX_LEVEL);
  assert.equal(maxed.slots,rules.wizardSlots(rules.MAX_LEVEL));
  assert.equal(rules.xpToNextLevel(maxed),null);
});

test('browser validation accepts only bounded level-up reports',()=>{
  const state=grind(world.initial('Browser','fighter'),5);
  assert.equal(validation.validState(state),true);
  assert.equal(validation.validState({...state,level:6}),false);
  assert.equal(validation.validState({...state,levelUp:{from:2,to:99,hpGain:8,unlocks:[]}}),false);
});

console.log('Progression QA passed: server-owned levels, live-play pacing, bounded growth, transient reporting and browser validation.');
