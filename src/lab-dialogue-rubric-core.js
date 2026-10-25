// Structural contract for a whole-utterance expert judgment. This module
// checks report identity and evidence references, never linguistic meaning.
(function(root){
 'use strict';
 const VERSION='lab-semantic-dialogue-qa-v3-rubric';
 const CHECK_IDS=Object.freeze(['source_grounding','submitted_work_integrity','bounded_answerability','conversation_continuity']);
 // This is an instruction for the existing semantic reviewer, not a lexical
 // classifier. Controller/source truth alone does not authorize disclosure.
 const PRESENTATION_REVIEW_RULE='[PLAYER_VISIBLE_NARRATIVE_BOUNDARY_V1] Under conversation_continuity, also assess whether the complete candidate stays inside the present fictional world. Internal stage order/IDs, mandatory future incidents, treatment mechanisms, readiness/end gates and success criteria are execution instructions, not facts that an NPC or public cue may explain to the player. Being present in an internal context, source or planning directive does not make such a disclosure appropriate. Reject a candidate that explains the game design, dictates a fixed future criticism/blame/credit-conflict sequence or announces a hidden completion/ending condition. Do not reject ordinary project language merely because it refers to a phase, review, responsibility, contribution, deadline or next action. Actual supplied materials, current available operations, known seven-day submission deadlines, established in-world plans and already delivered events may be described naturally. An announced future review is a plan, not a mandatory game scene; a future result is not an established award. Assess meaning and current source scope, never word presence. Use the existing conversation_continuity check with an exact candidate quote for an actual disclosure; no new check, forced verdict, dialogue rewrite or outcome change.';
 function exact(value,keys,label){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!==keys.slice().sort().join(','))throw Error(label+' has invalid fields.');
 }
 function normalize(value,{candidate,sources=[]}){
  if(typeof candidate!=='string')throw new TypeError('Dialogue rubric requires the complete candidate string.');
  exact(value,['checks'],'Dialogue rubric');
  if(!Array.isArray(value.checks)||value.checks.length!==CHECK_IDS.length)throw Error('Dialogue rubric requires exactly four checks.');
  const sourceIds=new Set(sources.map(s=>s.id)),seen=new Set();
  const supplied=value.checks.map(c=>{
   exact(c,['id','passed','quote','reason','sourceIds'],'Dialogue rubric check');
   if(!CHECK_IDS.includes(c.id)||seen.has(c.id)||typeof c.passed!=='boolean'||typeof c.quote!=='string'||(c.quote&&!candidate.includes(c.quote))||(!c.passed&&!c.quote.trim())||typeof c.reason!=='string'||!c.reason.trim()||!Array.isArray(c.sourceIds)||c.sourceIds.some(id=>typeof id!=='string'||!sourceIds.has(id)))throw Error('Ungrounded or inconsistent dialogue rubric check.');
   seen.add(c.id);return {...c,sourceIds:[...c.sourceIds]};
  });
  const checks=CHECK_IDS.map(id=>supplied.find(c=>c.id===id));
  const violations=checks.filter(c=>!c.passed).map(c=>({claim:c.quote,rule:c.id,explanation:c.reason,sourceIds:[...c.sourceIds]}));
  return {version:VERSION,checks,supported:checks.every(c=>c.passed),violations};
 }
 const api=Object.freeze({VERSION,CHECK_IDS,PRESENTATION_REVIEW_RULE,normalize});
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.LabDialogueRubricCore=api;
})(typeof window!=='undefined'?window:globalThis);
