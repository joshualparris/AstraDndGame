'use strict';
const assert=require('node:assert/strict');
const srd=require('../server/srd/index.cjs');
function test(name,fn){fn();console.log('✓',name)}

test('all twelve SRD classes load with 20 levels each',()=>{
  const classes=srd.listClasses();
  assert.equal(classes.length,12);
  for(const {id} of classes){
    const c=srd.getClass(id);
    assert.equal(c.levels.length,20,`${id} should have 20 levels`);
    assert.equal(c.levels[0].level,1);
    assert.equal(c.levels[19].level,20);
  }
});

test('full caster spell slot progression matches known 5e tables',()=>{
  assert.deepEqual(srd.spellSlotsAtLevel('wizard',1),{1:2});
  assert.deepEqual(srd.spellSlotsAtLevel('wizard',5),{1:4,2:3,3:2});
  assert.deepEqual(srd.spellSlotsAtLevel('wizard',20),{1:4,2:3,3:3,4:3,5:3,6:2,7:2,8:1,9:1});
  assert.equal(srd.maxSpellLevel('cleric',20),9);
  assert.equal(srd.maxSpellLevel('fighter',1),0);
});

test('319 SRD spells load and are queryable by class and level',()=>{
  assert.equal(srd.SPELLS.length,319);
  assert.ok(srd.getSpell('fireball'));
  assert.equal(srd.getSpell('fireball').level,3);
  assert.ok(srd.spellsForClass('wizard',1).every(s=>s.level<=1));
  assert.ok(srd.cantripsForClass('cleric').some(s=>s.id==='sacred-flame'));
});

test('nine races with subraces, four backgrounds, five feats load',()=>{
  assert.equal(srd.RACES.length,9);
  const elf=srd.getRace('elf');
  assert.ok(elf.subraces.some(s=>s.id==='high-elf'));
  assert.equal(srd.listBackgrounds().length,4);
  assert.equal(srd.listFeats().length,5);
  assert.ok(srd.listFightingStyles().length>=4);
});

test('fighter extra attack and action surge scale to level 20',()=>{
  const l20=srd.classLevel('fighter',20);
  assert.equal(l20.classSpecific.extra_attacks,3);
  assert.equal(l20.classSpecific.action_surges,2);
  assert.equal(l20.profBonus,6);
});

console.log('SRD content QA passed: 12 classes x20 levels, 319 spells, races, backgrounds, feats.');
