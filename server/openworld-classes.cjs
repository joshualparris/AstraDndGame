'use strict';
const {randomInt}=require('node:crypto');
const engine=require('../dist/engine.js');
const rules=require('./rules.cjs');

const DEFINITIONS={
  fighter:{name:'Fighter',slotsMax:0,attackRange:5,attackBonus:5,damageDie:8,damageBonus:3,weapon:'Longsword',inventory:['Longsword','Travelling cloak','Bedroll','Rations (3 days)'],rule:'Fighter rule: Second Wind is a tracked class resource. If explicitly used, set resource secondWind. Successful longsword attacks have server-rolled damage.'},
  rogue:{name:'Rogue',slotsMax:0,attackRange:80,attackBonus:5,damageDie:6,damageBonus:3,weapon:'Shortbow',inventory:['Shortbow','Thieves’ tools','Travelling cloak','Bedroll','Rations (3 days)'],rule:'Rogue rule: stealth, positioning and deception may justify DEX checks and advantage. Successful attacks have server-rolled damage; advantage or an established hidden strike can add sneak damage.'},
  wizard:{name:'Wizard',slotsMax:3,attackRange:120,attackBonus:5,damageDie:10,damageBonus:0,weapon:'Fire Bolt',inventory:['Arcane focus','Spellbook','Travelling cloak','Bedroll','Rations (3 days)'],rule:'Wizard rule: Fire Bolt is a cantrip and costs no slot. Levelled spells consume one spell resource. Magic Missile consumes a slot, automatically hits and has server-rolled damage.'},
  cleric:{name:'Cleric',slotsMax:3,attackRange:5,attackBonus:4,damageDie:6,damageBonus:2,weapon:'Mace',hp:20,ac:16,stats:{STR:2,DEX:0,CON:2,INT:0,WIS:3,CHA:1},inventory:['Mace','Shield','Holy symbol','Travelling cloak','Bedroll','Rations (3 days)'],ability:'Divine magic & restoration',rule:'Cleric rule: WIS is the primary spellcasting ability. Sacred Flame is a cantrip and costs no slot. Cure Wounds, Healing Word and other levelled cleric spells consume one spell resource. A mace attack has server-rolled damage. Do not grant healing unless the spell or fiction justifies it.'},
  paladin:{name:'Paladin',slotsMax:2,attackRange:5,attackBonus:5,damageDie:8,damageBonus:3,weapon:'Warhammer',hp:24,ac:18,stats:{STR:3,DEX:0,CON:2,INT:-1,WIS:1,CHA:2},inventory:['Warhammer','Shield','Holy symbol','Travelling cloak','Bedroll','Rations (3 days)'],ability:'Sacred warrior & divine smite',rule:'Paladin rule: STR is the usual weapon ability and CHA guides divine magic. Levelled paladin spells consume one spell resource. If the player explicitly uses Divine Smite on a successful melee attack, set resource spell; the server adds the smite damage and consumes the slot.'},
  ranger:{name:'Ranger',slotsMax:2,attackRange:150,attackBonus:5,damageDie:8,damageBonus:3,weapon:'Longbow',hp:20,ac:15,stats:{STR:0,DEX:3,CON:1,INT:0,WIS:2,CHA:0},inventory:['Longbow','Shortsword','Quiver (20 arrows)','Travelling cloak','Bedroll','Rations (3 days)'],ability:'Wilderness hunter & ranged combat',rule:'Ranger rule: DEX is the usual ranged weapon ability and WIS guides wilderness magic. Longbow attacks can be made at range and have server-rolled damage. Levelled ranger spells consume one spell resource.'}
};

let installed=false;
function install(){
  if(installed)return;installed=true;
  for(const id of ['cleric','paladin','ranger']){
    const d=DEFINITIONS[id];
    engine.classes[id]={name:d.name,hp:d.hp,ac:d.ac,stats:{...d.stats},attack:d.attackBonus,die:d.damageDie,damage:d.damageBonus,weapon:d.weapon,ability:d.ability};
  }
  const baseDamage=rules.attackDamage;
  rules.attackDamage=function extendedAttackDamage(state,resolution,roll=randomInt,action=''){
    if(!['cleric','paladin','ranger'].includes(state?.cls))return baseDamage(state,resolution,roll,action);
    const r=resolution?.roll;if(resolution?.kind!=='attack'||!r?.success)return {amount:0,text:''};
    const d=DEFINITIONS[state.cls],die=()=>roll(1,d.damageDie+1),first=die(),crit=r.critical?die():0;
    let amount=first+crit+d.damageBonus,label=`${d.weapon} ${first}${crit?` + ${crit} critical die`:''}${d.damageBonus?` + ${d.damageBonus}`:''}`;
    if(state.cls==='paladin'&&resolution.resource==='spell'&&/\b(?:divine\s+)?smite\b/i.test(action)){
      const s1=roll(1,9),s2=roll(1,9),s3=r.critical?roll(1,9):0,s4=r.critical?roll(1,9):0;
      amount+=s1+s2+s3+s4;label+=` + Divine Smite ${[s1,s2,s3,s4].filter(Boolean).join(' + ')}`;
    }
    return {amount:Math.max(0,Math.min(70,amount)),text:label};
  };
}

function definition(cls){return DEFINITIONS[cls]||DEFINITIONS.fighter}
function isExtended(cls){return ['cleric','paladin','ranger'].includes(cls)}
function isCaster(cls){return definition(cls).slotsMax>0}
function syncParty(state){
  const existing=Array.isArray(state.party)?state.party.filter(p=>p&&p.id!=='hero').slice(0,5):[];
  const hero={id:'hero',role:'player',name:state.name,cls:state.cls,level:state.level,hp:state.hp,maxHp:state.maxHp,ac:state.ac,slots:state.slots,slotsMax:state.slotsMax||definition(state.cls).slotsMax,conditions:Array.isArray(state.conditions)?state.conditions.slice(0,6):[]};
  state.party=[hero,...existing];return state;
}
function enrichState(input,{fresh=false}={}){
  install();const state=structuredClone(input||{}),d=definition(state.cls);
  state.slotsMax=Number.isFinite(state.slotsMax)?Math.max(0,Math.min(12,state.slotsMax)):d.slotsMax;
  if(fresh){state.slots=d.slotsMax;state.inventory=[...new Set([...(d.inventory||[]),...(Array.isArray(state.inventory)?state.inventory:[])])].slice(0,30)}
  if(!Number.isFinite(state.slots))state.slots=d.slotsMax;
  state.slots=Math.max(0,Math.min(state.slotsMax,state.slots));
  return syncParty(state);
}
function afterTurn(input,result={}){
  const state=enrichState(input),d=definition(state.cls);
  if(result.rest==='long'&&d.slotsMax>0)state.slots=d.slotsMax;
  return syncParty(state);
}
function rewriteClassRule(messages,state){
  if(!isExtended(state.cls))return messages;
  const replacement=definition(state.cls).rule+'\nCharacter identity:';
  return messages.map((m,i)=>i===0&&typeof m.content==='string'?{...m,content:m.content.replace(/Wizard rule:[\s\S]*?Character identity:/,replacement)}:m);
}
function planMessages(world,state,action){return rewriteClassRule(world.planMessages(state,action),state)}
function narrateMessages(world,state,action,resolution){return rewriteClassRule(world.narrateMessages(state,action,resolution),state)}

function tacticalAttack(state,targetId='enemy-1',roll=randomInt,tactical){
  if(!isExtended(state?.cls))return tactical.attack(state,targetId,roll);
  const s=tactical.enrichSpatial(state),c=s.combat,d=definition(s.cls);
  if(!c.active||c.turn!=='hero')return {state:s,ok:false,summary:'It is not your attack turn.'};
  const hero=c.actors.hero,target=c.actors[targetId];if(!hero||!target||target.hp<=0)return {state:s,ok:false,summary:'There is no valid target.'};
  if(hero.actionUsed)return {state:s,ok:false,summary:'Your action is already used.'};
  const dist=tactical.distanceFt(hero,target);if(dist>d.attackRange)return {state:s,ok:false,summary:`Target is ${dist} ft away; ${d.weapon} reaches ${d.attackRange} ft.`};
  const cover=d.attackRange>5?tactical.coverBetween(c,hero,target):'none';if(cover==='total')return {state:s,ok:false,summary:'Total cover blocks the attack.'};
  hero.actionUsed=true;const coverAc=cover==='half'?2:cover==='threequarters'?5:0,n=roll(1,21),total=n+d.attackBonus,hit=n===20||(n!==1&&total>=target.ac+coverAc);
  let summary=`${d.weapon}: ${n} + ${d.attackBonus} = ${total}${coverAc?` vs AC ${target.ac+coverAc} (${cover} cover)`:''}.`;
  if(hit){const first=roll(1,d.damageDie+1),extra=n===20?roll(1,d.damageDie+1):0,damage=first+extra+d.damageBonus;target.hp=Math.max(0,target.hp-damage);summary+=` Hit for ${damage} damage.`;if(target.hp<=0){summary+=` ${target.name} is defeated.`;c.active=false;c.turn='complete';s.facts=[...(Array.isArray(s.facts)?s.facts:[]),`Defeated ${target.name} in a tactical encounter at ${s.location}.`].slice(-16);s.journalEvents=[...(Array.isArray(s.journalEvents)?s.journalEvents:[]),`Won a tactical encounter against ${target.name}.`].slice(-18)}}else summary+=' Miss.';
  c.log=[...(c.log||[]),summary].slice(-30);return {state:syncParty(s),ok:true,summary,roll:{die:n,total,cover},targetHp:target.hp};
}

module.exports={DEFINITIONS,install,definition,isExtended,isCaster,enrichState,afterTurn,syncParty,planMessages,narrateMessages,tacticalAttack};
