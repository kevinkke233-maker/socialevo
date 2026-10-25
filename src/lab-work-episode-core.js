// Stage 3/4 route receipts, not additional progression or success requirements.
(function(root){
 'use strict';
 const VERSION='lab-work-episodes-v2-report-revision';
 const Review=root.LabReviewEpisodeCore||(typeof require==='function'?require('./lab-review-episode-core.js'):null);
 const Narrative=root.LabNarrativeCore||(typeof require==='function'?require('./lab-narrative-core.js'):null);
 function project({epoch,stageId,events=[],artifacts=[],anchor=null,anchorSteps=null,pendingCore=null,question=null,ready=false}={}){
  const spec={stage_3_revision_conflict:{taskId:'revision_plan',anchorId:'return_blame'},stage_4_credit:{taskId:'contribution_statement',anchorId:'final_check'}}[stageId];if(!spec)return null;
  const byId=new Map(events.filter(e=>e.sessionEpoch===epoch&&e.status==='committed'&&e.audience?.visibility==='group').map(e=>[e.eventId,e]));
  const submission=Review.submissions({epoch,events,artifacts}).filter(a=>a.taskId===spec.taskId).at(-1)||null;
  const ae=anchor&&byId.get(anchor.eventId),steps=anchor?.stepEventIds?.map(id=>byId.get(id));
  const required=Narrative.ANCHORS[spec.anchorId],artifactMatch=!required.taskId||anchor?.artifactId===submission?.id;
  const dynamic=Boolean(ae?.metadata?.anchorCastVersion),schedule=Array.isArray(anchorSteps)?anchorSteps:dynamic?[]:required.steps;
  const anchorPresented=Boolean(schedule.length&&artifactMatch&&ae?.type==='story_anchor'&&ae.metadata?.anchorId===spec.anchorId&&ae.metadata?.stageId===stageId&&ae.dialogueDeliveries?.length===schedule.length&&ae.dialogueDeliveries.every(d=>d.status==='delivered')&&steps?.length===schedule.length&&steps.every((e,i)=>e?.type==='story_anchor_step'&&e.metadata?.anchorId===spec.anchorId&&e.metadata?.stepIndex===i&&e.metadata?.readCompletedAt&&e.actors?.includes(schedule[i].npcId)&&(!dynamic||e.metadata.anchorCastHash===ae.metadata.anchorCastHash)&&schedule[i].moves.every(m=>e.metadata.moveEvidence?.[m]&&e.dialogueDeliveries?.some(d=>d.npcId===schedule[i].npcId&&d.status==='delivered'&&d.text.includes(e.metadata.moveEvidence[m])))));
  const qe=question&&question.epoch===epoch&&question.stageId===stageId&&byId.get(question.eventId);
  const activeQuestion=qe?.dialogueDeliveries?.some(d=>d.status==='delivered'&&d.npcId===question.npcId&&d.text===question.dialogue)?{eventId:qe.eventId,text:question.dialogue,speaker:question.npcName,npcId:question.npcId}:null;
  const ce=pendingCore?.stageId===stageId&&byId.get(pendingCore.eventId);
  const handoff=anchorPresented&&submission?.feedback.length&&ce?.type==='key_decision'&&ce.metadata?.stageId===stageId&&ce.dialogueDeliveries?.some(d=>d.status==='delivered'&&d.npcId)?{eventId:ce.eventId}:null;
  const phase=activeQuestion?'reply':handoff?'handoff':!submission?'draft':!submission.feedback.length?'feedback_pending':!anchorPresented?(stageId==='stage_3_revision_conflict'?'return_to_team':'final_check'):'discussion';
  return {version:VERSION,stageId,...spec,submission,anchorPresented,phase,question:activeQuestion,handoff,discussionReady:anchorPresented&&Boolean(submission?.feedback.length)&&Boolean(ready),
   rule:'Presentation of original work and incident receipts. No compulsory contact, successful grade, consensus, score, fixed day or new prerequisite. The report body is actual submitted text; a plan or requested edit is not an implemented revision. Roles require actual agreement. Preserve ordered report review and contribution stages.'};
 }
 const api=Object.freeze({VERSION,project});if(typeof module==='object'&&module.exports)module.exports=api;root.LabWorkEpisodeCore=api;
})(typeof window!=='undefined'?window:globalThis);
