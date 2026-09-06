'use strict';
const env=process.env;
const characters=require('../server/openworld-classes.cjs');characters.install();
const world=require('../server/world.cjs');const providers=require('../server/providers.cjs');const adjudication=require('../server/adjudication.cjs');const canon=require('../server/canon.cjs');
const visitors=new Map(),responses=new Map(),inflight=new Set();
function reply(res,status,body){res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');return res.status(status).json(body)}
function logProviderError(error){
  console.error('[astra-dnd provider]',JSON.stringify({status:error.status,providerStatus:error.providerStatus||0,providerCode:error.providerCode||'',providerType:error.providerType||'',providerMessage:error.providerMessage||'',model:error.model||'',stage:error.stage||'',retryAfter:error.retryAfter||0}));
}
module.exports=async function handler(req,res){
const secret=providers.signingSecret(env),configured=providers.configured(env);
if(req.method==='GET')return reply(res,200,{configured,mode:'open-world',version:3,features:['identity','backgrounds','six-classes','party-state','canon-memory','provider-abstraction','conditions','death-saves','attack-damage','map-exits','factions','journal','local-commands'],providers:providers.order(env).filter(p=>providers.providerKeys(p,env).length>0),build:(env.VERCEL_GIT_COMMIT_SHA||'local').slice(0,12)});
if(req.method!=='POST'){res.setHeader('Allow','GET, POST');return reply(res,405,{error:'Method not allowed.'})}
const origin=req.headers.origin;if(origin){try{if(new URL(origin).host!==req.headers.host)return reply(res,403,{error:'Please play from the game website.'})}catch{return reply(res,403,{error:'Invalid origin.'})}}
if(!configured)return reply(res,503,{error:'The open-world dungeon master is waiting for its server credentials. The original adventure is still available.'});
let body;try{body=typeof req.body==='string'?JSON.parse(req.body):req.body;if(!body||JSON.stringify(body).length>120000)throw new Error()}catch{return reply(res,400,{error:'Invalid request.'})}
const ip=String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim(),now=Date.now();for(const[k,v]of visitors)if(v.reset<=now)visitors.delete(k);for(const[k,v]of responses)if(v.expires<=now)responses.delete(k);if(visitors.size>5000)visitors.clear();if(responses.size>300)responses.delete(responses.keys().next().value);
const v=visitors.get(ip)||{count:0,reset:now+60000};if(v.count>=12){res.setHeader('Retry-After','60');return reply(res,429,{error:'Too many turns at once. Please wait a minute.',retryAfter:60})}v.count++;visitors.set(ip,v);
if(body.start===true){try{let state=world.initial(typeof body.name==='string'?body.name:'Rowan',body.cls,{origin:body.origin,background:body.background,tone:body.tone,backstory:body.backstory,goal:body.goal});state=canon.enrichState(characters.enrichState(state,{fresh:true}));return reply(res,200,{state,save:world.sign(state,secret)})}catch{return reply(res,400,{error:'Choose a character class.'})}}
const action=typeof body.action==='string'?body.action.trim():'';if(!action||action.length>1000)return reply(res,400,{error:'Write an action of 1–1,000 characters.'});let old;try{old=canon.enrichState(characters.enrichState(world.verify(body.save,secret)))}catch{return reply(res,400,{error:'This save cannot be verified or has expired. Start a new open-world adventure.'})}
const requestId=typeof body.requestId==='string'?body.requestId:'';if(!/^[a-zA-Z0-9-]{16,60}$/.test(requestId))return reply(res,400,{error:'Invalid turn identifier.'});const cacheKey=old.id+':'+old.turn+':'+requestId;if(responses.has(cacheKey))return reply(res,200,responses.get(cacheKey).data);if(inflight.has(old.id))return reply(res,409,{error:'Your previous turn is still being resolved.'});inflight.add(old.id);
try{
  const wrappedWorld={...world,planMessages:(state,a)=>characters.planMessages(world,state,a)};
  const plan=await adjudication.generateValidatedPlan({groq:providers,world:wrappedWorld,state:old,action,env});
  let resolved=world.resolve(old,plan,undefined,action),state=characters.enrichState(resolved.state),resolution=resolved.resolution;
  const result=await providers.generate(characters.narrateMessages(world,state,action,resolution),world.turnSchema,{env,stage:'narrate'});
  let updated=world.apply(state,result,action,resolution);updated=characters.afterTurn(updated,result);updated=canon.afterTurn(updated,old,action);
  const data={state:updated,save:world.sign(updated,secret),resolution};responses.set(cacheKey,{data,expires:Date.now()+120000});return reply(res,200,data)
}catch(e){const provider=e instanceof providers.ProviderError;if(provider)logProviderError(e);else console.error('[astra-dnd turn]',e instanceof Error?e.message:String(e));const status=provider?e.status:503,retryAfter=provider?e.retryAfter||0:0;if(retryAfter)res.setHeader('Retry-After',String(retryAfter));return reply(res,status,{error:provider?e.message:'The turn could not be safely resolved. Your save is unchanged; please try again.',retryAfter})}finally{inflight.delete(old.id)}
};
