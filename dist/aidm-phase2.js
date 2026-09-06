'use strict';
(()=>{
  const G=window.Blackthorn;if(!G?.classes)return;
  const extra={
    cleric:{name:'Cleric',hp:20,ac:16,stats:{STR:2,DEX:0,CON:2,INT:0,WIS:3,CHA:1},attack:4,die:6,damage:2,weapon:'Mace',ability:'Divine magic: Sacred Flame costs no slot. Levelled cleric spells such as Cure Wounds and Healing Word consume a spell slot. Mace attacks use server-rolled damage.',rune:'✢',tag:'Faith & restoration',description:'Stand between darkness and your companions with armour, prayer and healing magic.',summary:'20 HP · 16 AC · WIS +3'},
    paladin:{name:'Paladin',hp:24,ac:18,stats:{STR:3,DEX:0,CON:2,INT:-1,WIS:1,CHA:2},attack:5,die:8,damage:3,weapon:'Warhammer',ability:'Sacred warrior: martial attacks use server-rolled damage. Levelled divine magic consumes spell slots; explicitly declared Divine Smite adds server-rolled smite damage on a successful attack.',rune:'✦',tag:'Oath & steel',description:'A heavily armoured sacred warrior with conviction, divine magic and devastating smites.',summary:'24 HP · 18 AC · STR +3'},
    ranger:{name:'Ranger',hp:20,ac:15,stats:{STR:0,DEX:3,CON:1,INT:0,WIS:2,CHA:0},attack:5,die:8,damage:3,weapon:'Longbow',ability:'Wilderness hunter: longbow attacks work at range in tactical combat and use server-rolled damage. Levelled ranger magic consumes spell slots.',rune:'➶',tag:'Trail & bow',description:'Read the wilds, track what others miss and control a fight from range.',summary:'20 HP · 15 AC · DEX +3'}
  };
  Object.assign(G.classes,Object.fromEntries(Object.entries(extra).map(([id,c])=>[id,{name:c.name,hp:c.hp,ac:c.ac,stats:c.stats,attack:c.attack,die:c.die,damage:c.damage,weapon:c.weapon,ability:c.ability}])));
  const classes=document.querySelector('.classes');
  if(classes&&!document.querySelector('input[name="class"][value="cleric"]')){
    for(const [id,c] of Object.entries(extra)){
      const label=document.createElement('label');label.className='classcard';
      const input=document.createElement('input');input.type='radio';input.name='class';input.value=id;
      const rune=document.createElement('span');rune.className='rune';rune.textContent=c.rune;
      const strong=document.createElement('strong');strong.textContent=c.name;
      const tag=document.createElement('span');tag.textContent=c.tag;
      const p=document.createElement('p');p.textContent=c.description;
      const small=document.createElement('small');small.textContent=c.summary;
      label.append(input,rune,strong,tag,p,small);classes.append(label);
    }
  }
  const key='astra-open-world-v3';
  function campaign(){try{return JSON.parse(localStorage.getItem(key)||'null')}catch{return null}}
  function ensurePanels(){
    const aside=document.querySelector('#game aside');if(!aside||document.getElementById('phase2Party'))return;
    const party=document.createElement('details');party.id='phase2Party';party.open=true;const ps=document.createElement('summary');ps.textContent='Party';const pb=document.createElement('div');pb.id='phase2PartyBody';party.append(ps,pb);
    const canon=document.createElement('details');canon.id='phase2Canon';const cs=document.createElement('summary');cs.textContent='Canonical memory';const cb=document.createElement('div');cb.id='phase2CanonBody';canon.append(cs,cb);
    const facts=document.querySelector('#facts')?.parentElement;const anchor=facts||document.getElementById('newgame');if(anchor){anchor.after(party);party.after(canon)}else aside.append(party,canon);
  }
  function lines(root,items,empty){if(!root)return;root.replaceChildren();if(!items?.length){const p=document.createElement('p');p.className='small';p.textContent=empty;root.append(p);return}for(const value of items){const p=document.createElement('p');p.className='small';p.textContent=value;root.append(p)}}
  function refresh(){
    ensurePanels();const s=campaign()?.state;if(!s)return;
    const d=extra[s.cls];if(d){
      const slotsMax=Number.isFinite(s.slotsMax)?s.slotsMax:(s.cls==='cleric'?3:2),first=document.querySelector('#pack p');
      if(first&&slotsMax&&!first.textContent.includes('spell slot'))first.textContent+=` · ${s.slots}/${slotsMax} spell slots`;
      const abilities=document.getElementById('abilities');if(abilities)abilities.textContent=d.ability;
    }
    const party=Array.isArray(s.party)?s.party:[];
    lines(document.getElementById('phase2PartyBody'),party.map(p=>`${p.role==='player'?'★':'•'} ${p.name} · Level ${p.level} ${G.classes[p.cls]?.name||p.cls} · HP ${p.hp}/${p.maxHp} · AC ${p.ac}${p.slotsMax?` · slots ${p.slots}/${p.slotsMax}`:''}`),'Your companions will appear here when they join the adventure.');
    const canon=Array.isArray(s.canon)?[...s.canon].sort((a,b)=>({high:0,medium:1,low:2}[a.importance]??2)-({high:0,medium:1,low:2}[b.importance]??2)||b.lastSeen-a.lastSeen):[];
    lines(document.getElementById('phase2CanonBody'),canon.slice(0,16).map(x=>`${String(x.importance||'low').toUpperCase()} · ${x.content}`),'Important people, promises and world facts will accumulate here.');
  }
  refresh();setInterval(refresh,750);
  window.AstraPhase2={classes:extra,refresh};
})();
