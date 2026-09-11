'use strict';
const assert=require('node:assert/strict');
const world=require('../server/world.cjs');
const tactical=require('../server/tactical.cjs');

const test=(name,fn)=>{fn();console.log('✓',name)};
const maxRoll=(min,max)=>max-1;
const sequence=values=>()=>values.shift();
const plan=(overrides={})=>({kind:'none',ability:'STR',dc:10,advantage:'normal',proficient:false,resource:'none',stakes:'',intent:'',...overrides});
function clearGrid(state){state.combat.grid.cells={};return state}
function nameForStyle(state,style){for(let i=0;i<100;i++){const name=`Foe ${i}`;if(tactical.enemyProfile(state,name).id===style)return name}throw new Error(`Could not find ${style} profile`)}

test('enemy archetypes vary deterministically and scale with level',()=>{
  const level2=world.initial('Fighter','fighter'),styles=new Set();for(let i=0;i<30;i++)styles.add(tactical.enemyProfile(level2,`Foe ${i}`).id);assert.equal(styles.size,3);
  const level5={...level2,level:5,xp:60};const name='Road Marauder';assert(tactical.enemyProfile(level5,name).hp>tactical.enemyProfile(level2,name).hp);assert(tactical.enemyProfile(level5,name).attack>=tactical.enemyProfile(level2,name).attack);
});

test('rogue Dash uses the bonus action and preserves the attack action',()=>{
  const state=tactical.startEncounter(world.initial('Rogue','rogue'),'Guard');const out=tactical.dash(state);assert.equal(out.ok,true);assert.equal(out.state.combat.actors.hero.bonusActionUsed,true);assert.equal(out.state.combat.actors.hero.actionUsed,false);
});

test('rogue can Hide behind cover then attack with advantage',()=>{
  let state=clearGrid(tactical.startEncounter(world.initial('Rogue','rogue'),'Guard'));state.combat.grid.cells['2,4']={terrain:'difficult',cover:'half'};const hidden=tactical.hide(state);assert.equal(hidden.ok,true);assert.equal(hidden.state.combat.actors.hero.hidden,true);const attacked=tactical.attack(hidden.state,'enemy-1',maxRoll);assert.equal(attacked.ok,true);assert.equal(attacked.roll.advantage,'advantage');assert.equal(attacked.state.combat.actors.hero.hidden,false);
});

test('fighter Second Wind is a real tactical bonus action',()=>{
  const fighter={...world.initial('Fighter','fighter'),hp:8};const state=tactical.startEncounter(fighter,'Guard'),out=tactical.secondWind(state,maxRoll);assert.equal(out.ok,true);assert.equal(out.state.secondWindReady,false);assert.equal(out.state.combat.actors.hero.bonusActionUsed,true);assert.equal(out.state.combat.actors.hero.actionUsed,false);assert(out.state.hp>8);
});

test('wizard can cast Magic Missile tactically and spend a slot',()=>{
  let state=clearGrid(tactical.startEncounter(world.initial('Wizard','wizard'),'Guard'));const before=state.combat.actors['enemy-1'].hp,out=tactical.magicMissile(state,'enemy-1',maxRoll);assert.equal(out.ok,true);assert.equal(out.state.slots,2);assert.equal(out.state.combat.actors.hero.actionUsed,true);assert(out.state.combat.actors['enemy-1'].hp<before);
});

test('cover can turn a ranged enemy hit into a miss',()=>{
  const base=world.initial('Wizard','wizard'),archer=nameForStyle(base,'archer');let exposed=clearGrid(tactical.startEncounter(base,archer));const exposedResult=tactical.endTurn(exposed,()=>7);assert(exposedResult.state.hp<base.hp,'exposed hero should be hit on a 7 + 5');
  let covered=clearGrid(tactical.startEncounter(base,archer));covered.combat.grid.cells['5,4']={terrain:'difficult',cover:'half'};const coveredResult=tactical.endTurn(covered,()=>7);assert.equal(coveredResult.state.hp,base.hp,'half cover should raise AC enough to turn the same roll into a miss');
});

test('recognised magic equipment changes authoritative damage',()=>{
  const plain=world.initial('Fighter','fighter'),enchanted={...plain,inventory:[...plain.inventory,'Flaming Longsword']},attackPlan=plan({kind:'attack',ability:'STR',dc:10,proficient:true});
  const normal=world.resolve(plain,attackPlan,sequence([10,4]),'I attack with my longsword.'),flaming=world.resolve(enchanted,attackPlan,sequence([10,4,2]),'I attack with my flaming longsword.');assert.equal(flaming.resolution.damage,normal.resolution.damage+2);
});

test('three failed death saves impose a real bounded defeat penalty',()=>{
  const down={...world.initial('Fighter','fighter'),hp:0,gold:10,deathSaves:{successes:0,failures:2,stable:false,defeated:false}},out=world.resolve(down,plan(),()=>2,'I try to stand.');assert.equal(out.resolution.deathSave.outcome,'setback');assert.equal(out.state.hp,1);assert.equal(out.state.gold,5);assert(out.state.conditions.includes('exhausted'));assert.deepEqual(out.resolution.defeatPenalty,{goldLost:5,condition:'exhausted'});
});

console.log('Tactical depth QA passed: scaled archetypes, positioning, class actions, equipment and meaningful defeat.');
