'use strict';
const assert=require('node:assert/strict');
const world=require('../server/world.cjs');
const tactical=require('../server/tactical.cjs');
const rules=require('../server/rules.cjs');

function rng(seed){let value=seed>>>0;return (min,max)=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return min+Math.floor((value/0x100000000)*(max-min))}}
function nameForStyle(state,style){for(let i=0;i<500;i++){const name=`Balance foe ${i}`;if(tactical.enemyProfile(state,name).id===style)return name}throw new Error(`No deterministic ${style} name found`)}
function levelledFighter(level){const state=world.initial('Balance Fighter','fighter');if(level<=2)return state;const progression=rules.progressionFor('fighter',2,level);state.level=level;state.xp=rules.xpForLevel(level);state.maxHp+=progression.hpGain;state.hp=state.maxHp;return state}
function fight(level,style,seed){
  let state=levelledFighter(level),roll=rng(seed),name=nameForStyle(state,style);state=tactical.startEncounter(state,name);state.combat.grid.cells={};
  let move=tactical.move(state,8,4,roll);state=move.state;
  for(let round=0;round<30&&state.combat.active;round++){
    if(state.hp<=Math.ceil(state.maxHp*.55)&&state.secondWindReady){const wind=tactical.secondWind(state,roll);state=wind.state}
    const attack=tactical.attack(state,'enemy-1',roll);state=attack.state;if(!state.combat.active)return true;
    const end=tactical.endTurn(state,roll);state=end.state;if(state.hp<=0)return false;
  }
  return !state.combat.active&&state.hp>0;
}
function winRate(level,style,trials=300){let wins=0;for(let i=0;i<trials;i++)if(fight(level,style,0xA57A0000+level*10000+i*17+(style==='bruiser'?1:2)))wins++;return wins/trials}

for(const level of [2,5])for(const style of ['bruiser','skirmisher']){
  const rate=winRate(level,style);console.log(`Fighter level ${level} vs ${style}: ${(rate*100).toFixed(1)}% wins`);
  assert(rate<.90,`fighter level ${level} must retain meaningful loss risk against ${style}`);
  assert(rate>.20,`fighter level ${level} should still have a plausible solo chance against ${style}`);
}
console.log('Combat balance simulation passed: 1,200 seeded fights stay between 20% and 90% Fighter win rate at levels 2 and 5.');
