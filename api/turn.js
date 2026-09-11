'use strict';
const env=process.env;
const world=require('../server/world.cjs');
const groq=require('../server/groq.cjs');
const adjudication=require('../server/adjudication.cjs');
const modelOutput=require('../server/model-output.cjs');
const turnContract=require('../server/turn-contract.cjs');
const turnAuthority=require('../server/turn-authority.cjs');
const spatial=require('../server/spatial.cjs');
const tactical=require('../server/tactical.cjs');
const http=require('../server/http.cjs');
const rules=require('../server/rules.cjs');
const secretPolicy=require('../server/secret.cjs');
// These stores are best-effort protection inside one warm function instance. Signed input state
// prevents a retry from mutating an already-advanced save, but exact cross-instance response
// deduplication still requires a shared durable idempotency store.
const instanceVisitors=new Map(),instanceResponses=new Map(),instanceInflight=new Set();
const startKeys=new Set(['start','name','cls','origin','background','tone','backstory','goal']),turnKeys=new Set(['action','save','requestId']);
const signingSecrets=()=>secretPolicy.campaignSigningSecrets(env,groq);
const signingSecret=()=>signingSecrets()[0]||null;
const configured=()=>groq.keys(env).length>0&&!!signingSecret();
function verifySave(token){let lastError=null;for(const secret of signingSecrets()){try{return world.verify(token,secret)}catch(error){lastError=error}}throw lastError||new Error('No signing secret configured.')}
function safeProviderLog(error){console.error('[astra-dnd groq]',JSON.stringify({status:error.status,providerStatus:error.providerStatus||0,providerCode:error.providerCode||'',providerType:error.providerType||'',causeCode:error.causeCode||'',model:error.model||'',stage:error.stage||'',retryAfter:error.retryAfter||0}))}
function validOptionalText(value,max){return value===undefined||(typeof value==='string'&&value.length<=max)}
function validateStart(body){
  if(body.start!==true||!http.onlyKeys(body,startKeys)||typeof body.cls!=='string')return null;
  if(!validOptionalText(body.name,30)||!validOptionalText(body.backstory,700)||!validOptionalText(body.goal,350))return null;
  const badOrigin=body.origin!==undefined&&!Object.hasOwn(rules.ORIGINS,body.origin),badBackground=body.background!==undefined&&!Object.hasOwn(rules.BACKGROUNDS,body.background),badTone=body.tone!==undefined&&!Object.hasOwn(rules.TONES,body.tone);if(badOrigin||badBackground||badTone)return null;
  return {name:typeof body.name==='string'?body.name:'Rowan',cls:body.cls,options:{origin:body.origin,background:body.background,tone:body.tone,backstory:body.backstory,goal:body.goal}};
}
function validateTurn(body){if(!http.onlyKeys(body,turnKeys))return null;const action=typeof body.action==='string'?body.action.trim():'';if(!action||action.length>1000||typeof body.save!=='string'||body.save.length>80000||!http.validRequestId(body.requestId))return null;return {action,save:body.save,requestId:body.requestId}}
function rateLimit(req,res){const retryAfter=http.consumeRateLimit(instanceVisitors,http.clientIp(req),{limit:12});if(!retryAfter)return false;res.setHeader('Retry-After',String(retryAfter));http.reply(res,429,{error:'Too many turns at once. Please wait a minute.',retryAfter});return true}
const cacheKey=(state,requestId)=>`${state.id}:${state.turn}:${requestId}`;
const enrichForResponse=state=>state.combat?tactical.enrichSpatial(state):spatial.enrichExploration(state);
async function createCampaign(input,secret,res){try{const state=spatial.enrichExploration(world.initial(input.name,input.cls,input.options));return http.reply(res,200,{state,save:world.sign(state,secret)})}catch{return http.reply(res,400,{error:'Choose a valid character class and options.'})}}
async function resolveTurn(input,secret,res){
  let old;try{old=verifySave(input.save)}catch{return http.reply(res,400,{error:'This save cannot be verified or has expired. Start a new open-world adventure.'})}
  const key=cacheKey(old,input.requestId);http.pruneCache(instanceResponses);if(instanceResponses.has(key))return http.reply(res,200,instanceResponses.get(key).data);if(instanceInflight.has(old.id))return http.reply(res,409,{error:'Your previous turn is still being resolved.'});instanceInflight.add(old.id);
  try{
    const plan=await adjudication.generateValidatedPlan({groq,world,state:old,action:input.action,env}),{state,resolution}=world.resolve(old,plan,undefined,input.action),validateNarration=value=>turnContract.valid(value)&&turnAuthority.validNarrativeUpdate(state,input.action,value),result=await modelOutput.generateValidated({groq,messages:world.narrateMessages(state,input.action,resolution),schema:turnContract.schema,validate:validateNarration,env,stage:'narrate',repairInstruction:turnAuthority.repairInstruction(state,input.action)}),updated=enrichForResponse(world.apply(state,result,input.action,resolution)),data={state:updated,save:world.sign(updated,secret),resolution};
    instanceResponses.set(key,{data,expires:Date.now()+120000});return http.reply(res,200,data);
  }
  catch(error){const provider=error instanceof groq.ProviderError;if(provider)safeProviderLog(error);else console.error('[astra-dnd turn]',JSON.stringify({name:error?.name||'Error',stage:'turn'}));const status=provider?error.status:503,retryAfter=provider?error.retryAfter||0:0;if(retryAfter)res.setHeader('Retry-After',String(retryAfter));return http.reply(res,status,{error:provider?error.message:'The turn could not be safely resolved. Your save is unchanged; please try again.',retryAfter})}
  finally{instanceInflight.delete(old.id)}
}
module.exports=async function handler(req,res){
  const secret=signingSecret();if(req.method==='GET')return http.reply(res,200,{configured:configured(),mode:'open-world',version:3,features:['identity','backgrounds','conditions','death-saves','attack-damage','map-exits','factions','journal','local-commands','server-owned-economy'],build:(env.VERCEL_GIT_COMMIT_SHA||'local').slice(0,12)});
  if(req.method!=='POST'){res.setHeader('Allow','GET, POST');return http.reply(res,405,{error:'Method not allowed.'})}if(!http.sameOrigin(req))return http.reply(res,403,{error:'Please play from the game website.'});if(!configured()||!secret)return http.reply(res,503,{error:'The open-world dungeon master is waiting for its server credentials. The original adventure is still available.'});
  let body;try{body=http.parseBody(req)}catch{return http.reply(res,400,{error:'Invalid request.'})}if(rateLimit(req,res))return;if(Object.hasOwn(body,'start')){const input=validateStart(body);return input?createCampaign(input,secret,res):http.reply(res,400,{error:'Invalid character creation request.'})}const input=validateTurn(body);return input?resolveTurn(input,secret,res):http.reply(res,400,{error:'Write an action of 1–1,000 characters with a valid turn identifier.'});
};
