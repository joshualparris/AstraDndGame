'use strict';
const assert=require('node:assert/strict');
const world=require('../server/world.cjs');
const tactical=require('../server/tactical.cjs');
const secret='0123456789abcdef0123456789abcdef';
const high=(min,max)=>max-1;
function test(name,fn){try{fn();console.log('✓',name)}catch(e){console.error('✗',name);throw e}}

test('derives exploration graph from current location and exits',()=>{
  const s=world.initial('Map Tester','fighter');const e=tactical.deriveExploration(s);assert.equal(e.nodes.length,5);assert.equal(e.edges.length,4);assert.ok(e.nodes.find(n=>n.id===e.currentId)?.name.includes('road to Blackthorn'));
});
test('spatial enrichment survives signed save round trip',()=>{
  const s=tactical.enrichSpatial(world.initial('Signer','rogue')),token=world.sign(s,secret),v=world.verify(token,secret);assert.ok(v.spatial.exploration.nodes.length>=4);assert.equal(v.combat.active,false);
});
test('starts a deterministic tactical encounter',()=>{
  const s=tactical.startEncounter(world.initial('Seren','fighter'),'Grave hound');assert.equal(s.combat.active,true);assert.equal(s.combat.actors['enemy-1'].name,'Grave hound');assert.equal(s.combat.grid.width,12);
});
test('movement enforces speed and bounds',()=>{
  let s=tactical.startEncounter(world.initial('Mover','fighter'),'Foe');let r=tactical.move(s,11,7,high);assert.equal(r.ok,false);r=tactical.move(s,3,4,high);assert.equal(r.ok,true);assert.equal(r.state.combat.actors.hero.movementSpentFt,5);
});
test('dash consumes the action and doubles movement allowance',()=>{
  let s=tactical.startEncounter(world.initial('Dasher','fighter'),'Foe');let r=tactical.dash(s);assert.equal(r.ok,true);assert.equal(r.state.combat.actors.hero.actionUsed,true);assert.equal(r.state.combat.actors.hero.dashed,true);assert.ok(tactical.reachable(r.state).length>20);
});
test('disengage prevents opportunity attacks when leaving reach',()=>{
  let s=tactical.startEncounter(world.initial('Scout','rogue'),'Foe');s.combat.actors.hero.x=8;s.combat.actors.hero.y=4;let d=tactical.disengage(s);const hp=d.state.hp,r=tactical.move(d.state,7,4,high);assert.equal(r.ok,true);assert.equal(r.state.hp,hp);assert.equal(r.state.combat.actors['enemy-1'].reactionAvailable,true);
});
test('leaving reach without disengage triggers an opportunity attack',()=>{
  let s=tactical.startEncounter(world.initial('Scout','rogue'),'Foe');s.combat.actors.hero.x=8;s.combat.actors.hero.y=4;const hp=s.hp,r=tactical.move(s,7,4,high);assert.equal(r.ok,true);assert.ok(r.state.hp<hp);assert.equal(r.state.combat.actors['enemy-1'].reactionAvailable,false);
});
test('melee range is server-enforced',()=>{
  let s=tactical.startEncounter(world.initial('Fighter','fighter'),'Foe');let r=tactical.attack(s,'enemy-1',high);assert.equal(r.ok,false);s.combat.actors.hero.x=8;s.combat.actors.hero.y=4;r=tactical.attack(s,'enemy-1',high);assert.equal(r.ok,true);assert.ok(r.state.combat.actors['enemy-1'].hp<12);
});
test('total cover blocks a ranged attack',()=>{
  let s=tactical.startEncounter(world.initial('Mage','wizard'),'Foe');s.combat.grid.cells['5,4']={x:5,y:4,terrain:'blocked',cover:'total'};const r=tactical.attack(s,'enemy-1',high);assert.equal(r.ok,false);assert.match(r.summary,/cover/i);
});
test('enemy turn advances round and attacks or closes distance',()=>{
  let s=tactical.startEncounter(world.initial('Hero','fighter'),'Foe');s.combat.actors.hero.x=8;s.combat.actors.hero.y=4;const hp=s.hp,r=tactical.endTurn(s,high);assert.equal(r.ok,true);assert.equal(r.state.combat.round,2);assert.equal(r.state.combat.turn,'hero');assert.ok(r.state.hp<hp);
});
console.log('AIDungeonMaster port regression checks passed.');
