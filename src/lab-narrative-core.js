// Shared fictional-clock/ordered-story rules. No model, condition or NPC scores.
(function(root){
  'use strict';
  const VERSION='lab-narrative-v3-dynamic-participation',DAY_MINUTES=480,DEADLINE_DAYS=7;
  const STAGES=Object.freeze(['stage_1_entry','stage_2_first_failure','stage_3_revision_conflict','stage_4_credit']);
  function freezeTree(value){if(value&&typeof value==='object'){Object.values(value).forEach(freezeTree);Object.freeze(value);}return value;}
  const ANCHORS=freezeTree({
    advisor_review:{stageId:STAGES[1],taskId:'brief_review',parent:'',milestone:'advisor_critique_and_revision_visible',steps:[
      {npcId:'mina',moves:['work_received'],directive:'Acknowledge actually looking at the submitted review and inherited brief. State one grounded observation. This is a receipt, not another introduction; no question before the project lead speaks.'},
      {npcId:'riley',moves:['critical_issue','revision_request'],directive:'Deliver the advisor/project-lead criticism and require revision of the inherited project. Name a concrete supplied evidence/writing limitation sharply but respectfully. A competent review does NOT fix the inherited manuscript: acknowledge good player reasoning when supported, but criticize the unresolved project claim and request a bounded revision. Do not falsely lower the independent grade or claim a competent review is wrong. A final direct question is optional.'}
    ]},
    revision_review:{stageId:STAGES[2],taskId:'revision_plan',parent:'advisor_review',milestone:'revised_report_reviewed_again',steps:[
      {npcId:'mina',moves:['work_received'],directive:'Read the actual revised report version and compare it with the first submitted report and the actual earlier feedback. Name a real change, or explicitly acknowledge that the report was sent unchanged. A selected approach or a promise is not an edit. Do not invent a defect or ask a question before the project lead speaks.'},
      {npcId:'riley',moves:['critical_issue','revision_request'],directive:'Conduct the SECOND advisor review of the actual revised report. Speak sharply but respectfully about a specific remaining report defect, or scrutinize a genuine study limitation if the report already meets its criteria. Acknowledge correct changes and preserve the recorded grade. Request a bounded correction or a defensible explanation of the limitation, never invent an error to manufacture failure or require new experiments. This pressure precedes the return-to-team responsibility dispute.'}
    ]},
    return_blame:{stageId:STAGES[2],taskId:'',parent:'revision_review',milestone:'blame_pressure_and_ownership_visible',steps:[
      {npcId:'sam',moves:['responsibility_pressure'],directive:'After the SECOND advisor review, the team argues about responsibility for the old report and current revisions. Explicitly voice or acknowledge pressure to make the newcomer carry inherited responsibility. React as Kai from your actual persona and accessible history: endorse, hedge, resist or repair that transfer. Your data-preparation role is reason enough to join even if you have never spoken directly with the player. Do not invent an earlier chat, agreement, completed work or unanimous blame. A direct player reply may be invited.'},
      {npcId:'nora',moves:['responsibility_response'],directive:'Join the dispute because your report-wording and coordination role is implicated, regardless of whether you spoke with the player in stages 1 or 2. Respond to the actual review and Kai’s public words as Emma: explain your own scope, defend yourself, support the newcomer, hedge or challenge a blame claim as your persona/history supports. If this is a first direct exchange, use a natural role-based entry; never pretend you previously discussed something with the player or know another person’s private chat. Do not force hostility or consensus.'}
    ]},
    final_check:{stageId:STAGES[3],taskId:'contribution_statement',parent:'return_blame',milestone:'actual_work_and_credit_checked',steps:[
      {npcId:'mina',moves:['actual_work_check'],directive:'Review the actual formally submitted report version, delivered competition result and contribution statement. Distinguish the newcomer’s actual edits, adopted colleague wording and earlier project work. Do not turn a plan, suggestion or rejected draft into completed work. Refer to an award only when the supplied result receipt actually grants it. No question before the contribution check follows.'},
      {npcId:'nora',moves:['credit_check'],directive:'Raise the final contribution/credit check based on work actually recorded: what belongs to the newcomer, what predates them, and what responsibility remains. Keep Emma’s own guarded/supportive stance from history; do not guarantee recognition or erase the newcomer. Do not invent work or private disclosures. A final player question is optional.'}
    ]}
  });
  // Authored steps above remain the historical receipt schema. New social
  // discussions bind these same required meanings to an episode-specific cast.
  const CAST_VERSION='lab-anchor-cast-v1';
  function dynamicCastAnchor(id){return id==='return_blame'||id==='final_check';}
  function normalizeCastPlan(value,eligibleIds){
    if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='reason,responderIds'||
      !Array.isArray(value.responderIds)||!value.responderIds.length||value.responderIds.length>5||
      value.responderIds.some(id=>typeof id!=='string'||!eligibleIds.includes(id))||new Set(value.responderIds).size!==value.responderIds.length||
      typeof value.reason!=='string'||!value.reason.trim())throw Error('Story cast needs one to five unique eligible speakers and a grounded reason.');
    return freezeTree({responderIds:[...value.responderIds],reason:value.reason.trim()});
  }
  function castSteps(id,plan){
    if(!dynamicCastAnchor(id))throw Error('Teacher review speakers are authored, not dynamically cast.');
    const ids=plan.responderIds;
    return freezeTree(ids.map((npcId,i)=>{
      const moves=id==='return_blame'?(i===0?['responsibility_pressure']:['responsibility_response']):(i===0?['actual_work_check']:['credit_check']);
      if(ids.length===1)moves.push(id==='return_blame'?'responsibility_response':'credit_check');
      const directive=id==='return_blame'?
        'After the actual second advisor review, address responsibility for the inherited report and current revisions from your own project role, persona, current relationship and strategy. The opening speaker must make the responsibility boundary explicit: old responsibility may be pushed onto the newcomer, resisted, or fairly allocated without accusing anyone of pressure that never occurred. Later speakers respond to the actual public words and may protect themselves, challenge, support or clarify their own scope. Do not manufacture hostility, agreement, changed attitudes, earlier contact or private knowledge. A project role is sufficient to join without earlier direct contact. A direct player reply may be invited.':
        'Review the actual formally submitted report, delivered competition result and contribution statement from your own role and current stance. Distinguish the newcomer’s recorded edits, adopted colleague wording and earlier project work. Discuss how those contributions should appear in the supplied public-facing presentation; supporting, guarding your interests, disputing or clarifying are all possible when grounded. Do not manufacture hostility, consensus, completed work, changed attitudes, private disclosure or an award absent its receipt. Joining does not require earlier direct contact. A direct player reply may be invited.';
      return {npcId,moves,directive:directive+(i<ids.length-1?' Do not ask a direct player question before the remaining members have spoken.':'')};
    }));
  }
  function policyFor(event){
    if(event.type==='artifact_submission'&&event.metadata?.projectReportVersion)return event.metadata.sourceTaskId==='brief_review'?{min:240,max:480}:{min:60,max:240};
    if(event.type==='artifact_submission')return ({brief_review:{min:480,max:960},revision_plan:{min:720,max:1440},contribution_statement:{min:60,max:240}})[event.metadata?.sourceTaskId]||null;
    if(event.type==='key_decision')return {min:30,max:360};
    if(event.type==='story_anchor')return {min:30,max:150};
    return null;
  }
  function speechMinutes(text){const s=String(text||'');const zh=(s.match(/[\u3400-\u9fff]/g)||[]).length,words=(s.match(/[A-Za-z]+/g)||[]).length;return s.trim()?Math.max(1,Math.ceil(zh/70+words/35)):0;}
  function clockAt(minutes){
    if(!Number.isInteger(minutes)||minutes<0)throw Error('Fictional clock requires nonnegative whole minutes.');
    const day=1+Math.floor(minutes/DAY_MINUTES),part=minutes%DAY_MINUTES;
    return {day,minuteOfDay:part,time:`${String(9+Math.floor(part/60)).padStart(2,'0')}:${String(part%60).padStart(2,'0')}`,
      deadlineDay:DEADLINE_DAYS,deadlineMinutes:DAY_MINUTES*DEADLINE_DAYS,overdue:minutes>=DAY_MINUTES*DEADLINE_DAYS,
      remainingMinutes:Math.max(0,DAY_MINUTES*DEADLINE_DAYS-minutes)};
  }
  function normalizeTime(value,input){
    if(!value||Object.keys(value).sort().join(',')!=='evidence,minutes,reason')throw Error('Time report must have exactly minutes, reason, evidence.');
    if(!Number.isInteger(value.minutes)||value.minutes<input.policy.min||value.minutes>input.policy.max)throw Error('Narrative estimate is outside the shared action range.');
    if(typeof value.reason!=='string'||!value.reason.trim())throw Error('A time estimate needs a reason.');
    if(!Array.isArray(value.evidence)||!value.evidence.length)throw Error('A time estimate needs actual source evidence.');
    const evidence=value.evidence.map(e=>{if(!e||Object.keys(e).sort().join(',')!=='id,quote')throw Error('Time evidence shape invalid.');
      const source=input.evidence.find(x=>x.id===e.id);if(!source||typeof e.quote!=='string'||!e.quote.trim()||!source.text.includes(e.quote))throw Error('Timing evidence quote was not supplied.');return {id:e.id,quote:e.quote};});
    return {minutes:value.minutes,reason:value.reason.trim(),evidence};
  }
  function orderedFlow(completed,anchors){
    const ids=completed.map(x=>typeof x==='string'?x:x.stageId);
    const orderValid=ids.every((id,i)=>id===STAGES[i])&&ids.length<=4;
    const allAnchors=Object.keys(ANCHORS).every(id=>anchors[id]);
    return {orderValid,completedStages:ids,allAnchors,terminalAllowed:orderValid&&ids.length===4&&allAnchors};
  }
  function deliveryAt(minutes,artifacts){return {submitted:true,submittedAtMinutes:minutes,submittedAtDay:clockAt(minutes).day,
    submittedOnTime:minutes<DAY_MINUTES*DEADLINE_DAYS,status:minutes<DAY_MINUTES*DEADLINE_DAYS?'on_time':'late',
    artifacts:artifacts.map(a=>({id:a.id,taskId:a.sourceTaskId,status:a.status})),automaticDraftSubmission:false};}
  const api=Object.freeze({VERSION,DAY_MINUTES,DEADLINE_DAYS,STAGES,ANCHORS,CAST_VERSION,dynamicCastAnchor,normalizeCastPlan,castSteps,policyFor,speechMinutes,clockAt,normalizeTime,orderedFlow,deliveryAt});
  if(typeof module==='object'&&module.exports)module.exports=api;else root.LabNarrativeCore=api;
})(typeof window!=='undefined'?window:globalThis);
