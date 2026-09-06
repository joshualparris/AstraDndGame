'use strict';
const assert=require('node:assert/strict');
const adjudication=require('../server/adjudication.cjs');
const valid={kind:'check',ability:'WIS',dc:12,advantage:'normal',proficient:false,resource:'none',stakes:'Notice the detail.',intent:'Examine the stranger.'};
function test(name,fn){return Promise.resolve().then(fn).then(()=>console.log('✓',name))}
(async()=>{
  assert.equal(adjudication.validPlan(valid),true);
  assert.equal(adjudication.validPlan({...valid,dc:'12'}),false);
  assert.equal(adjudication.validPlan({...valid,ability:'wis'}),false);
  await test('valid adjudication is accepted without retry',async()=>{
    const calls=[];const groq={generate:async(...args)=>{calls.push(args);return valid},ProviderError:class extends Error{}};const world={planMessages:()=>[{role:'user',content:'x'}],planSchema:{}};
    const out=await adjudication.generateValidatedPlan({groq,world,state:{},action:'look',env:{GROQ_MODEL:'primary',GROQ_FALLBACK_MODEL:'fallback'}});assert.deepEqual(out,valid);assert.equal(calls.length,1);
  });
  await test('parseable but invalid adjudication retries on configured fallback model',async()=>{
    const calls=[];const groq={generate:async(messages,schema,options)=>{calls.push({messages,options});return calls.length===1?{...valid,ability:'wis'}:valid},ProviderError:class extends Error{}};const world={planMessages:()=>[{role:'user',content:'x'}],planSchema:{}};
    const out=await adjudication.generateValidatedPlan({groq,world,state:{},action:'look',env:{GROQ_MODEL:'primary',GROQ_FALLBACK_MODEL:'fallback'}});assert.deepEqual(out,valid);assert.equal(calls.length,2);assert.equal(calls[1].options.env.GROQ_MODEL,'fallback');assert.equal(calls[1].options.env.GROQ_FALLBACK_MODEL,'fallback');
  });
  await test('two semantically invalid plans fail closed without reaching rules engine',async()=>{
    class ProviderError extends Error{constructor(message,status,retryAfter,details){super(message);this.status=status;Object.assign(this,details)}}
    const groq={generate:async()=>({...valid,proficient:'false'}),ProviderError};const world={planMessages:()=>[],planSchema:{}};let error=null;try{await adjudication.generateValidatedPlan({groq,world,state:{},action:'look',env:{}})}catch(e){error=e}assert(error instanceof ProviderError);assert.equal(error.status,502);assert.equal(error.providerCode,'invalid_model_output');assert.equal(error.stage,'plan');
  });
  console.log('Adjudication validation QA passed.');
})().catch(e=>{console.error(e);process.exit(1)});
