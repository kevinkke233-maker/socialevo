// Structural boundary for the semantic QA Agent, never a phrase classifier.
(function(root){
 'use strict';
 const VERSION='lab-semantic-dialogue-qa-v2';
 const KINDS=new Set(['fact','question','request','proposal','commitment','opinion','uncertainty']);
 const TARGET_MAP={submission:'player_submission',original:'source_document',history:'spoken_claim',current_action:'current_event',role:'actor_role',conversation:'conversation'};
 const TARGETS=new Set(Object.values(TARGET_MAP));
 const VERDICTS=new Set(['supported','unsupported','unanswerable','not_factual']);
 const AUTHORITY={player_document:['submission'],source_document:['original','limits'],navigation:['navigation','world'],role:['role','original','limits'],event:['world','current_player_message','current_question','current_incident','workspace_write','submission'],attributed_speech:['history','private_owner_history','conditional_scene','current_player_message','current_question'],world:['original','limits','world','role','current_incident']};
 function exact(v,keys,label){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join(',')!==keys.slice().sort().join(','))throw Error(label+' has invalid fields.');}
 function normalize(value,{candidate,sources=[]}){
  exact(value,['speechActs','continuity','provenance'],'Semantic QA');
  if(!Array.isArray(value.speechActs)||!value.speechActs.length||value.speechActs.length>8)throw Error('Semantic QA needs1–8 speech acts.');
  const ids=new Set(sources.map(s=>s.id)),byId=new Map(sources.map(s=>[s.id,s]));
  const speechActs=value.speechActs.map(input=>{
   exact(input,['quote','kind','target','verdict','sourceIds','reason'],'QA speech act');
   const a={...input,target:TARGET_MAP[input.target]||input.target};
   exact(a,['quote','kind','target','verdict','sourceIds','reason'],'QA speech act');
   if(typeof a.quote!=='string'||!a.quote.trim()||!candidate.includes(a.quote)||!KINDS.has(a.kind)||!TARGETS.has(a.target)||!VERDICTS.has(a.verdict)||typeof a.reason!=='string'||!a.reason.trim()||!Array.isArray(a.sourceIds)||a.sourceIds.some(id=>typeof id!=='string'||!ids.has(id)))throw Error('Ungrounded QA act.');
   if(a.kind==='fact'&&!['supported','unsupported'].includes(a.verdict))throw Error('A fact needs a factual verdict.');
   if(['proposal','commitment','opinion','uncertainty'].includes(a.kind)&&a.verdict!=='not_factual')throw Error('A proposal/stance is not an assertion of performed work.');
   if(['request','question'].includes(a.kind)&&!['not_factual','unanswerable'].includes(a.verdict))throw Error('A request/question is not a past-work claim.');
   if(a.kind==='fact'&&a.verdict==='supported'&&!a.sourceIds.length)throw Error('Supported factual claim needs a supplied source.');
   if(a.kind==='fact'&&a.verdict==='supported'&&a.target==='player_submission'&&a.sourceIds.some(id=>byId.get(id).kind!=='submission'))throw Error('Only exact submission sources can establish filled player-written contents; history/advice cannot edit a note.');
   if(a.kind==='fact'&&a.verdict==='supported'&&a.target==='source_document'&&(!a.sourceIds.some(id=>['original','limits'].includes(byId.get(id).kind))||a.sourceIds.some(id=>!['original','limits','navigation'].includes(byId.get(id).kind))))throw Error('Original contents need original/limits evidence; navigation may only accompany location, never testimony.');
   return {...a,sourceIds:[...a.sourceIds]};
  });
  // This independent semantic assessment covers factual premises even inside
  // praise, questions or opinions. No speech-act label waives provenance.
  exact(value.provenance,['complete','assertions'],'QA provenance');
  if(value.provenance.complete!==true||!Array.isArray(value.provenance.assertions)||value.provenance.assertions.length>12)throw Error('QA must assess the complete candidate provenance.');
  const assertions=value.provenance.assertions.map(a=>{
   exact(a,['quote','scope','verdict','sourceIds','reason',...(Object.prototype.hasOwnProperty.call(a,'documentId')?['documentId']:[])],'QA provenance assertion');
   if(typeof a.quote!=='string'||!a.quote.trim()||!candidate.includes(a.quote)||!Object.prototype.hasOwnProperty.call(AUTHORITY,a.scope)||!['supported','unsupported'].includes(a.verdict)||!Array.isArray(a.sourceIds)||a.sourceIds.some(id=>typeof id!=='string'||!ids.has(id))||(a.documentId!==undefined&&typeof a.documentId!=='string')||typeof a.reason!=='string'||!a.reason.trim())throw Error('Ungrounded QA provenance assertion.');
   if(a.verdict==='supported'){
    if(!a.sourceIds.length||a.sourceIds.some(id=>!AUTHORITY[a.scope].includes(byId.get(id).kind)))throw Error('QA provenance scope '+a.scope+' allows '+AUTHORITY[a.scope].join('/')+' not supplied '+a.sourceIds.map(id=>byId.get(id).kind).join('/')+'. File location/existence/absence is navigation, not document contents. Reassess SAME words; do not change their truth.');
    if(['player_document','source_document'].includes(a.scope)){
     const primary=a.scope==='player_document'?'submission':'original';
     const bound=a.sourceIds.map(id=>byId.get(id)).filter(s=>s.kind===primary&&s.documentId===a.documentId);
     // Multiple current notes may literally contain identical text. Extra
     // citations of that SAME text cannot add fields to the identified note.
     const foreign=a.sourceIds.map(id=>byId.get(id)).filter(s=>s.kind===primary&&s.documentId!==a.documentId);
     if(!a.documentId||!bound.length||foreign.some(s=>primary!=='submission'||!bound.some(b=>b.text===s.text)))throw Error('QA document assertion must bind the exact supplied current document; different text cannot substitute.');
    }else if(a.documentId&&!a.sourceIds.some(id=>byId.get(id).documentId===a.documentId||(a.scope==='navigation'&&(byId.get(id).documentIds||[]).includes(a.documentId))))throw Error('A referenced document ID must be supplied by the cited authoritative sources.');
   }
   return {...a,sourceIds:[...a.sourceIds]};
  });
  for(const a of speechActs.filter(a=>a.kind==='fact'))if(!assertions.some(p=>p.quote.includes(a.quote)||a.quote.includes(p.quote)))throw Error('A factual speech act lacks an independent provenance assessment.');
  exact(value.continuity,['valid','quote','reason'],'QA continuity');
  const c=value.continuity;
  if(typeof c.valid!=='boolean'||typeof c.quote!=='string'||typeof c.reason!=='string'||!c.reason.trim()||c.quote&&!candidate.includes(c.quote)||!c.valid&&!c.quote.trim())throw Error('Ungrounded QA continuity.');
  const violations=speechActs.filter(a=>['unsupported','unanswerable'].includes(a.verdict)).map(a=>({claim:a.quote,rule:a.verdict,explanation:a.reason,sourceIds:a.sourceIds}));
  for(const a of assertions.filter(a=>a.verdict==='unsupported'))violations.push({claim:a.quote,rule:'provenance',explanation:a.reason,sourceIds:a.sourceIds});
  if(!c.valid)violations.push({claim:c.quote,rule:'continuity',explanation:c.reason,sourceIds:[]});
  return {version:VERSION,speechActs,provenance:{complete:true,assertions},continuity:{...c},supported:!violations.length,violations};
 }
 const api=Object.freeze({VERSION,normalize});if(typeof module==='object'&&module.exports)module.exports=api;root.LabDialogueQaCore=api;
})(typeof window!=='undefined'?window:globalThis);
