'use strict';
const {randomInt}=require('node:crypto');

const CONDITIONS=['blinded','charmed','deafened','frightened','grappled','incapacitated','invisible','paralysed','poisoned','prone','restrained','stunned','unconscious','exhausted'];
const conditionSet=new Set(CONDITIONS);
const ORIGINS={
  human:'Human',elf:'Elf',dwarf:'Dwarf',halfling:'Halfling',tiefling:'Tiefling',dragonborn:'Dragonborn'
};
const BACKGROUNDS={
  outlander:{name:'Outlander',abilities:['WIS','STR']},
  soldier:{name:'Soldier',abilities:['STR','CHA']},
  sage:{name:'Sage',abilities:['INT','WIS']},
  acolyte:{name:'Acolyte',abilities:['WIS','CHA']},
  criminal:{name:'Criminal',abilities:['DEX','CHA']},
  artisan:{name:'Artisan',abilities:['INT','CHA']},
  noble:{name:'Noble',abilities:['CHA','INT']},
  urchin:{name:'Urchin',abilities:['DEX','WIS']}
};
const TONES={balanced:'Balanced adventure',heroic:'Heroic fantasy',mystery:'Dark mystery',whimsical:'Whimsical fantasy'};

const MAX_LEVEL=5;
const XP_FOR_LEVEL={2:0,3:15,4:35,5:60};
const HP_PER_LEVEL={fighter:8,rogue:6,wizard:5};
const UNLOCKS={
  fighter:{3:['Improved Critical: attacks now crit on 19 or 20.']},
  rogue:{3:['Sneak Attack increased to 2d6.'],5:['Sneak Attack increased to 3d6.']},
  wizard:{5:['Fire Bolt increased to 2d10.']}
};

const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
const die=(sides,roll=randomInt)=>roll(1,sides+1);
function diceTotal(count,sides,roll=randomInt){let total=0;for(let i=0;i<count;i++)total+=die(sides,roll);return total}
function normaliseChoice(value,table,fallback){return typeof value==='string'&&Object.hasOwn(table,value)?value:fallback}
function normaliseConditions(value){
  if(!Array.isArray(value))return [];
  return [...new Set(value.filter(v=>typeof v==='string').map(v=>v.toLowerCase()).filter(v=>conditionSet.has(v)))].slice(0,6);
}
function backgroundProficient(state,ability){const bg=BACKGROUNDS[state.background];return !!(bg&&bg.abilities.includes(ability))}
function mergeAdvantage(base,state,kind){
  let plus=base==='advantage',minus=base==='disadvantage';const c=new Set(normaliseConditions(state.conditions));
  if((c.has('poisoned')||c.has('frightened'))&&(kind==='check'||kind==='attack'))minus=true;
  if(c.has('exhausted')&&kind==='check')minus=true;
  if((c.has('restrained')||c.has('prone'))&&kind==='attack')minus=true;
  if(c.has('invisible')&&kind==='attack')plus=true;
  if(plus&&minus)return 'normal';return plus?'advantage':minus?'disadvantage':'normal';
}
function characterLevel(state){const level=Number(state?.level);return Number.isInteger(level)?clamp(level,1,MAX_LEVEL):2}
function xpForLevel(level){return Object.hasOwn(XP_FOR_LEVEL,level)?XP_FOR_LEVEL[level]:0}
function levelForXp(xp){let level=2;for(let next=3;next<=MAX_LEVEL;next++)if(Number(xp)>=xpForLevel(next))level=next;return level}
function xpToNextLevel(state){const level=characterLevel(state);return level>=MAX_LEVEL?null:Math.max(0,xpForLevel(level+1)-(Number(state?.xp)||0))}
function proficiencyBonus(level){return level>=5?3:2}
function wizardSlots(level){return Math.min(6,characterLevel({level})+1)}
function criticalThreshold(state){return state?.cls==='fighter'&&characterLevel(state)>=3?19:20}
function sneakDice(level){return characterLevel({level})>=5?3:characterLevel({level})>=3?2:1}
function fireBoltDice(level){return characterLevel({level})>=5?2:1}
function hpPerLevel(cls){return Object.hasOwn(HP_PER_LEVEL,cls)?HP_PER_LEVEL[cls]:5}
function unlocksAt(cls,level){const byClass=UNLOCKS[cls]||{},gained=[...(byClass[level]||[])];if(level===5)gained.push('Proficiency bonus increased to +3.');return gained}
function progressionFor(cls,fromLevel,toLevel){
  let hpGain=0;const unlocks=[];
  for(let level=fromLevel+1;level<=toLevel;level++){hpGain+=hpPerLevel(cls);unlocks.push(...unlocksAt(cls,level))}
  return {from:fromLevel,to:toLevel,hpGain,unlocks};
}
function inventoryText(state){return Array.isArray(state?.inventory)?state.inventory.filter(item=>typeof item==='string').join('\n'):''}
function weaponTraits(state){
  const inventory=inventoryText(state),traits={attackBonus:0,damageBonus:0,bonusDice:0,bonusSides:0,bonusLabel:''};
  if(state?.cls==='fighter'){
    if(/\+1\s+(?:flaming\s+)?longsword/i.test(inventory)){traits.attackBonus=1;traits.damageBonus=1}
    if(/\b(?:flaming|flame[- ]touched)\s+longsword\b/i.test(inventory)){traits.bonusDice=1;traits.bonusSides=4;traits.bonusLabel='fire'}
  }else if(state?.cls==='rogue'){
    if(/\+1\s+shortbow/i.test(inventory)){traits.attackBonus=1;traits.damageBonus=1}
  }else if(state?.cls==='wizard'){
    if(/\+1\s+(?:wand|staff|arcane focus)/i.test(inventory)){traits.attackBonus=1;traits.damageBonus=1}
  }
  return traits;
}
function traitDamage(traits,crit,roll){
  if(!traits.bonusDice||!traits.bonusSides)return {amount:0,text:''};
  const first=diceTotal(traits.bonusDice,traits.bonusSides,roll),extra=crit?diceTotal(traits.bonusDice,traits.bonusSides,roll):0;
  return {amount:first+extra,text:` + ${traits.bonusLabel||'item'} ${first}${extra?` + ${extra} critical`:''}`};
}
function attackDamage(state,resolution,roll=randomInt,action=''){
  const r=resolution?.roll;if(resolution?.kind!=='attack'||!r?.success)return {amount:0,text:''};
  const crit=!!r.critical,level=characterLevel(state),traits=weaponTraits(state);let amount=0,label='';
  if(state.cls==='fighter'){
    const first=die(8,roll),extra=crit?die(8,roll):0,item=traitDamage(traits,crit,roll);amount=first+extra+3+traits.damageBonus+item.amount;label=`Longsword ${first}${crit?` + ${extra} critical die`:''} + ${3+traits.damageBonus}${item.text}`;
  }else if(state.cls==='rogue'){
    const first=die(6,roll),extra=crit?die(6,roll):0,hasSneak=r.advantage==='advantage'||/\b(sneak|hidden|from hiding)\b/i.test(action),sneak=hasSneak?diceTotal(sneakDice(level),6,roll):0,sneakCrit=crit&&hasSneak?diceTotal(sneakDice(level),6,roll):0;
    amount=first+extra+3+traits.damageBonus+sneak+sneakCrit;label=`Weapon ${first}${crit?` + ${extra} critical die`:''} + ${3+traits.damageBonus}${sneak?` + sneak ${sneak}${sneakCrit?` + ${sneakCrit}`:''}`:''}`;
  }else{
    const first=diceTotal(fireBoltDice(level),10,roll),extra=crit?diceTotal(fireBoltDice(level),10,roll):0;amount=first+extra+traits.damageBonus;label=`Fire Bolt ${first}${crit?` + ${extra} critical dice`:''}${traits.damageBonus?` + ${traits.damageBonus} focus`:''}`;
  }
  return {amount:clamp(amount,0,60),text:label};
}
function automaticSpellDamage(state,resolution,roll=randomInt,action=''){
  if(state.cls!=='wizard'||resolution?.resource!=='spell'||resolution?.blocked||!/\bmagic\s+missile\b/i.test(action))return {amount:0,text:''};
  const darts=[die(4,roll)+1,die(4,roll)+1,die(4,roll)+1];return {amount:darts.reduce((a,b)=>a+b,0),text:`Magic Missile ${darts.join(' + ')}`};
}
function freshDeathSaves(){return {successes:0,failures:0,stable:false,defeated:false}}
function rollDeathSave(state,roll=randomInt){
  const d=die(20,roll),ds={...freshDeathSaves(),...(state.deathSaves||{})};let outcome='pending',hp=0;
  if(d===20){hp=1;outcome='revived';Object.assign(ds,freshDeathSaves())}
  else if(d===1){ds.failures=clamp(ds.failures+2,0,3)}
  else if(d>=10){ds.successes=clamp(ds.successes+1,0,3)}
  else ds.failures=clamp(ds.failures+1,0,3);
  if(!hp&&ds.successes>=3){hp=1;ds.stable=true;outcome='stabilised'}
  if(!hp&&ds.failures>=3){hp=1;ds.defeated=true;outcome='setback'}
  return {die:d,hp,deathSaves:ds,outcome};
}
function applyConditionChanges(current,added,removed){
  const set=new Set(normaliseConditions(current));for(const c of normaliseConditions(removed))set.delete(c);for(const c of normaliseConditions(added))set.add(c);return [...set].slice(0,6);
}
module.exports={MAX_LEVEL,characterLevel,xpForLevel,levelForXp,xpToNextLevel,proficiencyBonus,wizardSlots,criticalThreshold,sneakDice,fireBoltDice,progressionFor,weaponTraits,CONDITIONS,ORIGINS,BACKGROUNDS,TONES,normaliseChoice,normaliseConditions,backgroundProficient,mergeAdvantage,attackDamage,automaticSpellDamage,freshDeathSaves,rollDeathSave,applyConditionChanges};
