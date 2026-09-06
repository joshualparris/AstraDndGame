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

const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
const die=(sides,roll=randomInt)=>roll(1,sides+1);
function normaliseChoice(value,table,fallback){return typeof value==='string'&&Object.hasOwn(table,value)?value:fallback}
function normaliseConditions(value){
  if(!Array.isArray(value))return [];
  return [...new Set(value.filter(v=>typeof v==='string').map(v=>v.toLowerCase()).filter(v=>conditionSet.has(v)))].slice(0,6);
}
function backgroundProficient(state,ability){const bg=BACKGROUNDS[state.background];return !!(bg&&bg.abilities.includes(ability))}
function mergeAdvantage(base,state,kind){
  let plus=base==='advantage',minus=base==='disadvantage';const c=new Set(normaliseConditions(state.conditions));
  if((c.has('poisoned')||c.has('frightened'))&&(kind==='check'||kind==='attack'))minus=true;
  if((c.has('restrained')||c.has('prone'))&&kind==='attack')minus=true;
  if(c.has('invisible')&&kind==='attack')plus=true;
  if(plus&&minus)return 'normal';return plus?'advantage':minus?'disadvantage':'normal';
}
function attackDamage(state,resolution,roll=randomInt,action=''){
  const r=resolution?.roll;if(resolution?.kind!=='attack'||!r?.success)return {amount:0,text:''};
  const crit=!!r.critical;let amount=0,label='';
  if(state.cls==='fighter'){
    const first=die(8,roll),extra=crit?die(8,roll):0;amount=first+extra+3;label=`Longsword ${first}${crit?` + ${extra} critical die`:''} + 3`;
  }else if(state.cls==='rogue'){
    const first=die(6,roll),extra=crit?die(6,roll):0;let sneak=0,sneakCrit=0;
    if(r.advantage==='advantage'||/\b(sneak|hidden|from hiding)\b/i.test(action)){sneak=die(6,roll);if(crit)sneakCrit=die(6,roll)}
    amount=first+extra+3+sneak+sneakCrit;label=`Weapon ${first}${crit?` + ${extra} critical die`:''} + 3${sneak?` + sneak ${sneak}${sneakCrit?` + ${sneakCrit}`:''}`:''}`;
  }else{
    const first=die(10,roll),extra=crit?die(10,roll):0;amount=first+extra;label=`Fire Bolt ${first}${crit?` + ${extra} critical die`:''}`;
  }
  return {amount:clamp(amount,0,50),text:label};
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
module.exports={CONDITIONS,ORIGINS,BACKGROUNDS,TONES,normaliseChoice,normaliseConditions,backgroundProficient,mergeAdvantage,attackDamage,automaticSpellDamage,freshDeathSaves,rollDeathSave,applyConditionChanges};
