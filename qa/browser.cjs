'use strict';
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../dist');
const OPENING='Rain beads on your cloak. Ahead, Blackthorn huddles beneath a ruined abbey.';
const classes={fighter:{hp:24,ac:16,slots:0,weapon:'Longsword'},rogue:{hp:18,ac:14,slots:0,weapon:'Shortbow'},wizard:{hp:14,ac:12,slots:3,weapon:'Fire Bolt'}};
function makeState(cls='fighter',name='Tester'){
  const c=classes[cls];return {version:3,id:'mock-campaign-id',turn:0,name,cls,level:2,xp:0,hp:c.hp,maxHp:c.hp,ac:c.ac,slots:c.slots,potions:2,gold:10,secondWindReady:cls==='fighter',location:'The road to Blackthorn',time:'Dusk, first day',inventory:[c.weapon,'Travelling cloak','Bedroll','Rations (3 days)',...(cls==='wizard'?['Spellbook']:[])],npcs:[],quests:['Discover why Blackthorn’s dead are walking—or choose your own road.'],places:['Blackthorn: a frightened village below a ruined abbey.','The Hollow Marches: roads, forests, river towns and forgotten kingdoms beyond.'],memory:'Opening memory.',history:[],prologue:'Rain beads on your cloak. Ahead, Blackthorn huddles beneath a ruined abbey. Its bell tower has no bell.\n\nThe road is yours. What do you do?',narrative:'Rain beads on your cloak. Ahead, Blackthorn huddles beneath a ruined abbey. Its bell tower has no bell.\n\nThe road is yours. What do you do?',suggestions:['Ask the woman about her daughter','Head west towards Greyhaven','Follow the sound beneath the abbey'],lastRoll:null};
}
function serve(){return new Promise(resolve=>{const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost');let file=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end()}try{const data=fs.readFileSync(file);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[path.extname(file)]||'application/octet-stream');res.end(data)}catch{res.writeHead(404);res.end('Not found')}});server.listen(0,'127.0.0.1',()=>resolve(server))})}
async function routeApi(page){
  let state=null,saveCounter=0;
  await page.route('**/api/turn',async route=>{
    const req=route.request();if(req.method()==='GET')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({configured:true,mode:'open-world',version:3,build:'browser-test'})});
    const body=JSON.parse(req.postData()||'{}');
    if(body.start===true){state=makeState(body.cls,body.name.trim()||'Rowan');return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({state,save:'mock-save-'+(++saveCounter)+'-abcdefghijk'})})}
    if(/rate limit/i.test(body.action||''))return route.fulfill({status:429,contentType:'application/json',body:JSON.stringify({error:'Groq is rate-limited right now. Your action has not been applied.',retryAfter:1})});
    if(!state)return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:'No state'})});
    const action=body.action||'';const next=structuredClone(state);next.turn++;let narrative='You act, and the Hollow Marches answer.';
    if(/healing potions/i.test(action)){next.potions--;next.hp=Math.min(next.maxHp,next.hp+7);narrative='The potion warms your throat and strength returns.'}
    else if(/Second Wind/i.test(action)){next.secondWindReady=false;next.hp=Math.min(next.maxHp,next.hp+8);narrative='You steady your breathing and find another reserve of strength.'}
    else if(/short rest/i.test(action)){next.secondWindReady=next.cls==='fighter'?true:next.secondWindReady;next.hp=Math.min(next.maxHp,next.hp+6);narrative='You find shelter and rest for an hour.'}
    else{next.hp=Math.min(next.hp,10);next.location='Blackthorn road';next.lastRoll={dice:[14],die:14,modifier:1,total:15,dc:12,ability:'WIS',advantage:'normal',success:true,critical:false};}
    next.narrative=narrative;next.time='Dusk, a few minutes later';next.history=[...next.history,{action,narrative}].slice(-6);next.suggestions=['Continue onward','Look around','Speak to someone'];state=next;
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({state,save:'mock-save-'+(++saveCounter)+'-abcdefghijk',resolution:{kind:'none'}})});
  });
}
(async()=>{
  const server=await serve(),port=server.address().port,base=`http://127.0.0.1:${port}`;const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:900}});const errors=[];page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});page.on('pageerror',e=>errors.push(e.message));await routeApi(page);await page.goto(base,{waitUntil:'networkidle'});
    assert.match(await page.locator('#availability').textContent(),/ready/i);await page.getByRole('button',{name:'How to play'}).click();assert.equal(await page.locator('#modal').evaluate(el=>el.open),true);await page.locator('#close').click();
    await page.locator('#name').fill('Browser Tester');await page.locator('input[value="fighter"]').check();await page.getByRole('button',{name:/Begin your adventure/}).click();await page.waitForSelector('#game:not([hidden])');assert.equal(await page.locator('#heroName').textContent(),'Browser Tester');assert.equal(await page.locator('#potion').isDisabled(),true,'potion must be disabled at full HP');assert.equal(await page.locator('#wind').isVisible(),true);assert.equal(await page.locator('#wind').isDisabled(),true,'Second Wind must be disabled at full HP');
    await page.locator('#input').fill('I examine the woman carefully');await page.locator('#command button[type="submit"]').click();await page.waitForFunction(()=>document.querySelector('#chapterNo')?.textContent==='TURN 1');const story=await page.locator('#story').textContent();assert(story.includes(OPENING),'opening scene should remain visible after turn 1');assert(story.includes('I examine the woman carefully'));assert.equal(await page.locator('#potion').isDisabled(),false);assert.equal(await page.locator('#wind').isDisabled(),false);
    await page.locator('#wind').click();await page.waitForFunction(()=>document.querySelector('#chapterNo')?.textContent==='TURN 2');assert.match(await page.locator('#pack').textContent(),/Second Wind spent/);assert.equal(await page.locator('#wind').isDisabled(),true);
    const saved=await page.evaluate(()=>localStorage.getItem('astra-open-world-v3'));assert(saved&&saved.includes('Browser Tester'));await page.reload({waitUntil:'networkidle'});assert.equal(await page.locator('#heroName').textContent(),'Browser Tester','valid campaign should survive reload');
    await page.locator('#input').fill('trigger rate limit');await page.locator('#command button[type="submit"]').click();await page.waitForFunction(()=>/rate-limited/i.test(document.querySelector('#turnstatus')?.textContent||''));assert.equal(await page.locator('#input').inputValue(),'trigger rate limit','failed action should remain editable');
    assert.equal(errors.length,0,'open-world page emitted console/page errors: '+errors.join(' | '));

    const corrupt=await browser.newPage();await routeApi(corrupt);await corrupt.goto(base);await corrupt.evaluate(()=>localStorage.setItem('astra-open-world-v3',JSON.stringify({state:{version:3,cls:'fighter'},save:'corrupt-save'})));await corrupt.reload({waitUntil:'networkidle'});assert.equal(await corrupt.locator('#creation').isVisible(),true,'corrupt local save should be discarded instead of crashing');await corrupt.close();

    const mobile=await browser.newPage({viewport:{width:390,height:844}});await routeApi(mobile);await mobile.goto(base,{waitUntil:'networkidle'});const overflow=await mobile.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);assert(overflow<=1,'mobile layout horizontally overflows by '+overflow+'px');await mobile.close();

    const classic=await browser.newPage({viewport:{width:1000,height:800}});await classic.addInitScript(()=>{Math.random=()=>0.99});await classic.goto(base+'/classic.html',{waitUntil:'networkidle'});await classic.locator('#name').fill('Classic Tester');await classic.getByRole('button',{name:/Enter Blackthorn/}).click();const click=async name=>{await classic.getByRole('button',{name}).click()};await click(/Promise to find her daughter/);await click(/Read the opened graves/);await click(/Show Edrin’s token/);await click(/Lead the girl back to the gate/);await click(/Save the ledger/);await click(/Leap across the broken balustrade/);await click(/Approach the bellkeeper/);await click(/Speak the name from the ledger/);assert.equal(await classic.locator('#chapter').textContent(),'THE KINDNESS OF A NAME');assert.match(await classic.locator('#story').textContent(),/ADVENTURE COMPLETE/);await classic.close();
    console.log('Browser QA passed: creation, resources, turn UI, persistent prologue, local save recovery, 429 UX, responsive layout, modal and full classic peaceful route.');
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exit(1)});
