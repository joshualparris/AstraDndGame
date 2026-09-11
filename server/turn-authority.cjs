'use strict';

const BUY=/\b(?:buy|purchase)\b/i;
const SELL=/\b(?:sell)\b/i;
const SPEND=/\b(?:buy|purchase|pay|spend|bribe|tip|hire|give|donate|bet|wager|trade|barter)\b/i;
const RECEIVE=/\b(?:sell|claim|collect|loot|take|receive|accept|reward|payment|winnings|trade|barter)\b/i;
const INVENTORY=/\b(?:buy|purchase|sell|trade|barter|take|pick\s+up|loot|give|drop|discard|equip|unequip|craft|forge|make|steal|receive|accept|use|drink|consume)\b/i;

function sameStrings(a,b){return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((value,index)=>value===b[index])}
function difference(after,before){const remaining=[...(before||[])],changed=[];for(const value of after||[]){const index=remaining.indexOf(value);if(index>=0)remaining.splice(index,1);else changed.push(value)}return changed}
function inventoryDelta(before,after){return {added:difference(after,before),removed:difference(before,after)}}
function transactionIntent(action){const text=typeof action==='string'?action:'';return {buy:BUY.test(text),sell:SELL.test(text),spend:SPEND.test(text),receive:RECEIVE.test(text),inventory:INVENTORY.test(text)}}
function validNarrativeUpdate(state,action,result){
  if(!state||!result)return false;
  const intent=transactionIntent(action),gold=Number(result.goldChange)||0,currentGold=Math.max(0,Number(state.gold)||0),before=Array.isArray(state.inventory)?state.inventory:[],after=Array.isArray(result.inventory)?result.inventory:before,{added,removed}=inventoryDelta(before,after),inventoryChanged=!sameStrings(before,after);
  if(gold<0&&(!intent.spend||Math.abs(gold)>currentGold))return false;
  if(gold>0&&!intent.receive)return false;
  if(inventoryChanged&&!intent.inventory)return false;
  // Purchases and sales are atomic: money cannot move if the corresponding item did not.
  if(intent.buy&&gold<0&&added.length===0)return false;
  if(intent.buy&&added.length>0&&gold>=0)return false;
  if(intent.sell&&gold>0&&removed.length===0)return false;
  return true;
}
function repairInstruction(state,action){
  return `Your previous response failed the server's authority checks. Return fresh JSON matching the schema. The player action was ${JSON.stringify(String(action||'').slice(0,1000))}. Current gold is ${Math.max(0,Number(state?.gold)||0)}. Gold may decrease only when the player explicitly chose to spend, pay, buy, bribe, hire, give, wager, trade or barter; never charge for a refused, failed or nonexistent purchase. Gold may increase only when the player explicitly chose to receive, collect, claim, loot, sell, trade or accept a reward/payment. Inventory may change only when the player explicitly chose an inventory-changing action such as taking, buying, selling, giving, dropping, equipping, crafting, stealing, receiving, using or consuming an item. A purchase that spends gold must actually add the purchased item in the same response; a sale that grants gold must remove the sold item. Otherwise keep goldChange at 0 and return the current inventory unchanged. Offers can be narrated without automatically accepting them for the player.`;
}
module.exports={transactionIntent,inventoryDelta,validNarrativeUpdate,repairInstruction};
