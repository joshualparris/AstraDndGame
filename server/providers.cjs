'use strict';
const groq=require('./groq.cjs');
const ProviderError=groq.ProviderError;
const pause=new Map();
const cleanList=v=>typeof v==='string'?v.split(',').map(x=>x.trim()).filter(Boolean):[];
const unique=a=>[...new Set(a.filter(Boolean))];
function order(env=process.env){const requested=cleanList(env.ASTRA_LLM_PROVIDERS||'groq').map(x=>x.toLowerCase());return requested.length?requested:['groq']}
function providerKeys(name,env=process.env){
  if(name==='groq')return groq.keys(env);
  if(name==='openai')return unique([env.OPENAI_API_KEY,...cleanList(env.OPENAI_API_KEYS)]);
  if(name==='openrouter')return unique([env.OPENROUTER_API_KEY,...cleanList(env.OPENROUTER_API_KEYS)]);
  return [];
}
function keys(env=process.env){return groq.keys(env)}
function signingSecret(env=process.env){const g=keys(env);if(env.DND_SESSION_SECRET)return env.DND_SESSION_SECRET;if(g[0])return require('node:crypto').createHmac('sha256',g[0]).update('astra-dnd-save-signing-v3').digest('hex');return null}
function configured(env=process.env){return !!signingSecret(env)&&order(env).some(p=>providerKeys(p,env).length>0)}
function endpoint(name){if(name==='openai')return 'https://api.openai.com/v1/chat/completions';if(name==='openrouter')return 'https://openrouter.ai/api/v1/chat/completions';return ''}
function model(name,env){if(name==='openai')return env.OPENAI_MODEL||'gpt-4o-mini';if(name==='openrouter')return env.OPENROUTER_MODEL||'meta-llama/llama-3.3-70b-instruct';return ''}
function headers(name,key,env){const h={'Authorization':`Bearer ${key}`,'Content-Type':'application/json'};if(name==='openrouter'){h['X-Title']=env.OPENROUTER_APP_NAME||'Astra Adventures';if(env.OPENROUTER_SITE_URL)h['HTTP-Referer']=env.OPENROUTER_SITE_URL}return h}
function parseError(data,status){const e=data?.error||{};return {providerStatus:status,providerCode:String(e.code||''),providerType:String(e.type||''),providerMessage:String(e.message||'').slice(0,400)}}
async function genericGenerate(name,messages,schema,{env=process.env,stage='',fetcher=fetch}={}){
  const until=pause.get(name)||0;if(until>Date.now())throw new ProviderError(`${name} is temporarily rate limited.`,429,Math.max(1,Math.ceil((until-Date.now())/1000)),{stage,providerCode:'rate_limited',model:model(name,env)});
  const ks=providerKeys(name,env);if(!ks.length)throw new ProviderError(`${name} is not configured.`,503,0,{stage,providerCode:'not_configured',model:model(name,env)});
  let last=null;
  for(let i=0;i<ks.length;i++){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),35000);
    try{
      const r=await fetcher(endpoint(name),{method:'POST',headers:headers(name,ks[i],env),body:JSON.stringify({model:model(name,env),messages,response_format:{type:'json_object'},temperature:stage==='narrate'?0.35:0.1}),signal:controller.signal});
      let data={};try{data=await r.json()}catch{}
      if(r.ok){const raw=data?.choices?.[0]?.message?.content;if(typeof raw!=='string')throw new ProviderError(`${name} returned no usable output.`,502,0,{stage,providerCode:'empty_output',model:model(name,env)});try{return JSON.parse(raw)}catch{throw new ProviderError(`${name} returned malformed JSON.`,502,0,{stage,providerCode:'invalid_json',model:model(name,env)})}}
      const details=parseError(data,r.status),retry=Number(r.headers?.get?.('retry-after'))||0;
      if(r.status===429){const seconds=Math.max(1,retry||30);pause.set(name,Date.now()+seconds*1000);throw new ProviderError(`${name} is rate limited.`,429,seconds,{...details,stage,model:model(name,env)})}
      if(r.status===401){last=new ProviderError(`${name} rejected a credential.`,502,0,{...details,stage,model:model(name,env)});continue}
      throw new ProviderError(`${name} request failed.`,r.status>=500?503:502,retry,{...details,stage,model:model(name,env)});
    }catch(e){if(e instanceof ProviderError){last=e;if(e.status===429||e.providerStatus!==401)throw e}else last=new ProviderError(`${name} could not be reached.`,503,0,{stage,providerCode:'network_error',providerMessage:e instanceof Error?e.message:'network error',model:model(name,env)})}
    finally{clearTimeout(timer)}
  }
  throw last||new ProviderError(`${name} is unavailable.`,503,0,{stage,providerCode:'unavailable',model:model(name,env)});
}
async function generate(messages,schema,options={}){
  const env=options.env||process.env,providers=order(env);let last=null;
  for(const name of providers){
    if(!providerKeys(name,env).length)continue;
    try{return name==='groq'?await groq.generate(messages,schema,options):await genericGenerate(name,messages,schema,options)}catch(e){last=e;if(e instanceof ProviderError&&e.status===429)throw e;if(e instanceof ProviderError&&e.status<500&&e.status!==502)throw e;/* availability failover across configured providers */}
  }
  if(last)throw last;throw new ProviderError('No AI dungeon master provider is configured.',503,0,{stage:options.stage||'',providerCode:'not_configured'});
}
function resetForTests(){pause.clear();groq.resetForTests()}
module.exports={ProviderError,generate,keys,providerKeys,order,configured,signingSecret,resetForTests,_genericGenerate:genericGenerate};
