'use strict';
const assert=require('node:assert/strict');
const authority=require('../server/turn-authority.cjs');
const world=require('../server/world.cjs');

const state=world.initial('Authority','fighter');
const baseResult={goldChange:0,inventory:[...state.inventory]};
const test=(name,fn)=>{fn();console.log('✓',name)};

test('ordinary conversation cannot silently debit gold',()=>{
  assert.equal(authority.validNarrativeUpdate(state,'I ask the woman about her daughter.',{...baseResult,goldChange:-8}),false);
});

test('ordinary conversation cannot silently add an item',()=>{
  assert.equal(authority.validNarrativeUpdate(state,'I ask what she knows.',{...baseResult,inventory:[...state.inventory,'Flaming Longsword']}),false);
});

test('checking inventory is normal input but cannot mutate inventory',()=>{
  assert.equal(authority.validNarrativeUpdate(state,'Dungeon Master, look at my inventory.',baseResult),true);
  assert.equal(authority.validNarrativeUpdate(state,'Dungeon Master, look at my inventory.',{...baseResult,inventory:[...state.inventory,'Imaginary ring']}),false);
});

test('a completed purchase moves item and affordable gold atomically',()=>{
  assert.equal(authority.validNarrativeUpdate(state,'I buy the flaming longsword for 8 gold.',{...baseResult,goldChange:-8,inventory:[...state.inventory,'Flaming Longsword']}),true);
  assert.equal(authority.validNarrativeUpdate(state,'I buy the flaming longsword.',{...baseResult,goldChange:-8}),false,'cannot charge for an item that was not added');
  assert.equal(authority.validNarrativeUpdate(state,'I buy the flaming longsword for 99 gold.',{...baseResult,goldChange:-50,inventory:[...state.inventory,'Flaming Longsword']}),false,'cannot overspend beyond current gold');
});

test('a sale must remove the sold item before gold can increase',()=>{
  const withCloak={...state,inventory:[...state.inventory,'Silk cloak']};
  assert.equal(authority.validNarrativeUpdate(withCloak,'I sell the silk cloak.',{goldChange:5,inventory:state.inventory}),true);
  assert.equal(authority.validNarrativeUpdate(withCloak,'I sell the silk cloak.',{goldChange:5,inventory:withCloak.inventory}),false);
});

test('unsolicited rewards remain offers until the player accepts them',()=>{
  assert.equal(authority.validNarrativeUpdate(state,'I rescue the child.',{...baseResult,goldChange:10}),false);
  assert.equal(authority.validNarrativeUpdate(state,'I accept the 10 gold reward.',{...baseResult,goldChange:10}),true);
});

console.log('Turn authority QA passed: gold and inventory changes require explicit player agency and atomic transactions.');
