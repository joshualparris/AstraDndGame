'use strict';
const {randomInt}=require('node:crypto');
const spatial=require('./spatial.cjs');
const rules=require('./rules.cjs');
const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));
const text=(value,max=80)=>typeof value==='string'?value.trim().slice(0,max):'';
const cellKey=(x,y)=>`${x},${y}`;
const die=(sides,roll=randomInt)=>roll(1,sides+1);
const distanceFt=(a,b)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y))*5;
const occupied=(combat,x,y,except)=>Object.values(combat.actors||{}).some(actor=>actor.id!==except&&actor.hp>0&&actor.x===x&&actor.y===y);
const ENEMY_STYLES=[
  {id:'bruiser',label:'Bruiser',hp:24,hpPerLevel:6,ac:15,attack:6,damageSides:10,damageBonus:3,range:5,speed:25,ranged:false},
  {id:'skirmisher',label:'Skirmisher',hp:20,hpPerLevel:5,ac:16,attack:6,damageSides:8,damageBonus:3,range:5,speed:35,ranged:false},
  {id:'archer',label:'Archer',hp:18,hpPerLevel:5,ac:14,attack:6,damageSides:8,damageBonus:3,range:60,speed:30,ranged:true}
];
function deriveExploration(state){return spatial.deriveExploration(state)}
function blankCombat(){return {active:false,round:0,turn:'hero',actors:{},grid:null,log:[],reachable:[]}}
function syncHeroProjection(state){
  const hero=state.combat?.actors?.hero;
  if(!hero)return state;
  hero.hp=clamp(Number(state.hp)||0,0,Number(state.maxHp)||999);
  hero.maxHp=clamp(Number(state.maxHp)||1,1,999);
  hero.ac=clamp(Number(state.ac)||10,1,30);
  return state;
}
function enrichSpatial(state){
  const next=spatial.enrichExploration(state);
  if(!next.combat||typeof next.combat!=='object'||Array.isArray(next.combat))next.combat=blankCombat();
  syncHeroProjection(next);
  next.combat.reachable=next.combat.active?reachableFromState(next):[];
  return next;
}
function makeGrid(state){
  const width=12,height=8,cells={};
  const seed=[...String(state.location||'')].reduce((value,char)=>((value*33)^char.charCodeAt(0))>>>0,5381);
  const obstacles=[{x:5,y:2+(seed%3),terrain:'difficult',cover:'half'},{x:5,y:3+(seed%3),terrain:'blocked',cover:'total'},{x:6,y:2+((seed>>>3)%3),terrain:'difficult',cover:'half'}];
  for(const obstacle of obstacles)if(obstacle.y<height)cells[cellKey(obstacle.x,obstacle.y)]=obstacle;
  return {width,height,cellSizeFt:5,cells};
}
function hashText(value){let hash=2166136261;for(const char of String(value||'')){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619)}return hash>>>0}
function enemyProfile(state,enemyName){
  const level=rules.characterLevel(state),style=ENEMY_STYLES[hashText(`${state.location}|${enemyName}`)%ENEMY_STYLES.length],scale=Math.max(0,level-2);
  return {...style,hp:style.hp+style.hpPerLevel*scale,ac:Math.min(18,style.ac+Math.floor(scale/2)),attack:style.attack+Math.floor(scale/2),damageBonus:style.damageBonus+Math.floor(scale/2),level};
}
function startEncounter(state,enemyName='Hostile creature'){
  let next=enrichSpatial(state);if(next.combat.active)return next;
  const enemy=text(enemyName,60)||'Hostile creature',grid=makeGrid(next),profile=enemyProfile(next,enemy),heroSpeed=next.conditions?.includes('exhausted')?25:30;
  const hero={id:'hero',name:text(next.name,40)||'Hero',faction:'party',x:2,y:4,hp:clamp(Number(next.hp)||1,0,999),maxHp:clamp(Number(next.maxHp)||1,1,999),ac:clamp(Number(next.ac)||10,1,30),speed:heroSpeed,movementSpentFt:0,actionUsed:false,bonusActionUsed:false,reactionAvailable:true,disengaged:false,dashed:false,hidden:false};
  const foe={id:'enemy-1',name:enemy,faction:'enemy',x:9,y:4,hp:profile.hp,maxHp:profile.hp,ac:profile.ac,speed:profile.speed,reactionAvailable:true,style:profile.id,styleLabel:profile.label,attackBonus:profile.attack,damageSides:profile.damageSides,damageBonus:profile.damageBonus,range:profile.range,ranged:profile.ranged};
  next.combat={active:true,round:1,turn:'hero',actors:{hero,[foe.id]:foe},grid,log:[`Tactical encounter began: ${enemy} (${profile.label.toLowerCase()}).`],reachable:[]};
  return enrichSpatial(next);
}
function cellAt(combat,x,y){return combat.grid?.cells?.[cellKey(x,y)]||null}
function inBounds(combat,x,y){return !!combat.grid&&Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&y>=0&&x<combat.grid.width&&y<combat.grid.height}
function movementAllowance(actor){return actor.speed*(actor.dashed?2:1)}
function refreshReachable(state,result={}){state.combat.reachable=state.combat.active?reachableFromState(state):[];return {state,...result}}
function damageHero(state,damage){state.hp=Math.max(0,state.hp-damage);syncHeroProjection(state);return state.hp}
function enemyMeleeAttack(enemy,hero,roll=randomInt){
  const attackDie=die(20,roll),total=attackDie+(enemy.attackBonus||4),hit=attackDie===20||(attackDie!==1&&total>=hero.ac);if(!hit)return {hit:false,text:`${enemy.name} used an opportunity attack and missed.`};
  const damage=die(4,roll)+Math.max(1,(enemy.damageBonus||1)-1);return {hit:true,damage,text:`${enemy.name} used an opportunity attack and dealt ${damage} damage.`};
}
function move(state,x,y,roll=randomInt){
  const next=enrichSpatial(state),combat=next.combat;if(!combat.active||combat.turn!=='hero')return refreshReachable(next,{ok:false,summary:'It is not your movement turn.'});
  const hero=combat.actors.hero,enemy=combat.actors['enemy-1'];if(!hero)return refreshReachable(next,{ok:false,summary:'No active hero.'});
  if(!inBounds(combat,x,y)||cellAt(combat,x,y)?.terrain==='blocked'||occupied(combat,x,y,'hero'))return refreshReachable(next,{ok:false,summary:'That space is blocked.'});
  const steps=Math.max(Math.abs(hero.x-x),Math.abs(hero.y-y)),cost=steps*5*(cellAt(combat,x,y)?.terrain==='difficult'?2:1);
  if(hero.movementSpentFt+cost>movementAllowance(hero))return refreshReachable(next,{ok:false,summary:`That move exceeds ${movementAllowance(hero)-hero.movementSpentFt} ft remaining.`});
  const oldPosition={x:hero.x,y:hero.y},wasInReach=enemy&&enemy.hp>0&&distanceFt(oldPosition,enemy)<=5;
  hero.x=x;hero.y=y;hero.movementSpentFt+=cost;
  let summary=`${hero.name} moved ${cost} ft to (${x}, ${y}).`;
  if(wasInReach&&enemy&&distanceFt(hero,enemy)>5&&enemy.reactionAvailable&&!hero.disengaged){enemy.reactionAvailable=false;const reaction=enemyMeleeAttack(enemy,hero,roll);if(reaction.hit)damageHero(next,reaction.damage);summary+=` ${reaction.text}`}
  combat.log=[...(combat.log||[]),summary].slice(-30);if(next.hp<=0)downHero(next);return refreshReachable(next,{ok:true,summary});
}
function spendMobilityAction(state,hero){if(state.cls==='rogue'&&rules.characterLevel(state)>=2&&!hero.bonusActionUsed){hero.bonusActionUsed=true;return 'bonus action'}if(hero.actionUsed)return null;hero.actionUsed=true;return 'action'}
function dash(state){
  const next=enrichSpatial(state),combat=next.combat;if(!combat.active||combat.turn!=='hero')return refreshReachable(next,{ok:false,summary:'You cannot Dash right now.'});
  const hero=combat.actors.hero,spent=spendMobilityAction(next,hero);if(!spent)return refreshReachable(next,{ok:false,summary:'You have no action available to Dash.'});
  hero.dashed=true;const summary=`You Dash as a ${spent}, doubling your movement allowance this turn.`;combat.log=[...(combat.log||[]),summary].slice(-30);return refreshReachable(next,{ok:true,summary});
}
function disengage(state){
  const next=enrichSpatial(state),combat=next.combat;if(!combat.active||combat.turn!=='hero')return refreshReachable(next,{ok:false,summary:'You cannot Disengage right now.'});
  const hero=combat.actors.hero,spent=spendMobilityAction(next,hero);if(!spent)return refreshReachable(next,{ok:false,summary:'You have no action available to Disengage.'});
  hero.disengaged=true;const summary=`You Disengage as a ${spent}; movement this turn will not trigger opportunity attacks.`;combat.log=[...(combat.log||[]),summary].slice(-30);return refreshReachable(next,{ok:true,summary});
}
function trace(combat,start,end){
  const cells=[];let x0=start.x,y0=start.y,x1=end.x,y1=end.y,dx=Math.abs(x1-x0),dy=Math.abs(y1-y0),sx=x0<x1?1:-1,sy=y0<y1?1:-1,error=dx-dy;
  while(!(x0===x1&&y0===y1)){const doubled=2*error;if(doubled>-dy){error-=dy;x0+=sx}if(doubled<dx){error+=dx;y0+=sy}if(!(x0===x1&&y0===y1))cells.push({x:x0,y:y0})}
  return cells;
}
function coverBetween(combat,start,end){let cover='none';for(const point of trace(combat,start,end)){const cell=cellAt(combat,point.x,point.y);if(cell?.terrain==='blocked'||cell?.cover==='total')return 'total';if(cell?.cover==='threequarters')cover='threequarters';else if(cell?.cover==='half'&&cover==='none')cover='half'}return cover}
function playerAttackProfile(state){
  const traits=rules.weaponTraits(state),proficiency=rules.proficiencyBonus(rules.characterLevel(state));
  if(state.cls==='fighter')return {ranged:false,range:5,label:'Longsword',attackBonus:3+proficiency+traits.attackBonus};
  if(state.cls==='rogue')return {ranged:true,range:80,label:'Shortbow',attackBonus:3+proficiency+traits.attackBonus};
  return {ranged:true,range:60,label:'Fire Bolt',attackBonus:3+proficiency+traits.attackBonus};
}
function finishEnemy(next,target,summary){const combat=next.combat;summary+=` ${target.name} is defeated.`;combat.active=false;combat.turn='complete';next.facts=[...(Array.isArray(next.facts)?next.facts:[]),`Defeated ${target.name} in a tactical encounter at ${next.location}.`].slice(-16);next.journalEvents=[...(Array.isArray(next.journalEvents)?next.journalEvents:[]),`Won a tactical encounter against ${target.name}.`].slice(-18);return summary}
function attack(state,targetId='enemy-1',roll=randomInt){
  const next=enrichSpatial(state),combat=next.combat;if(!combat.active||combat.turn!=='hero')return refreshReachable(next,{ok:false,summary:'It is not your attack turn.'});
  const hero=combat.actors.hero,target=combat.actors[targetId];if(!hero||!target||target.hp<=0)return refreshReachable(next,{ok:false,summary:'There is no valid target.'});if(hero.actionUsed)return refreshReachable(next,{ok:false,summary:'Your action is already used.'});
  const profile=playerAttackProfile(next),distance=distanceFt(hero,target);if(distance>profile.range)return refreshReachable(next,{ok:false,summary:`Target is ${distance} ft away; your ${profile.label} reaches ${profile.range} ft.`});
  const cover=profile.ranged?coverBetween(combat,hero,target):'none';if(cover==='total')return refreshReachable(next,{ok:false,summary:'Total cover blocks the attack.'});
  hero.actionUsed=true;const hidden=!!hero.hidden,first=die(20,roll),second=hidden?die(20,roll):null,attackDie=second===null?first:Math.max(first,second),coverAc=cover==='half'?2:cover==='threequarters'?5:0,total=attackDie+profile.attackBonus,criticalThreshold=rules.criticalThreshold(next),hit=attackDie>=criticalThreshold||(attackDie!==1&&total>=target.ac+coverAc),resolution={kind:'attack',roll:{dice:second===null?[first]:[first,second],die:attackDie,total,modifier:profile.attackBonus,dc:target.ac+coverAc,ability:next.cls==='fighter'?'STR':next.cls==='rogue'?'DEX':'INT',advantage:hidden?'advantage':'normal',success:hit,critical:attackDie>=criticalThreshold}};hero.hidden=false;
  let summary=`${profile.label} ${hidden?'from hiding ':''}roll ${attackDie} + ${profile.attackBonus} = ${total}${coverAc?` against AC ${target.ac+coverAc} (${cover} cover)`:''}.`;
  if(hit){const damage=rules.attackDamage(next,resolution,roll,hidden?'from hiding':'');target.hp=Math.max(0,target.hp-damage.amount);summary+=` Hit for ${damage.amount} damage.`;if(target.hp<=0)summary=finishEnemy(next,target,summary)}else summary+=' Miss.';
  combat.log=[...(combat.log||[]),summary].slice(-30);return refreshReachable(next,{ok:true,summary,roll:resolution.roll,targetHp:target.hp});
}
function magicMissile(state,targetId='enemy-1',roll=randomInt){
  const next=enrichSpatial(state),combat=next.combat;if(next.cls!=='wizard')return refreshReachable(next,{ok:false,summary:'Only a wizard can cast Magic Missile.'});if(!combat.active||combat.turn!=='hero')return refreshReachable(next,{ok:false,summary:'You cannot cast right now.'});
  const hero=combat.actors.hero,target=combat.actors[targetId];if(!hero||!target||target.hp<=0)return refreshReachable(next,{ok:false,summary:'There is no valid target.'});if(hero.actionUsed)return refreshReachable(next,{ok:false,summary:'Your action is already used.'});if(next.slots<1)return refreshReachable(next,{ok:false,summary:'No spell slots remain.'});if(distanceFt(hero,target)>120)return refreshReachable(next,{ok:false,summary:'The target is beyond Magic Missile range.'});if(coverBetween(combat,hero,target)==='total')return refreshReachable(next,{ok:false,summary:'Total cover blocks sight of the target.'});
  hero.actionUsed=true;next.slots--;const resolution={resource:'spell',blocked:false},damage=rules.automaticSpellDamage(next,resolution,roll,'Magic Missile');target.hp=Math.max(0,target.hp-damage.amount);let summary=`Magic Missile strikes automatically for ${damage.amount} damage. ${next.slots} spell slot${next.slots===1?'':'s'} remain.`;if(target.hp<=0)summary=finishEnemy(next,target,summary);combat.log=[...(combat.log||[]),summary].slice(-30);return refreshReachable(next,{ok:true,summary,targetHp:target.hp});
}
function usePotion(state,roll=randomInt){
  const next=enrichSpatial(state),combat=next.combat;if(!combat.active||combat.turn!=='hero')return refreshReachable(next,{ok:false,summary:'You cannot use a potion right now.'});const hero=combat.actors.hero;if(hero.actionUsed)return refreshReachable(next,{ok:false,summary:'Your action is already used.'});if(next.potions<1)return refreshReachable(next,{ok:false,summary:'No healing potions remain.'});if(next.hp>=next.maxHp)return refreshReachable(next,{ok:false,summary:'You are already at full health.'});hero.actionUsed=true;next.potions--;const healing=Math.min(next.maxHp-next.hp,die(4,roll)+die(4,roll)+2);next.hp+=healing;syncHeroProjection(next);const summary=`You drink a healing potion and recover ${healing} HP.`;combat.log=[...(combat.log||[]),summary].slice(-30);return refreshReachable(next,{ok:true,summary});
}
function secondWind(state,roll=randomInt){
  const next=enrichSpatial(state),combat=next.combat;if(next.cls!=='fighter')return refreshReachable(next,{ok:false,summary:'Only a fighter can use Second Wind.'});if(!combat.active||combat.turn!=='hero')return refreshReachable(next,{ok:false,summary:'You cannot use Second Wind right now.'});const hero=combat.actors.hero;if(hero.bonusActionUsed)return refreshReachable(next,{ok:false,summary:'Your bonus action is already used.'});if(!next.secondWindReady)return refreshReachable(next,{ok:false,summary:'Second Wind is already spent.'});if(next.hp>=next.maxHp)return refreshReachable(next,{ok:false,summary:'You are already at full health.'});hero.bonusActionUsed=true;next.secondWindReady=false;const healing=Math.min(next.maxHp-next.hp,die(10,roll)+rules.characterLevel(next));next.hp+=healing;syncHeroProjection(next);const summary=`Second Wind restores ${healing} HP without costing your action.`;combat.log=[...(combat.log||[]),summary].slice(-30);return refreshReachable(next,{ok:true,summary});
}
function hide(state){
  const next=enrichSpatial(state),combat=next.combat;if(next.cls!=='rogue')return refreshReachable(next,{ok:false,summary:'Only a rogue can Hide as a tactical bonus action.'});if(!combat.active||combat.turn!=='hero')return refreshReachable(next,{ok:false,summary:'You cannot Hide right now.'});const hero=combat.actors.hero,enemy=combat.actors['enemy-1'];if(hero.bonusActionUsed)return refreshReachable(next,{ok:false,summary:'Your bonus action is already used.'});const endpointCover=cellAt(combat,hero.x,hero.y)?.cover,lineCover=enemy?coverBetween(combat,enemy,hero):'none';if(!endpointCover&&lineCover==='none')return refreshReachable(next,{ok:false,summary:'You need cover between you and the enemy to Hide.'});hero.bonusActionUsed=true;hero.hidden=true;const summary='You Hide behind cover; your next attack this turn has advantage.';combat.log=[...(combat.log||[]),summary].slice(-30);return refreshReachable(next,{ok:true,summary});
}
function enemyAttack(state,roll=randomInt){
  const combat=state.combat,hero=combat.actors.hero,enemy=combat.actors['enemy-1'];if(!hero||!enemy||enemy.hp<=0)return 'No enemy can act.';const distance=distanceFt(enemy,hero),ranged=!!enemy.ranged;if((ranged&&distance>(enemy.range||60))||(!ranged&&distance>5))return `${enemy.name} cannot reach you.`;
  const cover=ranged?coverBetween(combat,enemy,hero):'none';if(cover==='total')return `${enemy.name} has no clear shot through total cover.`;const coverAc=cover==='half'?2:cover==='threequarters'?5:0,first=die(20,roll),second=ranged&&distance<=5?die(20,roll):null,attackDie=second===null?first:Math.min(first,second),total=attackDie+(enemy.attackBonus||4),hit=attackDie===20||(attackDie!==1&&total>=hero.ac+coverAc);if(!hit)return `${enemy.name} attacks${second!==null?' at disadvantage':''} and misses (${attackDie} + ${enemy.attackBonus||4}).`;
  const damage=die(enemy.damageSides||6,roll)+(enemy.damageBonus||1);damageHero(state,damage);return `${enemy.name} hits for ${damage} damage${coverAc?` despite ${cover} cover`:''}.`;
}
function stepToward(combat,actor,target){
  const maxSteps=Math.max(0,Math.floor((actor.speed||30)/5));for(let step=0;step<maxSteps&&distanceFt(actor,target)>(actor.ranged?Math.min(30,actor.range||60):5);step++){
    const dx=Math.sign(target.x-actor.x),dy=Math.sign(target.y-actor.y),nextX=actor.x+(Math.abs(target.x-actor.x)>=Math.abs(target.y-actor.y)?dx:0),nextY=actor.y+(Math.abs(target.y-actor.y)>Math.abs(target.x-actor.x)?dy:0);if(!inBounds(combat,nextX,nextY)||cellAt(combat,nextX,nextY)?.terrain==='blocked'||occupied(combat,nextX,nextY,actor.id))break;actor.x=nextX;actor.y=nextY;
  }
}
function endTurn(state,roll=randomInt){
  const next=enrichSpatial(state),combat=next.combat;if(!combat.active||combat.turn!=='hero')return refreshReachable(next,{ok:false,summary:'The tactical turn cannot end right now.'});
  const hero=combat.actors.hero,enemy=combat.actors['enemy-1'];combat.turn='enemy';let summary='';
  if(enemy&&enemy.hp>0){const canAttack=enemy.ranged?distanceFt(enemy,hero)<=enemy.range&&coverBetween(combat,enemy,hero)!=='total':distanceFt(enemy,hero)<=5;if(!canAttack){stepToward(combat,enemy,hero);summary=`${enemy.name} repositions. `}summary+=enemyAttack(next,roll)}
  if(next.hp<=0){downHero(next);summary+=' You fall unconscious.';return refreshReachable(next,{ok:true,summary})}
  combat.round=(combat.round||1)+1;combat.turn='hero';hero.actionUsed=false;hero.bonusActionUsed=false;hero.movementSpentFt=0;hero.reactionAvailable=true;hero.disengaged=false;hero.dashed=false;hero.hidden=false;if(enemy)enemy.reactionAvailable=true;
  combat.log=[...(combat.log||[]),summary||'The enemy hesitates.'].slice(-30);return refreshReachable(next,{ok:true,summary:summary||'The enemy hesitates.'});
}
function downHero(state){const combat=state.combat;combat.active=false;combat.turn='complete';syncHeroProjection(state);if(!Array.isArray(state.conditions))state.conditions=[];if(!state.conditions.includes('unconscious'))state.conditions.push('unconscious');state.journalEvents=[...(Array.isArray(state.journalEvents)?state.journalEvents:[]),'Fell unconscious during a tactical encounter.'].slice(-18)}
function reachableFromState(state){
  const combat=state.combat;if(!combat?.active||!combat.grid)return [];const hero=combat.actors.hero;if(!hero)return [];const remaining=movementAllowance(hero)-hero.movementSpentFt,reachable=[];
  for(let y=0;y<combat.grid.height;y++)for(let x=0;x<combat.grid.width;x++){if(cellAt(combat,x,y)?.terrain==='blocked'||occupied(combat,x,y,'hero'))continue;const cost=Math.max(Math.abs(hero.x-x),Math.abs(hero.y-y))*5*(cellAt(combat,x,y)?.terrain==='difficult'?2:1);if(cost<=remaining)reachable.push({x,y})}
  return reachable;
}
function reachable(state){return enrichSpatial(state).combat.reachable}
module.exports={deriveExploration,enrichSpatial,startEncounter,move,dash,disengage,attack,magicMissile,usePotion,secondWind,hide,endTurn,reachable,coverBetween,distanceFt,enemyProfile};
