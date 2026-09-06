'use strict';
const crypto=require('node:crypto');
const clean=(v,n=260)=>typeof v==='string'?v.replace(/\s+/g,' ').trim().slice(0,n):'';
const idFor=(kind,content)=>`${kind}-${crypto.createHash('sha1').update(`${kind}:${content.toLowerCase()}`).digest('hex').slice(0,12)}`;
function rank(content,kind){
  const c=content.toLowerCase();
  if(kind==='goal'||kind==='backstory'||/\b(promis|oath|swore|vowed|defeated|killed|died|betray|rescued|married|child|sibling|parent)\b/.test(c))return 'high';
  if(kind==='person'||kind==='faction'||kind==='event'||kind==='quest')return 'medium';
  return 'low';
}
function fact(kind,content,turn=0,importance){const value=clean(content);return value?{id:idFor(kind,value),kind,content:value,importance:importance||rank(value,kind),lastSeen:Math.max(0,Number(turn)||0)}:null}
function sourceFacts(state){
  const out=[];
  if(state.backstory)out.push(fact('backstory',`${state.name}: ${state.backstory}`,state.turn,'high'));
  if(state.goal)out.push(fact('goal',`Personal goal: ${state.goal}`,state.turn,'high'));
  for(const x of state.facts||[])out.push(fact('fact',x,state.turn));
  for(const x of state.journalEvents||[])out.push(fact('event',x,state.turn));
  for(const x of state.npcs||[])out.push(fact('person',x,state.turn));
  for(const x of state.factions||[])out.push(fact('faction',x,state.turn));
  for(const x of state.quests||[])out.push(fact('quest',x,state.turn));
  for(const x of state.places||[])out.push(fact('place',x,state.turn));
  return out.filter(Boolean);
}
function merge(existing,incoming){
  const map=new Map();
  for(const item of [...(Array.isArray(existing)?existing:[]),...(Array.isArray(incoming)?incoming:[])]){
    if(!item||typeof item.content!=='string')continue;const normalized=fact(clean(item.kind,24)||'fact',item.content,item.lastSeen,item.importance);if(!normalized)continue;
    const old=map.get(normalized.id);if(!old||normalized.lastSeen>=old.lastSeen)map.set(normalized.id,{...old,...normalized,importance:old?.importance==='high'?'high':normalized.importance});
  }
  return [...map.values()];
}
function prune(items){
  const order={high:0,medium:1,low:2};const sorted=[...items].sort((a,b)=>(order[a.importance]??2)-(order[b.importance]??2)||b.lastSeen-a.lastSeen);
  const high=sorted.filter(x=>x.importance==='high').slice(0,16),medium=sorted.filter(x=>x.importance==='medium').slice(0,18),low=sorted.filter(x=>x.importance==='low').slice(0,8);
  return [...high,...medium,...low].sort((a,b)=>a.lastSeen-b.lastSeen).slice(-42);
}
function summary(items){
  const important=[...items].sort((a,b)=>({high:0,medium:1,low:2}[a.importance]-({high:0,medium:1,low:2}[b.importance])||b.lastSeen-a.lastSeen).slice(0,18);
  return important.map(x=>`${x.importance.toUpperCase()} ${x.kind}: ${x.content}`).join('\n').slice(0,3200);
}
function enrichState(input){
  const state=structuredClone(input||{}),canon=prune(merge(state.canon,sourceFacts(state)));state.canon=canon;state.canonSummary=summary(canon);return state;
}
function afterTurn(input,previous,action=''){
  const state=enrichState(input),extra=[];
  if(clean(action,220))extra.push(fact('player-action',`${state.name}: ${clean(action,220)}`,state.turn,'low'));
  if(previous?.location&&state.location&&previous.location!==state.location)extra.push(fact('event',`Travelled from ${previous.location} to ${state.location}.`,state.turn,'medium'));
  state.canon=prune(merge(state.canon,extra));state.canonSummary=summary(state.canon);return state;
}
module.exports={fact,merge,prune,summary,enrichState,afterTurn};
