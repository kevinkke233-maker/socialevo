// Incident QA structural contract only. Meaning is judged by the Agent, not
// wording, pronoun patterns, sentiment or a local incident classifier.
(function(root){
 'use strict';
 const VERSION='lab-incident-role-qa-v1';
 const RULES=new Set(['owner_misbound','possibility_as_fact','unestablished_time','unclear_addressee','assumed_prior_reaction']);
 function exact(value,keys,label){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!==keys.slice().sort().join(','))throw Error(label+' has invalid fields.');
 }
 function input({candidate,speakerId,speakerName,incident,incidentRoleFacts,independentFirstReaction=false}){
  const facts=incidentRoleFacts;
  if([candidate,speakerId,speakerName,incident].some(v=>typeof v!=='string'||!v.trim())||!facts||typeof facts!=='object'||Array.isArray(facts)||facts.reviewWindowOwner!=='player'||typeof independentFirstReaction!=='boolean')throw new TypeError('Incident QA requires an actual cue, speaker and explicit player-owned review window.');
  const projected={reviewWindowOwner:facts.reviewWindowOwner};
  for(const key of ['observedFacts','possibleCauses','unestablishedFacts']){
   if(!Array.isArray(facts[key])||!facts[key].length||facts[key].some(v=>typeof v!=='string'||!v.trim()))throw new TypeError('Incident QA requires explicit '+key+'.');
   projected[key]=[...facts[key]];
  }
  if(facts.legacyFileOwner!==undefined){
   if(typeof facts.legacyFileOwner!=='string'||!facts.legacyFileOwner.trim())throw new TypeError('Invalid incident legacy file owner.');
   projected.legacyFileOwner=facts.legacyFileOwner;
  }
  return {candidate,speakerId,speakerName,incident,incidentRoleFacts:projected,independentFirstReaction};
 }
 function normalize(value,{candidate}){
  exact(value,['supported','violations'],'Incident QA');
  if(typeof value.supported!=='boolean'||!Array.isArray(value.violations)||value.violations.length>5)throw Error('Invalid incident QA verdict.');
  const violations=value.violations.map(v=>{
   exact(v,['quote','rule','reason'],'Incident QA violation');
   if(typeof v.quote!=='string'||!v.quote.trim()||!candidate.includes(v.quote)||!RULES.has(v.rule)||typeof v.reason!=='string'||!v.reason.trim())throw Error('Ungrounded incident QA violation.');
   return {...v};
  });
  if(value.supported!==(violations.length===0))throw Error('Incident QA supported must equal absence of violations.');
  return {version:VERSION,supported:value.supported,violations};
 }
 const api=Object.freeze({VERSION,input,normalize});
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.LabIncidentQaCore=api;
})(typeof window!=='undefined'?window:globalThis);
