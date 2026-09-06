'use strict';
const {randomInt}=require('node:crypto');

const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
const text=(v,n=80)=>typeof v==='string'?v.trim().slice(0,n):'';
const key=(x,y)=>`${x},${y}`;
const die=(sides,roll=randomInt)=>roll(1,sides+1);
const distanceFt=(a,b)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y))*5;
const occupied=(combat,x,y,except)=>Object.values(combat.actors||{}).some(a=>a.id!==except&&a.hp>0&&a.x===x&&a.y===y);

function idFor(name){
  const base=text(name,90).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'place';
  let h=2166136261;for(const c of String(name)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}
  return `${base.slice(0,36)}-${(h>>>0).toString(36).slice(0,5)}`;
}
function deriveExploration(state){
  const prior=state?.spatial?.exploration;
  const nodes=new Map(Array.isArray(prior?.nodes)?prior.nodes.map(n=>[n.id,{...n}]):[]);
  const currentName=text(state?.location,100)||'Unknown location';
  const currentId=idFor(currentName);
  if(!nodes.has(currentId))nodes.set(currentId,{id:currentId,name:currentName,x:0,y:0,discovered:true});
  const exits=Array.isArray(state?.exits)?state.exits.slice(0,8):[];
  const edges=[];
  exits.forEach((name,i)=>{
    const label=text(name,100);if(!label)return;
    const id=idFor(label);
    if(!nodes.has(id)){
      const angle=(Math.PI*2*i/Math.max(1,exits.length))-(Math.PI/2),radius=3+(i%2);
      nodes.set(id,{id,name:label,x:Math.round(Math.cos(angle)*radius*10)/10,y:Math.round(Math.sin(angle)*radius*10)/10,discovered:true});
    }
    edges.push({from:currentId,to:id,label,distanceFt:Math.max(250,500+(i*250)),locked:false});
  });
  return {currentId,nodes:[...nodes.values()].slice(-40),edges};
}
function enrichSpatial(state){
  const s=structuredClone(state||{});
  s.spatial={...(s.spatial&&typeof s.spatial==='object'?s.spatial:{}),exploration:deriveExploration(s)};
  if(!s.combat||typeof s.combat!=='object')s.combat={active:false,round:0,turn:'hero',actors:{},grid:null,log:[]};
  return s;
}
function makeGrid(state){
  const width=12,height=8,cells={};
  const seed=[...String(state.location||'')].reduce((a,c)=>((a*33)^c.charCodeAt(0))>>>0,5381);
  const obstacles=[
    {x:5,y:2+(seed%3),terrain:'difficult',cover:'half'},
    {x:5,y:3+(seed%3),terrain:'blocked',cover:'total'},
    {x:6,y:2+((seed>>>3)%3),terrain:'difficult',cover:'half'},
  ];
  for(const o of obstacles)if(o.y<height)cells[key(o.x,o.y)]=o;
  return {width,height,cellSizeFt:5,cells};
}
function startEncounter(state,enemyName='Hostile creature'){
  const s=enrichSpatial(state);if(s.combat?.active)return s;
  const enemy=text(enemyName,60)||'Hostile creature',grid=makeGrid(s);
  const hero={id:'hero',name:text(s.name,40)||'Hero',faction:'party',x:2,y:4,hp:clamp(Number(s.hp)||1,0,999),maxHp:clamp(Number(s.maxHp)||1,1,999),ac:clamp(Number(s.ac)||10,1,30),speed:30,movementSpentFt:0,actionUsed:false,bonusActionUsed:false,reactionAvailable:true,disengaged:false,dashed:false};
  const foe={id:'enemy-1',name:enemy,faction:'enemy',x:9,y:4,hp:12,maxHp:12,ac:12,speed:30,movementSpentFt:0,actionUsed:false,bonusActionUsed:false,reactionAvailable:true,disengaged:false,dashed:false};
  s.combat={active:true,round:1,turn:'hero',actors:{hero,[foe.id]:foe},grid,log:[`Tactical encounter began: ${enemy}.`]};
  return s;
}
function cellAt(combat,x,y){return combat.grid?.cells?.[key(x,y)]||null}
function inBounds(combat,x,y){return Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&y>=0&&x<combat.grid.width&&y<combat.grid.height}
function movementAllowance(actor){return actor.speed*(actor.dashed?2:1)}
function move(state,x,y,roll=randomInt){
  const s=enrichSpatial(state),c=s.combat;if(!c.active||c.turn!=='hero')return {state:s,ok:false,summary:'It is not your movement turn.'};
  const hero=c.actors.hero,enemy=c.actors['enemy-1'];if(!hero)return {state:s,ok:false,summary:'No active hero.'};
  if(!inBounds(c,x,y)||cellAt(c,x,y)?.terrain==='blocked'||occupied(c,x,y,'hero'))return {state:s,ok:false,summary:'That space is blocked.'};
  const steps=Math.max(Math.abs(hero.x-x),Math.abs(hero.y-y)),cost=steps*5*(cellAt(c,x,y)?.terrain==='difficult'?2:1);
  if(hero.movementSpentFt+cost>movementAllowance(hero))return {state:s,ok:false,summary:`That move exceeds ${movementAllowance(hero)-hero.movementSpentFt} ft remaining.`};
  const old={x:hero.x,y:hero.y},wasInReach=enemy&&enemy.hp>0&&distanceFt(old,enemy)<=5;
  hero.x=x;hero.y=y;hero.movementSpentFt+=cost;
  let summary=`${hero.name} moved ${cost} ft to (${x}, ${y}).`;
  if(wasInReach&&enemy&&distanceFt(hero,enemy)>5&&enemy.reactionAvailable&&!hero.disengaged){
    enemy.reactionAvailable=false;const d=die(20,roll),total=d+3,hit=d===20||(d!==1&&total>=hero.ac);
    if(hit){const dmg=die(6,roll)+1;hero.hp=Math.max(0,hero.hp-dmg);s.hp=hero.hp;summary+=` ${enemy.name} used an opportunity attack and dealt ${dmg} damage.`}
    else summary+=` ${enemy.name} used an opportunity attack and missed.`;
  }
  c.log=[...(c.log||[]),summary].slice(-30);if(hero.hp<=0)downHero(s);return {state:s,ok:true,summary};
}
function dash(state){
  const s=enrichSpatial(state),c=s.combat;if(!c.active||c.turn!=='hero')return {state:s,ok:false,summary:'You cannot Dash right now.'};
  const hero=c.actors.hero;if(hero.actionUsed)return {state:s,ok:false,summary:'Your action is already used.'};
  hero.actionUsed=true;hero.dashed=true;const summary='You Dash, doubling your movement allowance this turn.';c.log=[...(c.log||[]),summary].slice(-30);return {state:s,ok:true,summary};
}
function disengage(state){
  const s=enrichSpatial(state),c=s.combat;if(!c.active||c.turn!=='hero')return {state:s,ok:false,summary:'You cannot Disengage right now.'};
  const hero=c.actors.hero;if(hero.actionUsed)return {state:s,ok:false,summary:'Your action is already used.'};
  hero.actionUsed=true;hero.disengaged=true;const summary='You Disengage; movement this turn will not trigger opportunity attacks.';c.log=[...(c.log||[]),summary].slice(-30);return {state:s,ok:true,summary};
}
function trace(combat,a,b){
  const cells=[];let x0=a.x,y0=a.y,x1=b.x,y1=b.y,dx=Math.abs(x1-x0),dy=Math.abs(y1-y0),sx=x0<x1?1:-1,sy=y0<y1?1:-1,err=dx-dy;
  while(!(x0===x1&&y0===y1)){const e2=2*err;if(e2>-dy){err-=dy;x0+=sx}if(e2<dx){err+=dx;y0+=sy}if(!(x0===x1&&y0===y1))cells.push({x:x0,y:y0})}return cells;
}
function coverBetween(combat,a,b){
  let cover='none';for(const p of trace(combat,a,b)){const cell=cellAt(combat,p.x,p.y);if(cell?.terrain==='blocked'||cell?.cover==='total')return 'total';if(cell?.cover==='threequarters')cover='threequarters';else if(cell?.cover==='half'&&cover==='none')cover='half'}return cover;
}
function attack(state,targetId='enemy-1',roll=randomInt){
  const s=enrichSpatial(state),c=s.combat;if(!c.active||c.turn!=='hero')return {state:s,ok:false,summary:'It is not your attack turn.'};
  const hero=c.actors.hero,target=c.actors[targetId];if(!hero||!target||target.hp<=0)return {state:s,ok:false,summary:'There is no valid target.'};
  if(hero.actionUsed)return {state:s,ok:false,summary:'Your action is already used.'};
  const ranged=s.cls==='wizard',range=ranged?60:5,dist=distanceFt(hero,target);if(dist>range)return {state:s,ok:false,summary:`Target is ${dist} ft away; your current attack reaches ${range} ft.`};
  const cover=ranged?coverBetween(c,hero,target):'none';if(cover==='total')return {state:s,ok:false,summary:'Total cover blocks the attack.'};
  hero.actionUsed=true;const attackBonus=5,coverAc=cover==='half'?2:cover==='threequarters'?5:0,d=die(20,roll),total=d+attackBonus,hit=d===20||(d!==1&&total>=target.ac+coverAc);
  let summary=`Attack roll ${d} + ${attackBonus} = ${total}${coverAc?` against AC ${target.ac+coverAc} (${cover} cover)`:''}.`;
  if(hit){let damage;if(s.cls==='fighter')damage=die(8,roll)+3;else if(s.cls==='rogue')damage=die(8,roll)+3;else damage=die(10,roll);if(d===20)damage+=s.cls==='wizard'?die(10,roll):die(8,roll);target.hp=Math.max(0,target.hp-damage);summary+=` Hit for ${damage} damage.`;if(target.hp<=0){summary+=` ${target.name} is defeated.`;c.active=false;c.turn='complete';s.facts=[...(Array.isArray(s.facts)?s.facts:[]),`Defeated ${target.name} in a tactical encounter at ${s.location}.`].slice(-16);s.journalEvents=[...(Array.isArray(s.journalEvents)?s.journalEvents:[]),`Won a tactical encounter against ${target.name}.`].slice(-18)}}else summary+=' Miss.';
  c.log=[...(c.log||[]),summary].slice(-30);return {state:s,ok:true,summary,roll:{die:d,total,cover},targetHp:target.hp};
}
function enemyAttack(s,roll=randomInt){
  const c=s.combat,hero=c.actors.hero,enemy=c.actors['enemy-1'];if(!hero||!enemy||enemy.hp<=0)return 'No enemy can act.';
  const d=die(20,roll),total=d+3,hit=d===20||(d!==1&&total>=hero.ac);if(!hit)return `${enemy.name} attacks and misses (${d} + 3).`;
  const dmg=die(6,roll)+1;hero.hp=Math.max(0,hero.hp-dmg);s.hp=hero.hp;return `${enemy.name} hits for ${dmg} damage.`;
}
function stepToward(c,actor,target){
  for(let i=0;i<6&&distanceFt(actor,target)>5;i++){const dx=Math.sign(target.x-actor.x),dy=Math.sign(target.y-actor.y),nx=actor.x+(Math.abs(target.x-actor.x)>=Math.abs(target.y-actor.y)?dx:0),ny=actor.y+(Math.abs(target.y-actor.y)>Math.abs(target.x-actor.x)?dy:0);if(!inBounds(c,nx,ny)||cellAt(c,nx,ny)?.terrain==='blocked'||occupied(c,nx,ny,actor.id))break;actor.x=nx;actor.y=ny}
}
function endTurn(state,roll=randomInt){
  const s=enrichSpatial(state),c=s.combat;if(!c.active||c.turn!=='hero')return {state:s,ok:false,summary:'The tactical turn cannot end right now.'};
  const hero=c.actors.hero,enemy=c.actors['enemy-1'];c.turn='enemy';let summary='';if(enemy&&enemy.hp>0){if(distanceFt(enemy,hero)>5){stepToward(c,enemy,hero);summary=`${enemy.name} closes the distance. `}if(distanceFt(enemy,hero)<=5)summary+=enemyAttack(s,roll)}
  if(s.hp<=0){downHero(s);summary+=' You fall unconscious.';return {state:s,ok:true,summary}}
  c.round=(c.round||1)+1;c.turn='hero';hero.actionUsed=false;hero.bonusActionUsed=false;hero.movementSpentFt=0;hero.reactionAvailable=true;hero.disengaged=false;hero.dashed=false;if(enemy){enemy.actionUsed=false;enemy.movementSpentFt=0;enemy.reactionAvailable=true}
  c.log=[...(c.log||[]),summary||'The enemy hesitates.'].slice(-30);return {state:s,ok:true,summary:summary||'The enemy hesitates.'};
}
function downHero(s){const c=s.combat;c.active=false;c.turn='complete';if(!Array.isArray(s.conditions))s.conditions=[];if(!s.conditions.includes('unconscious'))s.conditions.push('unconscious');s.journalEvents=[...(Array.isArray(s.journalEvents)?s.journalEvents:[]),'Fell unconscious during a tactical encounter.'].slice(-18)}
function reachable(state){
  const s=enrichSpatial(state),c=s.combat;if(!c.active)return [];const h=c.actors.hero,remain=movementAllowance(h)-h.movementSpentFt,out=[];
  for(let y=0;y<c.grid.height;y++)for(let x=0;x<c.grid.width;x++){if(cellAt(c,x,y)?.terrain==='blocked'||occupied(c,x,y,'hero'))continue;const cost=Math.max(Math.abs(h.x-x),Math.abs(h.y-y))*5*(cellAt(c,x,y)?.terrain==='difficult'?2:1);if(cost<=remain)out.push({x,y})}return out;
}
module.exports={deriveExploration,enrichSpatial,startEncounter,move,dash,disengage,attack,endTurn,reachable,coverBetween,distanceFt};
