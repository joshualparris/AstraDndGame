'use strict';
const assert=require('node:assert/strict');
const {test,run,initial,world,characters,plan,high,result}=require('./codex-harness.cjs');
for(const cls of ['fighter','wizard','rogue','cleric','paladin','ranger'])test('R01 '+cls+' initial state and save roundtrip',()=>{const s=initial(cls),out=world.verify(world.sign(s,'qa-secret'),'qa-secret');assert.equal(out.cls,cls);assert(s.hp>0&&s.hp===s.maxHp);assert(s.ac>0);assert.equal(s.party[0].cls,cls);assert.equal(out.slots,s.slots);assert.equal(s.slots,characters.definition(cls).slotsMax)});
for(const level of [1,2,3,4,5,10,20])test('R02 level '+level+' proficiency is level-derived',()=>{const s=initial();s.level=level;const r=world.resolve(s,plan({kind:'attack',ability:'STR',proficient:true}),high);assert.equal(r.resolution.roll.modifier,3+2+Math.floor((level-1)/4));assert.equal(world.verify(world.sign(s,'qa'),'qa').level,level)});
test('R03 potion healing caps at max HP',()=>{const s=initial();s.hp=s.maxHp-1;const r=world.resolve(s,plan({resource:'potion'}),high);assert.equal(r.state.hp,s.maxHp);assert.equal(r.state.potions,s.potions-1)});
test('R04 explicit fighter short rest restores feature',()=>{const s=initial();s.secondWindReady=false;s.hp=1;const r=world.resolve(s,plan());const out=world.apply(r.state,result(s,{rest:'short'}),'I take a short rest.',r.resolution);assert(out.secondWindReady);assert.equal(out.hp,7)});
test('R05 spell slot levels and known spells exposed',()=>{const s=initial('wizard');assert(s.spellSlots&&s.knownSpells,'No typed slots or known-spells field')});
run();
