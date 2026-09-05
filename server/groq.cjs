'use strict';
let blockedUntil=0;const disabled=new Set();
class ProviderError extends Error{constructor(message,status=503,retryAfter=0){super(message);this.status=status;this.retryAfter=retryAfter}}
function keys(env=process.env){let result;try{result=JSON.parse(env.GROQ_API_KEYS||'[]')}catch{result=(env.GROQ_API_KEYS||'').split(/[\s,]+/)}if(!Array.isArray(result))result=[];if(env.GROQ_API_KEY)result.unshift(env.GROQ_API_KEY);return [...new Set(result.filter(k=>typeof k==='string'&&k.startsWith('gsk_')))];}
async function generate(messages,schema,{env=process.env,fetcher=fetch,now=Date.now}={}){const pool=keys(env);if(!pool.length)throw new ProviderError('The dungeon master is not configured yet.',503);if(now()<blockedUntil)throw new ProviderError('The dungeon master needs a short pause. Your progress is safe.',429,Math.ceil((blockedUntil-now())/1000));const models=[env.GROQ_MODEL||'openai/gpt-oss-120b','openai/gpt-oss-20b'];let modelIndex=0,attempts=0,keyIndex=0;
while(attempts<4&&keyIndex<pool.length){const key=pool[keyIndex];if(disabled.has(key)){keyIndex++;continue}attempts++;let response;try{response=await fetcher('https://api.groq.com/openai/v1/chat/completions',{method:'POST',signal:AbortSignal.timeout(18000),headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model:models[modelIndex],messages,temperature:.75,max_completion_tokens:2400,reasoning_effort:'low',response_format:{type:'json_schema',json_schema:{name:'adventure_turn',strict:true,schema}}})})}catch{if(modelIndex===0){modelIndex=1;continue}throw new ProviderError('The dungeon master lost connection. Please try the same action again.');}
if(response.status===429){const header=response.headers.get('retry-after');const seconds=Math.min(3600,Math.max(2,Number(header)||60));blockedUntil=now()+seconds*1000;throw new ProviderError('Groq is at its shared rate limit. Your action has not been applied.',429,seconds)}
if(response.status===401){disabled.add(key);keyIndex++;continue}
if(response.status>=500){if(modelIndex===0){modelIndex=1;continue}throw new ProviderError('Groq is temporarily unavailable. Your progress is safe.');}
if(!response.ok)throw new ProviderError('The dungeon master could not complete that request. Please try again later.');
let data;try{data=await response.json();const content=data.choices?.[0]?.message?.content;if(data.choices?.[0]?.finish_reason==='length')throw new Error();return JSON.parse(content)}catch{throw new ProviderError('The dungeon master returned an incomplete turn. Nothing has been changed.');}}
throw new ProviderError('No available dungeon-master credential could complete this request.');}
function resetForTests(){blockedUntil=0;disabled.clear()}
module.exports={generate,keys,ProviderError,resetForTests};
