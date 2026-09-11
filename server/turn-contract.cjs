'use strict';
const rules=require('./rules.cjs');
const object=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const string=(maxLength,minLength=0)=>({type:'string',maxLength,...(minLength?{minLength}: {})});
const strings=(maxItems,maxLength)=>({type:'array',maxItems,items:string(maxLength)});
const integer=(minimum,maximum)=>({type:'integer',minimum,maximum});
const schema=object({
  narrative:string(5000,1),
  location:string(100,1),
  time:string(100,1),
  suggestions:strings(4,140),
  memory:string(3500,1),
  inventory:strings(30,160),
  npcs:strings(15,260),
  quests:strings(12,200),
  places:strings(20,180),
  exits:strings(8,120),
  factions:strings(12,220),
  facts:strings(16,260),
  journalEvents:strings(18,240),
  conditionsAdded:strings(6,40),
  conditionsRemoved:strings(6,40),
  danger:{type:'string',enum:['safe','tense','dangerous']},
  hpChange:integer(-12,12),
  goldChange:integer(-50,50),
  xpGain:integer(0,3),
  rest:{type:'string',enum:['none','short','long']}
});
const required=Object.keys(schema.properties),allowed=new Set(required),danger=new Set(['safe','tense','dangerous']),rest=new Set(['none','short','long']),condition=new Set(rules.CONDITIONS);
const isObject=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const text=(value,max,nonEmpty=false)=>typeof value==='string'&&value.length<=max&&(!nonEmpty||value.trim().length>0);
const stringList=(value,maxItems,maxLength)=>Array.isArray(value)&&value.length<=maxItems&&value.every(item=>text(item,maxLength));
function valid(value){
  if(!isObject(value)||Object.keys(value).some(key=>!allowed.has(key))||required.some(key=>!Object.hasOwn(value,key)))return false;
  if(!text(value.narrative,5000,true)||!text(value.location,100,true)||!text(value.time,100,true)||!text(value.memory,3500,true))return false;
  if(!stringList(value.suggestions,4,140)||!stringList(value.inventory,30,160)||!stringList(value.npcs,15,260)||!stringList(value.quests,12,200)||!stringList(value.places,20,180)||!stringList(value.exits,8,120)||!stringList(value.factions,12,220)||!stringList(value.facts,16,260)||!stringList(value.journalEvents,18,240))return false;
  if(!stringList(value.conditionsAdded,6,40)||!stringList(value.conditionsRemoved,6,40)||![...value.conditionsAdded,...value.conditionsRemoved].every(item=>condition.has(item.toLowerCase())))return false;
  if(!danger.has(value.danger)||!rest.has(value.rest))return false;
  return Number.isInteger(value.hpChange)&&value.hpChange>=-12&&value.hpChange<=12&&Number.isInteger(value.goldChange)&&value.goldChange>=-50&&value.goldChange<=50&&Number.isInteger(value.xpGain)&&value.xpGain>=0&&value.xpGain<=3;
}
module.exports={schema,valid};
