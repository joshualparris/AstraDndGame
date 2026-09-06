'use strict';
(()=>{
  const campaignKey='astra-open-world-v3';
  const undoKey='astra-open-world-undo-v1';
  const prefsKey='astra-ui-prefs-v1';
  const slotPrefix='astra-open-world-slot-';
  const maxBackupBytes=250000;
  const $=id=>document.getElementById(id);
  const jsonEqual=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

  function validCampaign(value){
    const s=value&&value.state;
    return !!(value&&typeof value.save==='string'&&value.save.length>10&&s&&s.version===3&&typeof s.id==='string'&&typeof s.name==='string'&&typeof s.cls==='string'&&Number.isFinite(s.turn));
  }
  function readCampaign(){
    try{const value=JSON.parse(localStorage.getItem(campaignKey));return validCampaign(value)?value:null}catch{return null}
  }
  function writeCampaign(value){
    if(!validCampaign(value))return false;
    try{localStorage.setItem(campaignKey,JSON.stringify(value));return true}catch{return false}
  }
  function safeName(value){return String(value||'astra-campaign').replace(/[^a-z0-9_-]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,48)||'astra-campaign'}
  function flash(message){
    const target=$('savestatus')||$('turnstatus');if(!target)return;
    target.dataset.extraMessage='1';target.textContent=message;
    clearTimeout(flash.timer);flash.timer=setTimeout(()=>{if(target.dataset.extraMessage==='1'){delete target.dataset.extraMessage;const c=readCampaign();target.textContent=c?'PROGRESS SAVED ON THIS DEVICE':''}},2600);
  }
  function materialState(state){
    if(!state)return null;
    return {
      hp:state.hp,maxHp:state.maxHp,ac:state.ac,slots:state.slots,potions:state.potions,gold:state.gold,xp:state.xp,
      secondWindReady:state.secondWindReady,
      inventory:Array.isArray(state.inventory)?state.inventory:[],
      conditions:Array.isArray(state.conditions)?state.conditions:[]
    };
  }
  function safeUndoCandidate(before,data){
    if(!validCampaign(before)||!data||!data.state||typeof data.save!=='string')return false;
    const r=data.resolution||{};
    if(r.blocked||r.roll||r.deathSave||Number(r.damage)>0||Number(r.healing)>0||(r.resource&&r.resource!=='none'))return false;
    if(data.state.turn!==before.state.turn+1)return false;
    return jsonEqual(materialState(before.state),materialState(data.state));
  }
  function readUndo(){
    try{
      const value=JSON.parse(sessionStorage.getItem(undoKey));
      return value&&validCampaign(value.campaign)&&Number.isFinite(value.forTurn)?value:null;
    }catch{return null}
  }
  function clearUndo(){try{sessionStorage.removeItem(undoKey)}catch{}updateControls()}
  function applyUndo({reload=true}={}){
    const undo=readUndo(),current=readCampaign();
    if(!undo||!current||current.state.turn!==undo.forTurn)return false;
    if(!writeCampaign(undo.campaign))return false;
    clearUndo();
    if(reload)location.reload();
    return true;
  }

  const nativeFetch=typeof window.fetch==='function'?window.fetch.bind(window):null;
  if(nativeFetch){
    window.fetch=async function(input,init={}){
      const url=typeof input==='string'?input:(input&&input.url)||'';
      const method=String(init.method||'GET').toUpperCase();
      let before=null,body=null;
      if(method==='POST'&&/\/api\/turn(?:\?|$)/.test(url)){
        try{body=typeof init.body==='string'?JSON.parse(init.body):null}catch{}
        if(body&&body.start===true)clearUndo();
        else if(body&&typeof body.action==='string')before=readCampaign();
      }
      const response=await nativeFetch(input,init);
      if(before&&response.ok){
        response.clone().json().then(data=>{
          try{
            if(safeUndoCandidate(before,data))sessionStorage.setItem(undoKey,JSON.stringify({campaign:before,forTurn:data.state.turn,createdAt:Date.now()}));
            else sessionStorage.removeItem(undoKey);
          }catch{}
          updateControls();
        }).catch(()=>{});
      }
      return response;
    };
  }

  function backupPayload(){
    const campaign=readCampaign();if(!campaign)return null;
    return {format:'astra-campaign-backup-v1',version:1,exportedAt:new Date().toISOString(),campaign};
  }
  function downloadBackup(){
    const payload=backupPayload();if(!payload){flash('No campaign to back up yet.');return false}
    try{
      const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
      a.href=url;a.download=`astra-${safeName(payload.campaign.state.name)}-turn-${payload.campaign.state.turn}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);flash('Campaign backup downloaded.');return true;
    }catch{flash('Could not create a backup in this browser.');return false}
  }
  function restoreBackupObject(value,{reload=true}={}){
    const campaign=value&&value.format==='astra-campaign-backup-v1'?value.campaign:(value&&value.campaign?value.campaign:value);
    if(!validCampaign(campaign))return false;
    if(!writeCampaign(campaign))return false;
    clearUndo();
    if(reload)location.reload();
    return true;
  }
  async function restoreFile(file){
    if(!file||file.size>maxBackupBytes){flash('That backup is too large or unreadable.');return false}
    try{
      const parsed=JSON.parse(await file.text());
      if(!restoreBackupObject(parsed,{reload:false})){flash('That file is not a valid Astra campaign backup.');return false}
      flash('Backup restored. Reloading…');setTimeout(()=>location.reload(),80);return true;
    }catch{flash('That file is not a valid Astra campaign backup.');return false}
  }
  function saveSlot(n){
    const campaign=readCampaign();if(!campaign)return false;
    const slot=Math.max(1,Math.min(3,Number(n)||1));
    try{localStorage.setItem(slotPrefix+slot,JSON.stringify({format:'astra-slot-v1',savedAt:new Date().toISOString(),campaign}));updateControls();return true}catch{return false}
  }
  function loadSlot(n,{reload=true}={}){
    const slot=Math.max(1,Math.min(3,Number(n)||1));
    try{
      const value=JSON.parse(localStorage.getItem(slotPrefix+slot));if(!value||!validCampaign(value.campaign))return false;
      if(!writeCampaign(value.campaign))return false;clearUndo();if(reload)location.reload();return true;
    }catch{return false}
  }
  function slotInfo(n){
    try{const value=JSON.parse(localStorage.getItem(slotPrefix+n));return value&&validCampaign(value.campaign)?{savedAt:value.savedAt||'',name:value.campaign.state.name,turn:value.campaign.state.turn}:null}catch{return null}
  }

  function readPrefs(){
    try{return {...{largeText:false,readableFont:false,focus:false},...JSON.parse(localStorage.getItem(prefsKey)||'{}')}}catch{return {largeText:false,readableFont:false,focus:false}}
  }
  function applyPrefs(prefs=readPrefs()){
    document.body.classList.toggle('large-text',!!prefs.largeText);
    document.body.classList.toggle('readable-font',!!prefs.readableFont);
    document.body.classList.toggle('focus-reading',!!prefs.focus);
    for(const [id,key] of [['prefLarge','largeText'],['prefReadable','readableFont'],['prefFocus','focus']])if($(id))$(id).checked=!!prefs[key];
  }
  function setPref(key,value){const prefs=readPrefs();prefs[key]=!!value;try{localStorage.setItem(prefsKey,JSON.stringify(prefs))}catch{}applyPrefs(prefs)}

  function speakLatest(){
    const text=readCampaign()?.state?.narrative;
    if(!text){flash('There is no DM narration to read yet.');return false}
    if(!('speechSynthesis' in window)||typeof window.SpeechSynthesisUtterance!=='function'){flash('Read-aloud is not supported in this browser.');return false}
    try{
      if(window.speechSynthesis.speaking){window.speechSynthesis.cancel();flash('Read-aloud stopped.');return true}
      const utterance=new SpeechSynthesisUtterance(text);utterance.rate=.95;utterance.pitch=1;window.speechSynthesis.speak(utterance);flash('Reading the latest DM turn aloud.');return true;
    }catch{flash('Read-aloud could not start.');return false}
  }
  async function toggleFullscreen(){
    try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();return true}catch{return false}
  }

  function summary(){
    const c=readCampaign();if(!c)return {mode:'creation',hasCampaign:false};
    const s=c.state;
    return {
      mode:'open-world',hasCampaign:true,turn:s.turn,name:s.name,class:s.cls,level:s.level,hp:s.hp,maxHp:s.maxHp,ac:s.ac,xp:s.xp,
      location:s.location,time:s.time,danger:s.danger||'tense',conditions:Array.isArray(s.conditions)?s.conditions:[],
      quests:Array.isArray(s.quests)?s.quests:[],routes:Array.isArray(s.exits)?s.exits:[],factions:Array.isArray(s.factions)?s.factions:[],
      facts:Array.isArray(s.facts)?s.facts:[],inventory:Array.isArray(s.inventory)?s.inventory:[],latestNarrative:String(s.narrative||'').slice(0,1200)
    };
  }
  window.render_game_to_text=()=>JSON.stringify(summary());

  function installUi(){
    if($('astraCampaignTools'))return;
    const header=document.querySelector('header');
    if(header){const display=document.createElement('button');display.id='displayTools';display.type='button';display.textContent='Display';display.addEventListener('click',()=>{$('astraSettings')?.showModal()});header.append(display)}
    const aside=document.querySelector('#game aside');
    if(aside){
      const section=document.createElement('section');section.id='astraCampaignTools';section.className='crossrepo-tools';
      section.innerHTML='<h3>Campaign tools</h3><div class="utility extras-row"><button id="backupSave" type="button">Backup</button><button id="restoreSave" type="button">Restore</button><button id="undoTurn" type="button">Undo safe turn</button><button id="readTurn" type="button">Read aloud</button></div><div class="slot-row"><select id="saveSlot" aria-label="Save slot"><option value="1">Slot 1</option><option value="2">Slot 2</option><option value="3">Slot 3</option></select><button id="saveToSlot" type="button">Save slot</button><button id="loadFromSlot" type="button">Load slot</button></div><p id="slotStatus" class="small"></p><input id="restoreFile" type="file" accept="application/json,.json" hidden>';
      const saveStatus=$('savestatus');if(saveStatus)saveStatus.before(section);else aside.append(section);
      $('backupSave').onclick=downloadBackup;$('restoreSave').onclick=()=>$('restoreFile').click();$('restoreFile').onchange=e=>{const file=e.target.files?.[0];if(file)restoreFile(file);e.target.value=''};$('undoTurn').onclick=()=>{if(!applyUndo())flash('There is no safe turn to undo.')} ;$('readTurn').onclick=speakLatest;
      $('saveToSlot').onclick=()=>{const n=$('saveSlot').value;flash(saveSlot(n)?`Saved to slot ${n}.`:'No campaign to save.');updateControls()};
      $('loadFromSlot').onclick=()=>{const n=$('saveSlot').value;if(!loadSlot(n,{reload:false})){flash(`Slot ${n} is empty.`);return}flash(`Loaded slot ${n}. Reloading…`);setTimeout(()=>location.reload(),80)};
      $('saveSlot').onchange=updateControls;
    }
    const settings=document.createElement('dialog');settings.id='astraSettings';settings.innerHTML='<button id="settingsClose" class="dialog-close" aria-label="Close">×</button><p class="eyebrow">DISPLAY & ACCESSIBILITY</p><h2>Reading controls</h2><label class="setting-row"><input id="prefLarge" type="checkbox"> Larger interface text</label><label class="setting-row"><input id="prefReadable" type="checkbox"> Readable sans-serif story font</label><label class="setting-row"><input id="prefFocus" type="checkbox"> Focus reading mode</label><button id="fullscreen" type="button">Toggle fullscreen</button><p class="small">These preferences stay on this device. Press F outside a text field to toggle fullscreen.</p>';document.body.append(settings);
    $('settingsClose').onclick=()=>settings.close();$('prefLarge').onchange=e=>setPref('largeText',e.target.checked);$('prefReadable').onchange=e=>setPref('readableFont',e.target.checked);$('prefFocus').onchange=e=>setPref('focus',e.target.checked);$('fullscreen').onclick=toggleFullscreen;
    const story=$('story');if(story){const jump=document.createElement('button');jump.id='jumpLatest';jump.type='button';jump.textContent='↓ Jump to latest';jump.hidden=true;story.after(jump);jump.onclick=()=>{story.scrollTo({top:story.scrollHeight,behavior:'smooth'});jump.hidden=true};story.addEventListener('scroll',()=>{jump.hidden=story.scrollHeight-story.scrollTop-story.clientHeight<90})}
    document.addEventListener('keydown',e=>{if(e.key.toLowerCase()!=='f'||e.ctrlKey||e.metaKey||e.altKey)return;const tag=document.activeElement?.tagName;if(['INPUT','TEXTAREA','SELECT'].includes(tag))return;e.preventDefault();toggleFullscreen()});
    applyPrefs();updateControls();
  }
  function updateControls(){
    const c=readCampaign(),undo=readUndo(),undoButton=$('undoTurn');
    if(undoButton)undoButton.disabled=!c||!undo||c.state.turn!==undo.forTurn;
    const slot=$('saveSlot')?.value||'1',info=slotInfo(slot),status=$('slotStatus');
    if(status)status.textContent=info?`Slot ${slot}: ${info.name} · turn ${info.turn}`:`Slot ${slot}: empty`;
    if($('saveToSlot'))$('saveToSlot').disabled=!c;if($('loadFromSlot'))$('loadFromSlot').disabled=!info;if($('backupSave'))$('backupSave').disabled=!c;if($('readTurn'))$('readTurn').disabled=!c;
  }

  installUi();setInterval(updateControls,700);
  if('serviceWorker' in navigator&&(location.protocol==='https:'||location.hostname==='localhost'||location.hostname==='127.0.0.1'))navigator.serviceWorker.register('./sw.js').catch(()=>{});

  window.AstraExtras={validCampaign,readCampaign,backupPayload,restoreBackupObject,saveSlot,loadSlot,slotInfo,safeUndoCandidate,applyUndo,readPrefs,setPref,summary};
})();
