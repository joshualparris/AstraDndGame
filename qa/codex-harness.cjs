'use strict';
const path=require('node:path');
const root=path.resolve(process.env.ASTRA_QA_TARGET||path.join(__dirname,'..'));
const load=p=>require(path.join(root,p));
const characters=load('server/openworld-classes.cjs');characters.install();
const world=load('server/world.cjs'),tactical=load('server/tactical.cjs'),canon=load('server/canon.cjs');
const tests=[];
function test(name,fn){tests.push({name,fn})}
async function run(){let failed=0;for(const {name,fn} of tests){try{await fn();console.log('PASS '+name)}catch(e){failed++;console.log('FAIL '+name+' — '+e.message)}}console.log(JSON.stringify({target:root,total:tests.length,passed:tests.length-failed,failed}));if(failed)process.exitCode=1}
const initial=(cls='fighter')=>characters.enrichState(world.initial('Codex QA',cls),{fresh:true});
function encounter(cls='fighter'){const s=tactical.startEncounter(initial(cls),'QA goblin');s.combat.grid.cells={};s.combat.actors['enemy-1'].hp=100;s.combat.actors['enemy-1'].maxHp=100;return s}
const high=(lo,hi)=>hi-1,low=()=>1;
const plan=(changes={})=>({kind:'none',ability:'INT',dc:12,advantage:'normal',proficient:false,resource:'none',stakes:'QA stakes',intent:'QA intent',...changes});
const result=(s,changes={})=>({narrative:'You watch the road.',location:s.location,time:s.time,suggestions:['Continue'],memory:s.memory,inventory:s.inventory,npcs:s.npcs,quests:s.quests,places:s.places,exits:s.exits,factions:s.factions,facts:s.facts,journalEvents:s.journalEvents,conditionsAdded:[],conditionsRemoved:[],danger:s.danger,hpChange:0,goldChange:0,xpGain:0,rest:'none',...changes});
module.exports={root,load,characters,world,tactical,canon,test,run,initial,encounter,high,low,plan,result};
