'use strict';
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const base=process.env.LIVE_URL||'https://astra-dnd-game.vercel.app';
const expected=(process.env.GITHUB_SHA||'').slice(0,12);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function json(url,options){const r=await fetch(url,options);let body=null;try{body=await r.json()}catch{}return {r,body}}
async function post(body,origin=base){return json(base+'/api/turn',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify(body)})}
async function tactical(body,origin=base){return json(base+'/api/tactical',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify(body)})}
(async()=>{
  let health=null;
  for(let i=0;i<60;i++){
    health=await json(base+'/api/turn');
    if(health.r.ok&&health.body?.configured&&(!expected||health.body.build===expected))break;
    await sleep(3000);
  }
  assert.equal(health?.r.ok,true,'production /api/turn health check failed');assert.equal(health.body.configured,true,'production DM is not configured');if(expected)assert.equal(health.body.build,expected,'production did not reach the commit under test');

  const badOrigin=await post({start:true,name:'QA',cls:'fighter'},'https://example.invalid');assert.equal(badOrigin.r.status,403);
  const badClass=await post({start:true,name:'QA',cls:'bard'});assert.equal(badClass.r.status,400);
  for(const cls of ['fighter','rogue','wizard']){const created=await post({start:true,name:'Live QA',cls});assert.equal(created.r.status,200);assert.equal(created.body.state.cls,cls);assert.equal(created.body.state.turn,0);assert.equal(typeof created.body.save,'string')}

  const created=await post({start:true,name:'Live QA Fighter',cls:'fighter'});assert.equal(created.r.status,200);const request={action:'I examine the woman and ask her name and what happened to her daughter.',save:created.body.save,requestId:randomUUID()};let turn=await post(request);
  if(turn.r.status===429&&turn.body?.retryAfter){await sleep(Math.min(65000,turn.body.retryAfter*1000+1000));turn=await post(request)}
  assert.equal(turn.r.status,200,`live turn failed: ${JSON.stringify(turn.body)}`);assert.equal(turn.body.state.turn,1);assert.equal(turn.body.state.name,'Live QA Fighter');assert.equal(typeof turn.body.state.narrative,'string');assert(turn.body.state.narrative.length>80);assert(Array.isArray(turn.body.state.suggestions)&&turn.body.state.suggestions.length>=1);assert.equal(typeof turn.body.save,'string');assert(turn.body.save!==created.body.save);assert(turn.body.resolution&&typeof turn.body.resolution.kind==='string');

  const tacticalHealth=await json(base+'/api/tactical');assert.equal(tacticalHealth.r.status,200);assert.equal(tacticalHealth.body.configured,true,'production tactical engine is not configured');if(expected)assert.equal(tacticalHealth.body.build,expected,'production tactical endpoint is not on the tested build');
  const encounter=await tactical({op:'start',save:turn.body.save,enemyName:'QA Grave Hound'});assert.equal(encounter.r.status,200,`tactical start failed: ${JSON.stringify(encounter.body)}`);assert.equal(encounter.body.state.combat.active,true);assert.equal(encounter.body.state.combat.grid.width,12);assert.equal(encounter.body.state.combat.grid.height,8);assert.equal(encounter.body.state.combat.actors['enemy-1'].name,'QA Grave Hound');assert.equal(typeof encounter.body.save,'string');
  const moved=await tactical({op:'move',save:encounter.body.save,x:3,y:4});assert.equal(moved.r.status,200,`tactical move failed: ${JSON.stringify(moved.body)}`);assert.equal(moved.body.state.combat.actors.hero.x,3);assert.equal(moved.body.state.combat.actors.hero.y,4);assert.equal(moved.body.state.combat.actors.hero.movementSpentFt,5);

  console.log('Live production smoke passed:',JSON.stringify({build:health.body.build,turn:turn.body.state.turn,location:turn.body.state.location,resolution:turn.body.resolution.kind,roll:turn.body.resolution.roll?.total??null,tactical:{grid:`${moved.body.state.combat.grid.width}x${moved.body.state.combat.grid.height}`,hero:[moved.body.state.combat.actors.hero.x,moved.body.state.combat.actors.hero.y],enemy:moved.body.state.combat.actors['enemy-1'].name},narrative:turn.body.state.narrative.slice(0,180)}));
})().catch(error=>{console.error(error);process.exit(1)});
