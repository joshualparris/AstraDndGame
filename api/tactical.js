'use strict';
const env=process.env;
const crypto=require('node:crypto');
const world=require('../server/world.cjs');
const tactical=require('../server/tactical.cjs');
const groq=require('../server/groq.cjs');
const visitors=new Map();
function reply(res,status,body){res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');return res.status(status).json(body)}
function getSecret(){const keys=groq.keys(env);return env.DND_SESSION_SECRET||(keys[0]?crypto.createHmac('sha256',keys[0]).update('astra-dnd-save-signing-v3').digest('hex'):null)}
module.exports=async function handler(req,res){
  const secret=getSecret();
  if(req.method==='GET')return reply(res,200,{configured:!!secret,mode:'tactical',features:['exploration-map','battle-grid','movement','dash','disengage','opportunity-attacks','range','line-of-sight','cover','turn-economy'],build:(env.VERCEL_GIT_COMMIT_SHA||'local').slice(0,12)});
  if(req.method!=='POST'){res.setHeader('Allow','GET, POST');return reply(res,405,{error:'Method not allowed.'})}
  const origin=req.headers.origin;if(origin){try{if(new URL(origin).host!==req.headers.host)return reply(res,403,{error:'Please play from the game website.'})}catch{return reply(res,403,{error:'Invalid origin.'})}}
  if(!secret)return reply(res,503,{error:'Tactical mode is waiting for the campaign signing secret.'});
  let body;try{body=typeof req.body==='string'?JSON.parse(req.body):req.body;if(!body||JSON.stringify(body).length>100000)throw new Error()}catch{return reply(res,400,{error:'Invalid request.'})}
  const ip=String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim(),now=Date.now();for(const[k,v]of visitors)if(v.reset<=now)visitors.delete(k);const v=visitors.get(ip)||{count:0,reset:now+60000};if(v.count>=60){res.setHeader('Retry-After','60');return reply(res,429,{error:'Too many tactical actions at once. Please wait a minute.'})}v.count++;visitors.set(ip,v);
  let state;try{state=world.verify(body.save,secret)}catch{return reply(res,400,{error:'This campaign save could not be verified.'})}
  const op=typeof body.op==='string'?body.op:'';let result;
  try{
    if(op==='start'){state=tactical.startEncounter(state,body.enemyName);result={state,ok:true,summary:`Tactical encounter ready against ${state.combat.actors['enemy-1'].name}.`}}
    else if(op==='move')result=tactical.move(state,Number(body.x),Number(body.y));
    else if(op==='dash')result=tactical.dash(state);
    else if(op==='disengage')result=tactical.disengage(state);
    else if(op==='attack')result=tactical.attack(state,typeof body.targetId==='string'?body.targetId:'enemy-1');
    else if(op==='end_turn')result=tactical.endTurn(state);
    else if(op==='sync'){state=tactical.enrichSpatial(state);result={state,ok:true,summary:'Spatial state refreshed.'}}
    else return reply(res,400,{error:'Unknown tactical action.'});
  }catch(e){console.error('[astra tactical]',e instanceof Error?e.message:String(e));return reply(res,500,{error:'The tactical action could not be resolved. Your previous save is unchanged.'})}
  const enriched=tactical.enrichSpatial(result.state);
  return reply(res,result.ok===false?409:200,{state:enriched,save:world.sign(enriched,secret),ok:result.ok!==false,summary:result.summary||'',roll:result.roll||null,reachable:tactical.reachable(enriched)});
};
