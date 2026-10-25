// Durable game recovery is a local state reconstruction, never an agent turn.
const GAME_RECOVERY_VERSION = 'paired-game-recovery-v1';
const gameRecoveryRuntime = {restoring:false,paused:false,result:null,globals:null,dialog:null,suppressedReplyKeys:new Set()};

function gameRecoveryNetworkPaused(url) {
  return (gameRecoveryRuntime.restoring || gameRecoveryRuntime.paused ||
    typeof studyAccountAuthenticationPaused==='function'&&studyAccountAuthenticationPaused() ||
    typeof studyAccountPasswordSetupPaused==='function'&&studyAccountPasswordSetupPaused() ||
    typeof studyPairRuntime!=='undefined' && studyPairRuntime.checkpointConflict) &&
    /\/api\/(?:chat|tts|vision|recap-image)(?:[/?]|$)/.test(String(url));
}
function recoveryJson(value) {
  return JSON.parse(JSON.stringify(value, (key, item) => {
    if (['__proto__','prototype','constructor','controller','promise','resolve','reject','timeoutId'].includes(key)) return undefined;
    if (item instanceof Map) return {recoveryMap:[...item.entries()]};
    if (item instanceof Set) return {recoverySet:[...item]};
    if (typeof item === 'function' || item instanceof Promise || item instanceof AbortController || item instanceof Element) return undefined;
    return item;
  }));
}
function recoveryRevive(value) {
  if (!value || typeof value !== 'object') return value;
  if (value instanceof Map) return new Map([...value].map(([k,v])=>[k,recoveryRevive(v)]));
  if (value instanceof Set) return new Set([...value].map(recoveryRevive));
  if (Array.isArray(value)) return value.map(recoveryRevive);
  if (Object.keys(value).length === 1 && Array.isArray(value.recoveryMap)) return new Map(value.recoveryMap.map(([k,v])=>[k,recoveryRevive(v)]));
  if (Object.keys(value).length === 1 && Array.isArray(value.recoverySet)) return new Set(value.recoverySet.map(recoveryRevive));
  return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,recoveryRevive(v)]));
}
function recoveryElementValue(id) {return document.getElementById(id)?.value || '';}
function captureGameRuntimeCheckpoint() {
  if (!studyPairRequested() || !state.sessionId || !state.researchProfile?.pairId) return null;
  const privatePending = typeof privateConversationPending === 'undefined' || !privateConversationPendingIsCurrent() ? null : privateConversationPending;
  const story = typeof labStoryRuntime === 'undefined' ? null : labStoryRuntime;
  const globals = recoveryJson({
    openingQuestion: typeof openingQuestionPending === 'undefined' || !openingQuestionIsCurrent() ? null : openingQuestionPending,
    privatePending: privatePending ? {npcId:privatePending.npcId,result:privatePending.result,eventId:privatePending.event?.eventId,
      epoch:privatePending.epoch,stageId:privatePending.stageId,visible:privateContinuationVisible} : null,
    privateDrafts: typeof privateComposerDrafts === 'undefined' ? [] : [...privateComposerDrafts],
    cooperationNotes: typeof cooperationNotes === 'undefined' ? [] : [...cooperationNotes],
    replyOptions: typeof replyOptionsCache === 'undefined' ? [] : [...replyOptionsCache].filter(([,e])=>e.status==='ready').map(([key,e])=>[key,{source:e.source,status:e.status,result:e.result}]),
    story: story ? {id:story.id,key:story.key,npcId:story.npcId,eventId:story.event?.eventId} : null,
    storyFailure: typeof labStoryFailure === 'undefined' || labStoryFailure?.epoch!==state.sessionEpoch || labStoryFailure?.stageId!==currentStage()?.id ? null : labStoryFailure,
    relationshipProbe: typeof relationshipProbeRecovery === 'undefined' || relationshipProbeRecovery?.epoch!==state.sessionEpoch || relationshipProbeRecovery?.token!==stagePacingToken() ? null : relationshipProbeRecovery,
    outcomeTransition: typeof projectOutcomeTransition === 'undefined' || !projectOutcomeTransition ? null : {phase:projectOutcomeTransition.phase,result:projectOutcomeTransition.result},
    workspaceTab: typeof workspaceTab === 'undefined' ? 'current' : workspaceTab,
    computerOpen: typeof isBackpackOpen === 'function' && isBackpackOpen(),
    privateComposer: {open:typeof isSideTalkOpen === 'function' && isSideTalkOpen(),npcId:state.activeSideTalkNpcId,
      text:recoveryElementValue('side-talk-input'),title:document.getElementById('side-talk-title')?.textContent||''},
    freeResponse: recoveryElementValue('free-response'),
    responseEditorOpen: !document.getElementById('ui-response-editor')?.hidden,
    playerOwnDraft: typeof playerOwnDraft === 'undefined' ? '' : playerOwnDraft,
    artifactDraft: recoveryElementValue('artifact-draft-input'),
    activeRequests: typeof activeRequestRegistry === 'undefined' ? [] : [...activeRequestRegistry.values()].map(r=>({callId:r.callId,eventId:r.eventId,agentPurpose:r.agentPurpose,startedAt:r.startedAt}))
    ,counters:{projectReportTaskSequence,creditEntrySequence,sideTalkComposerSequence,sideTalkTopicSequence,laptopTaskPreparationSequence}
  });
  return GameRecoveryCore.capture(state, globals);
}

function restoreRecoveryGlobals(globals = {}) {
  const counters=globals.counters||{},taskPrefix=`project-task-${state.sessionId}-`;
  const taskIds=[state.activeArtifactTask?.id,...state.submittedArtifacts.map(a=>a.id),...state.eventLedger.map(e=>e.metadata?.artifactId)];
  const taskMaximum=Math.max(0,...taskIds.filter(id=>typeof id==='string'&&id.startsWith(taskPrefix)).map(id=>Number(id.slice(taskPrefix.length))).filter(Number.isSafeInteger));
  const creditIds=JSON.stringify(state.creditWorkflow||{}).match(/credit-entry-\d+/g)||[];
  projectReportTaskSequence=Math.max(taskMaximum,Number(counters.projectReportTaskSequence)||0);
  creditEntrySequence=Math.max(0,...creditIds.map(id=>Number(id.slice('credit-entry-'.length))),Number(counters.creditEntrySequence)||0);
  sideTalkComposerSequence=Math.max(0,Number(counters.sideTalkComposerSequence)||0);
  sideTalkTopicSequence=Math.max(0,Number(counters.sideTalkTopicSequence)||0);
  laptopTaskPreparationSequence=Math.max(0,Number(counters.laptopTaskPreparationSequence)||0);
  if (typeof openingQuestionPending !== 'undefined') openingQuestionPending = globals.openingQuestion ? recoveryRevive(globals.openingQuestion) : null;
  if (typeof privateComposerDrafts !== 'undefined') {privateComposerDrafts.clear();for (const [k,v] of globals.privateDrafts||[]) privateComposerDrafts.set(k,v);}
  if (typeof cooperationNotes !== 'undefined') {cooperationNotes.clear();for (const [k,v] of globals.cooperationNotes||[]) cooperationNotes.set(k,v);}
  if (typeof replyOptionsCache !== 'undefined') {
    replyOptionsCache.clear();
    for (const [key,entry] of globals.replyOptions||[]) {
      if (entry.status === 'ready' && entry.source?.epoch === state.sessionEpoch && entry.result) replyOptionsCache.set(key,{...entry,controller:new AbortController()});
    }
  }
  if (typeof privateConversationPending !== 'undefined') {
    const p = globals.privatePending, event = p && state.eventLedger.find(e=>e.eventId===p.eventId && e.status==='committed');
    privateConversationPending = event ? {...p,event} : null;
    privateContinuationVisible = Boolean(privateConversationPending && p.visible);
  }
  if (typeof labStoryRuntime !== 'undefined') labStoryRuntime = null;
  if (typeof labStoryFailure !== 'undefined') labStoryFailure = globals.storyFailure || (globals.story ? {
    epoch:state.sessionEpoch,stageId:currentStage()?.id,id:globals.story.id,key:globals.story.key,errorCode:'page_reloaded'
  } : null);
  if (typeof relationshipProbeRecovery !== 'undefined') {
    const p = globals.relationshipProbe ? recoveryRevive(globals.relationshipProbe) : null;
    if (p) {p.busy=false;p.event=state.eventLedger.find(e=>e.eventId===p.event?.eventId)||null;p.inputs=p.inputs instanceof Map?p.inputs:new Map();p.ready=p.ready instanceof Map?p.ready:new Map();}
    relationshipProbeRecovery = p;
  }
  if (typeof playerOwnDraft !== 'undefined') playerOwnDraft = globals.playerOwnDraft || globals.freeResponse || '';
  gameRecoveryRuntime.suppressedReplyKeys.clear();
  for (const p of [globals.openingQuestion,globals.privatePending]) {
    if (!p) continue;
    const source=replyOptionsSource(p.eventId,p.npcId,p.dialogue||p.result?.dialogue||'');
    if(source && !replyOptionsCache.has(source.key)) gameRecoveryRuntime.suppressedReplyKeys.add(source.key);
  }
}
function gameRecoverySuppressAutomaticReplyOptions(source,retry) {
  if(!source?.key || !gameRecoveryRuntime.suppressedReplyKeys.has(source.key))return false;
  if(retry===true){gameRecoveryRuntime.suppressedReplyKeys.delete(source.key);return false;}
  return true;
}

function renderRecoveredDialogue() {
  const feed = document.getElementById('dialogue-feed');
  if (!feed) return;
  feed.replaceChildren();
  for (const entry of state.dialogueHistory) {
    const article=document.createElement('article');article.className='message';
    const body=document.createElement('div');body.className='message-body';
    const name=document.createElement('strong');name.textContent=speakerDisplayName(entry.name||entry.speaker||'');
    const text=document.createElement('p');text.textContent=entry.text||'';body.append(name,text);article.append(body);feed.append(article);
  }
  const last=state.dialogueHistory.at(-1);
  if (last) showGalgameDialogue(last.name||last.speaker||'',last.text||'',last.emotion||'neutral',last.tone||'neutral');
}

function recoverControllerIntents(source) {
  const story=labStoryState(),token=stagePacingToken();
  for(const pending of [story.pendingAssessment,story.pendingBridge])if(pending)pending.busy=false;
  // Intent receipts added before each await make the normal path lossless. For
  // old paired saves, bind a missing intent only to an actual committed core
  // and its unchanged authored choice catalogue, never a guessed player answer.
  const completed=stagePacingState().completed||[],coreId=completed.at(-1)?.eventId;
  const core=state.eventLedger.find(e=>e.eventId===coreId&&e.type==='key_decision'&&e.status==='committed');
  if(!core)return;
  const hasContext=state.storyBeatLedger.some(b=>b.type==='stage_context'&&b.stageId===currentStage()?.id&&b.status==='committed');
  const assessment=state.eventLedger.filter(e=>e.type==='gm_end_assessment'&&e.metadata?.sourceEventId===core.eventId).at(-1);
  let window=core.metadata.recoveryDecisionWindow||state.pendingPostDecisionContinuation?.window||story.pendingBridge?.window||story.pendingAssessment?.window;
  if(!window && source.reproducibility?.scenarioHash===SocialEvoCore.stableHash(currentScenario())) {
    window=getDecisionWindows()[core.metadata.roundIndex];
    if(window)state.log.push({type:'Legacy recovery deviation',sourceEventId:core.eventId,detail:'Missing decision panel recovered from the identical authored catalogue; original player utterance retained.',timestamp:new Date().toISOString()});
  }
  const decision=core.metadata.playerDecision;
  if(!window || typeof decision!=='string' || !decision.trim())return;
  if(state.roundIndex>=getDecisionWindows().length && assessment?.status==='committed' &&
    state.latestGoalAssessment?.shouldEnd===true && !state.finalOutcome && labNormalEndingAllowed()) {
    const pending=state.pendingTerminalOutcome||{endAssessment:state.latestGoalAssessment,endingDecision:decision,
      endingRound:window.type,sourceEventId:core.eventId};
    state.pendingTerminalOutcome=pending;
    story.pendingBridge={kind:'probe',epoch:state.sessionEpoch,token,sourceEventId:core.eventId,pendingTerminal:pending,busy:false,errorCode:'reload_interrupted'};
    if(!relationshipProbeRecovery && state.relationshipTransferProbe && !['complete','completed'].includes(state.relationshipTransferProbe.status)) {
      const event=state.eventLedger.find(e=>e.eventId===state.relationshipTransferProbe.eventId);
      const cue=event?.dialogueDeliveries?.find(d=>d.status==='delivered'&&d.channel==='relationship_transfer_cue');
      const spec=relationshipTransferProbeSpec();
      if(event && cue && spec && !event.dialogueDeliveries.some(d=>d.npcId&&d.status==='delivered')) {
        relationshipProbeRecovery={epoch:state.sessionEpoch,token,sourceEventId:core.eventId,probeId:spec.id,cue:cue.text,
          pending,startedAt:state.relationshipTransferProbe.startedAt,busy:false,
          cueDelivery:{eventId:event.eventId,deliveryId:cue.deliveryId},inputs:new Map(),ready:new Map(),event};
      }
    }
    return;
  }
  if(!story.pendingAssessment && assessment && ['pending','validated','failed'].includes(assessment.status)) {
    story.pendingAssessment={kind:'assessment',epoch:state.sessionEpoch,token,sourceEventId:core.eventId,decision,window,busy:false,errorCode:'reload_interrupted'};
  } else if(!hasContext && state.stageIndex>0 && !story.pendingAssessment && !story.pendingBridge &&
    (assessment?.status==='committed' || state.pendingPostDecisionContinuation)) {
    story.pendingBridge={epoch:state.sessionEpoch,token,sourceEventId:core.eventId,decision,window,busy:false,errorCode:'reload_interrupted'};
  }
  if(hasContext && story.pendingBridge && story.pendingBridge.kind!=='probe') {
    // A delivered stage context is already in the original ledger. The lost
    // read-animation Promise must not regenerate that framing or re-charge it.
    story.pendingBridge=null;state.pendingPostDecisionContinuation=null;
  }
}
function restoreRecoveryInputs(globals = {}) {
  const selected=state.selectedOptionIndex, decision=state.pendingDecision;
  if (decision && state.decisionPanelVisible) {
    renderDecisionPanel(decision);setDecisionPanelVisible(true);
    if (Number.isInteger(selected) && selected>=0) document.querySelectorAll('#decision-options .option-btn')[selected]?.click();
    const free=document.getElementById('free-response'), editor=document.getElementById('ui-response-editor');
    if (free) free.value=globals.freeResponse||'';
    if (editor && (globals.responseEditorOpen || !decision.options?.length)) {
      editor.hidden=false;document.getElementById('decision-options').hidden=true;document.getElementById('ui-own-reply').hidden=true;
    }
    syncDecisionSubmitButton();
  }
  const composer=globals.privateComposer;
  if (composer?.open && state.npcs.some(n=>n.id===composer.npcId)) {
    state.activeSideTalkNpcId=composer.npcId;
    const panel=document.getElementById('side-talk-panel');panel.classList.remove('panel-hidden');
    document.getElementById('side-talk-title').textContent=composer.title||t('talkWith',state.npcs.find(n=>n.id===composer.npcId).name);
    document.getElementById('side-talk-input').value=composer.text||'';
    const options=document.getElementById('side-talk-options');options.replaceChildren();options.setAttribute('aria-busy','false');
    const note=document.createElement('p');note.textContent=state.language==='zh'?'已恢复未发送的草稿。请确认后再发送。':'Your unsent draft is restored. Send it when ready.';options.append(note);
    syncSideTalkSendButton();
  }
}

function gameRecoveryShowNotice(result) {
  const zh=state.language==='zh';
  let dialog=document.getElementById('game-recovery-dialog');
  if (!dialog) {
    dialog=document.createElement('dialog');dialog.id='game-recovery-dialog';dialog.className='project-info-dialog';
    const content=document.createElement('div');content.className='project-info-content';
    const title=document.createElement('h2');title.id='game-recovery-title';
    const note=document.createElement('p');note.id='game-recovery-note';
    const button=document.createElement('button');button.type='button';button.className='primary-btn full-width';button.id='game-recovery-continue';
    button.onclick=()=>void continueRecoveredGame();content.append(title,note,button);dialog.append(content);document.body.append(dialog);
    dialog.addEventListener('cancel',e=>e.preventDefault());
  }
  document.getElementById('game-recovery-title').textContent=zh?'游戏进度已恢复':'Your game is restored';
  const savedAt=result.reference?.receivedAt||result.reference?.capturedAt||result.reference?.createdAt||'';
  const older=result.technicalStop?.usable===false&&result.technicalStop?.newerThanSource===true;
  const gap=older?(zh?'较新的中断记录不完整，本次恢复的是更早可验证的保存点；最后几步可能需要重新操作。':'A newer interruption record is incomplete. This restores an earlier verifiable save; the last few actions may need to be repeated.'):
    (zh?'未确认保存的最后几步可能需要重新操作。':'The last unsaved actions may need to be repeated.');
  const continuation=result.artifactPlayback?(zh?'已有反馈尚未读完，继续时会显示保存的原反馈，不会重新送审。':'A saved response is unfinished. Continuing displays that original response without submitting or grading again.'):
    result.interrupted?.requiresManualContinuation?(zh?'上次有步骤未完成。可手动重试可核对的步骤；无法核对的内容请联系研究者。':'Some steps were unfinished. Retry steps that can be verified; contact the researcher for any step that cannot be verified.') : '';
  document.getElementById('game-recovery-note').textContent=zh?
    `已找回${studyPairLabel()}可验证保存的进度、对话和报告。${savedAt?'保存时间：'+savedAt+'。':''}刷新前尚未确认的回复不会自动重新请求。${continuation}${gap}`:
    `Verifiably saved progress, dialogue and report for ${studyPairLabel()} are restored. ${savedAt?'Saved at '+savedAt+'. ':''}Unconfirmed replies are not requested again automatically. ${continuation} ${gap}`;
  document.getElementById('game-recovery-continue').textContent=zh?'继续游戏':'Continue game';
  gameRecoveryRuntime.dialog=dialog;dialog.showModal();
}

function showGameRecoveryConflict() {
  gameRecoveryRuntime.paused=true;
  if(typeof stopPlayerNavigation==='function')stopPlayerNavigation('newer_saved_progress');
  if(typeof abortAllActiveRequests==='function')abortAllActiveRequests('newer_saved_progress');
  gameRecoveryRuntime.dialog?.close();
  let dialog=document.getElementById('game-recovery-conflict-dialog');
  if(!dialog){
    dialog=document.createElement('dialog');dialog.id='game-recovery-conflict-dialog';dialog.className='project-info-dialog';
    const content=document.createElement('div');content.className='project-info-content';
    const title=document.createElement('h2');title.id='game-recovery-conflict-title';
    const note=document.createElement('p');note.id='game-recovery-conflict-note';
    const button=document.createElement('button');button.type='button';button.id='game-recovery-conflict-continue';button.className='primary-btn full-width';
    button.onclick=()=>window.location.reload();content.append(title,note,button);dialog.append(content);document.body.append(dialog);
    dialog.addEventListener('cancel',event=>event.preventDefault());
  }
  const zh=state.language==='zh';
  document.getElementById('game-recovery-conflict-title').textContent=zh?'服务器已有更新的进度':'Newer progress is saved';
  document.getElementById('game-recovery-conflict-note').textContent=zh?
    '本页已暂停，避免覆盖已保存的记录。点击重试恢复会重新载入页面，读取同一编号最新保存的进度；不会自动重新发送人物回复。':
    'This page is paused to protect the saved record. Retry recovery reloads the page and reads the latest saved progress for this code. NPC replies are not requested again automatically.';
  document.getElementById('game-recovery-conflict-continue').textContent=zh?'重试恢复':'Retry recovery';
  if(!dialog.open)dialog.showModal();
}

async function restoreStudyPairGame(payload) {
  if (gameRecoveryRuntime.restoring) throw Error('Recovery is already in progress.');
  gameRecoveryRuntime.restoring=true;gameRecoveryRuntime.paused=true;
  try {
    const source=payload?.recovery?.export;
    const voiceRequested=Boolean(state.voiceModality.requested);
    const profile=normalizeServerStudyProfile(payload);
    const prepared=GameRecoveryCore.prepare(source,payload.pair,profile);
    // There are no live callbacks to resume after a page reload. Stop any local
    // setup request before binding the exact saved session; do not begin a new one.
    abortAllActiveRequests('game_recovery');cancelScheduledWork();
    if (typeof stopPlayerNavigation==='function')stopPlayerNavigation('game_recovery');
    for (const fn of [resetReplyOptionsRuntime,resetLabStoryRuntime,resetLabDayRuntime,resetProjectOutcomeRuntime,resetCreditWorkflowRuntime,resetLabRoutineRuntime,resetStagePacingRuntime,resetPrivateConversationRuntime,resetOpeningQuestionRuntime,resetVoiceRuntimeForNewSession]) fn();
    let manifest=state.runtimeManifest;
    if(typeof requestRuntimeManifest==='function')manifest=await requestRuntimeManifest();
    Object.assign(state,prepared.state);
    state.researchProfile=profile;state.runtimeManifest=manifest;
    state.studyPair={pairId:payload.pair.pairId,participantId:payload.pair.participantId,currentGame:payload.pair.currentGame,status:payload.pair.status};
    state.adminMode=false;state.configAdminUnlocked=false;state.sessionAdminModeAtStart=false;
    state.briefAcknowledged=true;
    Object.assign(state.voiceModality,{enabled:false,requested:voiceRequested,configured:Boolean(manifest.voice?.configured),
      availability:manifest.voice?.configured?'ready':'not_configured',provider:manifest.voice?.provider||'dashscope',
      engine:manifest.voice?.engine||'qwen-flash',model:manifest.voice?.model||'',dependencyReady:manifest.voice?.dependencyReady!==false,
      paraphrase:Boolean(manifest.voice?.paraphrase),requestTimeoutMs:manifest.voice?.requestTimeoutMs||45000,
      generationStreaming:manifest.voice?.streaming!==false});
    state.videoModality.enabled=false;state.videoModality.requested=false;
    const globals=recoveryRevive(prepared.globals||{});restoreRecoveryGlobals(globals);
    studyPairRestoreCollection(source,payload.recovery);
    const game=payload.pair.games[payload.pair.currentGame],summary=Boolean(game.completed&&game.saved&&state.finalOutcome);
    state.screen=summary?'summary':'game';
    if(!summary && !state.pendingDecision && !getDecisionWindows()[state.roundIndex])state.pendingDecision=state.pendingTerminalOutcome?.window||getDecisionWindows().at(-1);
    state.log.push({type:'Game restored',version:GAME_RECOVERY_VERSION,source:payload.recovery.source,sourceHash:payload.recovery.reference?.sha256,
      legacy:prepared.legacy,interrupted:prepared.interrupted,originalBuild:source.buildVersion,resumedBuild:BUILD_VERSION,timestamp:new Date().toISOString()});
    gameRecoveryRuntime.globals=globals;gameRecoveryRuntime.result={screen:summary?'summary':'game',legacy:prepared.legacy,interrupted:prepared.interrupted,reference:payload.recovery.reference,technicalStop:payload.recovery.technicalStop||null};
    applyLanguage({renderScreen:false});
    if (summary) {
      state.sessionClosed=true;
      if(studyPairRuntime.terminalRecord)state.terminalExports=[studyPairRuntime.terminalRecord];
      if(typeof studyQuestionnaireOnSummary==='function')studyQuestionnaireOnSummary();
      gameRecoveryRuntime.paused=false;showSummary({restored:true});
    } else {
      state.sessionClosed=false;state.terminalExports=[];state.terminalExportKeys=[];
      if(typeof restoreSavedArtifactPlayback==='function')gameRecoveryRuntime.result.artifactPlayback=restoreSavedArtifactPlayback(source,prepared.interrupted);
      recoverControllerIntents(source);
      if(!state.pendingDecision && !getDecisionWindows()[state.roundIndex])state.pendingDecision=state.pendingTerminalOutcome?.window||getDecisionWindows().at(-1);
      // Lost timing Promises must become an explicit retry, rather than an
      // invisible prerequisite that blocks the rest of the game forever.
      for(const event of state.eventLedger)if(event.status==='committed'&&event.metadata?.stageId===currentStage()?.id&&
        LabNarrativeCore.policyFor(event)&&labSourceTimingReady(event)&&!labClockHasSource(event.eventId)) {
        labClock().errors[event.eventId]=state.language==='zh'?'刷新前的工作时间尚未确认，请手动重试。':'Work timing was not confirmed before the reload. Retry explicitly.';
      }
      showScreen('game');renderGame();renderRecoveredDialogue();restoreRecoveryInputs(globals);updateWorldActivityClasses();
      gameRecoveryShowNotice(gameRecoveryRuntime.result);
    }
    return gameRecoveryRuntime.result;
  } catch(error) {
    gameRecoveryRuntime.paused=false;gameRecoveryRuntime.result=null;
    throw error;
  } finally {gameRecoveryRuntime.restoring=false;}
}

async function continueRecoveredGame() {
  if(gameRecoveryRuntime.restoring)return;
  gameRecoveryRuntime.dialog?.close();
  // The click permits local playback, but never replays an unknown provider request.
  if(typeof prepareGameAudioGesture==='function')prepareGameAudioGesture();
  gameRecoveryRuntime.paused=false;
  if(typeof startVoiceModality==='function')startVoiceModality();
  const globals=gameRecoveryRuntime.globals||{};
  if(typeof savedArtifactPlaybackOwner!=='undefined'&&savedArtifactPlaybackOwner){
    try{await resumeSavedArtifactPlayback();}
    catch(error){
      gameRecoveryRuntime.paused=true;gameRecoveryShowNotice(gameRecoveryRuntime.result);
      document.getElementById('game-recovery-title').textContent=state.language==='zh'?'已保存的反馈暂未能继续显示':'Saved feedback could not continue';
      document.getElementById('game-recovery-note').textContent=state.language==='zh'?'已有提交和评价保留，尚未重新请求回复。请重新载入恢复；仍失败请联系研究者。':'The submission and grade are retained; no reply was requested again. Reload recovery; contact the researcher if it still fails.';
      const retry=document.getElementById('game-recovery-continue');retry.textContent=state.language==='zh'?'重新载入并恢复进度':'Reload and recover';retry.onclick=()=>window.location.reload();
      return false;
    }
    return;
  }
  if (!state.storyBeatLedger.some(b=>b.status==='committed'&&b.type==='stage_context'&&b.sourceEventId===`opening-${state.sessionId}`) && state.stageIndex===0) {
    await playOpeningSequence({resume:true});completeOpeningPresentation();
  } else if (!state.openingResponseAnswered && state.stageIndex===0 && !state.pendingDecision) {
    showOpeningResponseWindow();
  }
  if(state.pendingTerminalOutcome && dueGlobalAttentionCheckpoint()) {
    state.isScenePlaying=false;startGlobalAttentionCheckIfNeeded();
  }
  if(globals.outcomeTransition && state.stageIndex===3 && !projectOutcomeReceipt()) {
    try {
      const continuation=presentProjectOutcomeTransition();
      const event=projectOutcomeEvent();
      if(event && globals.outcomeTransition.phase==='result') {
        projectOutcomeTransition.phase='result';projectOutcomeTransition.eventId=event.eventId;
        projectOutcomeTransition.result=globals.outcomeTransition.result;
        document.getElementById('ui-project-outcome').dataset.phase='result';
        document.getElementById('ui-project-outcome-title').textContent=globals.outcomeTransition.result.title;
        document.getElementById('ui-project-outcome-text').textContent=event.dialogueDeliveries.find(d=>d.status==='delivered'&&d.channel==='competition_result').text;
        document.getElementById('ui-project-outcome-continue').textContent=state.language==='zh'?'回到实验室，讨论贡献':'Return to the lab and discuss credit';
      }
      await continuation;
    } finally {state.isScenePlaying=false;state.isGmThinking=false;updateWorldActivityClasses();}
  }
  if(globals.computerOpen && !state.isScenePlaying && !state.decisionPanelVisible) {
    // Reopen existing UI without invoking the task-generation/first-contact paths.
    document.getElementById('backpack-panel').classList.remove('panel-hidden');
    renderBackpack();setWorkspaceTab(globals.workspaceTab||'current');
  }
  renderPlayerExperience();updateWorldActivityClasses();
  if(typeof studyPairMarkCheckpointDirty==='function')studyPairMarkCheckpointDirty('game_recovered',{saveSoon:true});
}

// A technical stop is not a game ending or evidence that the service recovered.
// Reload starts the existing owner-bound loader; it never resends a submission.
let technicalStopReloadPending=false;
function technicalStopRecoveryVisible(){
  return typeof studyPairRequested==='function'&&studyPairRequested()&&
    state.researchProfile?.active===true&&Boolean(state.researchProfile.pairId)&&
    Boolean(state.apiFatalError)&&state.sessionClosed===true&&state.screen==='game'&&
    !['success','partial_outcome','unhealthy_failure'].includes(state.finalOutcome?.endType);
}
function renderTechnicalStopRecovery(){
  const panel=document.getElementById('ui-technical-stop-recovery');if(!panel)return;
  const visible=technicalStopRecoveryVisible();panel.hidden=!visible;
  if(visible){
    const zh=state.language==='zh',copy={
      'ui-technical-stop-title':zh?'这一步暂时停止':'This step has stopped',
      'ui-technical-stop-note':zh?'可重新载入，恢复最近确认保存的进度。未完成的请求不会自动重发。':'You can reload to recover the latest confirmed save. Unfinished requests are not resent automatically.',
      'ui-technical-stop-contact':zh?'重新载入不表示服务已恢复；如果仍无法继续，请联系研究者。':'Reloading does not mean the service has recovered. Contact the researcher if you still cannot continue.',
      'ui-technical-stop-reload':zh?'重新载入并恢复进度':'Reload and recover progress'
    };
    for(const [id,text]of Object.entries(copy)){const node=document.getElementById(id);if(node.textContent!==text)node.textContent=text;}
    document.getElementById('ui-technical-stop-reload').disabled=technicalStopReloadPending;
  }
  if(typeof syncMainlineActionRail==='function')syncMainlineActionRail();
}
(function initializeTechnicalStopRecovery(){
  const rail=document.getElementById('ui-mainline-actions');if(!rail||document.getElementById('ui-technical-stop-recovery'))return;
  const panel=document.createElement('section');panel.id='ui-technical-stop-recovery';panel.hidden=true;
  panel.setAttribute('aria-labelledby','ui-technical-stop-title');
  const title=document.createElement('strong');title.id='ui-technical-stop-title';
  const note=document.createElement('p');note.id='ui-technical-stop-note';
  const contact=document.createElement('p');contact.id='ui-technical-stop-contact';
  const button=document.createElement('button');button.id='ui-technical-stop-reload';button.type='button';
  button.onclick=()=>{
    if(technicalStopReloadPending||button.disabled||!technicalStopRecoveryVisible())return;
    technicalStopReloadPending=true;button.disabled=true;window.location.reload();
  };
  panel.append(title,note,contact,button);rail.append(panel);
}());
