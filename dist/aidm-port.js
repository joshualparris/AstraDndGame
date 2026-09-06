'use strict';
(()=>{
  const campaignKey='astra-open-world-v3',ns='http://www.w3.org/2000/svg';
  const $=id=>document.getElementById(id);
  const read=()=>{try{return JSON.parse(localStorage.getItem(campaignKey)||'null')}catch{return null}};
  const clean=v=>String(v||'').slice(0,100);
  function idFor(name){let h=2166136261;for(const c of String(name)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return `${clean(name).toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,30)||'place'}-${(h>>>0).toString(36).slice(0,5)}`}
  function exploration(state){
    if(state?.spatial?.exploration?.nodes?.length)return state.spatial.exploration;
    const currentName=clean(state?.location)||'Unknown location',currentId=idFor(currentName),nodes=[{id:currentId,name:currentName,x:0,y:0}],edges=[],exits=Array.isArray(state?.exits)?state.exits.slice(0,8):[];
    exits.forEach((name,i)=>{const angle=Math.PI*2*i/Math.max(1,exits.length)-Math.PI/2,r=3+(i%2),id=idFor(name);nodes.push({id,name:clean(name),x:Math.round(Math.cos(angle)*r*10)/10,y:Math.round(Math.sin(angle)*r*10)/10});edges.push({from:currentId,to:id,label:clean(name),distanceFt:500+i*250,locked:false})});
    return {currentId,nodes,edges};
  }
  function setStatus(message,bad=false){const el=$('aidmStatus');if(!el)return;el.textContent=message||'';el.classList.toggle('bad',!!bad)}
  async function send(op,payload={}){
    const campaign=read();if(!campaign?.save){setStatus('Start an adventure first.',true);return null}
    setStatus('Resolving tactical action…');
    try{
      const r=await fetch('/api/tactical',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({save:campaign.save,op,...payload})}),data=await r.json();
      if(data?.state&&data?.save)localStorage.setItem(campaignKey,JSON.stringify({state:data.state,save:data.save}));
      setStatus(data.summary||data.error||(r.ok?'Done.':'That action is not legal.'),!r.ok);
      render();
      if(data?.state&&data?.save)setTimeout(()=>location.reload(),240);
      return data;
    }catch{setStatus('Tactical mode could not reach the server. Your save is unchanged.',true);return null}
  }
  function button(label,onClick,className=''){const b=document.createElement('button');b.type='button';b.textContent=label;if(className)b.className=className;b.addEventListener('click',onClick);return b}
  function install(){
    if($('aidmPort'))return;
    const aside=document.querySelector('#game aside');if(!aside)return;
    const section=document.createElement('section');section.id='aidmPort';section.className='aidm-port';
    const h=document.createElement('h3');h.textContent='World & tactical map';section.append(h);
    const tabs=document.createElement('div');tabs.className='aidm-tabs';tabs.append(button('World',()=>show('world'),'active'),button('Battle',()=>show('battle')));section.append(tabs);
    const world=document.createElement('div');world.id='aidmWorld';const battle=document.createElement('div');battle.id='aidmBattle';battle.hidden=true;section.append(world,battle);
    const status=document.createElement('p');status.id='aidmStatus';status.className='small aidm-status';section.append(status);
    const audio=document.createElement('div');audio.className='aidm-audio';const audioButton=button('Ambient sound',toggleAudio);audioButton.id='aidmAudio';audio.append(audioButton);const vol=document.createElement('input');vol.id='aidmVolume';vol.type='range';vol.min='0';vol.max='1';vol.step='.05';vol.value=localStorage.getItem('astra-ambient-volume')||'.35';vol.setAttribute('aria-label','Ambient volume');vol.oninput=()=>{localStorage.setItem('astra-ambient-volume',vol.value);if(audioRig)audioRig.gain.gain.value=Number(vol.value)*.08};audio.append(vol);section.append(audio);
    const newgame=$('newgame');if(newgame)newgame.before(section);else aside.append(section);render();
  }
  function show(which){const world=$('aidmWorld'),battle=$('aidmBattle');if(!world||!battle)return;world.hidden=which!=='world';battle.hidden=which!=='battle';document.querySelectorAll('.aidm-tabs button').forEach((b,i)=>b.classList.toggle('active',(which==='world'?i===0:i===1)))}
  function renderWorld(state){
    const root=$('aidmWorld');if(!root)return;root.replaceChildren();if(!state){root.append(document.createTextNode('Start a campaign to reveal the map.'));return}
    const ex=exploration(state),nodes=ex.nodes||[],edges=ex.edges||[];
    const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','-6 -6 12 12');svg.setAttribute('role','img');svg.setAttribute('aria-label','Exploration map');svg.classList.add('aidm-world-svg');
    for(const edge of edges){const a=nodes.find(n=>n.id===edge.from),b=nodes.find(n=>n.id===edge.to);if(!a||!b)continue;const line=document.createElementNS(ns,'line');line.setAttribute('x1',a.x);line.setAttribute('y1',a.y);line.setAttribute('x2',b.x);line.setAttribute('y2',b.y);line.classList.add(edge.locked?'locked':'route');svg.append(line)}
    for(const node of nodes){const g=document.createElementNS(ns,'g');g.setAttribute('transform',`translate(${Number(node.x)||0} ${Number(node.y)||0})`);g.classList.add('map-node');if(node.id===ex.currentId)g.classList.add('current');const circle=document.createElementNS(ns,'circle');circle.setAttribute('r',node.id===ex.currentId?'.48':'.38');g.append(circle);const label=document.createElementNS(ns,'text');label.setAttribute('y','.9');label.setAttribute('text-anchor','middle');label.textContent=clean(node.name).slice(0,24);g.append(label);g.setAttribute('tabindex','0');g.setAttribute('role','button');g.setAttribute('aria-label',`${node.name}${node.id===ex.currentId?', current location':', travel here'}`);if(node.id!==ex.currentId){const travel=()=>{const input=$('input');if(input){input.value=`I travel to ${clean(node.name)}`;input.focus();show('world');setStatus(`Travel command prepared for ${clean(node.name)}. Send it when ready.`)}};g.addEventListener('click',travel);g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();travel()}})}svg.append(g)}
    root.append(svg);const p=document.createElement('p');p.className='small';p.textContent='Tap a discovered route to prepare a travel action. The AI DM still narrates and adjudicates the journey.';root.append(p);
  }
  function renderBattle(state){
    const root=$('aidmBattle');if(!root)return;root.replaceChildren();const c=state?.combat;
    if(!c?.active){const p=document.createElement('p');p.className='small';p.textContent='No tactical encounter is active. Start one when the fiction has reached a fight.';root.append(p);root.append(button('Start tactical encounter',()=>{const suggested=clean(state?.npcs?.[0]?.split(/[—:]/)[0])||'Hostile creature',name=window.prompt('Name the hostile creature or foe:',suggested);if(name!==null)send('start',{enemyName:name||'Hostile creature'})},'tactical-start'));return}
    const info=document.createElement('p');info.className='small';info.textContent=`Round ${c.round||1} · ${c.turn==='hero'?'Your turn':'Enemy turn'}`;root.append(info);
    const grid=document.createElement('div');grid.className='tactical-grid';grid.style.gridTemplateColumns=`repeat(${c.grid.width}, minmax(20px,1fr))`;const reachable=new Set();const hero=c.actors?.hero;if(hero){const allowance=hero.speed*(hero.dashed?2:1)-hero.movementSpentFt;for(let y=0;y<c.grid.height;y++)for(let x=0;x<c.grid.width;x++){const cell=c.grid.cells?.[`${x},${y}`],occupied=Object.values(c.actors).some(a=>a.id!=='hero'&&a.hp>0&&a.x===x&&a.y===y),cost=Math.max(Math.abs(hero.x-x),Math.abs(hero.y-y))*5*(cell?.terrain==='difficult'?2:1);if(cell?.terrain!=='blocked'&&!occupied&&cost<=allowance)reachable.add(`${x},${y}`)}}
    for(let y=0;y<c.grid.height;y++)for(let x=0;x<c.grid.width;x++){const cell=c.grid.cells?.[`${x},${y}`],actor=Object.values(c.actors||{}).find(a=>a.hp>0&&a.x===x&&a.y===y),b=document.createElement('button');b.type='button';b.className='battle-cell';if(cell?.terrain)b.classList.add(cell.terrain);if(reachable.has(`${x},${y}`)&&!actor)b.classList.add('reachable');if(actor){b.classList.add(actor.faction==='party'?'hero':'enemy');b.textContent=actor.faction==='party'?'H':'E';b.title=`${actor.name} ${actor.hp}/${actor.maxHp} HP`;if(actor.faction==='enemy')b.onclick=()=>send('attack',{targetId:actor.id})}else{b.textContent=cell?.terrain==='blocked'?'×':cell?.terrain==='difficult'?'·':'';if(reachable.has(`${x},${y}`))b.onclick=()=>send('move',{x,y})}b.setAttribute('aria-label',actor?`${actor.name} at ${x},${y}`:`Grid cell ${x},${y}${reachable.has(`${x},${y}`)?', reachable':''}`);grid.append(b)}
    root.append(grid);const controls=document.createElement('div');controls.className='aidm-combat-controls';controls.append(button('Dash',()=>send('dash')),button('Disengage',()=>send('disengage')),button('End turn',()=>send('end_turn')));root.append(controls);
    const actors=document.createElement('p');actors.className='small';const foe=c.actors?.['enemy-1'];actors.textContent=`You: ${hero?.hp??state.hp}/${hero?.maxHp??state.maxHp} HP${foe?` · ${foe.name}: ${foe.hp}/${foe.maxHp} HP`:''}`;root.append(actors);
    const log=document.createElement('ol');log.className='tactical-log';for(const line of (c.log||[]).slice(-4)){const li=document.createElement('li');li.textContent=line;log.append(li)}root.append(log);
  }
  let lastSignature='';function render(){const state=read()?.state||null,signature=state?JSON.stringify([state.turn,state.location,state.exits,state.hp,state.combat]):'none';if(signature===lastSignature)return;lastSignature=signature;renderWorld(state);renderBattle(state)}
  let audioRig=null;
  function toggleAudio(){if(audioRig){try{audioRig.osc.stop();audioRig.noise.stop();audioRig.ctx.close()}catch{}audioRig=null;$('aidmAudio').textContent='Ambient sound';return}const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx){setStatus('Ambient audio is not supported by this browser.',true);return}const ctx=new Ctx(),gain=ctx.createGain(),osc=ctx.createOscillator(),filter=ctx.createBiquadFilter(),noise=ctx.createBufferSource(),noiseGain=ctx.createGain(),state=read()?.state||{},danger=state.danger||'tense';gain.gain.value=Number($('aidmVolume')?.value||.35)*.08;gain.connect(ctx.destination);osc.type=danger==='dangerous'?'sawtooth':'sine';osc.frequency.value=danger==='dangerous'?92:danger==='safe'?147:110;filter.type='lowpass';filter.frequency.value=260;osc.connect(filter);filter.connect(gain);osc.start();const buffer=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;noise.buffer=buffer;noise.loop=true;noiseGain.gain.value=.025;noise.connect(noiseGain);noiseGain.connect(gain);noise.start();audioRig={ctx,gain,osc,noise};$('aidmAudio').textContent='Stop ambience'}
  install();setInterval(render,900);window.AstraTactical={send,exploration,render};
})();
