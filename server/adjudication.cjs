'use strict';
const kinds=new Set(['none','check','attack','save']);
const abilities=new Set(['STR','DEX','CON','INT','WIS','CHA']);
const resources=new Set(['none','spell','potion','secondWind']);
const advantages=new Set(['normal','advantage','disadvantage']);

function validPlan(plan){
  return !!(plan&&typeof plan==='object'&&!Array.isArray(plan)&&
    kinds.has(plan.kind)&&abilities.has(plan.ability)&&resources.has(plan.resource)&&advantages.has(plan.advantage)&&
    Number.isInteger(plan.dc)&&typeof plan.proficient==='boolean'&&typeof plan.stakes==='string'&&typeof plan.intent==='string');
}

function invalidPlanError(groq){
  return new groq.ProviderError('The dungeon master returned an incomplete adjudication. Nothing has been changed.',502,0,{
    providerStatus:200,
    providerCode:'invalid_model_output',
    stage:'plan'
  });
}

async function generateValidatedPlan({groq,world,state,action,env=process.env}){
  const messages=world.planMessages(state,action);
  let plan=await groq.generate(messages,world.planSchema,{env,stage:'plan'});
  if(validPlan(plan))return plan;

  // A provider can occasionally return parseable JSON that still violates the
  // local contract despite response_format=json_schema. Do not let that object
  // reach the deterministic rules engine. Retry once using the configured
  // fallback model with a clean instruction; no save or player text is logged.
  const fallbackModel=env.GROQ_FALLBACK_MODEL||'openai/gpt-oss-20b';
  const retryEnv={...env,GROQ_MODEL:fallbackModel,GROQ_FALLBACK_MODEL:fallbackModel};
  const retryMessages=[...messages,{role:'user',content:'Your previous adjudication failed local validation. Return a fresh adjudication matching the required JSON schema exactly. Use only the allowed enum values, an integer DC, and a boolean proficient field. Do not include commentary.'}];
  plan=await groq.generate(retryMessages,world.planSchema,{env:retryEnv,stage:'plan'});
  if(validPlan(plan))return plan;
  throw invalidPlanError(groq);
}

module.exports={validPlan,generateValidatedPlan};
