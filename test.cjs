const assert=require('node:assert/strict');const G=require('./dist/engine.js');
const high=()=>.95,low=()=>0;function path(cls,commands,rng=high){const s=G.fresh('Tester',cls);for(const c of commands)G.act(s,c,rng);return s}
const peaceful=['promise','graves','honour','escort','ledger','cross','enter','name'];
for(const cls of Object.keys(G.classes)){const s=path(cls,peaceful);assert.equal(s.end,'THE KINDNESS OF A NAME');assert.equal(s.enemy,null);assert(s.flags.includes('rescued'));assert(s.hp>0)}
const mercy=path('rogue',['question','tavern','honour','escort','cache','cross','enter','mercy']);assert.equal(mercy.end,'A DAWN WITHOUT BELLS');
const shatter=path('wizard',['question','tracks','honour','ask','fork','dispel','enter','shatter']);assert.equal(shatter.end,'THE SILVER SILENCE');
let s=G.fresh('R','fighter');G.act(s,'garbage',low);assert.equal(s.scene,'road');assert.equal(s.hp,24);G.act(s,'potion',low);assert.equal(s.potions,2);G.act(s,'rest',low);assert.equal(s.rested,false);
s=path('fighter',['promise','tavern','fight']);assert(s.enemy);s.hp=10;const before=s.enemy.hp;G.act(s,'wind',high);assert(s.hp>10);assert.equal(s.enemy.hp,before);assert(!G.options(s).some(o=>o.id==='wind'));G.act(s,'attack',high);assert(!s.enemy);assert.equal(s.scene,'cloister');
s=path('wizard',['promise','tavern','fight']);const slots=s.slots;G.act(s,'missile',high);assert.equal(s.slots,slots-1);assert.equal(s.scene,'cloister');
s=path('rogue',['promise','tavern','fight']);const hp=s.hp;G.act(s,'hide',high);assert(s.hidden);assert.equal(s.hp,hp);G.act(s,'attack',high);assert.equal(s.enemy,null);
s=path('fighter',['promise','tavern','honour','escort','ledger','cross','enter','mercy'],low);assert(s.enemy?.kind==='drowned');
s=path('fighter',['promise','tavern','fight']);G.act(s,'flee',high);assert.equal(s.enemy,null);assert.equal(s.scene,'gate');
s=path('wizard',['promise','tavern','fight']);s.hp=1;G.act(s,'attack',low); // enemy natural 1 misses
assert.equal(s.hp,1);const seq=[0,.95,.5,.5];G.act(s,'attack',()=>seq.shift()??.5);assert(s.end);assert.equal(s.hp,0);
s=G.fresh('X','rogue');s.hp=1;G.act(s,'rest',high);assert(s.rested);const healed=s.hp;G.act(s,'rest',high);assert.equal(s.hp,healed);
// Full combat route reaches a distinct epilogue.
s=path('fighter',['promise','tavern','honour','escort','cache','cross','enter','battle']);while(s.enemy&&!s.end){if(s.hp<12&&!s.wind)G.act(s,'wind',high);G.act(s,'attack',high)}assert.equal(s.scene,'aftermath');G.act(s,'stay',high);assert.equal(s.end,'SOMEONE TO KEEP THE DAWN');
console.log('All checks passed: three classes, peaceful and combat endings, checks, resources, hiding, escape and defeat.');
