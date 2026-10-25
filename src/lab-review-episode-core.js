// Stage 2 presentation projection. No new prerequisite, grade or time rule.
(function(root){
 'use strict';
 const VERSION='lab-review-episode-v1',STAGE='stage_2_first_failure';
 function submissions({epoch,events=[],artifacts=[]}={}){
  const byId=new Map(events.filter(e=>e.sessionEpoch===epoch&&e.status==='committed'&&e.type==='artifact_submission'&&e.audience?.visibility==='group').map(e=>[e.eventId,e]));
  return artifacts.flatMap(a=>{const e=byId.get(a.sourceEventId);if(!['brief_review','revision_plan','contribution_statement'].includes(a.sourceTaskId)||!e||e.metadata?.artifactId!==a.id||e.metadata?.sourceTaskId!==a.sourceTaskId||!['accepted','needs_revision','rejected'].includes(a.status))return [];
   return [{id:a.id,eventId:e.eventId,taskId:a.sourceTaskId,title:a.title||'',status:a.status,action:a.optionAction||a.selectedOption||'',note:a.note||'',
    feedback:(e.dialogueDeliveries||[]).filter(d=>d.status==='delivered'&&d.channel==='artifact_evaluation'&&d.npcId).map(d=>({speaker:d.speaker,npcId:d.npcId,text:d.text}))}];});
 }
 function project({epoch,stageId,events=[],artifacts=[],draft='',advisor=null,pendingCore=null,question=null,ready=false}={}){
  if(stageId!==STAGE)return null;
  const records=submissions({epoch,events,artifacts}),submission=records.filter(a=>a.taskId==='brief_review').at(-1)||null;
  const byId=new Map(events.filter(e=>e.sessionEpoch===epoch&&e.status==='committed'&&e.audience?.visibility==='group').map(e=>[e.eventId,e]));
  const qe=question&&question.epoch===epoch&&question.stageId===stageId&&byId.get(question.eventId);
  const activeQuestion=qe?.dialogueDeliveries?.some(d=>d.status==='delivered'&&d.npcId===question.npcId&&d.text===question.dialogue)?{npcId:question.npcId,speaker:question.npcName,text:question.dialogue,eventId:qe.eventId}:null;
  const ae=advisor&&submission&&advisor.artifactId===submission.id&&byId.get(advisor.eventId);
  const steps=advisor?.stepEventIds?.map(id=>byId.get(id)),moves=[['work_received'],['critical_issue','revision_request']];
  // Same actual step/read receipts as the existing anchor, not a new gate.
  const advisorPresented=Boolean(ae?.type==='story_anchor'&&ae.metadata?.anchorId==='advisor_review'&&ae.dialogueDeliveries?.length===2&&ae.dialogueDeliveries.every(d=>d.status==='delivered')&&steps?.length===2&&steps.every((e,i)=>e?.type==='story_anchor_step'&&e.metadata?.anchorId==='advisor_review'&&e.metadata?.stepIndex===i&&e.metadata?.readCompletedAt&&moves[i].every(m=>e.metadata.moveEvidence?.[m]&&e.dialogueDeliveries?.some(d=>d.status==='delivered'&&d.text.includes(e.metadata.moveEvidence[m])))));
  const ce=pendingCore?.stageId===stageId&&byId.get(pendingCore.eventId);
  const handoff=advisorPresented&&ce?.type==='key_decision'&&ce.dialogueDeliveries?.some(d=>d.status==='delivered'&&d.npcId)?{eventId:ce.eventId}:null;
  const materialPresented=events.some(e=>e.sessionEpoch===epoch&&e.status==='committed'&&e.type==='shared_artifact_review'&&e.metadata?.documentId==='inherited-project-brief-v1');
  const hasDraft=typeof draft==='string'&&Boolean(draft.trim());
  const phase=activeQuestion?'reply':handoff?'handoff':advisorPresented?'discussion':submission?.feedback.length?'advisor':submission?'feedback_pending':hasDraft||materialPresented?'draft':'orient';
  return {version:VERSION,phase,materialPresented,hasDraft,submission,advisorPresented,handoff,question:activeQuestion,discussionReady:advisorPresented&&Boolean(ready),
   steps:[{id:'materials',done:materialPresented},{id:'draft',done:Boolean(submission),draftOnly:hasDraft&&!submission},{id:'feedback',done:Boolean(submission?.feedback.length)},{id:'advisor',done:advisorPresented},{id:'discussion',done:Boolean(handoff)},{id:'handoff',done:false}],
   rule:'These are presentation receipts, not comprehension, good grades, consensus or new gates. Exploration order and consultation count remain free. All original stages, actions, task rubrics and mandatory incidents remain authoritative.'};
 }
 const api=Object.freeze({VERSION,STAGE,submissions,project});if(typeof module!=='undefined'&&module.exports)module.exports=api;root.LabReviewEpisodeCore=api;
})(typeof window!=='undefined'?window:globalThis);
