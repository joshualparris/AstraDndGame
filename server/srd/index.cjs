'use strict';
// SRD 5.1 content (Open Game Content), released by Wizards of the Coast under
// CC-BY-4.0. Data curated from the MIT-licensed github.com/5e-bits/5e-database
// project and slimmed for gameplay use. See docs/SRD_ATTRIBUTION.md.
const SPELLS=require('./data/spells.json');
const CLASSES=require('./data/classes.json');
const SUBCLASSES=require('./data/subclasses.json');
const RACES=require('./data/races.json');
const BACKGROUNDS=require('./data/backgrounds.json');
const FEATS=require('./data/feats.json');
const FIGHTING_STYLES=require('./data/fighting-styles.json');
const EPIC_BOONS=require('./data/epic-boons.json');

const spellById=new Map(SPELLS.map(s=>[s.id,s]));
const classById=new Map(CLASSES.map(c=>[c.id,c]));
const raceById=new Map(RACES.map(r=>[r.id,r]));
const backgroundById=new Map(BACKGROUNDS.map(b=>[b.id,b]));
const featById=new Map(FEATS.map(f=>[f.id,f]));

function getSpell(id){return spellById.get(id)}
function spellsForClass(classId,maxLevel=9){return SPELLS.filter(s=>s.classes.includes(classId)&&s.level<=maxLevel)}
function cantripsForClass(classId){return SPELLS.filter(s=>s.classes.includes(classId)&&s.level===0)}
function getClass(classId){return classById.get(classId)}
function listClasses(){return CLASSES.map(c=>({id:c.id,name:c.name}))}
function classLevel(classId,level){const c=classById.get(classId);if(!c)return undefined;const lvl=Math.max(1,Math.min(20,Number(level)||1));return c.levels.find(l=>l.level===lvl)}
function subclassesForClass(classId){return SUBCLASSES.filter(s=>s.class===classId)}
function getSubclass(id){return SUBCLASSES.find(s=>s.id===id)}
function getRace(id){return raceById.get(id)}
function listRaces(){return RACES.map(r=>({id:r.id,name:r.name,subraces:r.subraces.map(s=>({id:s.id,name:s.name}))}))}
function getBackground(id){return backgroundById.get(id)}
function listBackgrounds(){return BACKGROUNDS.map(b=>({id:b.id,name:b.name}))}
function getFeat(id){return featById.get(id)}
function listFeats(){return FEATS.map(f=>({id:f.id,name:f.name}))}
function listFightingStyles(){return FIGHTING_STYLES}
function listEpicBoons(){return EPIC_BOONS}

/** Max spell slot level a class can access at a given character level, or 0 if non-caster/no slots yet. */
function maxSpellLevel(classId,level){
  const lvl=classLevel(classId,level);const sc=lvl&&lvl.spellcasting;if(!sc)return 0;
  for(let n=9;n>=1;n--){if((sc[`spell_slots_level_${n}`]||0)>0)return n}
  return 0;
}
/** {1: max, 2: max, ...} spell slot table at a given character level (SRD 5.1 slots, not remaining). */
function spellSlotsAtLevel(classId,level){
  const lvl=classLevel(classId,level);const sc=lvl&&lvl.spellcasting;if(!sc)return {};
  const out={};for(let n=1;n<=9;n++){const v=sc[`spell_slots_level_${n}`]||0;if(v>0)out[n]=v}
  return out;
}

module.exports={
  SPELLS,CLASSES,SUBCLASSES,RACES,BACKGROUNDS,FEATS,
  getSpell,spellsForClass,cantripsForClass,
  getClass,listClasses,classLevel,maxSpellLevel,spellSlotsAtLevel,
  subclassesForClass,getSubclass,
  getRace,listRaces,
  getBackground,listBackgrounds,
  getFeat,listFeats,listFightingStyles,listEpicBoons,
};
