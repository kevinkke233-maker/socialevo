// Optional correction of the same authored task, before its irreversible beat.
(function(root){
 'use strict';
 const VERSION='lab-work-revision-v1';
 const tasks={stage_2_first_failure:'brief_review',stage_3_revision_conflict:'revision_plan',stage_4_credit:'contribution_statement'};
 function eligibility({epoch,stageId,events=[],artifacts=[]}={}){
  const taskId=tasks[stageId];if(!taskId)return {allowed:false,reason:'no_current_task'};
  const committed=events.filter(e=>e.sessionEpoch===epoch&&e.status==='committed'),byId=new Map(committed.map(e=>[e.eventId,e]));
  if(committed.some(e=>e.type==='key_decision'&&e.metadata?.stageId===stageId))return {allowed:false,reason:'core_response_committed'};
  const anchorId=stageId==='stage_2_first_failure'?'advisor_review':stageId==='stage_4_credit'?'final_check':'';
  if(anchorId&&committed.some(e=>['story_anchor','story_anchor_step'].includes(e.type)&&e.metadata?.anchorId===anchorId))return {allowed:false,reason:'incident_started'};
  if(stageId==='stage_3_revision_conflict'&&!committed.some(e=>e.type==='story_anchor'&&e.metadata?.anchorId==='return_blame'))return {allowed:false,reason:'responsibility_incident_required'};
  const a=[...artifacts].reverse().find(a=>{const e=byId.get(a.sourceEventId);return a.sourceTaskId===taskId&&['accepted','needs_revision','rejected'].includes(a.status)&&e?.type==='artifact_submission'&&e.metadata?.artifactId===a.id&&e.metadata?.sourceTaskId===taskId&&e.audience?.visibility==='group'&&e.dialogueDeliveries?.some(d=>d.channel==='artifact_evaluation'&&d.status==='delivered'&&d.npcId);});
  if(!a)return {allowed:false,reason:'no_delivered_feedback'};
  if(a.status==='accepted')return {allowed:false,reason:'current_work_accepted',taskId,artifactId:a.id};
  return {allowed:true,taskId,artifactId:a.id,eventId:a.sourceEventId,selectedOptionId:byId.get(a.sourceEventId).metadata?.selectedOptionId||'',note:a.note||'',status:a.status};
 }
 function scoreDelta(report){const d=report?.dimensions||{},risk=Number(d.socialRisk||0),responsibility=Number(d.responsibilityHandling||0),contribution=Number(d.contributionVisibility||0),quality=Number(d.taskQuality??report?.overallScore??0),reasoning=Number(d.reasoningQuality??report?.overallScore??0);return {interpersonal:Math.round((responsibility+contribution-risk-100)/20),outcome:Math.round((quality+reasoning-100)/16)};}
 function replacementEffects(report,previous=null){const next=scoreDelta(report),old=previous?scoreDelta(previous):{interpersonal:0,outcome:0};return {interpersonal:next.interpersonal-old.interpersonal,outcome:next.outcome-old.outcome};}
 const api=Object.freeze({VERSION,eligibility,scoreDelta,replacementEffects});if(typeof module==='object'&&module.exports)module.exports=api;root.LabWorkRevisionCore=api;
})(typeof window!=='undefined'?window:globalThis);
