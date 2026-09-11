'use strict';
(()=>{
  const V=window.AstraValidation;if(!V)throw new Error('Astra validation module did not load.');
  const campaignKey='astra-open-world-v3',svgNamespace='http://www.w3.org/2000/svg',$=id=>document.getElementById(id);let tacticalRetry=null,lastSignature='',audioRig=null;
  const clean=value=>String(value||'').slice(0,100);
  function readCampaign(){try{return V.parseCampaign(localStorage.getItem(campaignKey))}catch{return null}}
  function setStatus(message,bad=false){const element=$('aidmStatus');if(!element)return;element.textContent=message||'';element.classList.toggle('bad',!!bad)}
  function requestIdFor(save,op,payload){const fingerprint=JSON.stringify([save,op,payload]);if(tacticalRetry?.fingerprint===fingerprint)return tacticalRetry.requestId;const requestId=crypto.randomUUID();tacticalRetry={fingerprint,requestId};return requestId}
  async function send(op,payload={}){
    const campaign=readCampaign();if(!campaign){setStatus('Start an adventure first.',true);return null}
    const requestId=requestIdFor(campaign.save,op,payload),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);setStatus('Resolving tactical action…');
    try{
      const response=await fetch('/api/tactical',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({save:campaign.save,op,requestId,...payload}),signal:controller.signal});
      let data;try{data=await response.json()}catch{throw new Error('Tactical mode returned an unreadable response. Your save is unchanged.')}
      tacticalRetry=null;
      if(data?.state&&data?.save){const next={state:data.state,save:data.save};if(!V.validCampaign(next))throw new Error('Tactical mode returned invalid campaign state. Your previous save is safe.');localStorage.setItem(campaignKey,JSON.stringify(next))}
      setStatus(data.summary||data.error||(response.ok?'Done.':'That action is not legal.'),!response.ok);render();
      if(response.ok&&data?.state&&data?.save)setTimeout(()=>location.reload(),240);
      return data;
    }catch(error){if(error.name==='AbortError')setStatus('Tactical mode took too long. Your save is unchanged; retrying the same action is safe.',true);else setStatus(error.message||'Tactical mode could not reach the server. Your save is unchanged.',true);return null}
    finally{clearTimeout(timer)}
  }
  function button(label,onClick,className='',disabled=false){const element=document.createElement('button');element.type='button';element.textContent=label;if(className)element.className=className;element.disabled=!!disabled;element.addEventListener('click',onClick);return element}
  function install(){
    if($('aidmPort'))return;const aside=document.querySelector('#game aside');if(!aside)return;
    const section=document.createElement('section');section.id='aidmPort';section.className='aidm-port';const heading=document.createElement('h3');heading.textContent='World & tactical map';section.append(heading);
    const tabs=document.createElement('div');tabs.className='aidm-tabs';tabs.append(button('World',()=>show('world'),'active'),button('Battle',()=>show('battle')));section.append(tabs);
    const world=document.createElement('div');world.id='aidmWorld';const battle=document.createElement('div');battle.id='aidmBattle';battle.hidden=true;section.append(world,battle);
    const status=document.createElement('p');status.id='aidmStatus';status.className='small aidm-status';section.append(status);
    const audio=document.createElement('div');audio.className='aidm-audio';const audioButton=button('Ambient sound',toggleAudio);audioButton.id='aidmAudio';audio.append(audioButton);const volume=document.createElement('input');volume.id='aidmVolume';volume.type='range';volume.min='0';volume.max='1';volume.step='.05';volume.value=localStorage.getItem('astra-ambient-volume')||'.35';volume.setAttribute('aria-label','Ambient volume');volume.oninput=()=>{localStorage.setItem('astra-ambient-volume',volume.value);if(audioRig)audioRig.gain.gain.value=Number(volume.value)*.08};audio.append(volume);section.append(audio);
    const newGame=$('newgame');if(newGame)newGame.before(section);else aside.append(section);render();
  }
  function show(which){const world=$('aidmWorld'),battle=$('aidmBattle');if(!world||!battle)return;world.hidden=which!=='world';battle.hidden=which!=='battle';document.querySelectorAll('.aidm-tabs button').forEach((element,index)=>element.classList.toggle('active',which==='world'?index===0:index===1))}
  function prepareTravel(name){const input=$('input'),place=clean(name);if(input){input.value=`I travel to ${place}`;input.focus();show('world');setStatus(`Travel command prepared for ${place}. Send it when ready.`)}}
  function renderLegacyRoutes(root,state){const message=document.createElement('p');message.className='small';message.textContent='The signed map will refresh after your next server turn.';root.append(message);for(const route of Array.isArray(state?.exits)?state.exits.slice(0,8):[])root.append(button(`Travel: ${clean(route)}`,()=>prepareTravel(route)))}
  function renderWorld(state){
    const root=$('aidmWorld');if(!root)return;root.replaceChildren();if(!state){root.append(document.createTextNode('Start a campaign to reveal the map.'));return}
    const exploration=state.spatial?.exploration;if(!exploration?.nodes?.length){renderLegacyRoutes(root,state);return}
    const nodes=exploration.nodes,edges=exploration.edges||[],svg=document.createElementNS(svgNamespace,'svg');svg.setAttribute('viewBox','-6 -6 12 12');svg.setAttribute('role','img');svg.setAttribute('aria-label','Exploration map');svg.classList.add('aidm-world-svg');
    for(const edge of edges){const start=nodes.find(node=>node.id===edge.from),end=nodes.find(node=>node.id===edge.to);if(!start||!end)continue;const line=document.createElementNS(svgNamespace,'line');line.setAttribute('x1',start.x);line.setAttribute('y1',start.y);line.setAttribute('x2',end.x);line.setAttribute('y2',end.y);line.classList.add(edge.locked?'locked':'route');svg.append(line)}
    for(const node of nodes){const group=document.createElementNS(svgNamespace,'g');group.setAttribute('transform',`translate(${Number(node.x)||0} ${Number(node.y)||0})`);group.classList.add('map-node');if(node.id===exploration.currentId)group.classList.add('current');const circle=document.createElementNS(svgNamespace,'circle');circle.setAttribute('r',node.id===exploration.currentId?'.48':'.38');group.append(circle);const label=document.createElementNS(svgNamespace,'text');label.setAttribute('y','.9');label.setAttribute('text-anchor','middle');label.textContent=clean(node.name).slice(0,24);group.append(label);group.setAttribute('tabindex','0');group.setAttribute('role','button');group.setAttribute('aria-label',`${node.name}${node.id===exploration.currentId?', current location':', travel here'}`);if(node.id!==exploration.currentId){const travel=()=>prepareTravel(node.name);group.addEventListener('click',travel);group.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();travel()}})}svg.append(group)}
    root.append(svg);const note=document.createElement('p');note.className='small';note.textContent='Tap a discovered route to prepare a travel action. The server remains authoritative for the journey.';root.append(note);
  }
  function renderBattle(state){
    const root=$('aidmBattle');if(!root)return;root.replaceChildren();const combat=state?.combat;
    if(!combat?.active){const message=document.createElement('p');message.className='small';message.textContent='No tactical encounter is active. Start one when the fiction has reached a fight.';root.append(message);root.append(button('Start tactical encounter',()=>{const suggested=clean(state?.npcs?.[0]?.split(/[—:]/)[0])||'Hostile creature',name=window.prompt('Name the hostile creature or foe:',suggested);if(name!==null)send('start',{enemyName:name||'Hostile creature'})},'tactical-start'));return}
    const hero=combat.actors?.hero,foe=combat.actors?.['enemy-1'],info=document.createElement('p');info.className='small';info.textContent=`Round ${combat.round||1} · ${combat.turn==='hero'?'Your turn':'Enemy turn'}${foe?.styleLabel?` · ${foe.styleLabel}`:''}`;root.append(info);
    if(!Array.isArray(combat.reachable))root.append(button('Sync battlefield',()=>send('sync')));
    const reachable=new Set((combat.reachable||[]).map(cell=>`${cell.x},${cell.y}`)),grid=document.createElement('div');grid.className='tactical-grid';grid.style.gridTemplateColumns=`repeat(${combat.grid.width}, minmax(20px,1fr))`;
    for(let y=0;y<combat.grid.height;y++)for(let x=0;x<combat.grid.width;x++){
      const cell=combat.grid.cells?.[`${x},${y}`],actor=Object.values(combat.actors||{}).find(item=>item.hp>0&&item.x===x&&item.y===y),element=document.createElement('button');element.type='button';element.className='battle-cell';if(cell?.terrain)element.classList.add(cell.terrain);if(reachable.has(`${x},${y}`)&&!actor)element.classList.add('reachable');
      if(actor){element.classList.add(actor.faction==='party'?'hero':'enemy');element.textContent=actor.faction==='party'?'H':'E';element.title=`${actor.name} ${actor.hp}/${actor.maxHp} HP`;if(actor.faction==='enemy')element.onclick=()=>send('attack',{targetId:actor.id})}else{element.textContent=cell?.terrain==='blocked'?'×':cell?.terrain==='difficult'?'·':'';if(reachable.has(`${x},${y}`))element.onclick=()=>send('move',{x,y})}
      element.setAttribute('aria-label',actor?`${actor.name} at ${x},${y}`:`Grid cell ${x},${y}${reachable.has(`${x},${y}`)?', reachable':''}`);grid.append(element);
    }
    root.append(grid);
    const controls=document.createElement('div');controls.className='aidm-combat-controls';const rogue=state.cls==='rogue',fighter=state.cls==='fighter',wizard=state.cls==='wizard',actionUsed=!!hero?.actionUsed,bonusUsed=!!hero?.bonusActionUsed;
    controls.append(button(rogue?'Dash (bonus)':'Dash',()=>send('dash'),' ',rogue?bonusUsed:actionUsed),button(rogue?'Disengage (bonus)':'Disengage',()=>send('disengage'),' ',rogue?bonusUsed:actionUsed));
    if(rogue)controls.append(button('Hide (bonus)',()=>send('hide'),' ',bonusUsed));
    if(fighter)controls.append(button('Second Wind (bonus)',()=>send('second_wind'),' ',bonusUsed||state.secondWindReady===false||state.hp>=state.maxHp));
    if(wizard)controls.append(button(`Magic Missile (${state.slots})`,()=>send('magic_missile',{targetId:'enemy-1'}),' ',actionUsed||state.slots<1));
    if(state.potions>0)controls.append(button(`Potion (${state.potions})`,()=>send('potion'),' ',actionUsed||state.hp>=state.maxHp));
    controls.append(button('End turn',()=>send('end_turn')));root.append(controls);
    const tip=document.createElement('p');tip.className='small';tip.textContent=wizard?'Tap the enemy for Fire Bolt, or spend a slot on Magic Missile.':rogue?'Use cover to Hide, then tap the enemy for an advantaged Sneak Attack.':'Move, use cover, heal with Second Wind, then tap the enemy to attack.';root.append(tip);
    const actors=document.createElement('p');actors.className='small';actors.textContent=`You: ${hero?.hp??state.hp}/${hero?.maxHp??state.maxHp} HP${foe?` · ${foe.name}: ${foe.hp}/${foe.maxHp} HP${foe.styleLabel?` (${foe.styleLabel})`:''}`:''}`;root.append(actors);
    const log=document.createElement('ol');log.className='tactical-log';for(const line of(combat.log||[]).slice(-4)){const item=document.createElement('li');item.textContent=line;log.append(item)}root.append(log);
  }
  function render(){const state=readCampaign()?.state||null,signature=state?JSON.stringify([state.turn,state.location,state.exits,state.hp,state.combat,state.spatial]):'none';if(signature===lastSignature)return;lastSignature=signature;renderWorld(state);renderBattle(state)}
  function toggleAudio(){
    if(audioRig){try{audioRig.osc.stop();audioRig.noise.stop();audioRig.ctx.close()}catch{}audioRig=null;$('aidmAudio').textContent='Ambient sound';return}
    const AudioContext=window.AudioContext||window.webkitAudioContext;if(!AudioContext){setStatus('Ambient audio is not supported by this browser.',true);return}const context=new AudioContext(),gain=context.createGain(),oscillator=context.createOscillator(),filter=context.createBiquadFilter(),noise=context.createBufferSource(),noiseGain=context.createGain(),state=readCampaign()?.state||{},danger=state.danger||'tense';gain.gain.value=Number($('aidmVolume')?.value||.35)*.08;gain.connect(context.destination);oscillator.type=danger==='dangerous'?'sawtooth':'sine';oscillator.frequency.value=danger==='dangerous'?92:danger==='safe'?147:110;filter.type='lowpass';filter.frequency.value=260;oscillator.connect(filter);filter.connect(gain);oscillator.start();const buffer=context.createBuffer(1,context.sampleRate*2,context.sampleRate),data=buffer.getChannelData(0);for(let index=0;index<data.length;index++)data[index]=Math.random()*2-1;noise.buffer=buffer;noise.loop=true;noiseGain.gain.value=.025;noise.connect(noiseGain);noiseGain.connect(gain);noise.start();audioRig={ctx:context,gain,osc:oscillator,noise};$('aidmAudio').textContent='Stop ambience';
  }
  install();setInterval(render,900);window.AstraTactical={send,render};
})();
