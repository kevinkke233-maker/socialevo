// Natural private conversation in both product and formal study sessions.
// Shared core milestones, variable realized interactions. Never reads condition.
const PRIVATE_CONVERSATION_STAGE_LIMIT = null;
let privateConversationPending = null, privateContinuationVisible = false;
let privateConversationApproachSequence = 0;

function privateConversationCommittedTurns() {
  return state.eventLedger.filter(event=>event.type==='private_chat'&&event.status==='committed'&&
    event.sessionEpoch===state.sessionEpoch&&event.metadata?.stageId===currentStage()?.id).length;
}
function privateConversationBudgetSnapshot() {
  return {version:'private-continuity-v4-reentry',productStageSendLimit:null,
    studyContinuationsEnabled:true,studyExposure:'shared_core_milestones_variable_interactions',
    currentStageCommittedSends:privateConversationCommittedTurns()};
}
function privateConversationBudgetReached() {
  return false;
}
function privateBudgetRequiresDecision(progress=storyBeatProgressForStage()) {
  // Compatibility diagnostic only. A conversation quota never unlocks a stage.
  return false;
}
function isPrivateContinuationOpen() {return privateContinuationVisible;}
function canContinuePrivateConversation() {
  return !state.apiFatalError&&!state.sessionClosed&&!state.finalOutcome;
}
function isPrivateDialogueActive() {return privateConversationPendingIsCurrent() || Boolean(npcContactRuntime);}
function renderPrivateConversationControls() {
  const panel=document.getElementById('ui-private-continuation');if(!panel) return;
  if(privateConversationPending&&!privateConversationPendingIsCurrent()) {privateConversationPending=null;privateContinuationVisible=false;}
  const zh=state.language==='zh';panel.hidden=!privateContinuationVisible;
  document.getElementById('ui-private-caption').textContent=zh?'继续单独交流':'Continue this private conversation';
  document.getElementById('ui-private-note').textContent=zh?'这里的话不会作为群体可见对白。':'These words are not group-visible dialogue.';
  const question=privateConversationPending&&isPlayerDirectedQuestion(privateConversationPending.result.dialogue,privateConversationPending.npcId);
  const replySource=question?replyOptionsSource(privateConversationPending.event.eventId,privateConversationPending.npcId,privateConversationPending.result.dialogue):null;
  const choices=replyOptionsRows(replySource);if(replySource&&privateContinuationVisible)requestReplyOptions(replySource);
  replyOptionsStatus(document.getElementById('ui-private-options-status'),replySource);
  document.getElementById('ui-private-ask').textContent=choices.length?(zh?'自定义回答':'Custom reply'):question?(zh?'回答对方':'Respond to them'):(zh?'继续聊':'Keep talking');
  const replies=document.getElementById('ui-private-reply-choices'),key=privateConversationPendingIsCurrent()?`${privateConversationPending.event.eventId}:${state.language}:${replyOptionsEntry(replySource)?.status||'none'}`:'';
  if(replies&&replies.dataset.sourceKey!==key){replies.replaceChildren();replies.dataset.sourceKey=key;for(const c of choices){const b=document.createElement('button');b.type='button';b.textContent=c.label;b.dataset.privateReply='true';b.onclick=()=>{if(privateConversationPendingIsCurrent()&&replyOptionsUiActive(replySource)&&privateConversationPending.event.eventId===replySource.eventId)resumePrivateConversation(false,c.utterance);};replies.append(b);}}
  if(replies)replies.hidden=!choices.length;
  document.getElementById('ui-private-topic').textContent=zh?'换话题':'Choose a new topic';
  document.getElementById('ui-private-end').textContent=zh?'结束交谈':'End conversation';
  if(typeof renderStagePacingControls==='function') renderStagePacingControls();
}
function resetPrivateConversationRuntime() {
  privateConversationApproachSequence += 1;
  privateConversationPending=null;privateContinuationVisible=false;cancelInactiveReplyOptionsRequests();renderPrivateConversationControls();
}
function privateConversationPendingIsCurrent() {
  const pending=privateConversationPending;
  return Boolean(pending&&pending.epoch===state.sessionEpoch&&pending.stageId===currentStage()?.id&&
    !state.sessionClosed&&!state.apiFatalError);
}
function offerPrivateConversationContinuation(npc,result,event) {
  // A committed turn retains its existing StoryBeat, memory, novelty and state
  // commit. No re-scoring, duplicate reward or synthetic NPC closing line.
  if(event?.sessionEpoch!==state.sessionEpoch||event?.metadata?.stageId!==currentStage()?.id||event?.status!=='committed')return false;
  if(!event.dialogueDeliveries?.some(d=>d.npcId===npc.id&&d.status==='delivered'&&d.text===result.dialogue))return false;
  if(!canContinuePrivateConversation()) {resetPrivateConversationRuntime();return false;}
  privateConversationPending={npcId:npc.id,result,event,epoch:event.sessionEpoch,stageId:event.metadata.stageId};
  event.metadata.continuationOfferedAt ||= new Date().toISOString();
  privateContinuationVisible=true;renderPrivateConversationControls();return true;
}
function resumePrivateConversation(changeTopic=false,selectedReply=null) {
  if(!privateConversationPendingIsCurrent()||!canContinuePrivateConversation()) {finishPrivateConversation();return;}
  const pending=privateConversationPending,npc=state.npcs.find(item=>item.id===pending.npcId);
  if(!npc) {resetPrivateConversationRuntime();return;}
  const approachSequence=++privateConversationApproachSequence;
  const sideTalkOptions=!changeTopic?{continueThread:true,lastReply:pending.result.dialogue,selectedReply}:{newTopic:true};
  const isCurrent=()=>approachSequence===privateConversationApproachSequence&&privateConversationPending===pending&&privateConversationPendingIsCurrent()&&canContinuePrivateConversation()&&
    pending.epoch===state.sessionEpoch&&pending.stageId===currentStage()?.id&&state.npcs.includes(npc);
  recordPrivateContinuationChoice(changeTopic?'change_topic':'continue');
  privateContinuationVisible=false;renderPrivateConversationControls();
  state.isScenePlaying=false;updateWorldActivityClasses();
  if(!positionsWithin(state.playerPosition,npc.position,interactionRange)||!navigationTalkLineClear(state.playerPosition,npc.position,npc.id)){
    // Returning to work may have put this NPC beyond speaking distance. Carry
    // only this explicit continuation to the existing physical approach; no
    // draft is submitted and no response/options request starts on the walk.
    return approachNpcForConversation(npc,{sideTalkOptions,isCurrent}).then(result=>{
      if(!isCurrent())return;
      if(result.arrived&&isSideTalkOpen()&&state.activeSideTalkNpcId===npc.id){if(!changeTopic)document.getElementById('side-talk-input').focus({preventScroll:true});return;}
      if(!isSideTalkOpen()&&!state.activeEventLock&&!state.decisionPanelVisible){privateContinuationVisible=true;renderPrivateConversationControls();updateWorldActivityClasses();}
    });
  }
  openSideTalk(npc,sideTalkOptions);
  if(!isSideTalkOpen()) {finishPrivateConversation();return;}
  if(!changeTopic) document.getElementById('side-talk-input').focus({preventScroll:true});
}
function finishPrivateConversation() {
  const pending=privateConversationPending,valid=privateConversationPendingIsCurrent();
  if(valid) recordPrivateContinuationChoice('end');
  resetPrivateConversationRuntime();
  if(!valid) return;
  const npc=state.npcs.find(item=>item.id===pending.npcId);if(!npc) return;
  // Clear the pending handoff BEFORE any asynchronous group work, so End/Esc
  // cannot dispatch it twice. Public exchange still receives only its existing
  // bounded observable cue, not aggregated private transcripts.
  state.isScenePlaying=true;updateWorldActivityClasses();
  Promise.resolve(continueAfterSideTalk(npc,pending.result,pending.event)).catch(error=>{
    if(!isStaleRequestError(error)) stopForAgentFailure(error,'private conversation handoff');
  });
}
function recordPrivateContinuationChoice(action) {
  if(!privateConversationPendingIsCurrent()) return;
  const metadata=privateConversationPending.event.metadata;
  metadata.continuationActions ||= [];metadata.continuationActions.push({action,timestamp:new Date().toISOString()});
}
function onPrivateConversationDraftClosed() {
  if(privateConversationPending) finishPrivateConversation();
}
function initializePrivateConversationControls() {
  const world=document.getElementById('pixel-world');if(!world) return;
  const panel=document.createElement('section');panel.id='ui-private-continuation';panel.hidden=true;
  panel.setAttribute('aria-label','Private conversation actions');
  panel.innerHTML='<header><strong id="ui-private-caption"></strong><small id="ui-private-note"></small></header><p id="ui-private-options-status" hidden></p><div id="ui-private-reply-choices" hidden></div><div><button id="ui-private-ask" type="button"></button><button id="ui-private-topic" type="button"></button><button id="ui-private-key" data-enter-stage-key type="button" hidden></button><button id="ui-private-retry" type="button" hidden></button><button id="ui-private-end" type="button"></button></div>';
  world.append(panel);
  document.getElementById('ui-private-ask').onclick=()=>resumePrivateConversation(false);
  document.getElementById('ui-private-topic').onclick=()=>resumePrivateConversation(true);
  document.getElementById('ui-private-end').onclick=finishPrivateConversation;
  document.getElementById('ui-private-key').onclick=enterStageKeyDecision;
  document.getElementById('ui-private-retry').onclick=()=>scheduleStageProgressCheck('player requested private readiness retry');
  renderPrivateConversationControls();
}
initializePrivateConversationControls();
