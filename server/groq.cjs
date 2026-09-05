'use strict';
const cooldowns=new Map(),disabled=new Set();let cursor=0;
class ProviderError extends Error{constructor(message,status=503,retryAfter=0){super(message);this.status=status;this.retryAfter=retryAfter}}
function keys(env=process.env){let result;try{result=JSON.parse(env.GROQ_API_KEYS||'[]')}catch{result=(env.GROQ_API_KEYS||'').split(/[\s,]+/)}if(!Array.isArray(result))result=[];if(env.GROQ_API_KEY)result.unshift(env.GROQ_API_KEY);return [...new Set(result.filter(k=>typeof k==='string'&&k.startsWith('gsk_')))];}
function retrySeconds(value,now){const numeric=Number(value);if(value!==null&&value!==''&&Number.isFinite(numeric))return Math.max(1,Math.ceil(numeric));const date=Date.parse(value);return Number.isFinite(date)?Math.max(1,Math.ceil((date-now)/1000)):60;}
async function generate(messages,schema,{env=process.env,fetcher=fetch,now=Date.now}={}){
const pool=keys(env);if(!pool.length)throw new ProviderError('The dungeon master is not configured yet.',503);
const shared=env.GROQ_QUOTA_MODE==='shared';const quotaKey=key=>shared?'shared':key;
const models=[env.GROQ_MODEL||'openai/gpt-oss-120b','openai/gpt-oss-20b'];
const start=cursor++%pool.length,deadline=now()+35000;let attempts=0;
for(let offset=0;offset<pool.length&&attempts<pool.length+1;offset++){
const key=pool[(start+offset)%pool.length];if(disabled.has(key)||(cooldowns.get(quotaKey(key))||0)>now())continue;
for(let modelIndex=0;modelIndex<models.length;modelIndex++){
const remaining=deadline-now();if(remaining<1000)throw new ProviderError('The dungeon master is taking too long. Your progress is safe.');
attempts++;let response;
try{response=await fetcher('https://api.groq.com/openai/v1/chat/completions',{method:'POST',signal:AbortSignal.timeout(Math.min(16000,remaining)),headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model:models[modelIndex],messages,temperature:.75,max_completion_tokens:2400,reasoning_effort:'low',response_format:{type:'json_schema',json_schema:{name:'adventure_turn',strict:true,schema}}})})}
catch{if(modelIndex===0)continue;throw new ProviderError('The dungeon master lost connection. Please try the same action again.');}
if(response.status===429){const seconds=retrySeconds(response.headers.get('retry-after'),now());cooldowns.set(quotaKey(key),now()+seconds*1000);break;}
if(response.status===401){disabled.add(key);break;}
if(response.status>=500){if(modelIndex===0)continue;throw new ProviderError('Groq is temporarily unavailable. Your progress is safe.');}
if(!response.ok)throw new ProviderError('The dungeon master could not complete that request. Please try again later.');
try{const data=await response.json();if(data.choices?.[0]?.finish_reason==='length')throw new Error();return JSON.parse(data.choices?.[0]?.message?.content)}catch{throw new ProviderError('The dungeon master returned an incomplete turn. Nothing has been changed.');}
}}
const remaining=pool.filter(k=>!disabled.has(k));const times=remaining.map(k=>cooldowns.get(quotaKey(k))||0);
if(times.length&&times.every(t=>t>now()))throw new ProviderError('All available Groq organisations are cooling down. Your action has not been applied.',429,Math.max(1,Math.ceil((Math.min(...times)-now())/1000)));
throw new ProviderError('No available dungeon-master credential could complete this request.');
}
function resetForTests(){cooldowns.clear();disabled.clear();cursor=0}
module.exports={generate,keys,ProviderError,resetForTests};
