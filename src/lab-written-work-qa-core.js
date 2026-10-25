// Written-work QA structural contract only; no local linguistic classifier.
(function(root){
 'use strict';
 const VERSION='lab-written-work-qa-v2';
 function exact(value,keys,label){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!==keys.slice().sort().join(','))throw Error(label+' has invalid fields.');
 }
 function input({candidate,speakerId,speakerName,submissions,replyTo}){
  if([candidate,speakerId,speakerName].some(v=>typeof v!=='string'||!v.trim())||!Array.isArray(submissions)||!submissions.length)throw new TypeError('Written-work QA requires a complete candidate, speaker and current submissions.');
  const sourceDocuments=submissions.map(s=>{
   if(!s||typeof s.documentId!=='string'||!s.documentId.trim()||typeof s.actualSubmittedNote!=='string'||[s.title,s.taskId,s.status,s.selectedApproach].some(v=>v!==undefined&&typeof v!=='string'))throw new TypeError('Invalid current submitted document source.');
   return {documentId:s.documentId,title:s.title??'',taskId:s.taskId??'',status:s.status??'',note:s.actualSubmittedNote,selectedApproach:{intent:s.selectedApproach??''}};
  });
  const result={candidate,speakerId,speakerName,sourceDocuments};
  if(replyTo!==undefined){
   if(!replyTo||typeof replyTo!=='object'||Array.isArray(replyTo)||!['prepared_public_turn','player_message'].includes(replyTo.kind)||[replyTo.speakerId,replyTo.speakerName,replyTo.text].some(v=>typeof v!=='string'||!v.trim()))throw new TypeError('Invalid explicit written-work reply context.');
   // This is the explicit immediate reply target, solely for referent/quotation
   // resolution. It is never another submitted note or proof of completed work.
   result.replyTo={speakerId:replyTo.speakerId,speakerName:replyTo.speakerName,text:replyTo.text,kind:replyTo.kind};
  }
  return result;
 }
 function normalize(value,{candidate,sourceDocuments}){
  exact(value,['supported','violations'],'Written-work QA');
  if(typeof value.supported!=='boolean'||!Array.isArray(value.violations))throw Error('Invalid written-work QA verdict.');
  const ids=new Set(sourceDocuments.map(d=>d.documentId));
  const violations=value.violations.map(v=>{
   exact(v,['quote','reason','documentIds'],'Written-work QA violation');
   if(typeof v.quote!=='string'||!v.quote.trim()||!candidate.includes(v.quote)||typeof v.reason!=='string'||!v.reason.trim()||!Array.isArray(v.documentIds)||v.documentIds.some(id=>typeof id!=='string'||!ids.has(id)))throw Error('Ungrounded written-work QA violation.');
   return {...v,documentIds:[...v.documentIds]};
  });
  if(value.supported!==(violations.length===0))throw Error('Written-work QA supported must equal absence of violations.');
  return {version:VERSION,supported:value.supported,violations};
 }
 const api=Object.freeze({VERSION,input,normalize});
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.LabWrittenWorkQaCore=api;
})(typeof window!=='undefined'?window:globalThis);
