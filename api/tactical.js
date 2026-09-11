'use strict';
const crypto=require('node:crypto');
const env=process.env;
const world=require('../server/world.cjs');
const tactical=require('../server/tactical.cjs');
const groq=require('../server/groq.cjs');
const http=require('../server/http.cjs');
const secretPolicy=require('../server/secret.cjs');
// These maps only coordinate one warm function instance. The signed pre-action save prevents
// already-advanced state from being mutated twice; exact cross-instance response deduplication
// requires shared storage and is intentionally not claimed here.
const instanceVisitors=new Map(),instanceResponses=new Map(),instanceInflight=new Set(),baseKeys=new Set(['save','op','requestId']);
const getSecrets=()=>secretPolicy.campaignSigningSecrets(env,groq);
const getSecret=()=>getSecrets()[0]||null;
function verifySave(token){let lastError=null;for(const secret of getSecrets()){try{return world.verify(token,secret)}catch(error){lastError=error}}throw lastError||new Error('No signing secret configured.')}
function keysFor(op){if(op==='start')return new Set([...baseKeys,'enemyName']);if(op==='move')return new Set([...baseKeys,'x','y']);if(op==='attack'||op==='magic_missile')return new Set([...baseKeys,'targetId']);return baseKeys}
function validate(body){
  const operations=['start','move','dash','disengage','attack','magic_missile','potion','second_wind','hide','end_turn','sync'];
  if(typeof body.op!=='string'||!operations.includes(body.op)||!http.onlyKeys(body,keysFor(body.op))||typeof body.save!=='string'||body.save.length>80000||!http.validRequestId(body.requestId))return null;
  if(body.op==='start'&&body.enemyName!==undefined&&(typeof body.enemyName!=='string'||body.enemyName.length>60))return null;
  if(body.op==='move'&&(!Number.isInteger(body.x)||!Number.isInteger(body.y)))return null;
  if((body.op==='attack'||body.op==='magic_missile')&&body.targetId!==undefined&&(typeof body.targetId!=='string'||body.targetId.length>80))return null;
  return body;
}
function rateLimit(req,res){const retryAfter=http.consumeRateLimit(instanceVisitors,http.clientIp(req),{limit:60});if(!retryAfter)return false;res.setHeader('Retry-After',String(retryAfter));http.reply(res,429,{error:'Too many tactical actions at once. Please wait a minute.',retryAfter});return true}
function stateKey(save,state,requestId){const digest=crypto.createHash('sha256').update(save).digest('base64url').slice(0,16);return `${state.id}:${digest}:${requestId}`}
function execute(state,input){
  if(input.op==='start')return {state:tactical.startEncounter(state,input.enemyName),ok:true,summary:null};
  if(input.op==='move')return tactical.move(state,input.x,input.y);
  if(input.op==='dash')return tactical.dash(state);
  if(input.op==='disengage')return tactical.disengage(state);
  if(input.op==='attack')return tactical.attack(state,input.targetId||'enemy-1');
  if(input.op==='magic_missile')return tactical.magicMissile(state,input.targetId||'enemy-1');
  if(input.op==='potion')return tactical.usePotion(state);
  if(input.op==='second_wind')return tactical.secondWind(state);
  if(input.op==='hide')return tactical.hide(state);
  if(input.op==='end_turn')return tactical.endTurn(state);
  return {state:tactical.enrichSpatial(state),ok:true,summary:'Spatial state refreshed.'};
}
async function resolveAction(input,secret,res){
  let state;try{state=verifySave(input.save)}catch{return http.reply(res,400,{error:'This campaign save could not be verified.'})}const key=stateKey(input.save,state,input.requestId);http.pruneCache(instanceResponses);if(instanceResponses.has(key))return http.reply(res,200,instanceResponses.get(key).data);if(instanceInflight.has(state.id))return http.reply(res,409,{error:'A tactical action is already being resolved for this campaign.'});instanceInflight.add(state.id);
  try{const result=execute(state,input),enriched=tactical.enrichSpatial(result.state),data={state:enriched,save:world.sign(enriched,secret),ok:result.ok!==false,summary:result.summary||'',roll:result.roll||null,reachable:tactical.reachable(enriched)};instanceResponses.set(key,{data,expires:Date.now()+120000});return http.reply(res,result.ok===false?409:200,data)}
  catch(error){console.error('[astra tactical]',JSON.stringify({name:error?.name||'Error',op:input.op}));return http.reply(res,500,{error:'The tactical action could not be resolved. Your previous save is unchanged.'})}finally{instanceInflight.delete(state.id)}
}
module.exports=async function handler(req,res){const secret=getSecret();if(req.method==='GET')return http.reply(res,200,{configured:!!secret,mode:'tactical',features:['exploration-map','battle-grid','movement','dash','disengage','opportunity-attacks','range','line-of-sight','cover','turn-economy','enemy-archetypes','class-actions','spellcasting','consumables'],build:(env.VERCEL_GIT_COMMIT_SHA||'local').slice(0,12)});if(req.method!=='POST'){res.setHeader('Allow','GET, POST');return http.reply(res,405,{error:'Method not allowed.'})}if(!http.sameOrigin(req))return http.reply(res,403,{error:'Please play from the game website.'});if(!secret)return http.reply(res,503,{error:'Tactical mode is waiting for a campaign signing secret.'});let body;try{body=http.parseBody(req)}catch{return http.reply(res,400,{error:'Invalid request.'})}if(rateLimit(req,res))return;const input=validate(body);return input?resolveAction(input,secret,res):http.reply(res,400,{error:'Invalid tactical action.'})};
