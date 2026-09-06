'use strict';
// Run with SOURCE_AIDM_ROOT pointing at a source checkout with tsx installed.
const assert=require('node:assert/strict'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {test,run,tactical,encounter,world,initial,plan,high}=require('./codex-harness.cjs');
const source=process.env.SOURCE_AIDM_ROOT;
if(!source)throw new Error('Set SOURCE_AIDM_ROOT to the reference AIDungeonMaster checkout.');
const sourceCode=`
const {resolveMove}=require('./src/lib/engine/spatial/tactical/movement.ts');
const {createInitialState}=require('./src/lib/game/state.ts');
const {resolveEngineRequest}=require('./src/lib/engine/index.ts');
const {applyCharacterLevel}=require('./src/lib/game/characters/level.ts');
const actor={id:'hero',faction:'party',size:'medium',speedFt:30,reachFt:5,movementSpentFt:0,extraMovementFt:0,actionUsed:false,bonusActionUsed:false,reactionAvailable:true,disengaged:false,prone:false,flying:false};
const base={gridType:'square',cellSizeFt:5,width:12,height:8,diagonalMode:'simple_5ft',cells:{},positions:{hero:{x:2,y:4}},actors:{hero:actor}};
const wall=structuredClone(base);for(let y=0;y<8;y++)wall.cells['3,'+y]={terrain:'blocked'};
const difficult=structuredClone(base);for(let y=0;y<8;y++)difficult.cells['3,'+y]={terrain:'difficult'};
const wizard=createInitialState('qa-source',{characterId:'wizard'});
const cast=resolveEngineRequest(wizard,{kind:'cast_spell',characterId:wizard.player.id,spellName:'World Obliteration',level:1});
const purchase=resolveEngineRequest(wizard,{kind:'update_inventory',characterId:wizard.player.id,goldDelta:-50,add:['Plate armour']});
console.log(JSON.stringify({wall:resolveMove(wall,'hero',{x:4,y:4}).result.ok,difficult:resolveMove(difficult,'hero',{x:4,y:4}).result.movementSpentFt,unknownSpell:cast.result.ok,purchase:purchase.result.ok,proficiencies:[1,2,3,4,5,10,20].map(l=>applyCharacterLevel(wizard.player,l).proficiencyBonus)}));
`;
const child=spawnSync(process.execPath,[path.join(source,'node_modules/tsx/dist/cli.mjs'),'-e',sourceCode],{cwd:source,encoding:'utf8',timeout:30000});
if(child.status!==0)throw new Error(child.stderr||child.stdout);
const expected=JSON.parse(child.stdout.trim().split('\n').at(-1));console.log('SOURCE OBSERVATIONS '+JSON.stringify(expected));
test('X01 source/port blocked-wall movement parity',()=>{const s=encounter();for(let y=0;y<8;y++)s.combat.grid.cells['3,'+y]={terrain:'blocked'};assert.equal(tactical.move(s,4,4).ok,expected.wall)});
test('X02 source/port difficult-terrain path cost parity',()=>{const s=encounter();for(let y=0;y<8;y++)s.combat.grid.cells['3,'+y]={terrain:'difficult'};assert.equal(tactical.move(s,4,4).state.combat.actors.hero.movementSpentFt,expected.difficult)});
test('X03 source/port unknown spell rejection parity',()=>assert.equal(!world.resolve(initial('wizard'),plan({resource:'spell'}),high,'I cast World Obliteration').resolution.blocked,expected.unknownSpell));
test('X04 source/port proficiency scaling parity',()=>{const actual=[1,2,3,4,5,10,20].map(level=>{const s=initial();s.level=level;return world.resolve(s,plan({kind:'attack',ability:'STR',proficient:true}),high).resolution.roll.modifier-3});assert.deepEqual(actual,expected.proficiencies)});
run();
