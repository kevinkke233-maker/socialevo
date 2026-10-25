// Public, source-linked recap projection. Never serialize NPC state, private
// dialogue, free-text input, study labels or inferred social success to an image API.
(function(root) {
  'use strict';
  const VERSION = 'lab-recap-v2-cover';
  const STAGES = ['stage_1_entry','stage_2_first_failure','stage_3_revision_conflict','stage_4_credit'];
  const TASKS = ['', 'brief_review', 'revision_plan', 'contribution_statement'];
  const ANCHORS = ['', 'advisor_review', 'return_blame', 'final_check'];
  const NPCS = ['mina','riley','sam','leo','nora'];
  const ACTIONS = ['evidence_clarification','bounded_collaboration','passive_avoidance','overcommitment','blame_externalization','public_escalation','responsibility_visibility','credit_self_erasure','credit_overclaim','transparent_credit','other_social_action'];
  function project({epoch,events,completed,artifacts,anchors,delivery,outcome,sessionId}) {
    const valid = events.filter(e => e.sessionEpoch === epoch && e.status === 'committed' && e.audience?.visibility === 'group');
    const rows = STAGES.map((stageId,i) => {
      const c = completed.find(x => x.stageId === stageId);
      const core = c && valid.find(e => e.eventId === c.eventId && e.type === 'key_decision' && e.metadata?.stageId === stageId);
      const a = artifacts.filter(x => x.sourceTaskId === TASKS[i]).at(-1);
      const ae = a && valid.find(e => e.type === 'artifact_submission' && e.metadata?.artifactId === a.id && e.dialogueDeliveries?.some(d => d.channel === 'artifact_evaluation' && d.status === 'delivered'));
      const anchor = anchors[ANCHORS[i]];
      const event = anchor && valid.find(e => e.eventId === anchor.eventId && e.type === 'story_anchor');
      return {stageId,completed:Boolean(core),optionId:core?.metadata?.selectedOptionId || '',
        taskStatus:ae && ['accepted','needs_revision','rejected'].includes(a.status) ? a.status : 'not_submitted',
        anchorPresented:Boolean(event),sourceEventIds:[core?.eventId,ae?.eventId,event?.eventId].filter(Boolean)};
    });
    const publicEncounters=NPCS.flatMap(npcId=>{
      const sources=valid.filter(e=>e.type!=='story_anchor'&&e.dialogueDeliveries?.some(d=>d.npcId===npcId&&d.status==='delivered'));
      const turns=sources.reduce((n,e)=>n+e.dialogueDeliveries.filter(d=>d.npcId===npcId&&d.status==='delivered').length,0);
      return turns?[{npcId,turns:Math.min(turns,9999),sourceEventIds:sources.slice(-8).map(e=>e.eventId)}]:[];
    });
    const actions=rows.map(row=>{const core=valid.find(e=>e.type==='key_decision'&&e.eventId===row.sourceEventIds[0]);
      const code=core?.metadata?.actionClassification?.actionCode;
      return ACTIONS.includes(code)?code:'other_social_action';
    });
    const finished = rows.every(r => r.completed) && rows.slice(1).every(r => r.anchorPresented);
    return {version:VERSION,sessionId,stages:rows,publicEncounters,actions,
      ending:finished && ['success','partial_outcome','unhealthy_failure'].includes(outcome?.endType) ? outcome.endType : 'incomplete',
      delivery:finished && delivery?.submitted ? {day:delivery.submittedAtDay,onTime:Boolean(delivery.submittedOnTime)} : null};
  }
  const api = Object.freeze({VERSION,STAGES:Object.freeze(STAGES),NPCS:Object.freeze(NPCS),ACTIONS:Object.freeze(ACTIONS),project});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.LabRecapCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
