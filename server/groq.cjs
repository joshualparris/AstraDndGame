'use strict';
let cooldownUntil=0;
const disabled=new Set();

class ProviderError extends Error{
  constructor(message,status=503,retryAfter=0,details={}){
    super(message);
    this.name='ProviderError';
    this.status=status;
    this.retryAfter=retryAfter;
    this.providerStatus=details.providerStatus||0;
    this.providerCode=details.providerCode||'';
    this.providerType=details.providerType||'';
    this.providerMessage=details.providerMessage||'';
    this.model=details.model||'';
    this.stage=details.stage||'';
  }
}

function keys(env=process.env){
  let result;
  try{result=JSON.parse(env.GROQ_API_KEYS||'[]')}
  catch{result=(env.GROQ_API_KEYS||'').split(/[\s,]+/)}
  if(!Array.isArray(result))result=[];
  if(env.GROQ_API_KEY)result.unshift(env.GROQ_API_KEY);
  return [...new Set(result.filter(k=>typeof k==='string'&&k.startsWith('gsk_')))];
}

function retrySeconds(value,now){
  const numeric=Number(value);
  if(value!==null&&value!==''&&Number.isFinite(numeric))return Math.max(1,Math.ceil(numeric));
  const date=Date.parse(value);
  return Number.isFinite(date)?Math.max(1,Math.ceil((date-now)/1000)):60;
}

function clean(value,max=320){
  return typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').trim().slice(0,max):'';
}

async function providerDetails(response,model,stage){
  let payload=null;
  try{if(typeof response.json==='function')payload=await response.json()}catch{}
  if(payload===null&&typeof response.text==='function'){
    try{const raw=await response.text();if(raw)payload={error:{message:raw}}}catch{}
  }
  const error=payload&&typeof payload==='object'?(payload.error&&typeof payload.error==='object'?payload.error:payload):{};
  return {
    providerStatus:response.status||0,
    providerCode:clean(error.code,120),
    providerType:clean(error.type,120),
    providerMessage:clean(error.message,320),
    model,
    stage
  };
}

function structuredOutputFailure(details){
  const haystack=`${details.providerCode} ${details.providerType} ${details.providerMessage}`.toLowerCase();
  return details.providerStatus===400&&/(json|schema|response[_ -]?format|failed[_ -]?generation|structured)/.test(haystack);
}

function publicFailure(details){
  const suffix=details.providerCode?` (${details.providerStatus}: ${details.providerCode})`:` (${details.providerStatus||'network'})`;
  if(details.providerStatus===401)return new ProviderError('The dungeon master\'s Groq credential was rejected. Your save is unchanged.',503,0,details);
  if(details.providerStatus===403)return new ProviderError(`The Groq project does not permit an available dungeon-master model${suffix}. Your save is unchanged.`,502,0,details);
  if([400,404,413,422].includes(details.providerStatus))return new ProviderError(`Groq rejected the dungeon-master request${suffix}. Your save is unchanged.`,502,0,details);
  if(details.providerStatus>=500)return new ProviderError('Groq is temporarily unavailable. Your progress is safe.',503,0,details);
  if(details.providerStatus===0)return new ProviderError('The dungeon master lost connection to Groq. Please try the same action again.',503,0,details);
  return new ProviderError(`Groq could not complete the dungeon-master request${suffix}. Your save is unchanged.`,502,0,details);
}

function requestBody(model,messages,schema,strict=true){
  return {
    model,
    messages,
    temperature:.75,
    max_completion_tokens:2400,
    reasoning_effort:'low',
    response_format:strict
      ?{type:'json_schema',json_schema:{name:'adventure_turn',strict:true,schema}}
      :{type:'json_object'}
  };
}

async function request(key,model,messages,schema,{fetcher,now,deadline,stage,strict=true}){
  const remaining=deadline-now();
  if(remaining<1000)throw new ProviderError('The dungeon master is taking too long. Your progress is safe.',503,0,{model,stage});
  try{
    return await fetcher('https://api.groq.com/openai/v1/chat/completions',{
      method:'POST',
      signal:AbortSignal.timeout(Math.min(16000,remaining)),
      headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
      body:JSON.stringify(requestBody(model,messages,schema,strict))
    });
  }catch{
    return null;
  }
}

async function parseSuccess(response,model,stage){
  try{
    const data=await response.json();
    if(data.choices?.[0]?.finish_reason==='length')throw new Error('length');
    return JSON.parse(data.choices?.[0]?.message?.content);
  }catch{
    throw new ProviderError('The dungeon master returned an incomplete turn. Nothing has been changed.',502,0,{providerStatus:response.status||200,providerCode:'invalid_model_output',model,stage});
  }
}

async function generate(messages,schema,{env=process.env,fetcher=fetch,now=Date.now,stage='turn'}={}){
  const pool=keys(env);
  if(!pool.length)throw new ProviderError('The dungeon master is not configured yet.',503);
  if(cooldownUntil>now())throw new ProviderError('Groq is rate-limited right now. Your action has not been applied.',429,Math.max(1,Math.ceil((cooldownUntil-now())/1000)),{providerStatus:429,stage});

  const models=[...new Set([env.GROQ_MODEL||'openai/gpt-oss-120b',env.GROQ_FALLBACK_MODEL||'openai/gpt-oss-20b'].filter(Boolean))];
  const deadline=now()+35000;
  let lastFailure=null;

  // Credentials are ordered primary -> backup. They are not rotated for throughput.
  for(const key of pool){
    if(disabled.has(key))continue;
    let tryNextCredential=false;

    for(const model of models){
      let response=await request(key,model,messages,schema,{fetcher,now,deadline,stage,strict:true});
      if(response===null){
        lastFailure={providerStatus:0,providerCode:'network_error',providerMessage:'Network request failed or timed out.',model,stage};
        continue;
      }

      if(response.status===429){
        const seconds=retrySeconds(response.headers?.get?.('retry-after'),now());
        cooldownUntil=now()+seconds*1000;
        throw new ProviderError('Groq is rate-limited right now. Your action has not been applied.',429,seconds,{providerStatus:429,providerCode:'rate_limit',model,stage});
      }

      if(response.status===401){
        disabled.add(key);
        lastFailure=await providerDetails(response,model,stage);
        tryNextCredential=true;
        break;
      }

      if(response.ok)return parseSuccess(response,model,stage);

      let details=await providerDetails(response,model,stage);
      lastFailure=details;

      // Groq documents occasional structured-output 400s. Retry once in JSON Object mode;
      // world validation still rejects malformed or incomplete state before a save is changed.
      if(structuredOutputFailure(details)){
        const compatibility=await request(key,model,messages,schema,{fetcher,now,deadline,stage,strict:false});
        if(compatibility===null){
          lastFailure={providerStatus:0,providerCode:'network_error',providerMessage:'Compatibility retry failed or timed out.',model,stage};
          continue;
        }
        if(compatibility.status===429){
          const seconds=retrySeconds(compatibility.headers?.get?.('retry-after'),now());
          cooldownUntil=now()+seconds*1000;
          throw new ProviderError('Groq is rate-limited right now. Your action has not been applied.',429,seconds,{providerStatus:429,providerCode:'rate_limit',model,stage});
        }
        if(compatibility.status===401){
          disabled.add(key);
          lastFailure=await providerDetails(compatibility,model,stage);
          tryNextCredential=true;
          break;
        }
        if(compatibility.ok)return parseSuccess(compatibility,model,stage);
        details=await providerDetails(compatibility,model,stage);
        lastFailure=details;
      }

      if(details.providerStatus===403){
        // Try the fallback model first; if no model is permitted, a backup credential may
        // belong to a differently configured project. This is availability failover only.
        tryNextCredential=true;
        continue;
      }
      if(details.providerStatus>=500)continue;
      if([400,404,413,422].includes(details.providerStatus)){
        // Model fallback can repair model-specific request incompatibilities.
        continue;
      }
      throw publicFailure(details);
    }

    if(!tryNextCredential&&lastFailure&&![403,500,501,502,503,504].includes(lastFailure.providerStatus))break;
  }

  if(lastFailure)throw publicFailure(lastFailure);
  throw new ProviderError('No valid dungeon-master credential is available. Your save is unchanged.',503);
}

function resetForTests(){cooldownUntil=0;disabled.clear()}
module.exports={generate,keys,ProviderError,resetForTests};
