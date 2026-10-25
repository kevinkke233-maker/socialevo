// A transient, validated public scene prefix, NOT delivered historical evidence.
(function(root){
 'use strict';
 const VERSION='lab-group-thread-v1-ordered';
 function project(prepared=[]){
  const priorTurns=prepared.map(({npc,update})=>{
   if(!npc?.id||typeof update?.dialogue!=='string'||!update.dialogue.trim())throw Error('Invalid prepared public turn.');
   return Object.freeze({speakerId:npc.id,speaker:npc.name,dialogue:update.dialogue});
  });
  return Object.freeze({version:VERSION,visibility:'group',status:'prepared_not_delivered',turnIndex:priorTurns.length,
   priorTurns:Object.freeze(priorTurns),latestTurn:priorTurns.at(-1)||null,instruction:'Compose the next turn in this ordered PUBLIC scene. The validated prefix will be spoken before your turn if the entire scene succeeds; it is not delivered history or verified work. Address the latest speaker, and respect earlier unresolved points. Brief agreement or disagreement is fine; add your own relevant stance, clarification or limitation, not another copy of the same quiz. Do not assume the player answered an intervening question. A prior speaker\'s claim is not established fact, agreement, completed work or private knowledge. Do not fabricate new facts just to be different.'});
 }
 function exactRepeat(text,thread){
  const norm=s=>String(s||'').replace(/[\s，,。.!！?？;；:：、—“”"'‘’]/gu,'').toLowerCase();
  const line=norm(text);return Boolean(line)&&(thread?.priorTurns||[]).some(t=>norm(t.dialogue)===line);
 }
 const api=Object.freeze({VERSION,project,exactRepeat});
 if(typeof module!=='undefined'&&module.exports)module.exports=api;root.LabGroupThreadCore=api;
})(typeof window!=='undefined'?window:globalThis);
