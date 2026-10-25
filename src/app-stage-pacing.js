// Content-readiness controller shared by product and server-assigned studies.
// No treatment, hidden appraisal, quota, grade threshold or elapsed-time gate.
const stageDirectorInflight = new Map();
let stageKeyLaunch = null;
let stageKeyResumeIntent = null;
let stagePacingCheckOwner = null;
function emptyStagePacingState() {
  return {version:SocialEvoCore.STAGE_PACING_VERSION,status:"exploring",report:null,error:"",completed:[],materialEvidence:[]};
}
function stagePacingState() {return state.stagePacing || (state.stagePacing=emptyStagePacingState());}
function stagePacingToken() {
  return `${state.sessionEpoch}:${state.sessionId}:${state.stageIndex}:${state.roundIndex}:${currentStage()?.id}`;
}
function resetStagePacingRuntime() {stageKeyLaunch=null;stageKeyResumeIntent=null;stagePacingCheckOwner=null;stageDirectorInflight.clear();}
async function resumeStageKeyAfterRecall(){const intent=stageKeyResumeIntent;stageKeyResumeIntent=null;if(!intent||intent.token!==stagePacingToken()||intent.revision!==stageMilestoneContext().revision||!stageKeyDecisionReady()||!stagePacingSafeToEnter())return false;return enterStageKeyDecision();}
function stageMilestoneContext() {
  const rule=SocialEvoCore.STAGE_MILESTONE_RULES.find(r=>r.stageId===currentStage()?.id);
  if(!rule) throw new Error("Unknown core stage.");
  const beats=state.storyBeatLedger.filter(b=>b.status==='committed'&&b.stageId===rule.stageId&&b.type!=='director_cue');
  const events=state.eventLedger.filter(e=>e.status==='committed'&&e.sessionEpoch===state.sessionEpoch);
  const opening=events.find(e=>e.type==='opening_response');
  const artifact=rule.requiredArtifactId?evaluatedWorkspaceSubmission(rule.requiredArtifactId):null;
  const artifactEvent=artifact&&events.find(e=>e.type==='artifact_submission'&&e.metadata?.sourceTaskId===rule.requiredArtifactId&&e.metadata?.artifactId===artifact.id);
  const feedbackDelivered=Boolean(artifactEvent?.dialogueDeliveries?.some(d=>d.channel==='artifact_evaluation'&&d.status==='delivered'));
  const prerequisites={
    ...(typeof labStoryPrerequisites==="function"?labStoryPrerequisites(rule.stageId):{}),
    narrative_work_timed:typeof currentLabTimingReady!=="function"||currentLabTimingReady(),
    ...(rule.requiresEntryScope ? {entry_scope_reviewed:events.some(e=>e.type==='shared_artifact_review'&&e.metadata?.documentId===ENTRY_SCOPE_DOCUMENT_ID)} : {}),
    stage_context_presented:beats.some(b=>b.type==='stage_context'&&b.visibility==='group'),
    opening_response_delivered:!rule.requiresOpeningResponse||Boolean(opening?.dialogueDeliveries?.some(d=>d.channel==='opening_response_npc'&&d.status==='delivered')),
    core_material_reviewed:!rule.requiresMaterial||stagePacingState().materialEvidence?.some(m=>m.documentId==='inherited-project-brief-v1')||state.storyBeatLedger.some(b=>b.status==='committed'&&b.type==='shared_material'&&b.focusTags?.includes('inherited-project-brief-v1')),
    core_task_evaluated:!rule.requiredArtifactId||Boolean(artifact),
    task_feedback_delivered:!rule.requiredArtifactId||feedbackDelivered
  };
  const evidence=beats.map(b=>({id:b.beatId,type:b.type,visibility:b.visibility,
    summary:b.visibility==='private'?(b.type==='private_consultation'?"The player received a private consultation; its words are not public.":"A private player activity occurred; no private words are available."):b.publicSummary}));
  if(opening) evidence.push({id:opening.eventId,type:'opening_response',visibility:'group',summary:'The player submitted the shared opening introduction; delivery is tracked in prerequisites.'});
  for(const d of artifactEvent?.dialogueDeliveries||[]) if(d.status==='delivered') evidence.push({id:d.deliveryId,type:d.channel,visibility:'group',summary:d.text});
  // Include delivered public wording, not just terse beat summaries. The
  // opening's actual task/boundary information must not disappear in a summary.
  for(const d of state.dialogueHistory.filter(d=>d.visibility==='group'&&d.actorId!=='controller'&&d.name!=='Game Master').slice(-16)) evidence.push({
    id:`dialogue-${SocialEvoCore.stableHash([d.name,d.text,d.timestamp])}`,type:'delivered_public_dialogue',visibility:'group',summary:`${d.name}: ${d.text}`});
  for(const item of stagePacingState().materialEvidence||[]) {
    const doc=(currentScenario().workspaceDocuments||[]).find(d=>d.id===item.documentId);
    if(doc?.knownByNpcIds?.length===state.npcs.length) evidence.push({id:item.eventId,type:'core_material',visibility:'group',presentationConfirmed:true,summary:
      `${state.language==='zh'?'实际界面展示记录（不是阅读理解或成员目击的推断）':'Confirmed player UI presentation (not comprehension or an NPC witness)'} · ${scenarioText(doc.title)}: ${(doc.sections||[]).map(s=>scenarioText(s.body)).join(' ')}`});
  }
  if(typeof labAnchorIdsForStage==='function')for(const id of labAnchorIdsForStage(rule.stageId)){const record=labAnchorRecord(id),event=record&&events.find(e=>e.eventId===record.eventId);
    for(const d of event?.dialogueDeliveries||[])if(d.status==='delivered')evidence.push({id:d.deliveryId,type:'required_story_anchor',visibility:'group',summary:`${d.speaker}: ${d.text}`});}
  if(typeof projectWorkflowEnabled==='function'&&projectWorkflowEnabled()){
    const submission=projectFormalSubmission(),result=typeof projectOutcomeReceipt==='function'?projectOutcomeReceipt():null;
    if(submission)evidence.push({id:submission.sourceEventId,type:'formal_project_submission',visibility:'group',summary:JSON.stringify(submission)});
    if(result)evidence.push({id:result.sourceEventId,type:'competition_result',visibility:'group',summary:result.text});
  }
  const publicEvidence=evidence.filter(e=>e.visibility==='group').map((e,index)=>({...e,sourceId:e.id,id:`evidence-${index+1}`}));
  // Private counts cannot become a proxy readiness signal, including alias
  // ordinals. Unchanged core/public inputs reuse the same grounded assessment.
  const revision=SocialEvoCore.stableHash(JSON.stringify({evidenceVersion:'material-presentation-v4-canonical-mainline',stage:rule.stageId,ids:publicEvidence.map(e=>e.sourceId),prerequisites,artifact:artifact&&{id:artifact.id,status:artifact.status,timestamp:artifact.timestamp}}));
  const arrival=beats.find(b=>b.type==='stage_context'&&b.visibility==='group'&&b.sourceEventId===`opening-${state.sessionId}`);
  const scope=events.find(e=>e.type==='shared_artifact_review'&&e.metadata?.documentId===ENTRY_SCOPE_DOCUMENT_ID);
  const entryPresentationProof=rule.stageId==='stage_1_entry'&&arrival&&scope&&publicEvidence.some(e=>e.type==='core_material'&&e.presentationConfirmed&&e.sourceId===scope.eventId)
    ? {arrivalId:arrival.beatId,scopeId:scope.eventId,rule:'Actual fixed arrival/roles and Starting scope have been presented. They establish a meaningful opportunity to PROPOSE boundaries, not a task assignment, agreement, understanding or completed review.'} : null;
  const anchorId=labAnchorIdForStage(rule.stageId),anchor=anchorId&&labAnchorRecord(anchorId);
  const anchorSources=anchor?publicEvidence.filter(e=>e.type==='required_story_anchor').map(e=>e.sourceId):[];
  const feedbackSources=(artifactEvent?.dialogueDeliveries||[]).filter(d=>d.status==='delivered'&&d.channel==='artifact_evaluation').map(d=>d.deliveryId);
  const mainlinePresentationProof=state.stageIndex>0&&anchor&&artifactEvent&&feedbackSources.length&&anchorSources.length
    ? {anchorId,anchorSources,feedbackSources,rule:'Actual evaluated work, delivered feedback, and the current mandatory ordered incident have been presented and read. This permits choosing HOW TO RESPOND, not proof that revision, consensus, data verification or recognition is already complete. Rejected/needs_revision work is a valid decision context; do not require a future-stage plan before offering its choice.'}:null;
  return {version:SocialEvoCore.STAGE_PACING_VERSION,stageId:rule.stageId,revision,
    stageGoal:scenarioText(currentStage().goal),requiredArtifactId:rule.requiredArtifactId,
    entryPresentationProof,mainlinePresentationProof,
    // A prospective decision frame explains what information is needed to
    // CHOOSE. It is not evidence that this choice, agreement or work happened.
    prospectiveDecisionFrame:(()=>{const w=getDecisionWindows().find(w=>w.stageId===rule.stageId);return w?{question:w.question,choices:w.options,notOccurred:true}:null;})(),
    semanticMilestones:[...rule.semanticMilestones,...(typeof labAnchorIdForStage==='function'&&labAnchorIdForStage(rule.stageId)?[LabNarrativeCore.ANCHORS[labAnchorIdForStage(rule.stageId)].milestone]:[])],prerequisites,
    hardReady:Object.values(prerequisites).every(Boolean),evidence:publicEvidence,publicEvidence};
}
function blindedStageMilestoneInput(context) {
  return {...context,mainlinePresentationProof:context.mainlinePresentationProof?{confirmed:true,anchorId:context.mainlinePresentationProof.anchorId,rule:context.mainlinePresentationProof.rule}:null,entryPresentationProof:context.entryPresentationProof?{confirmed:true,rule:context.entryPresentationProof.rule}:null,evidence:context.evidence.map(({sourceId,...e})=>e),publicEvidence:context.publicEvidence.map(({sourceId,...e})=>e)};
}
function stagePacingReportIsCurrent(report=stagePacingState().report) {
  return Boolean(report&&report.runtimeToken===stagePacingToken()&&report.contentRevision===stageMilestoneContext().revision&&
    !state.sessionClosed&&!state.apiFatalError&&!state.finalOutcome);
}
function stageKeyDecisionReady() {
  const p=stagePacingState();
  if (typeof entryEpisodeChoicePending==='function' && entryEpisodeChoicePending()) return false;
  return !p.pendingCoreEventId&&stagePacingReportIsCurrent(p.report)&&p.report.shouldTrigger&&stageMilestoneContext().hardReady&&
    !p.completed.some(item=>item.stageId===currentStage()?.id);
}
function stagePacingSafeToEnter() {
  if(typeof currentLabBridgeRecovery==='function'&&currentLabBridgeRecovery()?.kind==='assessment')return false;
  const voiceBusy=['loading','buffering','speaking'].includes(state.voiceModality?.status)&&state.voiceModality?.enabled;
  return !state.sessionClosed&&!state.apiFatalError&&!state.finalOutcome&&!state.dialogueAdvancePending&&!voiceBusy&&!state.activeEventLock&&!state.isIntroPlaying&&!state.isGmThinking&&
    !state.decisionPanelVisible&&!(typeof labStoryRuntime!=="undefined"&&labStoryRuntime)&&!labDayHandoff&&!isSideTalkOpen()&&!isBackpackOpen()&&!isTaskBoardOpen()&&
    !(typeof isPlayerToolOpen==='function'&&isPlayerToolOpen())&&
    (!state.isScenePlaying||(typeof isPrivateContinuationOpen==='function'&&isPrivateContinuationOpen()));
}
function stagePacingCheckInFlight() {
  if(state.screen!=='game'||state.sessionClosed||state.apiFatalError||state.finalOutcome||state.roundIndex>=scenarioStages().length)return false;
  return stageDirectorInflight.has(`${stagePacingToken()}:${stageMilestoneContext().revision}`);
}
function reconcileStagePacingChecking() {
  const p=stagePacingState();
  if(p.status!=='checking'||stagePacingCheckInFlight())return false;
  // A cancelled/stale/no-op assessment establishes no new readiness.
  p.status=p.error?'error':'exploring';return true;
}
function stageMissingRequiredMaterial() {
  const rule=SocialEvoCore.STAGE_MILESTONE_RULES.find(r=>r.stageId===currentStage()?.id),p=stagePacingState();
  if(!rule?.requiresMaterial||p.materialEvidence?.some(m=>m.documentId==='inherited-project-brief-v1')||state.storyBeatLedger.some(b=>b.status==='committed'&&b.type==='shared_material'&&b.focusTags?.includes('inherited-project-brief-v1')))return null;
  const doc=(currentScenario().workspaceDocuments||[]).find(d=>d.id==='inherited-project-brief-v1');
  return doc?{id:doc.id,title:scenarioText(doc.title)}:null;
}
function stageRequiredMaterialText(material=stageMissingRequiredMaterial()) {
  if(!material)return '';
  const taskId=SocialEvoCore.STAGE_MILESTONE_RULES.find(r=>r.stageId===currentStage()?.id)?.requiredArtifactId,reviewed=taskId&&evaluatedWorkspaceSubmission(taskId);
  const feedback=reviewed&&state.eventLedger.some(e=>e.sessionEpoch===state.sessionEpoch&&e.status==='committed'&&e.eventId===reviewed.sourceEventId&&e.dialogueDeliveries?.some(d=>d.channel==='artifact_evaluation'&&d.status==='delivered'));
  return (reviewed?(state.language==='zh'?(feedback?'报告已有反馈，提交和评价会保留。':'已提交的报告会保留。'):(feedback?'Your report feedback is saved. ':'Your submitted report is retained. ')):'')+
    (state.language==='zh'?`继续小组讨论前，请在材料包查看“${material.title}”。`:`Before the group discussion, open "${material.title}" in Work pack.`);
}
async function openStageRequiredMaterial() {
  const material=stageMissingRequiredMaterial(),token=stagePacingToken();
  if(!material||!stagePacingSafeToEnter())return false;
  const opened=await openBackpack('',{materialsOnly:true});
  if(!opened||token!==stagePacingToken()||!isBackpackOpen())return false;
  showWorkspaceDocument(material.id);return true;
}
function scheduleStageProgressCheck(source) {
  reconcileStagePacingChecking();
  if (typeof gameRecoveryNetworkPaused === "function" && gameRecoveryNetworkPaused("/api/chat")) return Promise.resolve(null);
  if (typeof entryEpisodeChoicePending==='function' && entryEpisodeChoicePending()) return Promise.resolve(null);
  if(state.sessionClosed||state.apiFatalError||state.finalOutcome||state.roundIndex>=scenarioStages().length) return Promise.resolve(null);
  const context=stageMilestoneContext();
  if(!context.prerequisites.stage_context_presented) return Promise.resolve(null);
  if (isEntryEpisodeStage() && !context.prerequisites.entry_scope_reviewed) {
    const p=stagePacingState();p.status="awaiting_entry_scope";p.report=null;p.error="";
    renderStagePacingControls();return Promise.resolve(null);
  }
  const token=stagePacingToken(),p=stagePacingState(),owner={token,revision:context.revision};
  stagePacingCheckOwner=owner;
  const assessment=assessGlobalStageProgress(source);
  if(stagePacingCheckInFlight()){p.status='checking';p.error='';}
  renderStagePacingControls();
  return assessment.then(report=>{
    if(stagePacingCheckOwner!==owner||token!==stagePacingToken()||!report||!stagePacingReportIsCurrent(report)) return null;
    const current=stagePacingState();current.report=report;current.error='';current.status=stagePacingCheckInFlight()?'checking':report.shouldTrigger?'ready':'exploring';renderStagePacingControls();
    const objective=document.getElementById('current-objective');if(objective) objective.textContent=nextStepText();
    if (isEntryEpisodeStage()) renderPlayerExperience();
    return report;
  }).catch(error=>{
    if(stagePacingCheckOwner!==owner||token!==stagePacingToken()||context.revision!==stageMilestoneContext().revision||state.sessionClosed||isStaleRequestError(error)) return null;
    const current=stagePacingState();current.report=null;current.status='error';current.error=shorten(String(error.message||error),180);
    state.log.push({type:'Stage readiness check failed',stageId:context.stageId,summary:current.error,timestamp:new Date().toISOString()});
    // A background failure NEVER manufactures readiness or interrupts audio.
    // The mainline remains locked and offers an explicit real-agent retry.
    renderStagePacingControls();renderResearchLog();return null;
  }).finally(()=>{
    if(stagePacingCheckOwner===owner)stagePacingCheckOwner=null;
    const changed=reconcileStagePacingChecking();
    if(state.screen!=='game'||state.sessionClosed||state.apiFatalError||state.finalOutcome)return;
    if(token===stagePacingToken()||changed){
      renderStagePacingControls();renderCurrentObjective();
      if(!state.activeEventLock&&!state.isScenePlaying&&!state.isGmThinking&&!state.dialogueAdvancePending)setWorldHelp(nextStepText());
    }
  });
}
function renderStagePacingControls() {
  const panel=document.getElementById('ui-stage-entry');if(!panel) return;
  reconcileStagePacingChecking();
  const p=stagePacingState(),zh=state.language==='zh',ready=stageKeyDecisionReady(),safe=stagePacingSafeToEnter(),material=stageMissingRequiredMaterial();
  const privateOpen=typeof isPrivateContinuationOpen==='function'&&isPrivateContinuationOpen();
  panel.hidden=state.screen!=='game'||!safe||privateOpen||(!ready&&p.status!=='error'&&!material);
  document.getElementById('ui-stage-entry-title').textContent=material?(zh?'查看讨论材料':'Review the discussion material'):(zh?'下一步讨论':'Next discussion');
  document.getElementById('ui-stage-entry-note').textContent=p.status==='error'
    ?(zh?'讨论暂时无法继续，请稍后重试。已有内容会保留。':'The discussion is temporarily unavailable. Please retry; your work is retained.')
    :material?stageRequiredMaterialText(material):(zh?'你也可以继续交流，准备好后再参加。':'You can keep talking and join when ready.');
  const materialButton=document.getElementById('ui-stage-material');materialButton.hidden=!material;materialButton.disabled=!safe||Boolean(stageKeyLaunch);
  materialButton.textContent=material?(zh?`打开“${material.title}”`:`Open "${material.title}"`):'';
  for(const button of document.querySelectorAll('[data-enter-stage-key]')) {
    button.textContent=zh?'参加小组讨论':'Join the group discussion';button.disabled=!ready||!safe||Boolean(stageKeyLaunch);
    if(button.id==='ui-private-key') button.hidden=!privateOpen||!ready;
  }
  document.getElementById('ui-stage-retry').hidden=p.status!=='error';
  document.getElementById('ui-stage-retry').textContent=zh?'重试继续讨论':'Retry the discussion';
  const privateRetry=document.getElementById('ui-private-retry');
  if(privateRetry) {privateRetry.hidden=!privateOpen||p.status!=='error';privateRetry.disabled=!safe;
    privateRetry.textContent=zh?'重试继续讨论':'Retry the discussion';}
  document.getElementById('ui-stage-key').hidden=!ready;
  if(typeof syncMainlineActionRail==='function')syncMainlineActionRail();
}
async function enterStageKeyDecision() {
  if(stageKeyLaunch||!stageKeyDecisionReady()||!stagePacingSafeToEnter()) return false;
  const token=stagePacingToken();stageKeyLaunch={token};
  if(typeof recordPrivateContinuationChoice==='function') recordPrivateContinuationChoice('enter_core_discussion');
  // Consuming an entry is NOT completing the stage. No choice is selected.
  if(typeof resetPrivateConversationRuntime==='function') resetPrivateConversationRuntime();
  state.isScenePlaying=false;
  try {return await maybeTriggerDecision('player accepted mainline entry',{enter:true});}
  finally {if(stageKeyLaunch?.token===token) stageKeyLaunch=null;updateWorldActivityClasses();renderStagePacingControls();}
}
function recordCoreStageCompletion(event) {
  if(event?.type!=='key_decision'||event.status!=='committed') throw new Error('Only a committed key choice can complete a stage.');
  if(event.sessionEpoch!==state.sessionEpoch||event.metadata?.stageId!==currentStage()?.id) throw new Error('A foreign or stale key choice cannot complete this stage.');
  const p=stagePacingState(),id=currentStage().id;
  if(p.completed.some(item=>item.stageId===id)) throw new Error('Core stage already completed.');
  if(!LabNarrativeCore.orderedFlow([...p.completed,{stageId:id}],{}).orderValid)throw Error('Core stages cannot be skipped or reordered.');
  if(Object.values(labStoryPrerequisites(id)).some(v=>!v))throw Error('Required story evidence missing.');
  p.completed.push({stageId:id,eventId:event.eventId,timestamp:new Date().toISOString()});p.status='completed';p.report=null;
}
function recordWorkspaceDocumentViewed(documentId) {
  const p=stagePacingState();p.materialEvidence ||= [];
  if(p.materialEvidence.some(m=>m.documentId===documentId)||state.sessionClosed||state.apiFatalError) return;
  const doc=(currentScenario().workspaceDocuments||[]).find(d=>d.id===documentId);if(!doc) return;
  if (documentId===ENTRY_SCOPE_DOCUMENT_ID) {entryEpisodeState().scopeReviewed=true;entryEpisodeState().guide="dismissed";}
  const event=createRuntimeEvent('shared_artifact_review',{actors:['player'],audience:{visibility:'private',npcIds:[]},metadata:{documentId,source:'visible_workspace_document'}});
  SocialEvoCore.transitionEvent(event,'validated',{});SocialEvoCore.transitionEvent(event,'committed',{npcIds:[]});
  p.materialEvidence.push({documentId,eventId:event.eventId,timestamp:new Date().toISOString()});
  recordStoryBeat({type:'shared_material',sourceEventId:event.eventId,visibility:'private',actors:['player'],
    publicSummary:scenarioText(doc.title),focusTags:[documentId,'visible_document'],attentionFact:{
      question:state.language==='zh'?'你刚才查看了哪份材料？':'Which material did you view?',correctAnswer:scenarioText(doc.title),
      distractors:state.projectTasks.map(t=>localizedTaskField(t,'title')).filter(t=>normalizeDialogueLine(t)!==normalizeDialogueLine(scenarioText(doc.title))).slice(0,3)}});
  void scheduleStageProgressCheck('core material viewed');
  if (isEntryEpisodeStage()) {setWorldHelp(entryEpisodeNextAction());renderCurrentObjective();renderPlayerExperience();}
}
function initializeStagePacingControls() {
  const panel=document.createElement('section');panel.id='ui-stage-entry';panel.hidden=true;
  panel.innerHTML='<strong id="ui-stage-entry-title"></strong><p id="ui-stage-entry-note"></p><button id="ui-stage-material" type="button" hidden></button><button id="ui-stage-key" data-enter-stage-key type="button"></button><button id="ui-stage-retry" type="button" hidden></button>';
  document.getElementById('pixel-world').append(panel);
  document.getElementById('ui-stage-key').onclick=enterStageKeyDecision;
  document.getElementById('ui-stage-material').onclick=openStageRequiredMaterial;
  document.getElementById('ui-stage-retry').onclick=()=>scheduleStageProgressCheck('player requested readiness retry');
}
initializeStagePacingControls();
