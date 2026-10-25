// Versioned shared report work. Pure data rules; no model, condition or score.
(function(root){
 'use strict';
 const VERSION='lab-project-workflow-v1';
 const copy=value=>JSON.parse(JSON.stringify(value));
 const hash=text=>{let h=2166136261;for(const c of String(text)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return 'report-'+(h>>>0).toString(16);};
 const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
 const body=sections=>sections.map(s=>`${s.title}\n${s.text}`).join('\n\n');
 function create({epoch,projectId,sections,maxBodyChars=4000}){
  if(!Number.isInteger(epoch)||!projectId||!Array.isArray(sections)||!sections.length||new Set(sections.map(s=>s.id)).size!==sections.length)throw TypeError('A current project and unique report sections are required.');
  const rows=sections.map(s=>{if(!s.id||typeof s.title!=='string'||typeof s.text!=='string')throw TypeError('Report sections require an identity, title and actual text.');return {id:s.id,title:s.title,text:s.text};});
  return {version:VERSION,epoch,projectId,maxBodyChars,initialBody:body(rows),draft:{sections:rows,savedAt:''},versions:[],adoptions:[],formalSubmission:null};
 }
 function save(state,sections,savedAt=''){
  if(state.formalSubmission)throw Error('The formally submitted report is locked.');
  if(!Array.isArray(sections)||sections.length!==state.draft.sections.length||sections.some((s,i)=>s.id!==state.draft.sections[i].id||typeof s.text!=='string'))throw TypeError('Save must contain the same report sections.');
  const next=copy(state);next.draft={sections:sections.map((s,i)=>({id:s.id,title:state.draft.sections[i].title,text:s.text})),savedAt};return next;
 }
 function capture(state,{taskId,eventId='',artifactId='',minute=0,unchangedAcknowledged=false}={}){
  if(!['brief_review','revision_plan'].includes(taskId))throw Error('Only actual reports enter report review.');
  const sections=copy(state.draft.sections),text=body(sections);
  if(!sections.some(s=>s.text.trim()))throw Error('Write report text before sending a version for review.');
  if(text.length>state.maxBodyChars)throw Error(`Report exceeds ${state.maxBodyChars} characters.`);
  const previous=state.versions.at(-1),unchanged=text===(previous?.body||state.initialBody);
  if(unchanged&&!unchangedAcknowledged)throw Error('Confirm explicitly that this version is being sent unchanged.');
  return freeze({versionId:eventId?'project-'+eventId:'pending-report',projectId:state.projectId,epoch:state.epoch,taskId,sourceEventId:eventId,artifactId,
   parentVersionId:previous?.versionId||'',sections,body:text,bodyHash:hash(text),unchanged,changedFromInitial:text!==state.initialBody,submittedAtMinutes:minute,adoptions:copy(state.adoptions)});
 }
 function reviewed(state,version,receipt){
  if(body(version.sections)!==version.body||hash(version.body)!==version.bodyHash||version.epoch!==state.epoch||version.projectId!==state.projectId||!version.sourceEventId||!version.artifactId||receipt.sourceEventId!==version.sourceEventId||receipt.artifactId!==version.artifactId||receipt.body!==version.body||!['accepted','needs_revision','rejected'].includes(receipt.status))throw Error('Review must bind the exact submitted report version.');
  if(state.versions.some(v=>v.versionId===version.versionId))throw Error('A report version can be recorded only once.');
  const next=copy(state);next.versions.push({...copy(version),status:receipt.status,feedbackText:String(receipt.feedbackText||'')});return next;
 }
 function canSubmit(state,{stageId,review,revisionReviewed=false,blamePresented=false}={}){
  if(state.formalSubmission)return {ok:false,reason:'already_submitted'};
  if(stageId!=='stage_3_revision_conflict')return {ok:false,reason:'stage_3_required'};
  if(!revisionReviewed||!blamePresented)return {ok:false,reason:'actual_revision_review_and_responsibility_discussion_required'};
  if(!review||review.taskId!=='revision_plan'||review.status!=='accepted'||review.body!==body(state.draft.sections)||!state.versions.some(v=>v.versionId===review.versionId&&v.sourceEventId===review.sourceEventId&&v.body===review.body&&v.status==='accepted'))return {ok:false,reason:'current_report_needs_actual_accepted_review'};
  return {ok:true,review};
 }
 function formal(state,context,{eventId,minute,day,onTime}){
  const eligible=canSubmit(state,context);if(!eligible.ok)throw Error(eligible.reason);
  if(!eventId||!Number.isInteger(minute)||minute<0||!Number.isInteger(day)||typeof onTime!=='boolean')throw TypeError('Actual submission identity and fixed game time are required.');
  if(day!==1+Math.floor(minute/480)||onTime!==(minute<7*480))throw Error('Formal delivery day and deadline status must match its fixed game minute.');
  const next=copy(state),v=eligible.review;
  next.formalSubmission={version:VERSION,eventId,projectId:state.projectId,epoch:state.epoch,versionId:v.versionId,reportVersionId:v.versionId,sourceEventId:eventId,submissionEventId:eventId,sourceReviewEventId:v.sourceEventId,artifactId:v.artifactId,reportArtifactId:v.artifactId,
   body:v.body,bodyHash:v.bodyHash,sections:copy(v.sections),submittedAtGameMinute:minute,submittedAtMinutes:minute,submittedAtDay:day,submittedOnTime:onTime,status:onTime?'on_time':'late'};
  return next;
 }
 const api=Object.freeze({VERSION,create,save,capture,reviewed,canSubmit,formal,body,hash});
 if(typeof module==='object'&&module.exports)module.exports=api;root.LabProjectWorkflowCore=api;
})(typeof globalThis==='object'?globalThis:this);
