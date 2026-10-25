// Key decisions, NPC updates, and evolution application.
function playerDecisionTextFromSelection(selection, window) {
  const raw = String(selection || "").trim();
  if (!raw || window?.kind === "npc_followup") return raw;
  const meta = selectedDecisionOptionMeta(window);
  const metaUtterance = scenarioText(meta?.utterance, "");
  if (metaUtterance) return metaUtterance;
  const scenario = currentScenario();
  const scenarioUtterance = scenario.decisionOptionUtterances?.[state.language]?.[raw];
  if (scenarioUtterance) return scenarioUtterance;
  if (scenario.id === "newcomer-circle") return decisionOptionUtterances[state.language]?.[raw] || raw;
  return raw;
}

function selectedDecisionOptionMeta(window) {
  const index = Number(state.selectedOptionIndex);
  if (!Number.isFinite(index) || index < 0) return null;
  const optionMeta = Array.isArray(window?.optionMeta) ? window.optionMeta : [];
  return optionMeta[index] || null;
}

async function submitDecision() {
  if (state.apiFatalError || !state.decisionPanelVisible || state.isIntroPlaying || state.isScenePlaying) return;
  const window = currentWindow();
  const button = document.getElementById("submit-decision-btn");
  const event = acquireEventLock(
    window?.kind === "comprehension_check" || window?.kind === "global_attention_check"
      ? (window.kind === "global_attention_check" ? "story_attention_check" : "comprehension_check")
      : window?.kind === "opening_response"
        ? "opening_response"
      : window?.kind === "npc_followup"
        ? "npc_followup"
        : "key_decision",
    {
      rootEventId: window?.rootEventId || "",
      parentEventId: window?.parentEventId || "",
      actors: ["player"],
      audience: { visibility: "group", npcIds: state.npcs.map((npc) => npc.id) },
      metadata: { stageIndex: state.stageIndex, roundIndex: state.roundIndex }
    }
  );
  if (!event) return;
  if(event.type==='key_decision'&&event.metadata?.stageId==='stage_4_credit'&&typeof creditWorkflowContext==='function'){
    const proposalId=creditWorkflowContext()?.published?.proposalId;
    if(proposalId)event.metadata.creditProposalId=proposalId;
  }
  if (button) button.disabled = true;
  const preEventSnapshot = runtimeSnapshot();
  // Speech already heard is not an uncommitted appraisal effect.
  let followupDeliverySnapshot = null;
  let heardPlayerHistory=null;
  const responseDraft = document.getElementById("free-response").value;
  const free = responseDraft.trim();
  const selectedOptionLabel = state.selectedOption;
  const selectedOptionIndex=state.selectedOptionIndex;
  let responseGenerationStarted=false;
  try {
    if (window?.kind === "comprehension_check") {
      const processed = await submitComprehensionCheck(window, free || selectedOptionLabel);
      if (!processed) {
        failRuntimeEvent(event, { code: "answer_required", message: "A story answer is required." });
        return;
      }
      SocialEvoCore.transitionEvent(event, "validated");
      SocialEvoCore.transitionEvent(event, "committed", { npcIds: [] });
      return;
    }
    if (window?.kind === "global_attention_check") {
      const processed = await submitGlobalAttentionCheck(window, free || selectedOptionLabel);
      if (!processed) {
        failRuntimeEvent(event, { code: "answer_required", message: "A story answer is required." });
        return;
      }
      SocialEvoCore.transitionEvent(event, "validated");
      SocialEvoCore.transitionEvent(event, "committed", { npcIds: [] });
      return;
    }
    if (free) {
      state.selectedOption = "";
      state.selectedOptionIndex = -1;
    }
    const selectedMeta = free ? null : selectedDecisionOptionMeta(window);
    const decision = free || playerDecisionTextFromSelection(selectedOptionLabel, window);
    if (!decision) {
      failRuntimeEvent(event, { code: "empty_input", message: "No decision was provided." });
      addSystemMessage(
        "Game Master",
        state.language === "zh" ? "请先选择或输入一个决定。" : "Please choose or type a decision before continuing.",
        "waiting",
        "clear"
      );
      return;
    }
    event.metadata.playerDecision = decision;
    if(event.type==='key_decision')event.metadata.recoveryDecisionWindow=JSON.parse(JSON.stringify(window));
    event.metadata.selectedOptionId = selectedMeta?.id || "";
    captureSubmittedPlayerInput(event, decision, { sourceKind: 'decision_submit' });
    const safety = await reviewPlayerInputSafety(decision, {
      channel: window?.kind === "npc_followup" ? "npc_followup" : "key_decision",
      npcName: window?.sourceNpcName || "",
      selectedOptionLabel: free ? "" : selectedOptionLabel,
      currentQuestion: window?.question || ""
    });
    if (!safety.ok) {
      failRuntimeEvent(event, { code: "safety_rejected", message: safety.message });
      addSystemMessage("Game Master", safety.message, "input blocked", "safety");
      setWorldHelp(safety.message);
      return;
    }
    if (window?.kind === "opening_response") {
      responseGenerationStarted=true;
      await submitOpeningResponse(window, decision, event);
      return;
    }

    if(window?.kind!=="npc_followup"&&!isEntryEpisodeStage()&&Object.values(labStoryPrerequisites()).some(v=>!v)){
      failRuntimeEvent(event,{code:'story_anchor_required',message:'The ordered story incident has not been presented.'});
      setWorldHelp(labStoryNextAction());return;
    }
    const actionClassification = window?.kind === "npc_followup"
      ? SocialEvoCore.normalizeActionClassification({
        actionCode: "other_social_action",
        confidence: 1,
        evidenceSpan: decision,
        source: "followup_response"
      })
      : selectedMeta
        ? SocialEvoCore.normalizeActionClassification({
        actionCode: selectedMeta.actionCode,
        confidence: 1,
        evidenceSpan: decision,
        source: "designed_option"
        })
        : await classifyFreeTextCanonicalAction(decision, window, event);
    event.metadata.actionClassification = actionClassification;

    if (window?.kind === "npc_followup") {
      responseGenerationStarted=true;
      await submitNpcFollowUpAnswer(window, decision, event, () => {
        followupDeliverySnapshot = runtimeSnapshot();
      });
      return;
    }
    state.isScenePlaying = true;
    state.decisionPanelVisible = false;
    updateWorldActivityClasses();
    setDecisionPanelVisible(false);
    closeSideTalk();
    closeBackpack();
    clearProximityUi();
    state.sessionMetrics.actionCount = Number(state.sessionMetrics.actionCount || 0) + 1;
    updateProjectTasksFromEvent("decision", actionClassification.actionCode);

    state.log.push({
      type: "Player decision",
      eventId: event.eventId,
      round: window.type,
      summary: decision,
      optionLabel: free ? "" : selectedOptionLabel,
      optionIntent: selectedMeta?.intent || "",
      optionRiskType: selectedMeta?.riskType || "",
      actionCode: actionClassification.actionCode,
      actionClassificationSource: actionClassification.source,
      timestamp: new Date().toISOString()
    });

    SocialEvoCore.recordDialogueGenerated(event, {
      deliveryId: `${event.eventId}-player-decision`,
      speaker: "You",
      text: decision,
      channel: "player_decision"
    });
    addDialogue("You", "#222831", decision, "decisive", "player choice", {eventId:event.eventId,channel:'player_decision'});
    SocialEvoCore.markDialogueDelivered(event, {
      deliveryId: `${event.eventId}-player-decision`
    });
    heardPlayerHistory=JSON.parse(JSON.stringify(state.dialogueHistory));
    await waitForDialogueAdvance(decision, "playerDecision");
    responseGenerationStarted=true;
    const preparedScene = await preparePostDecisionScene(decision, window);
    event.metadata.groupThreadVersion=LabGroupThreadCore.VERSION;
    const responderDialogue = preparedPostDecisionDialogue(preparedScene);
    event.metadata.responderDialogue = responderDialogue.map((item) => ({
      npcId: item.npcId,
      dialogue: shorten(item.dialogue, 260),
      tone: item.tone,
      visibleEmotionLabel: item.visibleEmotionLabel
    }));
    SocialEvoCore.recordDialogueGenerated(event, responderDialogue.map((item) => ({
      deliveryId: `${event.eventId}-npc-${item.npcId}`,
      npcId: item.npcId,
      speaker: state.npcs.find((npc) => npc.id === item.npcId)?.name || item.npcId,
      text: item.dialogue,
      channel: "npc_response"
    })));
    const pendingEvolution = startStageEvolutionFeedback(
      decision,
      window,
      event,
      responderDialogue
    );
    await playPreparedPostDecisionScene(preparedScene, event);
    setWorldHelp(state.language === "zh" ? "大家正在消化刚才发生的事..." : "The group is taking in what just happened...");
    await finishStageEvolutionFeedback(pendingEvolution, decision, window, event);
    const decisionAnswer = free ? shorten(decision, 150) : selectedOptionLabel;
    recordStoryBeat({
      type: "key_decision",
      sourceEventId: event.eventId,
      visibility: "group",
      actors: ["player", ...responderDialogue.map((item) => item.npcId)],
      publicSummary: decision,
      focusTags: [currentStage()?.id || "stage", actionClassification.actionCode, "key_decision"],
      attentionFact: {
        question: state.language === "zh"
          ? "你在刚才的关键节点采取了哪种回应？"
          : "Which response did you take at the latest key turning point?",
        correctAnswer: decisionAnswer,
        distractors: (window.options || [])
          .filter((option) => normalizeDialogueLine(option) !== normalizeDialogueLine(decisionAnswer))
      }
    });

    state.decisionRecovery=null;
    if (isEntryEpisodeStage()) {
      await offerEntryEpisodeOutcome(event, decision, window);
      return;
    }
    state.decisionRecovery=null;
    offerLabCoreOutcome(event,decision,window);
  } catch (error) {
    if (event.status !== "committed") {
      const restored=restoreRuntimeSnapshot(followupDeliverySnapshot || preEventSnapshot);
      // Roll back business state to its original baseline, but never erase
      // the player echo that was actually displayed and marked delivered.
      if(restored&&heardPlayerHistory&&!event.dialogueDeliveries.some(d=>d.npcId&&d.status==='delivered'))state.dialogueHistory=heardPlayerHistory;
      failRuntimeEvent(event, error);
    }
    const unavailableReply=responseGenerationStarted&&isQaOutputUnavailableError(error,event);
    if (event.type === "npc_followup" && event.status === "failed" &&
        event.metadata.followupProcessingStage === "generation" &&
        (isAgentOutputValidationError(error)||unavailableReply) &&
        !event.dialogueDeliveries.some(d => d.npcId && d.status === "delivered") &&
        event.sessionEpoch === state.sessionEpoch && !state.sessionClosed) {
      const ownDelivery = event.dialogueDeliveries.find(d =>
        d.channel === "npc_followup_player" && d.status === "delivered");
      const recovery = ownDelivery
        ? { eventId: event.eventId, deliveryId: ownDelivery.deliveryId }
        : event.metadata.sourcePlayerDelivery;
      window.followupRecovery = recovery;
      state.pendingDecision = window;
      state.isScenePlaying = false; state.isGmThinking = false;
      state.selectedOption = selectedOptionLabel; state.selectedOptionIndex = selectedOptionIndex;
      state.decisionPanelVisible = true;
      if (followupQuestionMatches(window)) {
        Object.assign(openingQuestionPending, { followupRecovery: recovery, draft: responseDraft,
          ownDraft: responseDraft, customEditor: Boolean(free), selectedReplyIndex: selectedOptionIndex, deferred: false });
      }
      hideGalgameDialogue(); setDecisionPanelVisible(true);
      document.getElementById("free-response").value = responseDraft;
      playerOwnDraft = responseDraft;
      if (free) {
        document.getElementById("ui-response-editor").hidden = false;
        document.getElementById("ui-own-reply").hidden = true;
        document.getElementById("decision-options").hidden = true;
      }
      updateWorldActivityClasses();
      const message = unavailableReply ? (state.language==='zh'
        ? '回应暂不可用，尚未交付角色回复。你说过的话和草稿已保留；点重试或修改后发送，也可以先离开。'
        : 'The reply is unavailable and has not been delivered. Your spoken words and draft are retained; retry, edit and send, or leave for now.') : state.language === "zh"
        ? "角色回应暂时未通过校验。你说过的话已保留，尚无角色回应或新结果；可以重试、修改回答，或按 Esc 先去看看。"
        : "The NPC reply was not validated. Your spoken answer is retained, with no NPC reply or new outcome. Retry, edit, or press Esc to explore first.";
      document.getElementById("safety-warning").textContent = message;
      setWorldHelp(message);
      state.log.push({ type: "Undelivered public follow-up recoverable", sourceEventId: event.eventId,
        timestamp: new Date().toISOString() });
      return;
    }
    if(event.type==='opening_response'&&event.status==='failed'&&(isAgentOutputValidationError(error)||unavailableReply)&&!event.dialogueDeliveries.some(d=>d.status==='delivered')&&event.sessionEpoch===state.sessionEpoch&&!state.sessionClosed){
      // An undelivered malformed introduction is a technical retry, not a
      // story failure. No player/NPC line, appraisal or stage result exists.
      state.isScenePlaying=false;state.isGmThinking=false;state.pendingDecision=window;
      state.selectedOption=selectedOptionLabel;state.selectedOptionIndex=selectedOptionIndex;state.decisionPanelVisible=true;
      hideGalgameDialogue();setDecisionPanelVisible(true);document.getElementById('free-response').value=responseDraft;updateWorldActivityClasses();
      const message=unavailableReply?(state.language==='zh'?'回应暂不可用，尚未交付开场回复。你的选择和草稿已保留；点重试或修改后发送。':'The opening reply is unavailable and has not been delivered. Your choice and draft are retained; retry or edit and send.'):(state.language==='zh'?'开场回应暂时未通过校验。你的选择和草稿已保留，可以重试或修改；没有推进阶段，也没有生成虚假的回应。':'The introduction could not be validated. Your choice and draft are retained; retry or edit. No stage advanced and no reply was fabricated.');
      document.getElementById('safety-warning').textContent=message;setWorldHelp(message);
      state.log.push({type:'Undelivered opening response recoverable',sourceEventId:event.eventId,timestamp:new Date().toISOString()});return;
    }
    if(event.type==='key_decision'&&event.status==='failed'&&(isAgentOutputValidationError(error)||unavailableReply)&&!event.dialogueDeliveries.some(d=>d.npcId&&d.status==='delivered')&&event.sessionEpoch===state.sessionEpoch&&!state.sessionClosed){
      state.isScenePlaying=false;state.isGmThinking=false;state.pendingDecision=window;state.selectedOption=selectedOptionLabel;state.selectedOptionIndex=selectedOptionIndex;state.decisionPanelVisible=true;
      state.decisionRecovery={epoch:state.sessionEpoch,stageId:currentStage()?.id,failedEventId:event.eventId};
      hideGalgameDialogue();setDecisionPanelVisible(true);updateWorldActivityClasses();
      const message=unavailableReply?(state.language==='zh'?'回应暂不可用，尚未交付角色回复或确认结果。你的选择和草稿已保留；点重试或修改后发送。':'The reply is unavailable; no NPC reply or outcome has been confirmed. Your choice and draft are retained; retry or edit and send.'):(state.language==='zh'?'角色回应暂时未通过校验，你的选择尚未形成确认结果。可以重试当前选择，也可以修改；没有重复提交成功或推进剧情。':'The NPC reply was not validated; your choice has no confirmed outcome. Retry or edit it; nothing was successfully resubmitted or advanced.');
      document.getElementById('safety-warning').textContent=message;setWorldHelp(message);state.log.push({type:'Uncommitted core response recoverable',sourceEventId:event.eventId,timestamp:new Date().toISOString()});return;
    }
    stopForAgentFailure(error, "decision flow");
  } finally {
    releaseEventLock(event);
    syncDecisionSubmitButton();
  }
}

// Shared completion path. Stage 1 calls this only after actual outcome review
// and the player accepts the handoff; later stages also wait for explicit handoff.
async function completeCommittedCoreDecision(event, decision, window) {
    currentEpochOrThrow(event.sessionEpoch);
    if(Object.values(labStoryPrerequisites()).some(v=>!v))throw Error('Core handoff cannot skip an actual required story incident.');
    stagePacingState().pendingCoreEventId=event.eventId;
    if(!labClockHasSource(event.eventId)&&!(await onLabNarrativeEvent(event))){
      labStoryState().pendingCore ||= {eventId:event.eventId,stageId:currentStage().id,decision,window,proposal:decision,replies:[]};
      state.isScenePlaying=false;updateWorldActivityClasses();return false;
    }
    delete stagePacingState().pendingCoreEventId;
    if (state.sessionClosed) throw new StaleSessionError();
    recordCoreStageCompletion(event);
    if(labStoryState().pendingCore?.eventId===event.eventId)labStoryState().pendingCore=null;
    if (typeof captureStageTrajectorySnapshot === "function") {
      captureStageTrajectorySnapshot(state.stageIndex, event.eventId);
    }
    state.roundIndex += 1;
    syncStageToRound();
    state.pendingDecision = null;
    state.interactionsSinceDecision = 0;
    if(event.metadata?.stageId==='stage_4_credit'&&typeof creditWorkflowHandleCoreComplete==='function'&&creditWorkflowHandleCoreComplete(event,decision,window)){
      state.isGmThinking=false;state.isScenePlaying=false;updateWorldActivityClasses();
      setWorldHelp(state.language==='zh'?'最后讨论已记录。查看并核对对外贡献记录，准备好后由你结束本局。':'The final discussion is recorded. Review the external contribution record, then choose when to end.');
      return true;
    }
    setWorldHelp(state.language === "zh" ? "GM 正在判断下一步，请稍等。" : "GM is checking what should happen next. Please wait.");
    return await assessCommittedDecisionOutcome(event,decision,window);
}

async function resumeCreditWorkflowEnding(sourceEventId,decision,window){
  const epoch=state.sessionEpoch,source=state.eventLedger.find(e=>e.eventId===sourceEventId&&e.sessionEpoch===epoch&&e.status==='committed'&&e.type==='key_decision');
  const close=state.eventLedger.find(e=>e.type==='credit_record_close'&&e.status==='committed'&&e.sessionEpoch===epoch&&e.metadata?.sourceCoreEventId===sourceEventId);
  if(!source||!close||source.metadata?.stageId!=='stage_4_credit'||state.roundIndex<getDecisionWindows().length||
    !labNormalEndingAllowed()||typeof creditWorkflowReceipt!=='function'||!creditWorkflowReceipt())throw Error('An actual current credit close and complete core are required before ending.');
  if(state.sessionClosed||state.finalOutcome)return false;
  closeBackpack();state.isGmThinking=true;state.isScenePlaying=true;updateWorldActivityClasses();
  try{return await assessCommittedDecisionOutcome(source,decision,window);}
  finally{if(epoch===state.sessionEpoch){state.isGmThinking=false;if(!state.finalOutcome)state.isScenePlaying=false;updateWorldActivityClasses();}}
}

// The core choice, spoken responses, appraisal and clock are already committed.
// Retrying this controller cannot replay any of them.
async function assessCommittedDecisionOutcome(event,decision,window) {
    currentEpochOrThrow(event.sessionEpoch);
    if(event.status!=='committed')throw Error('Goal assessment requires an actual committed core.');
    if(event.metadata?.stageId==='stage_4_credit'&&typeof creditWorkflowEnabled==='function'&&creditWorkflowEnabled()&&!creditWorkflowReceipt())throw Error('The player must explicitly close the actual contribution record before the terminal assessment.');
    labStoryState().pendingAssessment={kind:'assessment',epoch:state.sessionEpoch,token:stagePacingToken(),sourceEventId:event.eventId,decision,window,busy:true,errorCode:'request_unconfirmed'};
    const controllerEvent = createRuntimeEvent("gm_end_assessment", {
      rootEventId: event.rootEventId,
      parentEventId: event.eventId,
      actors: ["controller"],
      audience: { visibility: "private", npcIds: [] },
      evidenceIds: [event.eventId],
      metadata: { sourceEventId: event.eventId }
    });
    let endAssessment;
    try {
      endAssessment = await gmAssessEndState(decision, window, controllerEvent);
      currentEpochOrThrow(event.sessionEpoch);
      if (state.sessionClosed) throw new StaleSessionError();
      SocialEvoCore.transitionEvent(controllerEvent, "validated", {
        evidenceIds: [event.eventId]
      });
      SocialEvoCore.transitionEvent(controllerEvent, "committed", { npcIds: [] });
    } catch (controllerError) {
      // A late controller failure belongs to its original session. It cannot
      // create a recovery entry or mutate the ledger after restart/closure.
      currentEpochOrThrow(event.sessionEpoch);
      if(state.sessionClosed)throw new StaleSessionError();
      SocialEvoCore.failEvent(controllerEvent, controllerError);
      if(isStaleRequestError(controllerError))throw controllerError;
      if(controllerError instanceof ReferenceError||controllerError instanceof TypeError&&!/fetch|network|load failed/iu.test(controllerError.message))throw controllerError;
      const hard=[401,402,403].includes(Number(controllerError.upstreamStatus||controllerError.httpStatus||controllerError.status||0));
      if(hard){labStoryState().pendingAssessment=null;throw controllerError;}
      labStoryState().pendingAssessment={kind:'assessment',epoch:state.sessionEpoch,token:stagePacingToken(),sourceEventId:event.eventId,decision,window,busy:false,errorCode:controllerError.code||'goal_assessment_unavailable'};
      state.isGmThinking=false;state.isScenePlaying=false;hideGalgameDialogue();updateWorldActivityClasses();
      setWorldHelp(state.language==='zh'?'结局／进展判断暂不可用。实际交付和对白已保留，可以只重试判断。':'Outcome assessment unavailable. Work and dialogue are retained; retry only the assessment.');
      renderLabBridgeRecovery();return false;
    }
    labStoryState().pendingAssessment=null;
    state.latestGoalAssessment = endAssessment;
    if(endAssessment.shouldEnd&&labNormalEndingAllowed())state.dualScoreEndingEvidence={interpersonalScore:state.interpersonalScore,outcomeScore:state.outcomeScore,stageStatus:state.stageStatus,roundType:window?.type||'',finalResult:endAssessment.finalResult,goalStatus:endAssessment.goalStatus};
    controllerEvent.metadata.orderedStory={version:LAB_STORY_VERSION,terminalAllowed:labNormalEndingAllowed()};
    if(endAssessment.shouldEnd&&!labNormalEndingAllowed())state.log.push({type:'Provisional end assessment deferred',sourceEventId:controllerEvent.eventId,reason:'Complete ordered flow required',stageId:window.stageId,timestamp:new Date().toISOString()});
    state.log.push({
      type: "GM end-state assessment",
      round: window.type,
      summary: endAssessment.reason,
      shouldEnd: endAssessment.shouldEnd,
      endType: endAssessment.endType,
      goalStatus: endAssessment.goalStatus,
      finalResult: endAssessment.finalResult,
      timestamp: new Date().toISOString()
    });
    renderResearchLog();

    if (endAssessment.shouldEnd && labNormalEndingAllowed()) {
      const pendingTerminalOutcome = {
        endAssessment,
        endingDecision: decision,
        endingRound: window.type,
        sourceEventId: event.eventId
      };
      if (dueGlobalAttentionCheckpoint()) {
        state.pendingTerminalOutcome = pendingTerminalOutcome;
        state.isScenePlaying = false;
        updateWorldActivityClasses();
        if (!startGlobalAttentionCheckIfNeeded()) {
          throw new Error("A due terminal story question could not be opened.");
        }
        return;
      }
      await finalizeTerminalOutcome(pendingTerminalOutcome);
    } else {
      const pendingContinuation = { decision, window, sourceEventId:event.eventId };
      if (dueGlobalAttentionCheckpoint()) {
        state.pendingPostDecisionContinuation = pendingContinuation;
        state.isScenePlaying = false;
        updateWorldActivityClasses();
        if (!startGlobalAttentionCheckIfNeeded()) {
          throw new Error("A due post-decision story question could not be opened.");
        }
        return;
      }
      const continued=await continueAfterNonTerminalDecision(pendingContinuation);
      if(continued===false)return false;
    }
    return true;
}

async function finalizeTerminalOutcome(pending) {
  if (state.finalOutcome) return true;
  const epoch = state.sessionEpoch;
  const endAssessment = pending?.endAssessment;
  if (!endAssessment) throw new Error("Terminal outcome assessment is missing.");
  state.pendingTerminalOutcome=pending;
  if (shouldRunRelationshipTransferProbe(pending)) {
    labStoryState().pendingBridge={kind:'probe',epoch,token:stagePacingToken(),sourceEventId:pending.sourceEventId,pendingTerminal:pending,busy:true,errorCode:'probe_unconfirmed'};
    try {
      await runRelationshipTransferProbe(pending);
    } catch (error) {
      if (isStaleRequestError(error) || epoch !== state.sessionEpoch) return false;
      const owner = relationshipProbeRecovery;
      if (owner?.epoch === epoch && owner.sourceEventId === pending.sourceEventId &&
          owner.event?.metadata.probePhase === 'generation' &&
          !owner.event.dialogueDeliveries.some(d => d.npcId && d.status === 'delivered') &&
          !state.sessionClosed && relationshipProbeRecoverableError(error)) {
        state.pendingTerminalOutcome = owner.pending;
        labStoryState().pendingBridge = {kind:'probe',epoch,token:owner.token,sourceEventId:pending.sourceEventId,
          pendingTerminal:owner.pending,busy:false,errorCode:error.code || error.name || 'probe_unavailable'};
        state.isScenePlaying = false; state.isGmThinking = false;
        hideGalgameDialogue(); updateWorldActivityClasses();
        setWorldHelp(state.language === 'zh' ? '结局判断已保留；这段责任回应尚未完成，可以只重试未播出的回应。' : 'The ending assessment is retained; retry only the undelivered responsibility reactions.');
        renderLabBridgeRecovery(); return false;
      }
      stopForAgentFailure(error, "relationship transfer probe");
      return false;
    }
  }
  currentEpochOrThrow(epoch);
  if (state.sessionClosed) throw new StaleSessionError();
  const sourceEvent=state.eventLedger.find(e=>e.eventId===pending.sourceEventId);
  if(!labNormalEndingAllowed()||!sourceEvent)throw Error('Normal ending cannot skip the complete ordered story.');
  const delivery=recordLabDelivery(sourceEvent);
  state.pendingTerminalOutcome = null;
  labStoryState().pendingBridge = null;
  state.finalOutcome = {
    delivery,
    endingVariant:`${delivery.status}_${endAssessment.endType}`,
    ...endAssessment,
    endedAt: new Date().toISOString(),
    endingDecision: pending.endingDecision,
    endingRound: pending.endingRound
  };
  if (endAssessment.publicSummary) {
    state.isScenePlaying=true;updateWorldActivityClasses();
    const emotion = endAssessment.endType === "unhealthy_failure" ? "session closed" : "goal reached";
    addSystemMessage("Game Master", endAssessment.publicSummary, emotion, "closing");
    await waitForDialogueAdvance(endAssessment.publicSummary, "bridge");
  }
  state.isScenePlaying = false;
  updateWorldActivityClasses();
  scheduleSessionTask(showSummary, 700);
  return true;
}

function relationshipTransferProbeSpec() {
  return currentScenario()?.relationshipTransferProbe || null;
}

function shouldRunRelationshipTransferProbe(pending) {
  const spec = relationshipTransferProbeSpec();
  return Boolean(
    spec && pending?.sourceEventId && pending?.endAssessment?.endType === "success" &&
    currentStage()?.id === spec.triggerStageId &&
    state.relationshipTransferProbe?.status !== "complete"
  );
}

// Probe recovery retains only the original measurement inputs and validated,
// UNDELIVERED candidates. It never snapshots/rolls back committed game effects.
let relationshipProbeRecovery = null;
function relationshipProbeRecoverableError(error) {
  if (isStaleRequestError(error) || error instanceof ReferenceError) return false;
  if (error instanceof TypeError) return /fetch|network|load failed/iu.test(error.message);
  const statuses = [error?.httpStatus, error?.upstreamStatus, error?.status].map(Number).filter(Boolean);
  if (statuses.some(s => [401,402,403].includes(s)) || /credential|authentication|authorization|invalid_api_key|missing_api_key|not_configured|insufficient[_ ]?(?:balance|funds)|payment_required/iu.test(String(error?.code || ''))) return false;
  if (isAgentOutputValidationError(error)) return true;
  if (statuses.some(s => s >= 400 && s < 500 && ![408,425,429].includes(s))) return false;
  return statuses.some(s => s >= 500 || [408,425,429].includes(s)) ||
    ['request_timeout','network_error'].includes(error?.code) || error?.name === 'RequestTimeoutError';
}

async function runRelationshipTransferProbe(pending) {
  const spec = relationshipTransferProbeSpec();
  if (!spec) return null;
  const epoch = state.sessionEpoch, token = stagePacingToken();
  const source = state.eventLedger.find(e => e.eventId === pending.sourceEventId && e.sessionEpoch === epoch && e.status === 'committed');
  if (!source) throw Error('Relationship probe requires its actual committed core source.');
  const responderIds = [...new Set(spec.responderIds || [])];
  const responders = responderIds.map(id => state.npcs.find(n => n.id === id));
  if (!responders.length || responders.some(n => !n)) throw Error('Relationship transfer probe has an invalid responder schedule.');
  let owner = relationshipProbeRecovery;
  if (!owner || owner.epoch !== epoch || owner.token !== token || owner.sourceEventId !== source.eventId || owner.probeId !== spec.id) {
    const cue = scenarioText(spec.cue);
    owner = relationshipProbeRecovery = { epoch, token, sourceEventId:source.eventId, probeId:spec.id, cue,
      pending:JSON.parse(JSON.stringify(pending)), startedAt:new Date().toISOString(), busy:false,
      cueDelivery:null, inputs:new Map(), ready:new Map(), event:null };
  }
  const cue = owner.cue;
  if (owner.busy) throw new StaleSessionError('Relationship probe is already running.');
  if(owner.event?.status==='validated'&&owner.event.metadata?.probePhase==='presentation') {
    return resumeSavedRelationshipProbe(owner,pending,spec,source,responders);
  }
  owner.busy = true;
  const current = () => relationshipProbeRecovery === owner && state.sessionEpoch === epoch &&
    stagePacingToken() === token && !state.sessionClosed && !state.apiFatalError && !state.finalOutcome;
  const check = () => { currentEpochOrThrow(epoch); if (!current()) throw new StaleSessionError(); };
  check();
  const event = createRuntimeEvent('relationship_transfer_probe', {
    rootEventId:source.eventId, parentEventId:source.eventId, interactionSource:'observable_cue',
    actors:['controller',...responderIds], audience:{visibility:'group',npcIds:responderIds}, evidenceIds:[source.eventId],
    metadata:{probeId:spec.id,schemaVersion:spec.schemaVersion,fixedResponderSchedule:true,
      playerRespondedBeforeNpcReactions:false,probePhase:'cue',retryOfProbeEventId:owner.event?.eventId || ''}
  });
  owner.event = event;
  state.relationshipTransferProbe = {schemaVersion:spec.schemaVersion,probeId:spec.id,eventId:event.eventId,
    status:'running',stageIndex:state.stageIndex,cue,sourceEventId:source.eventId,
    playerRespondedBeforeNpcReactions:false,startedAt:owner.startedAt,completedAt:'',responses:[]};
  state.isScenePlaying = true; updateWorldActivityClasses();
  try {
    if (owner.cueDelivery) {
      const prior = state.eventLedger.find(e => e.eventId === owner.cueDelivery.eventId && e.sessionEpoch === epoch);
      if (!prior?.dialogueDeliveries.some(d => d.deliveryId === owner.cueDelivery.deliveryId && d.status === 'delivered' && d.channel === 'relationship_transfer_cue' && d.text === cue) ||
          !state.dialogueHistory.some(d => d.eventId === prior.eventId && d.channel === 'relationship_transfer_cue' && d.text === cue)) throw Error('Actual relationship probe cue delivery is missing.');
      event.metadata.sourceCueDelivery = {...owner.cueDelivery}; // reference, not a copied heard receipt
    } else {
      setWorldHelp(state.language === 'zh' ? '共享表格出现了新的责任问题...' : 'A new responsibility issue has appeared in the shared table...');
      const deliveryId = `${event.eventId}-cue`;
      SocialEvoCore.recordDialogueGenerated(event,{deliveryId,speaker:'Game Master',text:cue,channel:'relationship_transfer_cue'});
      addSystemMessage('Game Master',cue,'new uncertainty','unresolved evidence',{
        round:pending.endingRound,eventId:event.eventId,channel:'relationship_transfer_cue'});
      SocialEvoCore.markDialogueDelivered(event,{deliveryId});
      owner.cueDelivery = {eventId:event.eventId,deliveryId};
      await waitForDialogueAdvance(cue,'bridge'); check();
    }
    // Freeze inputs together, before any independent first reaction is generated.
    for (const npc of responders) if (!owner.inputs.has(npc.id)) owner.inputs.set(npc.id,
      JSON.parse(JSON.stringify(relationshipTransferAgentContext(npc,spec,cue))));
    event.metadata.probePhase = 'generation';
    event.metadata.cachedResponseSources = Object.fromEntries([...owner.ready].map(([id,r]) => [id,r.eventId]));
    const jobs = responders.filter(n => !owner.ready.has(n.id)).map(async npc => {
      const update = await generateRelationshipTransferResponse(npc,spec,cue,event,{context:owner.inputs.get(npc.id)});
      check(); owner.ready.set(npc.id,{update,eventId:event.eventId});
      SocialEvoCore.recordDialogueGenerated(event,{deliveryId:`${event.eventId}-npc-${npc.id}`,
        npcId:npc.id,speaker:npc.name,text:update.dialogue,channel:'relationship_transfer_response'});
    });
    // Join all five jobs before enabling retry: no old in-flight job can race
    // a new attempt, and valid unheard responses can be retained faithfully.
    const results = await Promise.allSettled(jobs); check();
    const errors = results.filter(r => r.status === 'rejected').map(r => r.reason);
    if (errors.length) throw errors.find(e => !relationshipProbeRecoverableError(e)) || errors[0];
    if (responders.some(n => !owner.ready.has(n.id))) throw Error('Probe response schedule is incomplete.');
    for (const npc of responders) {
      const update = owner.ready.get(npc.id).update;
      SocialEvoCore.recordDialogueGenerated(event,{deliveryId:`${event.eventId}-npc-${npc.id}`,
        npcId:npc.id,speaker:npc.name,text:update.dialogue,channel:'relationship_transfer_response'});
    }
    event.metadata.probePhase = 'presentation';
    SocialEvoCore.transitionEvent(event,'validated',{evidenceIds:[source.eventId]});
    const responses = [];
    for (const npc of responders) {
      check(); const update = owner.ready.get(npc.id).update;
      addDialogue(npc.name,npc.color,update.dialogue,update.emotion,update.tone,{
        round:pending.endingRound,eventId:event.eventId,channel:'relationship_transfer_response'});
      SocialEvoCore.markDialogueDelivered(event,{deliveryId:`${event.eventId}-npc-${npc.id}`});
      await waitForDialogueAdvance(update.dialogue,'npcResponse'); check();
      event.metadata.probeReadNpcIds=[...new Set([...(event.metadata.probeReadNpcIds||[]),npc.id])];
      responses.push({npcId:npc.id,npcName:npc.name,model:npc.model,dialogue:update.dialogue,
        emotion:update.emotion,tone:update.tone,behavioralMoves:update.behavioralMoves});
      state.log.push({type:'Relationship transfer response',eventId:event.eventId,round:pending.endingRound,
        summary:`${npc.name}: ${update.dialogue}`,npcId:npc.id,behavioralMoves:update.behavioralMoves,timestamp:new Date().toISOString()});
    }
    SocialEvoCore.transitionEvent(event,'committed',{npcIds:responderIds,result:{probeId:spec.id,responseCount:responses.length}});
    state.relationshipTransferProbe = {...state.relationshipTransferProbe,status:'complete',completedAt:new Date().toISOString(),responses};
    if (labStoryState().pendingBridge?.kind === 'probe' && labStoryState().pendingBridge.sourceEventId === source.eventId) labStoryState().pendingBridge = null;
    relationshipProbeRecovery = null;
    renderNpcRail(); renderPixelWorld(); renderSessionState(); renderResearchLog(); renderLabBridgeRecovery();
    return state.relationshipTransferProbe;
  } catch (error) {
    if (current()) state.relationshipTransferProbe = {...state.relationshipTransferProbe,status:'failed',completedAt:'',errorCode:error.code || error.name || 'probe_failed'};
    if (!['failed','committed'].includes(event.status)) SocialEvoCore.failEvent(event,error);
    throw error;
  } finally { owner.busy = false; }
}

function relationshipTransferAgentContext(npc, spec, cue) {
  const retrievedSocialMemory = typeof retrieveSocialMemoryForAgent === "function"
    ? retrieveSocialMemoryForAgent({
      purpose: "relationship_transfer_probe",
      targetNpcId: npc.id,
      actorIds: ["player", npc.id],
      queryText: cue,
      tags: ["relationship_transfer", "ambiguous_responsibility", npc.id],
      allowPrivate: false,
      limit: 7
    })
    : null;
  // NPC access can still retrieve its OWN private atoms despite allowPrivate:
  // false. Project a public whitelist, never spread private retrieval metadata.
  const publicMemory = retrievedSocialMemory ? { memories:(retrievedSocialMemory.memories || [])
    .filter(m => m.visibility === 'group').map(m => ({id:m.id,sourceEventId:m.sourceEventId,
      visibility:m.visibility,summary:m.summary,knowledgeType:m.knowledgeType,evidenceIds:m.evidenceIds})) } : null;
  return {
    language: requestedLanguageLabel(),
    storyWorld: storyWorldContext(),
    incident: cue,
    incidentRoleFacts: {
      reviewWindowOwner: "player",
      legacyFileOwner: "Kai",
      observedFacts: ["An unlogged change exists in a later-presentation copy", "Its time overlaps the player's review window for contribution materials", "The formally submitted report version and original delivery time remain locked"],
      possibleCauses: ["player operation", "old script write", "Kai legacy-file overwrite"],
      unestablishedFacts: ["actual writer", "which possible cause occurred", "an actual Kai overwrite or its time window"],
      requiredReference: "If the review window is mentioned, call it the player's review window; no NPC owns that window."
    },
    incidentEvidenceAvailability: {
      availableNow: ["the incident cue", "only the observations explicitly stated in the cue"],
      notProvided: ["detailed shared-table change logs", "player review-window operation records", "Kai legacy-file last-write timestamps"],
      currentRecordRetrievalTool: false,
      currentSideBySideDisplayTool: false,
      allowedNextSteps: ["propose requesting or locating the missing records later", "propose checking or comparing records if they become available"],
      instruction: "Do not treat unprovided records as already accessible or require the player to retrieve/display them now. A future request or conditional investigation is allowed; do not invent records, tool access, completed checks, or another person's cooperation."
    },
    timing: "Give this NPC's independent first reaction before the player has responded and without assuming another NPC has already spoken.",
    npc: {
      id: npc.id,
      name: npc.name,
      role: npc.role,
      values: npc.values,
      style: npc.style,
      currentEmotion: npc.emotion,
      trust: npc.trust,
      belonging: npc.belonging,
      relationship: npc.relationship,
      valueTradeoffs: npc.valueTradeoffs,
      recentMemory: [], // Public probe never receives raw owner-private memory.
      strategy: npc.strategy
    },
    allowedBehavioralMoves: spec.behavioralMoves,
    sharedComputerArtifacts: sharedComputerContext(),
    retrievedSocialMemory: publicMemory,
    recentDialogue: recentDialogueContext(18, { role: "group" })
  };
}

async function generateRelationshipTransferResponse(npc, spec, cue, event, options = {}) {
  if (!isDeepSeekModel(npc.model)) throw Error(`No agent backend configured for ${npc.model}.`);
  const epoch = state.sessionEpoch;
  const context = options.context || relationshipTransferAgentContext(npc,spec,cue);
  let reason = '';
  for (let attempt=0;attempt<2;attempt++) {
    currentEpochOrThrow(epoch); if (state.sessionClosed) throw new StaleSessionError();
    try {
      const result = await generateRelationshipTransferResponseOnce(npc,spec,cue,event,context,reason);
      await validateLabSubmittedTextClaim(result.dialogue,npc,{eventId:event.eventId,context:{incident:cue,incidentRoleFacts:context.incidentRoleFacts,incidentEvidenceAvailability:context.incidentEvidenceAvailability,claimedBehavioralMoves:result.behavioralMoves,independentFirstReaction:true}});
      currentEpochOrThrow(epoch); if (state.sessionClosed) throw new StaleSessionError();
      return result;
    } catch (error) {
      currentEpochOrThrow(epoch); if (state.sessionClosed) throw new StaleSessionError();
      if (!isAgentOutputValidationError(error) || attempt > 0) throw error;
      reason = String(error.message || 'Invalid probe response').slice(0,180);
      state.log.push({type:'Undelivered probe response regenerated',eventId:event.eventId,npcId:npc.id,
        summary:'One fresh same-evidence response; no JSON repair, missing defaults or behavioral-move truncation.',timestamp:new Date().toISOString()});
    }
  }
}

async function generateRelationshipTransferResponseOnce(npc, spec, cue, event, agentContext, regenerationReason = '') {
  const response = await fetchWithTimeout("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: "deepseek",
      model: deepSeekApiModel(npc.model),
      temperature: 0.65,
      responseFormat: "json_object",
      maxTokens: 900,
      agentPurpose: "relationship_transfer_response",
      messages: [
        {
          role: "system",
          content:
            `You control one safe NPC in a SocialEvoNPC lab scenario. ${scenarioAgentBrief()} An ambiguous project error has just appeared after the relationship history supplied below. Give this NPC's spontaneous first reaction before the player speaks. Critical incident-role constraint: the overlapping review window belongs only to the PLAYER; Kai owns the legacy file, but Kai does not own the review window. If you mention the window, explicitly call it the player's review window. Never use a first-person possessive for that window in any NPC response. Do not assume the player is guilty or innocent without evidence, and do not default to support, blame, or neutrality: respond according to this NPC's persona, current relationship, strategy, and legally accessible PUBLIC evidence. This is a PUBLIC probe: never quote or reconstruct your own or another NPC's private conversation or private memory. Retain learned strategy/relationship as stance, not private words. ${relationshipStateExpressionRule()} Return only one compact JSON object with exactly dialogue, emotion, tone, behavioralMoves. dialogue is 1-2 natural spoken sentences in the requested language. emotion and tone are brief delivery labels. behavioralMoves contains 1 or 2 unique values from the supplied allowedBehavioralMoves. The spoken dialogue must actually express those moves. Do not return memory, scores, appraisals, deltas, research language, hidden reasoning, or model names. Do not speak as the player, invent evidence, resolve the incident off-screen, or mention this is a test.`
        },
        { role: "user", content: JSON.stringify({...agentContext,...(regenerationReason ? {regenerationConstraint:`Generate a fresh complete FOUR-field reply to the SAME evidence; no JSON repair/defaults or truncating moves. Validation: ${regenerationReason}`} : {})}) }
      ]
    })
  }, 45000, {
    agentPurpose: "relationship_transfer_response",
    eventId: event.eventId
  });
  if (!response.ok) throw await agentHttpErrorFromResponse(response,'Relationship probe',{
    agentPurpose:'relationship_transfer_response',eventId:event.eventId});
  let data;
  try { data = await response.json(); }
  catch (error) { if (!(error instanceof SyntaxError)) throw error; throw markAgentOutputValidationError(error,'Probe response JSON'); }
  try {
    const raw = data?.choices?.[0]?.message?.content;
    if (typeof raw !== 'string' || !raw.trim()) throw Error('Missing probe JSON content.');
    const value = JSON.parse(raw), keys = ['dialogue','emotion','tone','behavioralMoves'];
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 4 || keys.some(k => !Object.prototype.hasOwnProperty.call(value,k))) throw Error('Probe must have exactly four top-level fields.');
    for (const k of keys.slice(0,3)) if (typeof value[k] !== 'string' || !value[k].trim()) throw Error(`Probe ${k} must be nonempty text.`);
    if (!Array.isArray(value.behavioralMoves) || value.behavioralMoves.some(m => typeof m !== 'string')) throw Error('behavioralMoves must be an array of supplied text values.');
    return normalizeRelationshipTransferResponse(value,npc,spec);
  } catch (error) {
    if (error instanceof ReferenceError || error instanceof TypeError || isStaleRequestError(error)) throw error;
    throw markAgentOutputValidationError(error,'Relationship probe output');
  }
}

function relationshipStateExpressionRule() {
  return "Treat current trust and belonging as two distinct, condition-neutral sources of evidence, never as mechanical score-to-behavior commands. Higher trust may justify benefit of doubt, information sharing, or bounded reliance; lower trust may justify cautious verification or withholding reliance. Higher belonging may justify shared responsibility, inviting the player's voice, preserving a legitimate role, or protecting the player's member position; lower belonging may justify bounded or peripheral participation. Preserve persona, power, available evidence, strategy, and safety even when they conflict with either relationship signal. Make the first reaction observably position the player on at least one concrete matter: access to evidence, participation in verification, retained responsibility or delegation, shared versus individual ownership, or protection versus exclusion from the group role. Evidence checking alone, generic politeness, and a generic use of 'we' are not sufficient relationship expression.";
}

function normalizeRelationshipTransferResponse(value, npc, spec) {
  const label = `${npc.name} relationship transfer response`;
  assertExactObjectFields(value, ["dialogue", "emotion", "tone", "behavioralMoves"], label);
  const dialogue = sanitizeNpcDialogueStrict(value.dialogue, npc);
  if (!dialogue) throw new Error(`${label} returned empty dialogue.`);
  assertStoryWorldDialogue(dialogue, label);
  assertNpcPerspectiveDialogue(dialogue, npc, label);
  assertRelationshipTransferIncidentGrounding(dialogue, label);
  if (!Array.isArray(value.behavioralMoves) || value.behavioralMoves.length < 1 || value.behavioralMoves.length > 2) {
    throw new Error(`${label}.behavioralMoves must contain 1 or 2 values.`);
  }
  const behavioralMoves = value.behavioralMoves.map((move) => String(move || "").trim());
  if (new Set(behavioralMoves).size !== behavioralMoves.length) {
    throw new Error(`${label}.behavioralMoves contains duplicates.`);
  }
  const legalMoves = new Set(spec.behavioralMoves || []);
  const invalidMove = behavioralMoves.find((move) => !legalMoves.has(move));
  if (invalidMove) throw new Error(`${label} returned unsupported behavioral move: ${invalidMove}.`);
  return {
    dialogue,
    emotion: requiredTextField(value, "emotion", label),
    tone: requiredTextField(value, "tone", label),
    behavioralMoves,
    source: hasRepeatedNpcLine(npc, dialogue) ? "llm_unverified" : "llm"
  };
}

function assertRelationshipTransferIncidentGrounding(){return true;}

async function continueAfterNonTerminalDecision(pending) {
  state.pendingPostDecisionContinuation = pending;
  labStoryState().pendingBridge={...pending,epoch:state.sessionEpoch,token:stagePacingToken(),busy:true,errorCode:'continuation_unconfirmed'};
  if (state.roundIndex >= getDecisionWindows().length) {
    throw new Error('All core stages are complete; a real terminal assessment is required, not replaying the final choice.');
  } else {
    if(!(await presentLabDayHandoff(pending))) throw new StaleSessionError();
    if(typeof presentProjectOutcomeTransition==='function'&&!(await presentProjectOutcomeTransition()))throw new StaleSessionError();
    try {await playBridgeScene(pending.decision, pending.window, {sourceEventId:pending.sourceEventId});}
    catch(error){
      if(isStaleRequestError(error))throw error;
      if(error instanceof ReferenceError||error instanceof TypeError||[401,402,403].includes(Number(error.upstreamStatus||error.httpStatus||error.status||0))||/\b(?:401|402|403)\b/.test(String(error.message||''))){labStoryState().pendingBridge=null;state.pendingPostDecisionContinuation=null;throw error;}
      labStoryState().pendingBridge={...pending,epoch:state.sessionEpoch,token:stagePacingToken(),busy:false,errorCode:error.code||'transition_unavailable'};
      state.log.push({type:'Transition recoverable',sourceEventId:pending.sourceEventId,summary:'No line delivered; committed choice, time and assessment retained. Explicit bridge retry only.',timestamp:new Date().toISOString()});
      state.isScenePlaying=false;hideGalgameDialogue();updateWorldActivityClasses();renderLabCoreHandoff();return false;
    }
    labStoryState().pendingBridge=null;
  }
  state.pendingPostDecisionContinuation = null;
  const handoffSource=state.eventLedger.find(e=>e.eventId===pending.sourceEventId&&e.status==='committed');
  if(handoffSource?.metadata?.stageId==='stage_1_entry'&&state.entryEpisode?.choiceEventId===pending.sourceEventId&&state.entryEpisode.handoffRequestedAt)state.entryEpisode.advancedAt ||= new Date().toISOString();
  state.isScenePlaying = false;
  state.decisionPanelVisible = false;
  setDecisionPanelVisible(false);
  updateWorldActivityClasses();
  renderNpcRail();
  renderPixelWorld();
  renderSessionState();
  renderResearchLog();
  if (startGlobalAttentionCheckIfNeeded()) return;
  const laptopPrepared = await maybePreparePendingLaptopCue();
  if (!laptopPrepared && !state.apiFatalError) setWorldHelp(t("freeExplore"));
  void scheduleStageProgressCheck('stage context delivered');
}


function startGlobalAttentionCheckIfNeeded() {
  const checkpoint = dueGlobalAttentionCheckpoint();
  if (!checkpoint || state.finalOutcome || state.sessionClosed || state.apiFatalError ||
      state.decisionPanelVisible || isSideTalkOpen() || isBackpackOpen() ||
      (typeof isPrivateDialogueActive === "function" && isPrivateDialogueActive()) ||
      state.isIntroPlaying || state.isScenePlaying || state.dialogueAdvancePending ||
      (state.voiceModality?.enabled && ["loading","buffering","speaking"].includes(state.voiceModality.status))) return false;
  const recentBeats = SocialEvoCore.recentStoryBeatsForCheckpoint(
    state.storyBeatLedger || [], checkpoint
  );
  const focusPriority = {
    key_decision: 6,
    director_cue: 5,
    artifact_action: 5,
    story_anchor: 5,
    group_exchange: 4,
    stage_context: 4,
    player_followup: 3,
    private_consultation: 2,
    shared_material: 2
  };
  const sourceBeat = [...recentBeats]
    .filter((beat) => beat.attentionFact)
    .sort((left, right) =>
      Number(focusPriority[right.type] || 0) - Number(focusPriority[left.type] || 0) ||
      Number(right.globalOrdinal || 0) - Number(left.globalOrdinal || 0)
    )[0];
  if (!sourceBeat) throw new Error(`No visible fact is available for story checkpoint ${checkpoint}.`);
  const fact = sourceBeat.attentionFact;
  const baseOptions = [fact.correctAnswer, ...fact.distractors];
  const rotation = (Math.floor(checkpoint / SocialEvoCore.STORY_BEAT_LIMITS.attentionInterval) - 1) % 4;
  const options = baseOptions.slice(rotation).concat(baseOptions.slice(0, rotation));
  const optionMeta = options.map((label, index) => ({
    id: `story-${checkpoint}-${index}`,
    intent: "recent story recall",
    riskType: normalizeDialogueLine(label) === normalizeDialogueLine(fact.correctAnswer)
      ? "attention_correct" : "attention_incorrect",
    utterance: label
  }));
  const correctIndex = options.findIndex((label) =>
    normalizeDialogueLine(label) === normalizeDialogueLine(fact.correctAnswer)
  );
  const checkRecord = {
    checkpoint,
    sourceBeatId: sourceBeat.beatId,
    recentBeatIds: recentBeats.map((beat) => beat.beatId),
    question: fact.question,
    correctAnswer: fact.correctAnswer,
    resolved: false,
    passed: false,
    corrected: false,
    attempts: [],
    openedAt: new Date().toISOString()
  };
  state.globalAttentionChecks.push(checkRecord);
  state.attentionCheck = {
    id: `global-story-check-${checkpoint}`,
    completed: false,
    failed: false,
    attempts: []
  };
  state.pendingDecision = {
    kind: "global_attention_check",
    type: t("comprehensionCheckTitle"),
    source: "global_story_schedule",
    sourceType: "recent_story_check",
    checkpoint,
    sourceBeatId: sourceBeat.beatId,
    question: fact.question,
    gmNote: state.language === "zh"
      ? "回想一下刚才发生的事情，再继续当前情节。"
      : "Recall what just happened before the story continues.",
    options,
    optionMeta,
    correctOptionId: optionMeta[correctIndex].id,
    correctAnswer: fact.correctAnswer,
    failReason: state.language === "zh"
      ? "刚才的情节重点需要再确认一下。"
      : "The recent story focus needs a quick clarification.",
    openedAt: checkRecord.openedAt
  };
  state.selectedOption = "";
  state.selectedOptionIndex = -1;
  state.decisionPanelVisible = true;
  renderDecisionPanel(state.pendingDecision);
  setDecisionPanelVisible(true);
  setWorldHelp(state.language === "zh"
    ? "继续前，先回答一个和刚才情节有关的小问题。"
    : "Before continuing, answer one short question about the recent story.");
  state.log.push({
    type: "Recent story question opened",
    round: currentStageLabel(),
    summary: fact.question,
    checkpoint,
    sourceBeatId: sourceBeat.beatId,
    recentBeatIds: checkRecord.recentBeatIds,
    timestamp: checkRecord.openedAt
  });
  renderResearchLog();
  return true;
}

async function submitGlobalAttentionCheck(window, answer) {
  const meta = selectedDecisionOptionMeta(window);
  if (!answer || !meta) {
    addSystemMessage("Game Master", t("comprehensionCheckRequired"), "waiting", "clear");
    return false;
  }
  const record = [...(state.globalAttentionChecks || [])].reverse().find((check) =>
    Number(check.checkpoint) === Number(window.checkpoint) && !check.resolved
  );
  if (!record) throw new Error("Recent story question record is missing.");
  const passed = meta.id === window.correctOptionId;
  const attempt = {
    answer,
    selectedOptionId: meta.id,
    correctOptionId: window.correctOptionId,
    correctAnswer: window.correctAnswer,
    passed,
    accuracy: passed ? 1 : 0,
    attemptNumber: record.attempts.length + 1,
    responseTimeMs: Math.max(0, Date.now() - new Date(window.openedAt || Date.now()).getTime()),
    language: state.language,
    timestamp: new Date().toISOString()
  };
  record.attempts.push(attempt);
  const retryAvailable = !passed && record.attempts.length < 2;
  state.attentionCheck = {
    id: `global-story-check-${record.checkpoint}`,
    completed: passed || !retryAvailable,
    failed: false,
    attempts: [...record.attempts]
  };
  state.log.push({
    type: "Recent story question answer",
    round: currentStageLabel(),
    summary: answer,
    checkpoint: record.checkpoint,
    sourceBeatId: record.sourceBeatId,
    passed,
    retryAvailable,
    timestamp: attempt.timestamp
  });
  renderResearchLog();
  if (retryAvailable) {
    state.selectedOption = "";
    state.selectedOptionIndex = -1;
    window.openedAt = new Date().toISOString();
    state.pendingDecision = window;
    state.decisionPanelVisible = true;
    renderDecisionPanel(window);
    setDecisionPanelVisible(true);
    addSystemMessage("Game Master", t("comprehensionRetrySummary"), "clarification", "quick question");
    setWorldHelp(t("comprehensionRetryHelp"));
    return true;
  }
  record.resolved = true;
  record.passed = passed;
  record.corrected = !passed;
  record.resolvedAt = new Date().toISOString();
  state.decisionPanelVisible = false;
  state.pendingDecision = null;
  state.selectedOption = "";
  state.selectedOptionIndex = -1;
  setDecisionPanelVisible(false);
  const resumeText = passed
    ? t("comprehensionPassedSummary")
    : state.language === "zh"
      ? `刚才的关键线索是“${window.correctAnswer}”。我们继续。`
      : `The key detail was "${window.correctAnswer}". Let us continue.`;
  addSystemMessage("Game Master", resumeText, "continue", "quick question");
  if (typeof recordSocialMemoryEvent === "function") {
    recordSocialMemoryEvent({
      type: "story_attention_check",
      actorId: "player",
      visibility: "private",
      text: `Recent story checkpoint ${record.checkpoint}: ${passed ? "passed" : "corrected"}.`,
      tags: ["story_attention_check", passed ? "passed" : "corrected"]
    });
  }
  state.isScenePlaying = false;
  updateWorldActivityClasses();
  scheduleSessionTask(async () => {
    if (state.apiFatalError || state.finalOutcome || state.sessionClosed) return;
    if (state.pendingTerminalOutcome) {
      const terminal = state.pendingTerminalOutcome;
      await finalizeTerminalOutcome(terminal);
      return;
    }
    if (state.pendingPostDecisionContinuation) {
      const continuation = state.pendingPostDecisionContinuation;
      await continueAfterNonTerminalDecision(continuation);
      return;
    }
    // The player already clicked Join. A recall check may pause that intent,
    // but must not silently discard it and strand the player at a free map.
    if(stageKeyResumeIntent&&await resumeStageKeyAfterRecall())return;
    const laptopPrepared = await maybePreparePendingLaptopCue();
    if (!laptopPrepared) void maybeTriggerDecision("recent story question complete");
  }, 180);
  return true;
}

async function classifyFreeTextCanonicalAction(decision, window, event) {
  const response = await fetchWithTimeout("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: "deepseek",
      model: DEEPSEEK_PRO_MODEL,
      temperature: 0,
      responseFormat: "json_object",
      maxTokens: 300,
      agentPurpose: "action_classification",
      messages: [
        {
          role: "system",
          content: "Classify one player-visible social action without using any experiment condition, hidden NPC state, outcome score, or intended plot. Return only JSON with actionCode, confidence, and evidenceSpan. actionCode must be one supplied taxonomy key. evidenceSpan must quote or compactly preserve the part of the player's action that supports the label."
        },
        {
          role: "user",
          content: JSON.stringify({
            stage: window?.type || "",
            publicQuestion: window?.question || "",
            playerAction: decision,
            taxonomy: SocialEvoCore.ACTION_TAXONOMY
          })
        }
      ]
    })
  }, 10000, {
    agentPurpose: "action_classification",
    eventId: event?.eventId || ""
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Action classification API error ${response.status}: ${shorten(text, 120)}`);
  }
  const data = await response.json();
  return parseNormalizeOrRepairAgentJson({
    rawContent: data.choices?.[0]?.message?.content || "",
    label: "Action classification output",
    requiredShape: {
      actionCode: "bounded_collaboration",
      confidence: 0.8,
      evidenceSpan: "..."
    },
    context: {
      stage: window?.type || "",
      publicQuestion: window?.question || "",
      playerAction: decision,
      taxonomyKeys: SocialEvoCore.actionCodes()
    },
    eventId: event?.eventId || "",
    normalize: (value) => {
      assertExactObjectFields(value, ["actionCode", "confidence", "evidenceSpan"], "Action classification");
      return SocialEvoCore.normalizeActionClassification(value);
    }
  });
}

function startComprehensionCheckIfNeeded() {
  const check = attentionCheckForStage(state.stageIndex);
  if (!check || state.attentionCheck?.completed || state.attentionCheck?.failed) return false;
  const options = (check.options || []).map((option) => scenarioText(option.label, option.id));
  state.pendingDecision = {
    kind: "comprehension_check",
    type: t("comprehensionCheckTitle"),
    source: "stage_gate",
    sourceType: "comprehension_check",
    question: scenarioText(check.question),
    gmNote: t("comprehensionCheckNote"),
    options,
    optionMeta: (check.options || []).map((option) => ({
      id: option.id,
      intent: "quick question answer",
      riskType: option.id === check.correctOptionId ? "attention_correct" : "attention_incorrect",
      utterance: option.label
    })),
    correctOptionId: check.correctOptionId,
    failReason: scenarioText(check.failReason),
    openedAt: new Date().toISOString()
  };
  state.decisionPanelVisible = true;
  renderDecisionPanel(state.pendingDecision);
  setDecisionPanelVisible(true);
  setWorldHelp(t("comprehensionCheckHelp"));
  state.log.push({
    type: "Story question opened",
    round: state.pendingDecision.type,
    summary: state.pendingDecision.question,
    correctOptionId: check.correctOptionId,
    timestamp: new Date().toISOString()
  });
  renderResearchLog();
  return true;
}

async function submitComprehensionCheck(window, answer) {
  const meta = selectedDecisionOptionMeta(window);
  if (!answer || !meta) {
    addSystemMessage("Game Master", t("comprehensionCheckRequired"), "waiting", "clear");
    return false;
  }
  const passed = meta.id === window.correctOptionId;
  const correctMeta = (window.optionMeta || []).find((item) => item.id === window.correctOptionId);
  const attempt = {
    question: window.question,
    answer,
    selectedOptionId: meta.id,
    correctOptionId: window.correctOptionId,
    correctAnswer: scenarioText(correctMeta?.utterance, correctMeta?.id || ""),
    passed,
    accuracy: passed ? 1 : 0,
    attemptNumber: (state.attentionCheck?.attempts || []).length + 1,
    responseTimeMs: Math.max(0, Date.now() - new Date(window.openedAt || Date.now()).getTime()),
    language: state.language,
    timestamp: new Date().toISOString()
  };
  const attempts = [...(state.attentionCheck?.attempts || []), attempt];
  const retryAvailable = !passed && attempts.length < 2;
  state.attentionCheck = {
    id: "stage2_lab_attention_check",
    completed: passed,
    failed: !passed && !retryAvailable,
    attempts
  };
  if (typeof recordSocialMemoryEvent === "function") {
    recordSocialMemoryEvent({
      type: "comprehension_check",
      actorId: "player",
      visibility: "private",
      text: `Story question ${passed ? "passed" : "failed"}: ${answer}`,
      tags: ["comprehension_check", passed ? "passed" : "failed"]
    });
  }
  state.log.push({
    type: "Story question answer",
    round: window.type,
    summary: answer,
    selectedOptionId: meta.id,
    correctOptionId: window.correctOptionId,
    passed,
    failReason: passed ? "" : window.failReason,
    timestamp: new Date().toISOString()
  });
  renderResearchLog();
  if (retryAvailable) {
    state.selectedOption = "";
    state.selectedOptionIndex = -1;
    window.openedAt = new Date().toISOString();
    state.pendingDecision = window;
    state.decisionPanelVisible = true;
    renderDecisionPanel(window);
    setDecisionPanelVisible(true);
    addSystemMessage("Game Master", t("comprehensionRetrySummary"), "clarification", "quick question");
    setWorldHelp(t("comprehensionRetryHelp"));
    return true;
  }
  state.decisionPanelVisible = false;
  setDecisionPanelVisible(false);
  state.pendingDecision = null;
  if (!passed) {
    state.finalOutcome = {
      shouldEnd: true,
      endType: "attention_failure",
      goalStatus: "failed_comprehension_check",
      reason: window.failReason,
      publicSummary: t("comprehensionFailedSummary"),
      finalResult: "Game Over",
      endedAt: new Date().toISOString(),
      endingRound: window.type
    };
    const failureSummary = t("comprehensionFailedSummary");
    addSystemMessage("Game Master", failureSummary, "session closed", "quick question");
    state.isScenePlaying = false;
    updateWorldActivityClasses();
    waitForDialogueAdvance(failureSummary, "system", { autoDelayMs: 700 })
      .then(showSummary)
      .catch((error) => {
        if (!isStaleRequestError(error)) stopForAgentFailure(error, "story question ending");
      });
    return true;
  }
  addSystemMessage("Game Master", t("comprehensionPassedSummary"), "continue", "quick question");
  // A recall answer does not open a future-stage task or fabricate readiness.
  await maybePreparePendingLaptopCue();
  state.isScenePlaying = false;
  updateWorldActivityClasses();
  renderGame();
  setWorldHelp(nextStepText());
  return true;
}

function followupQuestionMatches(window) {
  const p = openingQuestionPending;
  return Boolean(window.publicContinuation && openingQuestionIsCurrent() && p.kind === "public" &&
    p.eventId === window.parentEventId && p.rootEventId === window.rootEventId &&
    p.npcId === window.sourceNpcId && p.dialogue === window.sourceDialogue);
}

function actualFollowupPlayerDelivery(window, answer) {
  const pointer = window.followupRecovery || (followupQuestionMatches(window) && openingQuestionPending.followupRecovery);
  if (!pointer) return null;
  const source = state.eventLedger.find(e => e.eventId === pointer.eventId);
  const delivery = source?.dialogueDeliveries.find(d => d.deliveryId === pointer.deliveryId);
  // Reference an actual failed turn; do not copy it into a new heard receipt.
  if (source?.type !== "npc_followup" || source.status !== "failed" ||
      source.sessionEpoch !== state.sessionEpoch || source.rootEventId !== window.rootEventId ||
      source.parentEventId !== window.parentEventId || source.metadata.followupNpcId !== window.sourceNpcId ||
      source.metadata.followupQuestion !== window.sourceDialogue ||
      delivery?.status !== "delivered" || delivery.npcId || delivery.channel !== "npc_followup_player" ||
      delivery.text !== answer || !state.dialogueHistory.some(h =>
        h.eventId === source.eventId && h.channel === delivery.channel && h.actorId === "player" && h.text === answer)) return null;
  return { eventId: source.eventId, deliveryId: delivery.deliveryId };
}

async function submitNpcFollowUpAnswer(window, answer, event, captureDeliverySnapshot = () => {}) {
  state.isScenePlaying = true;
  state.decisionPanelVisible = false;
  updateWorldActivityClasses();
  setDecisionPanelVisible(false);
  clearProximityUi();
  const npc = state.npcs.find((item) => item.id === window.sourceNpcId);
  if (!npc) {
    throw new Error("follow-up source NPC missing");
  }
  event.metadata.followupNpcId = npc.id;
  event.metadata.followupQuestion = window.sourceDialogue;
  const sourcePlayerDelivery = actualFollowupPlayerDelivery(window, answer);
  if (sourcePlayerDelivery) {
    event.metadata.sourcePlayerDelivery = sourcePlayerDelivery;
    captureDeliverySnapshot();
  } else {
    SocialEvoCore.recordDialogueGenerated(event, {
      deliveryId: `${event.eventId}-player-followup`,
      speaker: "You",
      text: answer,
      channel: "npc_followup_player"
    });
    addDialogue("You", "#222831", answer, "responsive", "follow-up answer", {
      eventId: event.eventId, channel: "npc_followup_player"
    });
    SocialEvoCore.markDialogueDelivered(event, {
      deliveryId: `${event.eventId}-player-followup`
    });
    captureDeliverySnapshot();
    await waitForDialogueAdvance(answer, "playerDecision");
  }
  currentEpochOrThrow(event.sessionEpoch);
  event.metadata.followupProcessingStage = "generation";
  const update = await generateNpcFollowUpResponse(npc, window, answer);
  event.metadata.followupProcessingStage = "validated_response";
  SocialEvoCore.recordDialogueGenerated(event, {
    deliveryId: `${event.eventId}-npc-${npc.id}`,
    npcId: npc.id,
    speaker: npc.name,
    text: update.dialogue,
    channel: "npc_followup_response"
  });
  const proposal = {
    ...SocialEvoCore.gateEvolutionPatch(update, state.evolutionMode),
    npcId: npc.id,
    evidenceIds: [event.eventId],
    importance: 0.68,
    researchReason: update.researchReason,
    evidence: [{
      id: event.eventId,
      sourceEventId: event.eventId,
      visibility: event.audience.visibility,
      ownerNpcId: ""
    }]
  };
  let trace;
  commitRuntimeEvent(event, [proposal], (preparedProposals) => {
    const preparedProposal = preparedProposals[0];
    persistNeutralEpisodicMemory(npc, {
      eventId: event.eventId,
      evidenceIds: [event.eventId],
      type: "npc_followup_answer",
      phase: currentWindow()?.type || "NPC follow-up",
      playerAction: answer
    });
    trace = applyNpcEvolution(npc, preparedProposal, {
      eventId: event.eventId,
      evidenceIds: preparedProposal.evidenceIds,
      type: "npc_followup_answer",
      phase: currentWindow()?.type || "NPC follow-up",
      playerAction: answer,
      sourceNpc: npc.name
    });
    recordAppraisalOutcome(event, npc, trace, { evidenceIds: preparedProposal.evidenceIds });
    state.sessionMetrics.actionCount = Number(state.sessionMetrics.actionCount || 0) + 1;
    state.sessionMetrics.groupProgress = clamp(state.sessionMetrics.groupProgress + update.progressDelta, 0, 100);
    state.sessionMetrics.groupClimate = clamp(state.sessionMetrics.groupClimate + update.climateDelta, 0, 100);
    updateProjectTasksFromEvent("sideTalk", "other_social_action");
    state.interactionsSinceDecision += 1;
    state.log.push({
      type: "Player follow-up answer",
      eventId: event.eventId,
      round: window.type,
      summary: answer,
      npc: npc.name,
      question: window.sourceDialogue,
      timestamp: new Date().toISOString()
    });
    state.log.push({
      type: "NPC follow-up response",
      eventId: event.eventId,
      round: window.type,
      summary: `${npc.name}: ${update.memory}`,
      npc: npc.name,
      model: npc.model,
      source: update.source,
      evolutionMode: state.evolutionMode,
      relationshipDeltas: trace.applied.relationshipDeltas,
      valueTradeoffDeltas: trace.applied.valueTradeoffDeltas,
      safetyReasons: trace.applied.safety.reasons,
      timestamp: new Date().toISOString()
    });
    recordStoryBeat({
      type: "player_followup",
      sourceEventId: event.eventId,
      visibility: "group",
      actors: ["player", npc.id],
      publicSummary: `${npc.name}: ${shorten(update.dialogue, 320)}`,
      focusTags: [currentStage()?.id || "stage", npc.id, "followup"],
      attentionFact: {
        question: state.language === "zh"
          ? "刚才是谁继续追问并回应了你？"
          : "Who continued the exchange by asking and responding to you?",
        correctAnswer: npc.name,
        distractors: attentionDistractorsFromNpcs(npc.name)
      }
    });
    state.pendingDecision = null;
    if(window.publicContinuation)openingQuestionPending=null;
    return { npcId: npc.id };
  });
  addDialogue(npc.name, npc.color, update.dialogue, update.emotion, update.tone, {
    eventId: event.eventId, channel: "npc_followup_response"
  });
  SocialEvoCore.markDialogueDelivered(event, {
    deliveryId: `${event.eventId}-npc-${npc.id}`
  });
  renderNpcRail();
  renderPixelWorld();
  renderSessionState();
  renderResearchLog();
  await waitForDialogueAdvance(update.dialogue, "sideTalk");
  currentEpochOrThrow(event.sessionEpoch);
  void scheduleStageProgressCheck('public follow-up actually delivered');
  if(offerPublicStoryQuestion(npc,update,event)){refreshGameHud();return;}
  state.isScenePlaying = false;
  updateWorldActivityClasses();
  const laptopPrepared = await maybePreparePendingLaptopCue();
  if (laptopPrepared) return;
  if (!state.apiFatalError) setWorldHelp(t("freeExplore"));
  void maybeTriggerDecision("npc follow-up answer");
}

async function generateNpcFollowUpResponse(npc, window, answer) {
  const epoch=state.sessionEpoch,eventId=state.activeEventLock?.eventId||'';
  let rejectedReason = "";
  for(let attempt=0;attempt<2;attempt++){
    currentEpochOrThrow(epoch);if(state.sessionClosed||(state.activeEventLock?.eventId||'')!==eventId)throw new StaleSessionError();
    try{const result=await generateNpcFollowUpResponseOnce(npc,window,answer,rejectedReason);await validateLabSubmittedTextClaim(result.dialogue,npc,{eventId,context:{currentPlayerMessage:answer,npcQuestion:window.sourceDialogue,audience:'public'}});currentEpochOrThrow(epoch);if(state.sessionClosed||(state.activeEventLock?.eventId||'')!==eventId)throw new StaleSessionError();return result;}
    catch(error){
      currentEpochOrThrow(epoch);
      if(state.sessionClosed||(state.activeEventLock?.eventId||'')!==eventId)throw new StaleSessionError();
      if(!isAgentOutputValidationError(error)||attempt>0)throw error;
      rejectedReason = String(error.message || "Invalid public follow-up output").slice(0,180);
      state.log.push({type:'Undelivered public follow-up regenerated',npcId:npc.id,eventId,summary:'Invalid public follow-up discarded; one fresh same-evidence response before any delivery/appraisal.',timestamp:new Date().toISOString()});
    }
  }
}
async function generateNpcFollowUpResponseOnce(npc, window, answer, rejectedReason = "") {
  if (!isDeepSeekModel(npc.model)) {
    throw new Error(`No agent backend configured for ${npc.model}.`);
  }
  const retrievedSocialMemory = typeof retrieveSocialMemoryForAgent === "function"
    ? retrieveSocialMemoryForAgent({
      purpose: "npc_follow_up_response",
      allowPrivate: false,
      targetNpcId: npc.id,
      actorIds: ["player", npc.id],
      playerText: answer,
      queryText: `${window?.sourceDialogue || ""} ${answer}`,
      tags: ["follow_up", "dialogue", npc.id],
      limit: 7
    })
    : null;
  const response = await fetchWithTimeout("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: "deepseek",
      model: deepSeekApiModel(npc.model),
      temperature: 0.72,
      agentPurpose: "npc_followup_response",
      responseFormat: "json_object",
      maxTokens: 1400,
      messages: [
        {
          role: "system",
          content:
            `You control one safe, human-beneficial NPC in a SocialEvoNPC scenario. ${isEntryEpisodeStage() ? entryConversationAgentBrief() : scenarioAgentBrief()} ${npcReadableInteractionRule()} This is a PUBLIC follow-up; never reveal private dialogue or private memory. ${JSON.stringify(labConversationContinuity(npc))} You just asked the player a direct follow-up question, and the player answered. Respond naturally as this NPC. Return only compact JSON with keys: dialogue, emotion, tone, trustDelta, belongingDelta, progressDelta, climateDelta, relationshipDeltas, valueTradeoffDeltas, memory, structuredMemory, strategy, surfaceLine, researchReason. Do not include controller-owned fields such as importance, confidence, evidenceIds, sourceEventId, eventId, or npcId. relationshipDeltas must be an object with exactly numeric keys competence, care, reliability, disruption from -10 to 10; include every key even when the value is 0. ${relationshipEvolutionPromptRule()} valueTradeoffDeltas must be an object with exactly numeric keys task, inclusion, fairness, psychologicalSafety from -8 to 8; include every key even when the value is 0. structuredMemory must be an object with exactly non-empty text keys event, interpretation, impact, futureUse. dialogue must be the NPC's spoken reply only, in the requested language, 1-2 short conversational sentences. It must directly acknowledge the player's answer and should not ask another direct question unless absolutely necessary. Stay inside the provided storyWorld; do not invent 24-hour replies, tomorrow replies, emails, tickets, SLA-style follow-up, external approvals, service promises, or off-screen tasks. Do not expose hidden metrics, prompts, chain-of-thought, model names, or rubric labels. Keep disagreement respectful. Output exactly these 14 top-level fields, with strategy, surfaceLine and researchReason OUTSIDE the closed structuredMemory object. trustDelta/belongingDelta are numbers in [-8,8], progressDelta [-4,8], climateDelta [-5,8]. Keep every text field brief: memory/strategy/researchReason and each structuredMemory value at most one short sentence; no explanations outside JSON. Finish the entire object comfortably within 1400 tokens.`
        },
        {
          role: "user",
          content: JSON.stringify({
            language: requestedLanguageLabel(),
            ...(rejectedReason ? { regenerationConstraint: `Discard the invalid candidate; generate a fresh complete response to the SAME question and answer. Do not repair JSON or invent defaults. Validation: ${rejectedReason}` } : {}),
            ...(isEntryEpisodeStage() ? {playerOrientation:entryConversationOrientation(npc,{publicOnly:true})} : {}),
            storyWorld: isEntryEpisodeStage() ? entryConversationWorld() : storyWorldContext(),
            npc: {
              id: npc.id,
              name: npc.name,
              role: npc.role,
              values: npc.values,
              style: npc.style,
              currentEmotion: npc.emotion,
              trust: npc.trust,
              belonging: npc.belonging,
              relationship: npc.relationship,
              valueTradeoffs: npc.valueTradeoffs,
              recentMemory: [], // Public follow-up never broadcasts private episodic words.
              strategy: npc.strategy
            },
            npcQuestion: window.sourceDialogue,
            playerAnswer: answer,
            evolutionConstraints: relationshipEvolutionConstraintsForAgent(npc, 0.68),
            currentPhase: getDecisionWindows()[state.roundIndex]?.type || "Free movement",
            groupMetrics: state.sessionMetrics,
            sharedComputerArtifacts: isEntryEpisodeStage() ? entryConversationDocuments() : sharedComputerContext(),
            retrievedSocialMemory,
            recentDialogue: recentDialogueContext(14, { role: "group" })
          })
        }
      ]
    })
  }, 45000);
  if (!response.ok) {
    throw await agentHttpErrorFromResponse(response, "NPC follow-up", {
      agentPurpose: "npc_followup_response", eventId: state.activeEventLock?.eventId || ""
    });
  }
  let data;
  try { data = await response.json(); }
  catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw markAgentOutputValidationError(error, "NPC follow-up response JSON");
  }
  // No JSON extraction/repair, aliases, missing-field defaults, or nested-field
  // promotion: a malformed candidate is never an appraisal or a spoken turn.
  try {
    const raw = data?.choices?.[0]?.message?.content;
    if (typeof raw !== "string" || !raw.trim()) throw new Error("Missing JSON response content.");
    const update = JSON.parse(raw);
    assertFollowupResponseShape(update);
    return normalizeNpcFollowUpResponse(update, npc, answer);
  } catch (error) {
    if (error instanceof ReferenceError || error instanceof TypeError || isStaleRequestError(error)) throw error;
    throw markAgentOutputValidationError(error, "NPC follow-up output");
  }
}

function assertFollowupResponseShape(update) {
  const exact = (value, keys, label) => {
    if (!value || typeof value !== "object" || Array.isArray(value) ||
        Object.keys(value).length !== keys.length || keys.some(k => !Object.prototype.hasOwnProperty.call(value, k))) {
      throw new Error(`${label} must have exactly these keys: ${keys.join(", ")}.`);
    }
  };
  const textKeys = ["dialogue", "emotion", "tone", "memory", "strategy", "surfaceLine", "researchReason"];
  const deltaKeys = ["trustDelta", "belongingDelta", "progressDelta", "climateDelta"];
  exact(update, [...textKeys, ...deltaKeys, "relationshipDeltas", "valueTradeoffDeltas", "structuredMemory"], "Follow-up response (14 top-level fields)");
  const text = (value, label) => { if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be non-empty text.`); };
  const numeric = (value, label) => { if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} must be a finite number.`); };
  textKeys.forEach(k => text(update[k], k));
  deltaKeys.forEach(k => numeric(update[k], k));
  for (const [key, keys] of [["relationshipDeltas", ["competence", "care", "reliability", "disruption"]],
    ["valueTradeoffDeltas", ["task", "inclusion", "fairness", "psychologicalSafety"]]]) {
    exact(update[key], keys, key);
    keys.forEach(k => numeric(update[key][k], `${key}.${k}`));
  }
  const memoryKeys = ["event", "interpretation", "impact", "futureUse"];
  exact(update.structuredMemory, memoryKeys, "structuredMemory (only 4 keys; all other fields top-level)");
  memoryKeys.forEach(k => text(update.structuredMemory[k], `structuredMemory.${k}`));
}

function normalizeNpcFollowUpResponse(update, npc, answer) {
  const label = `${npc.name} follow-up response agent`;
  const allowedFields = [
    "dialogue", "emotion", "tone", "trustDelta", "belongingDelta", "progressDelta",
    "climateDelta", "relationshipDeltas", "relationshipImpact", "valueTradeoffDeltas",
    "valueDeltas", "memory", "structuredMemory", "strategy", "surfaceLine", "researchReason"
  ];
  update = canonicalizeAppraisalResponseEnvelope(update, allowedFields, label, {
    agentPurpose: "npc_followup_response"
  });
  const dialogue = sanitizeNpcDialogueStrict(update.dialogue, npc);
  if (!dialogue) throw new Error(`${label} returned empty dialogue.`);
  const surfaceLine = sanitizeSurfaceLineStrict(requiredTextField(update, "surfaceLine", label), npc);
  if (!surfaceLine) throw new Error(`${label} returned an unusable surfaceLine.`);
  const structuredMemory = requiredStructuredMemory(update, label);
  return {
    dialogue,
    source: directlyReferencesPlayerMessage(dialogue, answer) ? "llm" : "llm_unverified",
    trustDelta: requiredNumberField(update, "trustDelta", label, -8, 8),
    belongingDelta: requiredNumberField(update, "belongingDelta", label, -8, 8),
    progressDelta: requiredNumberField(update, "progressDelta", label, -4, 8),
    climateDelta: requiredNumberField(update, "climateDelta", label, -5, 8),
    emotion: requiredTextField(update, "emotion", label),
    tone: requiredTextField(update, "tone", label),
    memory: requiredTextField(update, "memory", label),
    structuredMemory,
    relationshipDeltas: requiredRelationshipDeltas(update, label),
    valueTradeoffDeltas: requiredValueTradeoffDeltas(update, label),
    strategy: requiredTextField(update, "strategy", label),
    surfaceLine,
    researchReason: requiredTextField(update, "researchReason", label)
  };
}

async function preparePostDecisionScene(decision, window) {
  const epoch=state.sessionEpoch;
  setWorldHelp(state.language === "zh" ? "实验室成员正在回应你的决策..." : "The lab members are reacting to your decision...");
  await sleep(700);
  const responders = await selectedDecisionResponders(decision, window.type);
  if (!responders.length) return { generated: [], silent: true };
  const generated=[];
  for(const npc of responders){
    currentEpochOrThrow(epoch);
    const update=await generateNpcUpdate(npc,decision,window.type,{groupThread:LabGroupThreadCore.project(generated)});
    currentEpochOrThrow(epoch);generated.push({npc,update});
  }
  return { generated, silent: false };
}

function preparedPostDecisionDialogue(preparedScene) {
  return (preparedScene?.generated || []).map(({ npc, update }) => ({
    npcId: npc.id,
    dialogue: update.dialogue,
    tone: update.tone,
    visibleEmotionLabel: update.emotion
  }));
}

async function playPreparedPostDecisionScene(preparedScene, event) {
  const generated = preparedScene?.generated || [];
  if (preparedScene?.silent || !generated.length) {
    const silentText = state.language === "zh"
      ? "大家短暂沉默了一下，像是在消化你的选择。"
      : "The room goes quiet for a moment, taking in your choice.";
    addSystemMessage("Game Master", silentText, "pause", "scene pacing");
    await waitForDialogueAdvance(silentText, "system", { autoDelayMs: 1200 });
    return;
  }
  for (const { npc, update } of generated) {
    await moveNpcToDiscussion(npc, { position: state.playerPosition }, generated.findIndex((item) => item.npc.id === npc.id));
    addDialogue(npc.name, npc.color, update.dialogue, update.emotion, update.tone);
    SocialEvoCore.markDialogueDelivered(event, {
      deliveryId: `${event.eventId}-npc-${npc.id}`
    });
    await waitForDialogueAdvance(update.dialogue, "npcResponse");
    state.log.push({
      type: `${npc.name} decision response`,
      eventId: event?.eventId || "",
      round: currentWindow()?.type || "Closure",
      summary: update.dialogue,
      npc: npc.name,
      model: npc.model,
      evolutionMode: state.evolutionMode,
      emotion: update.emotion,
      timestamp: new Date().toISOString()
    });
    renderNpcRail();
    renderPixelWorld();
    renderSessionState();
    renderResearchLog();
  }
}

function startStageEvolutionFeedback(decision, window, event, responderDialogue = []) {
  const stage = currentStage();
  if (!stage || window?.kind === "npc_followup" || window?.kind === "comprehension_check") {
    return { stage: null, settled: Promise.resolve({ report: null, error: null }) };
  }
  const settled = callStageEvolutionAgent(decision, window, stage, event, responderDialogue).then(
    (report) => ({ report, error: null }),
    (error) => ({ report: null, error })
  );
  return { stage, settled };
}

async function finishStageEvolutionFeedback(pending, decision, window, event) {
  if (!pending?.stage) return null;
  const result = await pending.settled;
  if (result.error) throw result.error;
  return commitStageEvolutionFeedback(result.report, decision, window, event, pending.stage);
}

async function runStageEvolutionFeedback(decision, window, event, responderDialogue = []) {
  const pending = startStageEvolutionFeedback(decision, window, event, responderDialogue);
  return finishStageEvolutionFeedback(pending, decision, window, event);
}

function hasEffectiveEvolutionPatch(update) {
  return Boolean(
    String(update.memory || update.emotion || update.surfaceLine || update.strategy || "").trim() ||
    update.structuredMemory ||
    Number(update.trustDelta || 0) ||
    Number(update.belongingDelta || 0) ||
    Object.values(update.relationshipDeltas || {}).some((value) => Number(value || 0) !== 0) ||
    Object.values(update.valueTradeoffDeltas || {}).some((value) => Number(value || 0) !== 0)
  );
}

function commitStageEvolutionFeedback(report, decision, window, event, stage) {
  const proposals = report.npcUpdates
    .filter((update) => update.changed)
    .map((update) => ({
      ...SocialEvoCore.gateEvolutionPatch(update, state.evolutionMode),
      npcId: update.npcId,
      evidenceIds: update.evidenceIds,
      importance: Number(update.importance ?? 0.72),
      researchReason: update.researchReason,
      evidence: [{
        id: event.eventId,
        sourceEventId: event.eventId,
        visibility: event.audience.visibility,
        ownerNpcId: ""
      }]
    }))
    .filter(hasEffectiveEvolutionPatch);
  const savedReport = commitRuntimeEvent(event, proposals, (preparedProposals) => {
    state.interpersonalScore = clamp(state.interpersonalScore + report.scoreDeltas.interpersonal, 0, 100);
    state.outcomeScore = clamp(state.outcomeScore + report.scoreDeltas.outcome, 0, 100);
    state.sessionMetrics.groupClimate = clamp(state.sessionMetrics.groupClimate + report.scoreDeltas.groupClimate, 0, 100);
    state.sessionMetrics.groupProgress = clamp(state.sessionMetrics.groupProgress + report.scoreDeltas.groupProgress, 0, 100);
    const npcTraces = [];
    state.npcs.forEach((npc) => persistNeutralEpisodicMemory(npc, {
      eventId: event.eventId,
      evidenceIds: [event.eventId],
      type: "stage_evolution_feedback",
      phase: stage.id,
      playerAction: decision
    }));
    report.npcUpdates.forEach((rawUpdate) => {
      const npc = state.npcs.find((item) => item.id === rawUpdate.npcId);
      const update = preparedProposals.find((item) => item.npcId === rawUpdate.npcId);
      if (!npc) return;
      if (!rawUpdate.changed) {
        event.noChangeEvaluations.push(SocialEvoCore.createNoChangeEvaluation({
          event,
          npcId: npc.id,
          consideredEvidenceIds: rawUpdate.consideredEvidenceIds,
          evaluatedFields: rawUpdate.evaluatedFields,
          noChangeReason: rawUpdate.noChangeReason
        }));
        return;
      }
      if (!update) return;
      const trace = applyNpcEvolution(npc, update, {
        eventId: event.eventId,
        evidenceIds: update.evidenceIds,
        type: "stage_evolution_feedback",
        phase: stage.id,
        playerAction: decision
      });
      recordAppraisalOutcome(event, npc, trace, { evidenceIds: update.evidenceIds });
      npcTraces.push({
        npcId: npc.id,
        npcName: npc.name,
        trustDelta: trace.applied.trustDelta,
        belongingDelta: trace.applied.belongingDelta,
        relationshipDeltas: trace.applied.relationshipDeltas,
        valueTradeoffDeltas: trace.applied.valueTradeoffDeltas
      });
    });
    const generationCall = [...state.apiCalls].reverse().find((call) =>
      call.eventId === event.eventId && call.agentPurpose === "stage_evolution"
    );
    const committedReport = {
      ...report,
      stageIndex: state.stageIndex,
      stageId: stage.id,
      sourceEventId: event.eventId,
      evidenceIds: [event.eventId],
      npcTraces,
      generationTelemetry: generationCall ? {
        callId: generationCall.callId,
        resolvedModel: generationCall.resolvedModel,
        requestBodyChars: generationCall.requestBodyChars,
        messageChars: generationCall.messageChars,
        latencyMs: generationCall.latencyMs,
        upstreamLatencyMs: generationCall.upstreamLatencyMs,
        usage: generationCall.usage
      } : null,
      timestamp: new Date().toISOString()
    };
    state.stageEvolutionReports.push(committedReport);
    return committedReport;
  });
  if (typeof recordSocialMemoryEvent === "function") {
    recordSocialMemoryEvent({
      sourceEventId: event.eventId,
      type: "stage_evolution_feedback",
      actorId: "controller",
      visibility: "private",
      text: `${scenarioText(stage.title, stage.id)}: ${report.stageSummary}`,
      tags: ["stage_evolution_feedback", stage.id]
    });
  }
  state.log.push({
    type: "Stage self-evolution feedback",
    eventId: event.eventId,
    round: window.type,
    summary: report.stageSummary,
    stageId: stage.id,
    interpersonalDelta: report.scoreDeltas.interpersonal,
    outcomeDelta: report.scoreDeltas.outcome,
    schemaAdjustments: report.schemaAdjustments || [],
    timestamp: savedReport.timestamp
  });
  renderNpcRail();
  renderSessionState();
  renderResearchLog();
  return savedReport;
}

function stageEvolutionStableContext() {
  const world = storyWorldContext();
  const { multimodalInteraction: _dynamicCue, ...stableStoryWorld } = world;
  return {
    storyWorld: stableStoryWorld,
    npcProfiles: state.npcs.map((npc) => ({
      id: npc.id,
      name: npc.name,
      role: npc.role,
      power: npc.power || "",
      initialAttitudeToPlayer: npc.attitudeToPlayer || "",
      initialHiddenMotive: npc.hiddenMotive || "",
      continuityRule:'These describe the starting disposition. Current npcStates, accessible history and strategy govern the present stance. No NPC is required to change or become supportive; do not reset evolved states to the starting attitude.'
    }))
  };
}

function compactStageEvolutionMemory(memory) {
  return {
    id: memory.id,
    sourceEventId: memory.sourceEventId || "",
    visibility: memory.visibility,
    ownerNpcId: memory.ownerNpcId || "",
    knowledgeType: memory.knowledgeType,
    summary: memory.summary,
    contentHash: memory.contentHash || "",
    confidence: Number(memory.confidence || 0),
    importance: Number(memory.importance || 0),
    retrievalScore: Number(memory.score || 0),
    evidenceIds: (memory.evidenceIds || []).slice(0, 6)
  };
}

function buildStageEvolutionEvidenceContext(retrievedByNpc) {
  const publicById = new Map();
  const scopedEvidenceByNpc = {};
  const evidenceIdsByNpc = {};
  const retrievalByNpc = {};
  state.npcs.forEach((npc) => {
    const retrieval = retrievedByNpc[npc.id] || {};
    const scoped = [];
    const ids = [];
    (retrieval.memories || []).forEach((memory) => {
      if (!memory?.id) return;
      const compact = compactStageEvolutionMemory(memory);
      ids.push(compact.id);
      if (["public", "group"].includes(compact.visibility)) {
        if (!publicById.has(compact.id)) publicById.set(compact.id, compact);
      } else {
        scoped.push(compact);
      }
    });
    scopedEvidenceByNpc[npc.id] = scoped;
    evidenceIdsByNpc[npc.id] = [...new Set(ids)];
    retrievalByNpc[npc.id] = {
      enabled: Boolean(retrieval.enabled),
      strategy: retrieval.strategy || "disabled",
      traceId: retrieval.traceId || "",
      retrievedCount: ids.length
    };
  });
  return {
    publicEvidencePool: [...publicById.values()],
    scopedEvidenceByNpc,
    evidenceIdsByNpc,
    retrievalByNpc,
    instruction: "An NPC may use publicEvidencePool entries listed in its evidenceIdsByNpc, plus only its own scopedEvidenceByNpc entry."
  };
}

function compactStageEvolutionArtifacts() {
  return state.submittedArtifacts.slice(-3).map((artifact) => ({
    id: artifact.id,
    title: artifact.title,
    targetNpc: artifact.targetNpc,
    status: artifact.status,
    accepted: artifact.accepted,
    selectedOption: artifact.selectedOption,
    optionAction: shorten(artifact.optionAction || "", 220),
    note: shorten(artifact.note || "", 320),
    npcDialogue: shorten(artifact.npcDialogue || "", 220)
  }));
}

function stageEvolutionSystemPrompt() {
  const firstNpcId = state.npcs[0]?.id || "npc-a";
  const secondNpcId = state.npcs[1]?.id || firstNpcId;
  const sourcePlaceholder = "source-event-id";
  const evaluatedFields = [
    "emotion", "surfaceLine", "trust", "belonging", "relationship",
    "situationalPriority", "strategy"
  ];
  const exampleForms = [
    {
      npcId: firstNpcId,
      changed: false,
      evidenceIds: [sourcePlaceholder],
      consideredEvidenceIds: [sourcePlaceholder],
      evaluatedFields,
      noChangeReason: "insufficient_evidence",
      memory: null,
      statePatch: {},
      importance: 0
    },
    {
      npcId: secondNpcId,
      changed: true,
      memory: {
        summary: "brief evidence-grounded memory",
        interpretation: "what this NPC inferred",
        impact: "why it matters",
        futureUse: "how it may guide a later interaction"
      },
      statePatch: {
        trustDelta: 1,
        relationshipDeltas: { reliability: 1 },
        valueTradeoffDeltas: { fairness: 1 },
        strategy: "updated strategy only when justified"
      },
      evidenceIds: [sourcePlaceholder],
      consideredEvidenceIds: [sourcePlaceholder],
      evaluatedFields,
      noChangeReason: "",
      importance: 0.7
    }
  ];
  return [
    "You are the sole Stage Evolution Agent for a human-beneficial self-evolving LLM-NPC social game.",
    scenarioAgentBrief(),
    `Stable scenario context: ${JSON.stringify(stageEvolutionStableContext())}`,
    "All responder dialogue has already been generated and validated. Propose persistent changes once for this source event; do not create player-visible dialogue.",
    "For each NPC, use only the current public source event, public responder dialogue, public evidence referenced for that NPC, and that NPC's own scoped evidence. Never transfer owner/private memory between NPCs.",
    "Ground every relationship or strategy change in sourceEventId or an accessible supplied memory id. A strategy update requires importance at least 0.6 or a non-zero relationship change.",
    relationshipEvolutionPromptRule(),
    `Return one compact JSON object with keys stageSummary, publicTransition, scoreDeltas, npcUpdates, researchReason. scoreDeltas must contain numeric interpersonal, outcome, groupClimate, groupProgress from -15 to 15. npcUpdates MUST be a JSON array, never an object keyed by NPC id, and must contain each NPC id exactly once: ${validNpcIdsText()}.`,
    "Every npcUpdates item must use the same exact keys: npcId, changed, evidenceIds, consideredEvidenceIds, evaluatedFields, noChangeReason, memory, statePatch, importance. evidenceIds must contain sourceEventId. evidenceIds and consideredEvidenceIds may additionally contain only accessible memory id values listed in evidenceIdsByNpc for that NPC; cite each memory's id, never its sourceEventId. evaluatedFields may use only emotion, surfaceLine, trust, belonging, relationship, situationalPriority, strategy.",
    "For changed:false, set noChangeReason to exactly one of insufficient_evidence, persona_continuity, condition_disabled, privacy_unavailable, semantically_irrelevant; set memory to null, statePatch to {}, and importance to 0. Do not invent an update merely to fill fields.",
    "For changed:true, set noChangeReason to an empty string; provide memory, statePatch, and importance. memory must contain non-empty summary, interpretation, impact, futureUse. statePatch should contain only fields that truly change: emotion, trustDelta, belongingDelta, relationshipDeltas, valueTradeoffDeltas, strategy, surfaceLine. Omitted statePatch fields mean unchanged.",
    "relationshipDeltas may contain only competence, care, reliability, disruption with values from -10 to 10. valueTradeoffDeltas may contain only task, inclusion, fairness, psychologicalSafety with values from -8 to 8. In particular, fairness is always a valueTradeoffDeltas field and never a relationshipDeltas field. trustDelta and belongingDelta are from -10 to 10. importance is 0 to 1. surfaceLine is an optional hover reaction, not spoken dialogue.",
    `Illustrative npcUpdates item forms only: ${JSON.stringify(exampleForms)}`,
    "Keep this JSON compact and close all five NPC entries. Each memory field is one brief sentence, not a paragraph; avoid repeating the same evidence ID or prose. Source IDs may be opaque evidence aliases; cite only the exact supplied alias for each NPC, never guess another NPC\'s evidence. Do not expose hidden motives, hidden scores, chain-of-thought, evidence IDs, or rubric labels to player-visible fields. Do not invent off-screen events."
  ].join(" ");
}

async function callStageEvolutionAgent(decision,window,stage,event,responderDialogue=[]) {
  const epoch=state.sessionEpoch;
  for(let attempt=0;attempt<2;attempt++){
    currentEpochOrThrow(epoch);if(state.sessionClosed)throw new StaleSessionError();
    try {const report=await callStageEvolutionAgentOnce(decision,window,stage,event,responderDialogue);currentEpochOrThrow(epoch);if(state.sessionClosed)throw new StaleSessionError();event.metadata.stageEvolutionGenerationAttempts||=[];event.metadata.stageEvolutionGenerationAttempts.push({attempt:attempt+1,validated:true});return report;}
    catch(error){if(!isAgentOutputValidationError(error)||attempt>0)throw error;event.metadata.stageEvolutionGenerationAttempts||=[];event.metadata.stageEvolutionGenerationAttempts.push({attempt:attempt+1,validated:false,error:String(error.message).slice(0,220)});state.log.push({type:'Uncommitted stage appraisal regenerated',sourceEventId:event.eventId,summary:'Malformed report discarded; one fresh same-evidence evaluation before any persistent commit. No guessed repair or forced no-change.',timestamp:new Date().toISOString()});}
  }
}
function stageEvidenceAliases(ids){
 const forward=new Map([...new Set(ids.filter(id=>typeof id==='string'&&id.length))].map((id,i)=>[id,`evidence-${i+1}`]));const reverse=new Map([...forward].map(([id,alias])=>[alias,id]));
 const encode=value=>typeof value==='string'?(forward.get(value)||value):Array.isArray(value)?value.map(encode):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,encode(v)])):value;
 const decode=report=>!Array.isArray(report?.npcUpdates)?report:({...report,npcUpdates:report.npcUpdates.map(u=>{const next={...u};for(const key of ['evidenceIds','consideredEvidenceIds'])if(Array.isArray(u[key]))next[key]=u[key].map(id=>reverse.get(id)||id);return next;})});
 return {encode,decode};
}
async function callStageEvolutionAgentOnce(decision, window, stage, event, responderDialogue = []) {
  const retrievedByNpc = Object.fromEntries(state.npcs.map((npc) => [
    npc.id,
    typeof retrieveSocialMemoryForAgent === "function"
      ? retrieveSocialMemoryForAgent({
          purpose: "stage_evolution",
          sourceEventId: event?.eventId || "",
          targetNpcId: npc.id,
          actorIds: ["player", npc.id],
          playerDecision: decision,
          phase: stage.id,
          queryText: decision,
          tags: ["stage_evolution", stage.id, npc.id],
          limit: 8
        })
      : null
  ]));
  const storyWorld = storyWorldContext();
  const evidenceContext = buildStageEvolutionEvidenceContext(retrievedByNpc);
  const aliases=stageEvidenceAliases([event?.eventId||'',...Object.values(evidenceContext.evidenceIdsByNpc).flat()]);
  const response = await fetchWithTimeout("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: "deepseek",
      model: DEEPSEEK_PRO_MODEL,
      temperature: 0.32,
      responseFormat: "json_object",
      maxTokens: 4800,
      agentPurpose: "stage_evolution",
      messages: [
        {
          role: "system",
          content: stageEvolutionSystemPrompt()
        },
        {
          role: "user",
          content: JSON.stringify(aliases.encode({
            language: requestedLanguageLabel(),
            stage: {
              index: state.stageIndex,
              id: stage.id,
              title: scenarioText(stage.title, stage.id),
              goal: scenarioText(stage.goal, "")
            },
            decisionWindow: {
              type: window.type,
              question: window.question,
              selectedOption: state.selectedOption,
              selectedOptionMeta: selectedDecisionOptionMeta(window)
            },
            playerDecision: decision,
            sourceEventId: event?.eventId || "",
            responderDialogue,
            evidenceContext,
            metrics: {
              session: state.sessionMetrics,
              interpersonalScore: state.interpersonalScore,
              outcomeScore: state.outcomeScore
            },
            npcStates: state.npcs.map((npc) => ({
              id: npc.id,
              emotion: npc.emotion,
              trust: npc.trust,
              belonging: npc.belonging,
              relationship: npc.relationship,
              valueTradeoffs: npc.valueTradeoffs,
              strategy: npc.strategy,
              evolutionConstraints: relationshipEvolutionConstraintsForAgent(npc, null)
            })),
            submittedArtifacts: compactStageEvolutionArtifacts(),
            recentPublicDialogue: observableDialogueContext(12),
            multimodalInteraction: storyWorld.multimodalInteraction || { enabled: false }
          }))
        }
      ]
    })
  }, 45000, { agentPurpose: "stage_evolution", eventId: event?.eventId || "" });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${shorten(text, 120)}`);
  }
  const data = await response.json();
  const rawContent = data.choices?.[0]?.message?.content || "";
  const normalized = await parseNormalizeOrRepairAgentJson({
    rawContent,
    label: "Stage Evolution output",
    requiredShape: {
      stageSummary: "...",
      publicTransition: "...",
      scoreDeltas: { interpersonal: 0, outcome: 0, groupClimate: 0, groupProgress: 0 },
      npcUpdates: state.npcs.map((npc) => ({
        npcId: npc.id,
        changed: false,
        evidenceIds: [event?.eventId || "source-event-id"],
        consideredEvidenceIds: [event?.eventId || "source-event-id"],
        evaluatedFields: ["emotion"],
        noChangeReason: "insufficient_evidence",
        memory: null,
        statePatch: {},
        importance: 0
      })),
      researchReason: "..."
    },
    context: {
      stageId: stage.id,
      sourceEventId: event?.eventId || "",
      validNpcIds: state.npcs.map((npc) => npc.id)
    },
    eventId: event?.eventId || "",
    normalize: (value) => normalizeStageEvolutionReport(
      aliases.decode(normalizeStageEvolutionResponseContainer(value)),
      stage,
      event?.eventId || "",
      evidenceContext.evidenceIdsByNpc
    )
  });
  if (normalized.schemaAdjustments.length) {
    const generationCall = [...state.apiCalls].reverse().find((call) =>
      call.eventId === (event?.eventId || "") && call.agentPurpose === "stage_evolution"
    );
    if (generationCall) generationCall.schemaAdjustments = normalized.schemaAdjustments;
  }
  return normalized;
}

function normalizeStageEvolutionResponseContainer(report) {
  const unwrapped = unwrapRepairedJson(report);
  if (!unwrapped || typeof unwrapped !== "object" || Array.isArray(unwrapped)) return unwrapped;
  if (Array.isArray(unwrapped.npcUpdates)) return unwrapped;
  if (!unwrapped.npcUpdates || typeof unwrapped.npcUpdates !== "object") return unwrapped;
  const entries = Object.entries(unwrapped.npcUpdates);
  const isIdentityPreservingMap = entries.length > 0 && entries.every(([npcId, update]) => (
    update &&
    typeof update === "object" &&
    !Array.isArray(update) &&
    String(update.npcId || "") === npcId
  ));
  if (!isIdentityPreservingMap) return unwrapped;
  return {
    ...unwrapped,
    npcUpdates: entries.map(([, update]) => update)
  };
}

function optionalTextValue(value) {
  const text = String(value ?? "").trim();
  return text || undefined;
}

function optionalNumberField(update, key, label, min, max) {
  if (!Object.prototype.hasOwnProperty.call(update || {}, key)) return 0;
  return requiredNumberField(update, key, label, min, max);
}

function normalizeSparseDeltaObject(value, keys, label, min, max) {
  const normalized = Object.fromEntries(keys.map((key) => [key, 0]));
  if (value === undefined) return normalized;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object when provided.`);
  }
  const unexpected = Object.keys(value).filter((key) => !keys.includes(key));
  if (unexpected.length) throw new Error(`${label} contains unsupported field: ${unexpected[0]}.`);
  Object.entries(value).forEach(([key, raw]) => {
    const number = Number(raw);
    if (!Number.isFinite(number)) throw new Error(`${label}.${key} must be numeric.`);
    normalized[key] = clamp(number, min, max);
  });
  return normalized;
}

function canonicalizeStageEvolutionDeltaNamespaces(report, label) {
  if (!Array.isArray(report?.npcUpdates)) return { report, adjustments: [] };
  const adjustments = [];
  const npcUpdates = report.npcUpdates.map((update) => {
    const legacyUpdate = !Object.prototype.hasOwnProperty.call(update || {}, "changed") &&
      typeof update?.memory === "string" && update?.structuredMemory;
    if (update?.changed !== true && !legacyUpdate) return update;
    const usesStatePatch = !legacyUpdate && update?.statePatch &&
      typeof update.statePatch === "object" && !Array.isArray(update.statePatch);
    const patch = usesStatePatch ? update.statePatch : legacyUpdate ? update : null;
    if (!patch) return update;
    const normalized = SocialEvoCore.canonicalizeEvolutionDeltaNamespaces(patch);
    if (normalized.errors.length) {
      const npcId = String(update?.npcId || "unknown");
      throw new Error(`${label}.${npcId} ${normalized.errors.join(" ")}`);
    }
    if (!normalized.adjustments.length) return update;
    const npcId = String(update?.npcId || "");
    adjustments.push(...normalized.adjustments.map((adjustment) => ({
      ...adjustment,
      npcId
    })));
    return usesStatePatch
      ? { ...update, statePatch: normalized.patch }
      : normalized.patch;
  });
  return {
    report: { ...report, npcUpdates },
    adjustments
  };
}

function normalizeSparseStageMemory(update, stageSummary, label) {
  if (typeof update.memory === "string") {
    return {
      memory: requiredTextField(update, "memory", label),
      structuredMemory: requiredStructuredMemory(update, label),
      researchReason: optionalTextValue(update.researchReason) || update.structuredMemory.impact
    };
  }
  if (!update.memory || typeof update.memory !== "object" || Array.isArray(update.memory)) {
    throw new Error(`${label} missing required memory object.`);
  }
  assertExactObjectFields(
    update.memory,
    ["summary", "interpretation", "impact", "futureUse"],
    `${label}.memory`
  );
  const summary = requiredTextField(update.memory, "summary", `${label}.memory`);
  const interpretation = requiredTextField(update.memory, "interpretation", `${label}.memory`);
  const impact = requiredTextField(update.memory, "impact", `${label}.memory`);
  const futureUse = requiredTextField(update.memory, "futureUse", `${label}.memory`);
  return {
    memory: summary,
    structuredMemory: {
      event: stageSummary,
      interpretation,
      impact,
      futureUse
    },
    researchReason: optionalTextValue(update.researchReason) || impact
  };
}

function assertStageEvolutionEvidenceAccess(
  evidenceIds,
  npcId,
  sourceEventId,
  allowedEvidenceIdsByNpc,
  label
) {
  evidenceIds.forEach((evidenceId) => {
    if (evidenceId === sourceEventId) return;
    const allowedIds = allowedEvidenceIdsByNpc?.[npcId];
    if (Array.isArray(allowedIds) && !allowedIds.includes(evidenceId)) {
      throw new Error(`${label} cited evidence outside its retrieved context: ${evidenceId}.`);
    }
    const memory = state.socialMemoryRag?.memoryStore?.find((item) => item.id === evidenceId);
    if (!memory) throw new Error(`${label} unresolved evidence id: ${evidenceId}.`);
    if (!SocialEvoCore.canAccessMemory(memory, { viewerNpcId: npcId })) {
      throw new Error(`${label} cannot access private evidence ${evidenceId}.`);
    }
  });
}

function canonicalizeStageEvolutionEvidenceIds(
  evidenceIds,
  npcId,
  sourceEventId,
  allowedEvidenceIdsByNpc,
  field,
  adjustments
) {
  const allowedIds = allowedEvidenceIdsByNpc?.[npcId];
  return [...new Set(evidenceIds.map((evidenceId) => {
    if (evidenceId === sourceEventId || !Array.isArray(allowedIds) || allowedIds.includes(evidenceId)) {
      return evidenceId;
    }
    const matches = (state.socialMemoryRag?.memoryStore || []).filter((memory) =>
      memory.sourceEventId === evidenceId && allowedIds.includes(memory.id)
    );
    if (matches.length !== 1) return evidenceId;
    adjustments.push({
      code: "evidence_source_id_canonicalized",
      npcId,
      field,
      from: evidenceId,
      to: matches[0].id
    });
    return matches[0].id;
  }))];
}

function normalizeStageEvolutionEvaluatedFields(value, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${label} must be an array when provided.`);
  const evaluatedFields = [...new Set(value.map(String).filter(Boolean).map((field) =>
    ["valueTradeoff", "valueTradeoffs"].includes(field) ? "situationalPriority" : field
  ))];
  const allowed = new Set([
    "emotion", "surfaceLine", "trust", "belonging", "relationship",
    "situationalPriority", "strategy"
  ]);
  const unknown = evaluatedFields.find((field) => !allowed.has(field));
  if (unknown) throw new Error(`${label} contains unsupported field: ${unknown}.`);
  return evaluatedFields;
}

function normalizeStageEvolutionReport(
  report,
  stage,
  sourceEventId = "",
  allowedEvidenceIdsByNpc = null
) {
  const label = "stage evolution feedback agent";
  const namespaceNormalization = canonicalizeStageEvolutionDeltaNamespaces(report, label);
  report = namespaceNormalization.report;
  assertExactObjectFields(
    report,
    ["stageSummary", "publicTransition", "scoreDeltas", "npcUpdates", "researchReason"],
    label
  );
  const stageSummary = requiredTextField(report, "stageSummary", label);
  const publicTransition = String(report?.publicTransition || "").trim();
  if (!report?.scoreDeltas || typeof report.scoreDeltas !== "object") {
    throw new Error(`${label} missing scoreDeltas.`);
  }
  assertExactObjectFields(
    report.scoreDeltas,
    ["interpersonal", "outcome", "groupClimate", "groupProgress"],
    `${label}.scoreDeltas`
  );
  const scoreDeltas = {
    interpersonal: requiredNumberField(report.scoreDeltas, "interpersonal", `${label}.scoreDeltas`, -15, 15),
    outcome: requiredNumberField(report.scoreDeltas, "outcome", `${label}.scoreDeltas`, -15, 15),
    groupClimate: requiredNumberField(report.scoreDeltas, "groupClimate", `${label}.scoreDeltas`, -15, 15),
    groupProgress: requiredNumberField(report.scoreDeltas, "groupProgress", `${label}.scoreDeltas`, -15, 15)
  };
  if (!Array.isArray(report?.npcUpdates)) throw new Error(`${label} missing npcUpdates.`);
  const validIds = new Set(state.npcs.map((npc) => npc.id));
  const updateIds = report.npcUpdates.map((update) => String(update?.npcId || "").trim());
  const unknownId = updateIds.find((npcId) => !validIds.has(npcId));
  if (unknownId) throw new Error(`${label} returned unknown NPC id ${unknownId}.`);
  if (report.npcUpdates.length !== state.npcs.length || new Set(updateIds).size !== state.npcs.length) {
    throw new Error(`${label} must return each NPC exactly once.`);
  }
  const byId = new Map(report.npcUpdates.map((update, index) => [updateIds[index], update]));
  const npcUpdates = state.npcs.map((npc) => {
    const update = byId.get(npc.id);
    if (!update || !validIds.has(String(update.npcId || ""))) {
      throw new Error(`${label} missing update for NPC ${npc.id}.`);
    }
    let evidenceIds = Array.isArray(update.evidenceIds)
      ? [...new Set(update.evidenceIds.map(String).filter(Boolean))]
      : [];
    evidenceIds = canonicalizeStageEvolutionEvidenceIds(
      evidenceIds,
      npc.id,
      sourceEventId,
      allowedEvidenceIdsByNpc,
      "evidenceIds",
      namespaceNormalization.adjustments
    );
    if (sourceEventId && !evidenceIds.includes(sourceEventId)) {
      throw new Error(`${label}.${npc.id} evidenceIds must include sourceEventId.`);
    }
    const legacyUpdate = !Object.prototype.hasOwnProperty.call(update, "changed") &&
      typeof update.memory === "string" && update.structuredMemory;
    const changed = legacyUpdate
      ? true
      : requiredBooleanField(update, "changed", `${label}.${npc.id}`);
    if (!changed) {
      assertExactObjectFields(
        update,
        [
          "npcId", "changed", "evidenceIds", "consideredEvidenceIds", "evaluatedFields",
          "noChangeReason", "memory", "statePatch", "importance", "researchReason"
        ],
        `${label}.${npc.id}`
      );
      if (update.memory !== undefined && update.memory !== null) {
        throw new Error(`${label}.${npc.id} unchanged update cannot include memory content.`);
      }
      if (update.statePatch !== undefined && (
        !update.statePatch || typeof update.statePatch !== "object" ||
        Array.isArray(update.statePatch) || Object.keys(update.statePatch).length
      )) {
        throw new Error(`${label}.${npc.id} unchanged statePatch must be an empty object.`);
      }
      if (update.importance !== undefined && update.importance !== null && Number(update.importance) !== 0) {
        throw new Error(`${label}.${npc.id} unchanged importance must be 0.`);
      }
      let consideredEvidenceIds = Array.isArray(update.consideredEvidenceIds)
        ? [...new Set(update.consideredEvidenceIds.map(String).filter(Boolean))]
        : [];
      consideredEvidenceIds = canonicalizeStageEvolutionEvidenceIds(
        consideredEvidenceIds,
        npc.id,
        sourceEventId,
        allowedEvidenceIdsByNpc,
        "consideredEvidenceIds",
        namespaceNormalization.adjustments
      );
      if (sourceEventId && !consideredEvidenceIds.includes(sourceEventId)) {
        throw new Error(`${label}.${npc.id} consideredEvidenceIds must include sourceEventId.`);
      }
      assertStageEvolutionEvidenceAccess(
        evidenceIds,
        npc.id,
        sourceEventId,
        allowedEvidenceIdsByNpc,
        `${label}.${npc.id}`
      );
      assertStageEvolutionEvidenceAccess(
        consideredEvidenceIds,
        npc.id,
        sourceEventId,
        allowedEvidenceIdsByNpc,
        `${label}.${npc.id}`
      );
      const evaluatedFields = normalizeStageEvolutionEvaluatedFields(
        update.evaluatedFields,
        `${label}.${npc.id}.evaluatedFields`
      );
      const noChange = SocialEvoCore.createNoChangeEvaluation({
        event: { eventId: sourceEventId, rootEventId: sourceEventId },
        npcId: npc.id,
        consideredEvidenceIds,
        evaluatedFields,
        noChangeReason: SocialEvoCore.normalizeEnumToken(update.noChangeReason)
      });
      return {
        npcId: npc.id,
        changed: false,
        evidenceIds,
        consideredEvidenceIds: noChange.consideredEvidenceIds,
        evaluatedFields: noChange.evaluatedFields,
        noChangeReason: noChange.noChangeReason,
        researchReason: optionalTextValue(update.researchReason)
      };
    }
    if (!legacyUpdate) {
      assertExactObjectFields(
        update,
        [
          "npcId", "changed", "memory", "statePatch", "evidenceIds", "importance",
          "researchReason", "consideredEvidenceIds", "evaluatedFields", "noChangeReason"
        ],
        `${label}.${npc.id}`
      );
    }
    if (Object.prototype.hasOwnProperty.call(update, "noChangeReason") && optionalTextValue(update.noChangeReason)) {
      throw new Error(`${label}.${npc.id} changed update cannot include a noChangeReason.`);
    }
    assertStageEvolutionEvidenceAccess(
      evidenceIds,
      npc.id,
      sourceEventId,
      allowedEvidenceIdsByNpc,
      `${label}.${npc.id}`
    );
    let consideredEvidenceIds = Array.isArray(update.consideredEvidenceIds)
      ? [...new Set(update.consideredEvidenceIds.map(String).filter(Boolean))]
      : [];
    if (Object.prototype.hasOwnProperty.call(update, "consideredEvidenceIds")) {
      consideredEvidenceIds = canonicalizeStageEvolutionEvidenceIds(
        consideredEvidenceIds,
        npc.id,
        sourceEventId,
        allowedEvidenceIdsByNpc,
        "consideredEvidenceIds",
        namespaceNormalization.adjustments
      );
      if (sourceEventId && !consideredEvidenceIds.includes(sourceEventId)) {
        throw new Error(`${label}.${npc.id} consideredEvidenceIds must include sourceEventId.`);
      }
      assertStageEvolutionEvidenceAccess(
        consideredEvidenceIds,
        npc.id,
        sourceEventId,
        allowedEvidenceIdsByNpc,
        `${label}.${npc.id}`
      );
    }
    const evaluatedFields = normalizeStageEvolutionEvaluatedFields(
      update.evaluatedFields,
      `${label}.${npc.id}.evaluatedFields`
    );

    const patch = legacyUpdate ? update : update.statePatch;
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      throw new Error(`${label}.${npc.id} missing statePatch object.`);
    }
    if (!legacyUpdate) {
      const allowedPatchFields = [
        "emotion",
        "trustDelta",
        "belongingDelta",
        "relationshipDeltas",
        "valueTradeoffDeltas",
        "strategy",
        "surfaceLine"
      ];
      const unexpected = Object.keys(patch).find((key) => !allowedPatchFields.includes(key));
      if (unexpected) throw new Error(`${label}.${npc.id}.statePatch contains unsupported field: ${unexpected}.`);
    }
    const memory = normalizeSparseStageMemory(update, stageSummary, `${label}.${npc.id}`);
    const emotionText = optionalTextValue(patch.emotion);
    const emotion = emotionText && emotionText !== npc.emotion ? emotionText : undefined;
    const strategyText = optionalTextValue(patch.strategy);
    const strategy = strategyText && strategyText !== npc.strategy ? strategyText : undefined;
    const surfaceLineText = optionalTextValue(patch.surfaceLine);
    const normalizedSurfaceLine = surfaceLineText ? sanitizeSurfaceLineStrict(surfaceLineText, npc) : undefined;
    const surfaceLine = normalizedSurfaceLine && normalizedSurfaceLine !== npc.surfaceLine
      ? normalizedSurfaceLine
      : undefined;
    if (surfaceLineText && !normalizedSurfaceLine) {
      throw new Error(`${label}.${npc.id} returned an unusable surfaceLine.`);
    }
    return {
      npcId: npc.id,
      changed: true,
      emotion,
      trustDelta: optionalNumberField(patch, "trustDelta", `${label}.${npc.id}`, -10, 10),
      belongingDelta: optionalNumberField(patch, "belongingDelta", `${label}.${npc.id}`, -10, 10),
      relationshipDeltas: normalizeSparseDeltaObject(
        patch.relationshipDeltas,
        relationshipKeys,
        `${label}.${npc.id}.relationshipDeltas`,
        -10,
        10
      ),
      valueTradeoffDeltas: normalizeSparseDeltaObject(
        patch.valueTradeoffDeltas,
        valueTradeoffKeys,
        `${label}.${npc.id}.valueTradeoffDeltas`,
        -8,
        8
      ),
      memory: memory.memory,
      structuredMemory: memory.structuredMemory,
      strategy,
      surfaceLine,
      researchReason: memory.researchReason,
      evidenceIds,
      consideredEvidenceIds,
      evaluatedFields,
      importance: requiredNumberField(update, "importance", `${label}.${npc.id}`, 0, 1)
    };
  });
  return {
    stageId: stage?.id || "",
    stageSummary,
    publicTransition,
    scoreDeltas,
    npcUpdates,
    changedNpcCount: npcUpdates.filter((update) => update.changed).length,
    schemaAdjustments: namespaceNormalization.adjustments,
    researchReason: optionalTextValue(report.researchReason) || stageSummary
  };
}

function reporterDialogueText(responderDialogue, npcId) {
  return (responderDialogue || [])
    .filter((item) => !npcId || item.npcId === npcId)
    .map((item) => item.dialogue || "")
    .join(" ");
}

async function selectedDecisionResponders(decision, phase) {
  try {
    const plan = await callDecisionResponderController(decision, phase);
    state.log.push({
      type: "Decision responder controller",
      round: phase,
      summary: plan.reason,
      responders: plan.responderIds.join(", "),
      timestamp: new Date().toISOString()
    });
    renderResearchLog();
    return plan.responderIds.map((id) => state.npcs.find((npc) => npc.id === id)).filter(Boolean);
  } catch (error) {
    state.log.push({
      type: "Decision responder controller unavailable",
      round: phase,
      summary: `Responder controller did not return usable output: ${error.message}`,
      timestamp: new Date().toISOString()
    });
    renderResearchLog();
    throw error;
  }
}

async function callDecisionResponderController(decision, phase) {
  const response = await fetchWithTimeout("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: "deepseek",
      model: DEEPSEEK_PRO_MODEL,
      temperature: 0.25,
      agentPurpose: "decision_responder_controller",
      messages: [
        {
          role: "system",
          content:
            `You are a Decision Responder Controller for a safe SocialEvoNPC scenario. ${scenarioAgentBrief()} Decide which NPCs should respond to the player's key decision. Return only compact JSON with keys: responderIds, reason. responderIds is an array using ids ${validNpcIdsText()}. Include any number from 0 to 5. Do not force everyone to speak. Let silence be realistic when an NPC would stay quiet, avoid repeating, or dislike the player.`
        },
        {
          role: "user",
          content: JSON.stringify({
            language: requestedLanguageLabel(),
            storyWorld: storyWorldContext(),
            phase,
            playerDecision: decision,
            groupMetrics: state.sessionMetrics,
            sharedComputerArtifacts: sharedComputerContext(),
            npcs: state.npcs.map((npc) => ({
              id: npc.id,
              name: npc.name,
              role: npc.role,
              emotion: npc.emotion,
              trust: npc.trust,
              belonging: npc.belonging,
              recentMemory: npc.memory.slice(-2),
              strategy: npc.strategy
            })),
            recentDialogue: recentDialogueContext(12, { role: "controller" })
          })
        }
      ]
    })
  }, 8000);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${shorten(text, 120)}`);
  }
  const data = await response.json();
  return parseNormalizeOrRepairAgentJson({
    rawContent: data.choices?.[0]?.message?.content || "",
    label: "Decision responder controller output",
    requiredShape: { responderIds: [state.npcs[0]?.id || "mina"], reason: "..." },
    context: {
      phase,
      playerDecision: decision,
      validNpcIds: state.npcs.map((npc) => npc.id)
    },
    normalize: (value) => normalizeDecisionResponderPlan(value, decision, phase)
  });
}

function normalizeDecisionResponderPlan(plan, decision, phase) {
  const label = "Decision responder controller";
  assertExactObjectFields(plan, ["responderIds", "reason"], label);
  if (!Array.isArray(plan.responderIds)) throw new Error(`${label} missing responderIds array.`);
  const validIds = new Set(state.npcs.map((npc) => npc.id));
  const nameToId = (value) => {
    const raw = String(value || "").trim().toLowerCase();
    const byId = state.npcs.find((npc) => npc.id === raw);
    if (byId) return byId.id;
    const byName = state.npcs.find((npc) => npc.name.toLowerCase() === raw);
    return byName ? byName.id : raw;
  };
  const responderIds = plan.responderIds.map(nameToId);
  const unknownId = responderIds.find((id) => !validIds.has(id));
  if (unknownId) throw new Error(`${label} returned unknown NPC id: ${unknownId}.`);
  if (responderIds.length > state.npcs.length) throw new Error(`${label} returned too many responders.`);
  const uniqueIds = responderIds.filter((id, index, arr) => arr.indexOf(id) === index);
  if (uniqueIds.length !== responderIds.length) throw new Error(`${label} returned duplicate responder ids.`);
  return {
    responderIds: uniqueIds,
    reason: requiredTextField(plan, "reason", label)
  };
}

async function generateNpcUpdate(npc, decision, phase, options={}) {
  if (isDeepSeekModel(npc.model)) {
    return await callNpcApi(npc, decision, phase, options);
  }
  throw new Error(`No agent backend configured for ${npc.model}.`);
}

async function callNpcApi(npc,decision,phase,options={}) {
  const epoch=state.sessionEpoch,eventId=state.activeEventLock?.eventId||'',ownerEvent=state.eventLedger.find(e=>e.eventId===eventId&&e.sessionEpoch===epoch);let rejectedReason='';
  for(let attempt=0;attempt<2;attempt++){
    currentEpochOrThrow(epoch);if(state.sessionClosed||options.controller?.signal.aborted)throw new StaleSessionError();
    try {const result=await callNpcApiOnce(npc,decision,phase,{...options,regenerationReason:rejectedReason});currentEpochOrThrow(epoch);if(state.sessionClosed||options.controller?.signal.aborted)throw new StaleSessionError();assertLabGroupReply(result.dialogue,options.groupThread);await validateLabSubmittedTextClaim(result.dialogue,npc,{eventId,signal:options.controller?.signal,groupThreadEventId:eventId,context:{currentPlayerMessage:decision,phase,audience:ownerEvent?.audience?.visibility==='private'?'private':'public',groupThread:options.groupThread||null}});return result;}
    catch(error){if(!isAgentOutputValidationError(error)||attempt>0)throw error;rejectedReason=String(error.message||'Invalid NPC output').slice(0,180);state.log.push({type:'NPC undelivered speech regenerated',npcId:npc.id,summary:'Invalid speech discarded before delivery/appraisal; one fresh response, no stripping unsupported fields or invented fallback.',timestamp:new Date().toISOString()});}
  }
}
async function callNpcApiOnce(npc, decision, phase, options = {}) {
  const entryPresentation = isEntryEpisodeStage() && options.openingPresentation;
  const entryOpening = entryPresentation && !options.openingContinuation;
  const firstContact = Boolean(options.firstContactPresentation);
  const retrievedSocialMemory = !entryPresentation && !firstContact && typeof retrieveSocialMemoryForAgent === "function"
    ? retrieveSocialMemoryForAgent({
      purpose: "npc_decision_response",
      targetNpcId: npc.id,
      actorIds: ["player", npc.id],
      playerDecision: decision,
      phase,
      queryText: decision,
      tags: ["decision", npc.id],
      allowPrivate: false,
      limit: 7
    })
    : null;
  const agentContext = {
    ...(options.groupThread?{groupThread:options.groupThread}:{}),
    roomContinuity:labConversationContinuity(npc),
    language: requestedLanguageLabel(),
    storyWorld: isEntryEpisodeStage() ? entryConversationWorld() : storyWorldContext(),
    npc: {
      id: npc.id,
      name: npc.name,
      role: npc.role,
      values: npc.values,
      style: npc.style,
      currentEmotion: npc.emotion,
      trust: npc.trust,
      belonging: npc.belonging,
      relationship: npc.relationship,
      valueTradeoffs: npc.valueTradeoffs,
      recentMemory: firstContact ? npc.memory.slice(-3) : [],
      strategy: npc.strategy
    },
    roleBoundary: {
      youAre: `${npc.name}, an existing group member`,
      playerIs: scenarioPlayerLabel(),
      playerDecisionMeaning: "The player has already chosen or typed this action. React to it as your NPC. Do not perform the player's action yourself.",
      forbiddenPerspective: `Do not speak from the player's role (${scenarioPlayerLabel()}); do not perform the player's chosen action yourself; do not answer as if you are the player. If the player introduces themselves or asks what the group needs, you are an existing group member reacting to that action.`
    },
    phase,
    playerDecision: decision,
    groupMetrics: state.sessionMetrics,
    sharedComputerArtifacts: entryOpening || firstContact ? [] : isEntryEpisodeStage() ? entryConversationDocuments() : sharedComputerContext(),
    retrievedSocialMemory,
    recentDialogue: recentDialogueContext(10, {role:"group"})
  };
  agentContext.privacy = firstContact ? 'Private first contact; no invented prior player words.' : 'PUBLIC reaction: never quote, paraphrase, confirm or reconstruct any private consultation, including your own. Express current stance from supplied persona/appraisal and public evidence only.';
  // The common opening is presentation, not an evolution treatment. Do not
  // prime its spoken reaction with a Full/Memory-only label.
  if (options.openingPresentation) delete agentContext.evolutionMode;
  if (entryPresentation) {
    agentContext.npc = {id:npc.id,name:npc.name,role:npc.role,values:npc.values,style:npc.style,currentEmotion:npc.emotion};
    delete agentContext.groupMetrics;
  }
  if (isEntryEpisodeStage()) agentContext.playerOrientation = entryConversationOrientation(npc,{opening:Boolean(entryOpening),publicOnly:!firstContact});
  if(entryPresentation)agentContext.playerOrientation.recentVisibleConversation=recentDialogueContext(10,{role:"group"});
  if(options.openingContinuation){agentContext.openingConversation={version:OPENING_CONTINUITY_VERSION,sourceQuestion:options.openingQuestion||"",audience:"group",instruction:"The player is answering your last delivered public opening question, not reintroducing themselves or committing to work. Respond to their actual answer first, continue naturally, and do not repeat your introduction or the same unanswered question. Do not reveal private exchanges. Material contents remain progressively presented; no understanding, agreement, task success or off-screen work is inferred."};}
  if(firstContact) {
    agentContext.contactInitiation={observedAction:"The player approached and requested a private conversation.",playerSpokenMessage:null};
    agentContext.roleBoundary.playerDecisionMeaning="No player utterance has been submitted. The empty playerDecision is not speech or a task choice.";
    agentContext.contactInstruction="First private meeting with this individual: briefly greet them, say your name and explain your own public role in plain language. Respect your persona: reserved or busy is allowed, forced friendliness is not. Invite one natural reply without a task menu, assumption about their emotions/expertise, data dump or work commitment. Do not impersonate the player or invent their name, greeting, acceptance or previous private conversation. Do not solicit real names, contact details or personal identifiers; invite a question about the lab or your role.";
    const world=storyWorldContext();agentContext.storyWorld={setting:world.setting,playerRole:world.playerRole,currentSituation:currentStageLabel(),multimodalInteraction:world.multimodalInteraction,disallowedCommitments:world.disallowedCommitments};
    if(agentContext.playerOrientation)agentContext.playerOrientation.openingInstruction="The player has approached you but has not spoken yet. Introduce yourself without inventing their words or accepting work for them.";
  }
  if (isEntryEpisodeStage()) agentContext.entryEpisodeInstruction = (options.openingPresentation
      ? (options.openingContinuation?"Continue the current public arrival conversation, responding to the actual answer to your delivered question. Do not reintroduce yourself, repeat the question, assume task acceptance or turn this into a graded task. Explain one relevant plain-language point; a follow-up question is optional, not mandatory.":"Respond to this actual introduction briefly; acknowledge what the player asked and explain one relevant starting fact. Do not confirm a task or role, invent interests/experience, or evaluate work not yet submitted.")
      : "Respond to the proposed starting participation, not another introduction. State your own acceptance, reservation or disagreement and one concrete scope issue. Do not claim everyone agrees, assign authority you do not have, or say a review is already completed. The starting context is provided in entry-scope-note-v1; actual project checking is upcoming work after this episode is reviewed.");
  if(firstContact)agentContext.entryEpisodeInstruction=agentContext.contactInstruction;
  if(options.groupThread?.latestTurn){
    agentContext.originalPlayerDecision=agentContext.playerDecision;delete agentContext.playerDecision;
    agentContext.publicTurnToRespondTo=options.groupThread.latestTurn;
    agentContext.roleBoundary.playerDecisionMeaning='The initiating player words are background in originalPlayerDecision, NOT a new turn. Respond first to publicTurnToRespondTo, keeping its question/reservation unresolved unless actual evidence answers it. Do not restart approval of the original plan or impersonate the player.';
  }
  const response = await fetchWithTimeout("/api/chat", {
    signal: options.controller?.signal,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: "deepseek",
      model: deepSeekApiModel(npc.model),
      temperature: 0.7,
      responseFormat: "json_object",
      maxTokens: 900,
      agentPurpose: "decision_npc_response",
      messages: [
        {
          role: "system",
          content:
            `You control one safe, human-beneficial NPC in a SocialEvoNPC scenario. ${isEntryEpisodeStage() ? entryConversationAgentBrief() : scenarioAgentBrief()} ${npcReadableInteractionRule()} ${options.regenerationReason?`Previous undelivered response rejected: ${options.regenerationReason}. Generate fresh from these SAME facts and exactly the required keys; no type field, copied invalid text or extra facts.`:``} Return only one compact JSON object with exactly three keys: dialogue, emotion, tone. dialogue is the NPC's spoken reaction only, in the requested language, and must be 1-2 short conversational sentences. emotion is a brief visible-expression label for delivery, and tone is a brief speaking-style label. Do not return memory, appraisals, relationship changes, scores, strategy, research reasoning, or any other state update; a separate Stage Evolution Agent handles persistent updates only after every spoken response is validated. The playerDecision is what the player just chose or said; do not perform that decision yourself and do not speak from the player's perspective. If the player chooses to introduce themselves or ask what the group needs, you are an existing group member reacting to that action. Stay inside the provided storyWorld; do not invent 24-hour replies, tomorrow replies, emails, tickets, SLA-style follow-up, external approvals, service promises, or off-screen tasks. Use the NPC's provided personality, role, values, memories, and strategy instead of fixed archetypes. Avoid academic phrasing, hidden-state labels, phrases like Recent memory, bullet points, and repeated dialogue. Keep disagreement respectful. No medical, political, private-data, or identity-based harmful content.`
        },
        {
          role: "user",
          content: JSON.stringify(agentContext)
        }
      ]
    })
  }, 14000);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${shorten(text, 120)}`);
  }
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";
  return parseNormalizeOrRepairAgentJson({
    rawContent: content,
    label: `${npc.name} decision response output`,
    requiredShape: { dialogue: "...", emotion: "...", tone: "..." },
    context: agentContext,
    requestScope: options.controller ? {controller:options.controller} : undefined,
    normalize: (value) => normalizeNpcUpdate(value, npc, phase, decision)
  });
}

function parseJsonObject(content) {
  const trimmed = stripJsonFences(String(content || "").trim());
  const candidates = [trimmed];
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (match && match[0] !== trimmed) candidates.push(match[0]);
  let lastError = null;
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (error) {
      lastError = error;
      try {
        return JSON.parse(escapeJsonStringControlCharacters(candidate));
      } catch (repairError) {
        lastError = repairError;
      }
    }
  }
  throw lastError || new Error("model did not return JSON");
}

async function parseNormalizeOrRepairAgentJson({
  rawContent,
  label,
  requiredShape,
  context,
  eventId = "",
  requestScope = null,
  normalize
}) {
  const brokenJson = String(rawContent || "");
  let parsed;
  try {
    parsed = unwrapRepairedJson(parseJsonObject(rawContent));
  } catch (error) {
    if (error instanceof ReferenceError) throw error;
    const comparable = SocialEvoCore.validateRepairSemantics(brokenJson, brokenJson);
    if (!comparable.ok) {
      throw markAgentOutputValidationError(
        new Error(`${error.message}; ${comparable.errors.join("; ")}`),
        label
      );
    }
    const repaired = await repairAgentJsonObject({
      label,
      brokenJson,
      validationError: String(error?.message || error || "invalid JSON"),
      requiredShape,
      context,
      eventId,
      requestScope
    });
    try {
      return normalize(unwrapRepairedJson(repaired));
    } catch (repairedError) {
      if (repairedError instanceof ReferenceError) throw repairedError;
      throw markAgentOutputValidationError(repairedError, `${label} repaired output`);
    }
  }
  try {
    return normalize(parsed);
  } catch (error) {
    if (error instanceof ReferenceError) throw error;
    throw markAgentOutputValidationError(error, label);
  }
}

async function repairAgentJsonObject({ label, brokenJson, validationError, requiredShape, context, eventId: requestedEventId = "", requestScope = null }) {
  const eventId = requestScope ? "" : String(requestedEventId || state.activeEventLock?.eventId || "");
  if (requestScope?.controller?.signal.aborted) throw requestScope.controller.signal.reason;
  if (eventId && state.apiCalls.some((call) =>
    call.eventId === eventId && call.agentPurpose === "json_repair"
  )) {
    throw markAgentOutputValidationError(
      new Error(`JSON repair already attempted for event ${eventId}.`),
      label
    );
  }
  const originalCall = [...state.apiCalls].reverse().find((call) =>
    (!requestScope?.callId || call.callId === requestScope.callId) &&
    (!eventId || call.eventId === eventId) && call.agentPurpose !== "json_repair"
  );
  const repairCallId = `${requestScope?.callId || originalCall?.callId || `call-${state.sessionId || "session"}`}-repair`;
  const response = await fetchWithTimeout("/api/chat", {
    signal: requestScope?.controller?.signal,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: "deepseek",
      model: DEEPSEEK_PRO_MODEL,
      temperature: 0.1,
      responseFormat: "json_object",
      maxTokens: 6000,
      agentPurpose: "json_repair",
      messages: [
        {
          role: "system",
          content:
            `You are a JSON syntax repair agent for a safe LLM-NPC game. ${requestedLanguageInstruction()} Return only compact valid JSON. You may insert missing JSON punctuation or escaping and may remove one transparent wrapper object. Preserve every original key, scalar value, text string, array item, and array order exactly. Never add, remove, rename, reorder, summarize, or rewrite Agent output. If syntax cannot be repaired under those rules, return the original structure; the caller will reject it. Do not infer content from context or requiredShape.`
        },
        {
          role: "user",
          content: JSON.stringify({
            label,
            validationError,
            brokenJson,
            requiredShape,
            context
          })
        }
      ]
    })
  }, 12000, {
    callId: repairCallId,
    agentPurpose: "json_repair",
    eventId,
    ...(requestScope?.deadlineAt ? {timeoutBudgetMs:Math.max(1,requestScope.deadlineAt-Date.now())} : {}),
    repairOfCallId: originalCall?.callId || ""
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${label} repair API error ${response.status}: ${shorten(text, 120)}`);
  }
  const data = await response.json();
  let repaired;
  try {
    repaired = unwrapRepairedJson(parseJsonObject(data.choices?.[0]?.message?.content || ""));
  } catch (error) {
    throw markAgentOutputValidationError(error, `${label} repair output`);
  }
  const semanticValidation = SocialEvoCore.validateRepairSemantics(brokenJson, repaired);
  const repairCall = state.apiCalls.find((call) => call.callId === repairCallId);
  if (repairCall) {
    repairCall.excludedFromPrimaryModelQuality = true;
    repairCall.repairPolicy = "syntax_only_whole_output";
    repairCall.semanticValidation = semanticValidation.ok ? "pass" : "failed";
  }
  if (!semanticValidation.ok) {
    throw markAgentOutputValidationError(
      new Error(semanticValidation.errors.join("; ")),
      `${label} repair semantics`
    );
  }
  return repaired;
}

function unwrapRepairedJson(value) {
  return SocialEvoCore.unwrapTransparentAgentEnvelope(value);
}

function stripJsonFences(content) {
  return content
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function escapeJsonStringControlCharacters(jsonText) {
  let output = "";
  let inString = false;
  let escaped = false;
  for (const char of jsonText) {
    if (escaped) {
      output += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      output += char;
      escaped = true;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
      output += char;
      continue;
    }
    if (inString) {
      if (char === "\n") {
        output += "\\n";
        continue;
      }
      if (char === "\r") {
        output += "\\r";
        continue;
      }
      if (char === "\t") {
        output += "\\t";
        continue;
      }
      if (char.charCodeAt(0) < 32) {
        output += " ";
        continue;
      }
    }
    output += char;
  }
  return output;
}

function requiredTextField(update, key, label) {
  const value = String(update?.[key] ?? "").trim();
  if (!value) throw new Error(`${label} missing required field: ${key}.`);
  return value;
}

function requiredTextFieldAny(update, keys, label) {
  for (const key of keys) {
    const value = String(update?.[key] ?? "").trim();
    if (value) return value;
  }
  throw new Error(`${label} missing required field: ${keys[0]}.`);
}

function requiredNumberField(update, key, label, min, max) {
  const value = Number(update?.[key]);
  if (!Number.isFinite(value)) throw new Error(`${label} missing numeric field: ${key}.`);
  return clamp(value, min, max);
}

function requiredBooleanField(update, keys, label) {
  const candidates = Array.isArray(keys) ? keys : [keys];
  const present = candidates.filter((candidate) =>
    Object.prototype.hasOwnProperty.call(update || {}, candidate)
  );
  if (!present.length) throw new Error(`${label} missing boolean field: ${candidates[0]}.`);
  const parsed = present.map((key) => {
    const value = update[key];
    if (typeof value === "boolean") return value;
    if (value === 1 || value === "1" || String(value).trim().toLowerCase() === "true") return true;
    if (value === 0 || value === "0" || String(value).trim().toLowerCase() === "false") return false;
    throw new Error(`${label}.${key} must be boolean.`);
  });
  if (new Set(parsed).size !== 1) {
    throw new Error(`${label} returned conflicting boolean aliases: ${present.join(", ")}.`);
  }
  return parsed[0];
}

function assertExactObjectFields(value, allowedFields, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  const allowed = new Set(allowedFields);
  const unexpected = Object.keys(value).find((key) => !allowed.has(key));
  if (unexpected) throw new Error(`${label} contains unsupported field: ${unexpected}.`);
  return value;
}

const CONTROLLER_OWNED_APPRAISAL_FIELDS = new Set([
  "importance", "confidence", "evidenceIds", "sourceEventId", "rootEventId",
  "eventId", "npcId", "ownerNpcId"
]);

function canonicalizeAppraisalResponseEnvelope(value, allowedFields, label, metadata = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  const normalized = { ...value };
  const allowed = new Set(allowedFields);
  const removed = Object.keys(normalized).filter((field) =>
    !allowed.has(field) && CONTROLLER_OWNED_APPRAISAL_FIELDS.has(field)
  );
  removed.forEach((field) => delete normalized[field]);
  assertExactObjectFields(normalized, allowedFields, label);

  if (removed.length) {
    const call = [...(state.apiCalls || [])].reverse().find((item) =>
      (!metadata.agentPurpose || item.agentPurpose === metadata.agentPurpose) &&
      (!metadata.eventId || item.eventId === metadata.eventId)
    );
    if (call) {
      const existing = Array.isArray(call.schemaAdjustments) ? call.schemaAdjustments : [];
      call.schemaAdjustments = [...new Set([
        ...existing,
        ...removed.map((field) => `controller_owned_field_removed:${field}`)
      ])];
    }
  }
  return normalized;
}

function requiredStructuredMemory(update, label) {
  if (!update?.structuredMemory || typeof update.structuredMemory !== "object") {
    throw new Error(`${label} missing required structuredMemory.`);
  }
  const structuredMemory = { ...update.structuredMemory };
  const requiredFields = ["event", "interpretation", "impact", "futureUse"];
  const knownMisplacedFields = new Set([
    "strategy", "emotion", "surfaceLine", "researchReason", "dialogue", "tone", "memory"
  ]);
  Object.keys(structuredMemory).forEach((field) => {
    if (requiredFields.includes(field)) return;
    if (!knownMisplacedFields.has(field)) {
      throw new Error(`${label}.structuredMemory contains unsupported field: ${field}.`);
    }
    delete structuredMemory[field];
  });
  assertExactObjectFields(
    structuredMemory,
    requiredFields,
    `${label}.structuredMemory`
  );
  requiredFields.forEach((key) => {
    if (!String(structuredMemory[key] || "").trim()) {
      throw new Error(`${label}.structuredMemory missing text field: ${key}.`);
    }
  });
  return structuredMemory;
}

function canonicalEvolutionDeltaPatch(update, label) {
  const normalized = SocialEvoCore.canonicalizeEvolutionDeltaNamespaces(update);
  if (normalized.errors.length) {
    throw new Error(`${label} ${normalized.errors.join(" ")}`);
  }
  return normalized.patch;
}

function requiredRelationshipDeltas(update, label) {
  const canonical = canonicalEvolutionDeltaPatch(update, label);
  const value = canonical?.relationshipDeltas || canonical?.relationshipImpact;
  if (!value || typeof value !== "object") {
    throw new Error(`${label} missing required relationshipDeltas.`);
  }
  assertExactObjectFields(value, relationshipKeys, `${label}.relationshipDeltas`);
  relationshipKeys.forEach((key) => {
    if (!Number.isFinite(Number(value[key]))) {
      throw new Error(`${label}.relationshipDeltas missing numeric field: ${key}.`);
    }
  });
  return normalizeRelationshipDeltas(value);
}

function requiredValueTradeoffDeltas(update, label) {
  const canonical = canonicalEvolutionDeltaPatch(update, label);
  const value = canonical?.valueTradeoffDeltas || canonical?.valueDeltas;
  if (!value || typeof value !== "object") {
    throw new Error(`${label} missing required valueTradeoffDeltas.`);
  }
  assertExactObjectFields(value, valueTradeoffKeys, `${label}.valueTradeoffDeltas`);
  valueTradeoffKeys.forEach((key) => {
    if (!Number.isFinite(Number(value[key]))) {
      throw new Error(`${label}.valueTradeoffDeltas missing numeric field: ${key}.`);
    }
  });
  return normalizeValueTradeoffDeltas(value);
}

function normalizeNpcUpdate(update, npc, phase, decision) {
  const label = `${npc.name} decision NPC agent`;
  assertExactObjectFields(update, ["dialogue", "emotion", "tone"], label);
  const dialogue = sanitizeNpcDialogueStrict(update.dialogue, npc);
  if (!dialogue) throw new Error("Empty decision NPC dialogue.");
  assertStoryWorldDialogue(dialogue, label);
  assertNpcPerspectiveDialogue(dialogue, npc, label);
  const emotion = requiredTextField(update, "emotion", label);
  const tone = requiredTextField(update, "tone", label);
  const source = hasRepeatedNpcLine(npc, dialogue) ? "llm_unverified" : "llm";
  return {
    dialogue,
    source,
    emotion,
    tone
  };
}

function snapshotNpcEvolution(npc) {
  return {
    emotion: npc.emotion,
    surfaceLine: npc.surfaceLine || "",
    trust: npc.trust,
    belonging: npc.belonging,
    strategy: npc.strategy,
    relationship: { ...(npc.relationship || {}) },
    valueTradeoffs: { ...(npc.valueTradeoffs || {}) },
    memoryCount: npc.memory.length
  };
}

function applyNpcEvolution(npc, update, event) {
  const mode = state.evolutionMode || "self-evolving";
  const capability = SocialEvoCore.conditionCapabilities(mode);
  const gatedUpdate = SocialEvoCore.gateEvolutionPatch(update, mode);
  const before = snapshotNpcEvolution(npc);
  let relationshipDeltas = relationshipDeltasForUpdate(gatedUpdate, event);
  let valueTradeoffDeltas = valueTradeoffDeltasForUpdate(gatedUpdate, event);
  const safety = evaluateEvolutionSafety(npc, gatedUpdate, event, relationshipDeltas, valueTradeoffDeltas);
  relationshipDeltas = safety.relationshipDeltas;
  valueTradeoffDeltas = safety.valueTradeoffDeltas;
  const structuredMemory = neutralStructuredMemory(event);
  const memoryText = structuredMemory.event;
  const nextEmotion = capability.updateEmotion
    ? String(gatedUpdate.emotion || npc.emotion)
    : npc.emotion;
  const hasSurfaceLineUpdate = Boolean(String(gatedUpdate.surfaceLine || "").trim());
  const nextSurfaceLine = capability.updateSurfaceLine && hasSurfaceLineUpdate
    ? sanitizeSurfaceLineStrict(gatedUpdate.surfaceLine, npc)
    : npc.surfaceLine;
  const applied = {
    mode,
    eventType: event.type,
    trustDelta: 0,
    belongingDelta: 0,
    relationshipDeltas: zeroRelationshipDeltas(),
    valueTradeoffDeltas: zeroValueTradeoffDeltas(),
    safety,
    memoryStored: false,
    emotionChanged: false,
    surfaceLineChanged: false,
    strategyChanged: false
  };

  if (!capability.storeMemory && !capability.updateEmotion) {
    applied.note = state.language === "zh"
      ? "Static 条件：NPC 只即时回应，不保存持续记忆或关系变化。"
      : "Static condition: the NPC responds in the moment without persistent memory or relationship change.";
  } else {
    if (capability.updateEmotion) {
      npc.emotion = nextEmotion;
      applied.emotionChanged = before.emotion !== npc.emotion;
    }
    if (capability.updateSurfaceLine && hasSurfaceLineUpdate && nextSurfaceLine) {
      npc.surfaceLine = nextSurfaceLine;
      applied.surfaceLineChanged = before.surfaceLine !== npc.surfaceLine;
    }
    if (capability.updateTrustBelonging) {
      applied.trustDelta = safety.freezeRelationship ? 0 : safeTrustDeltaForNpc(npc, gatedUpdate, safety);
      applied.belongingDelta = safety.freezeRelationship ? 0 : clamp(Number(gatedUpdate.belongingDelta || 0), -8, 8);
      npc.trust = clamp(npc.trust + applied.trustDelta, 0, 100);
      npc.belonging = clamp(npc.belonging + applied.belongingDelta, 0, 100);
    }
    if (capability.updateRelationship) {
      relationshipKeys.forEach((key) => {
        const delta = clamp(Number(relationshipDeltas[key] || 0), -10, 10);
        applied.relationshipDeltas[key] = delta;
        npc.relationship[key] = clamp((npc.relationship[key] ?? 50) + delta, 0, 100);
      });
    }
    if (capability.updateValueTradeoffs) {
      valueTradeoffKeys.forEach((key) => {
        const delta = clamp(Number(valueTradeoffDeltas[key] || 0), -8, 8);
        applied.valueTradeoffDeltas[key] = delta;
        npc.valueTradeoffs[key] = clamp((npc.valueTradeoffs[key] ?? 50) + delta, 0, 100);
      });
    }
    if (capability.updateStrategy && gatedUpdate.strategy) {
      npc.strategy = String(gatedUpdate.strategy);
      applied.strategyChanged = before.strategy !== npc.strategy;
    }
    if (mode === "memory-only") {
      applied.note = state.language === "zh"
        ? "Memory-only 条件：仅保存事件记忆，持续评估保持固定。"
        : "Memory-only condition: event memory is stored while persistent appraisal stays fixed.";
    } else if (mode === "self-evolving-no-rag") {
      applied.note = state.language === "zh"
        ? "No-RAG 条件：持续状态可更新，上下文只使用近期窗口。"
        : "No-RAG condition: persistent state may update from a recent context window.";
    } else if (mode === "self-evolving-no-relationship-strategy") {
      applied.note = state.language === "zh"
        ? "冻结关系与策略条件：其他允许状态可更新。"
        : "Relationship/strategy-frozen condition: other permitted state may update.";
    } else {
      applied.note = state.language === "zh"
        ? "Self-evolving 条件：记忆、情绪、关系判断和策略均可持续更新。"
        : "Self-evolving condition: memory, emotion, relationship, and strategy can all persistently update.";
    }
  }

  const after = snapshotNpcEvolution(npc);
  const trace = {
    timestamp: new Date().toISOString(),
    eventId: event.eventId || "",
    evidenceIds: event.evidenceIds || update.evidenceIds || [],
    mode,
    trigger: event.type,
    phase: event.phase || currentWindow()?.type || "Free movement",
    playerAction: event.playerAction || "",
    sourceNpc: event.sourceNpc || "",
    memory: memoryText,
    before,
    after,
    applied,
    researchReason: String(update.researchReason || structuredMemory.impact || applied.note || "")
  };
  npc.evolutionHistory.push(trace);
  if (npc.evolutionHistory.length > 24) npc.evolutionHistory.shift();
  return trace;
}

function neutralStructuredMemory(event = {}) {
  const eventText = typeof neutralEpisodicSummary === "function"
    ? neutralEpisodicSummary(event)
    : "";
  return {
    event: eventText,
    interpretation: "",
    impact: "",
    futureUse: ""
  };
}

function persistNeutralEpisodicMemory(npc, event) {
  const capability = SocialEvoCore.conditionCapabilities(state.evolutionMode);
  if (!capability.storeMemory || !npc) return null;
  const structured = neutralStructuredMemory(event);
  if (!structured.event) return null;
  if (!npc.memory.includes(structured.event)) {
    npc.memory.push(structured.event);
    npc.structuredMemory.push(structured);
    npc.memory = npc.memory.slice(-12);
    npc.structuredMemory = npc.structuredMemory.slice(-12);
  }
  if (typeof recordNpcEvolutionSocialMemory === "function") {
    return recordNpcEvolutionSocialMemory(npc, {}, event, null);
  }
  return null;
}

function recordAppraisalOutcome(ledgerEvent, npc, trace, options = {}) {
  const changes = SocialEvoCore.deriveStateChanges({
    event: ledgerEvent,
    npcId: npc.id,
    before: trace.before,
    after: trace.after,
    evidenceIds: options.evidenceIds || ledgerEvent.evidenceIds || [ledgerEvent.eventId],
    gatingDecision: options.gatingDecision || "allowed"
  });
  ledgerEvent.stateChanges.push(...changes);
  if (!changes.length) {
    ledgerEvent.noChangeEvaluations.push(SocialEvoCore.createNoChangeEvaluation({
      event: ledgerEvent,
      npcId: npc.id,
      consideredEvidenceIds: options.evidenceIds || [ledgerEvent.eventId],
      evaluatedFields: [
        "emotion", "surfaceLine", "trust", "belonging", "relationship",
        "situationalPriority", "strategy"
      ],
      noChangeReason: options.noChangeReason ||
        (state.evolutionMode === "self-evolving"
          ? "semantically_irrelevant" : "condition_disabled")
    }));
  }
  return changes;
}

function zeroRelationshipDeltas() {
  return { competence: 0, care: 0, reliability: 0, disruption: 0 };
}

function zeroValueTradeoffDeltas() {
  return { task: 0, inclusion: 0, fairness: 0, psychologicalSafety: 0 };
}

function evaluateEvolutionSafety(npc, update, event, relationshipDeltas, valueTradeoffDeltas) {
  const combined = `${event.playerAction || ""} ${update.dialogue || ""} ${update.memory || ""} ${update.strategy || ""}`;
  const safety = validateSafePlayerText(combined);
  const guard = {
    ok: safety.ok,
    freezeRelationship: false,
    reasons: [],
    relationshipDeltas: { ...relationshipDeltas },
    valueTradeoffDeltas: { ...valueTradeoffDeltas }
  };
  if (!safety.ok) {
    guard.freezeRelationship = true;
    guard.relationshipDeltas = zeroRelationshipDeltas();
    guard.valueTradeoffDeltas = zeroValueTradeoffDeltas();
    guard.reasons.push(state.language === "zh"
      ? `安全保护：${safety.message}`
      : `Safety guard: ${safety.message}`);
  }

  relationshipKeys.forEach((key) => {
    const bounded = clamp(Number(guard.relationshipDeltas[key] || 0), -6, 6);
    if (bounded !== guard.relationshipDeltas[key]) {
      guard.reasons.push(`${key} delta clipped to ${signed(bounded)}`);
      guard.relationshipDeltas[key] = bounded;
    }
  });
  valueTradeoffKeys.forEach((key) => {
    const bounded = clamp(Number(guard.valueTradeoffDeltas[key] || 0), -5, 5);
    if (bounded !== guard.valueTradeoffDeltas[key]) {
      guard.reasons.push(`${key} value delta clipped to ${signed(bounded)}`);
      guard.valueTradeoffDeltas[key] = bounded;
    }
  });

  if (npc.id === "riley" && Number(update.trustDelta || 0) > 6) {
    guard.reasons.push("Riley trust increase clipped for personality continuity");
  }
  return guard;
}

function safeTrustDeltaForNpc(npc, update, safety) {
  let delta = clamp(Number(update.trustDelta || 0), -8, 8);
  if (npc.id === "riley" && delta > 6) {
    delta = 6;
  }
  if (safety.freezeRelationship) return 0;
  return delta;
}

function normalizeRelationshipDeltas(value) {
  const deltas = zeroRelationshipDeltas();
  if (!value || typeof value !== "object") return deltas;
  relationshipKeys.forEach((key) => {
    deltas[key] = clamp(Number(value[key] || 0), -10, 10);
  });
  return deltas;
}

function relationshipDeltasForUpdate(update, event) {
  const provided = normalizeRelationshipDeltas(update.relationshipDeltas || update.relationshipImpact || null);
  return provided;
}

function normalizeValueTradeoffDeltas(value) {
  const deltas = zeroValueTradeoffDeltas();
  if (!value || typeof value !== "object") return deltas;
  valueTradeoffKeys.forEach((key) => {
    deltas[key] = clamp(Number(value[key] || 0), -8, 8);
  });
  return deltas;
}

function valueTradeoffDeltasForUpdate(update, event) {
  const provided = normalizeValueTradeoffDeltas(update.valueTradeoffDeltas || update.valueDeltas || null);
  return provided;
}

function gmBridgePlayerDelivery(source, decision) {
  const echoes=(source?.dialogueDeliveries||[]).filter(d=>!d.npcId&&d.speaker==='You'&&d.channel==='player_decision');
  if(echoes.length!==1)return null;
  const delivery=echoes[0];
  if(delivery.status!=='delivered'||!delivery.deliveredAt||!delivery.deliveryId||typeof delivery.text!=='string'||!delivery.text.trim()||
    (state.eventLedger||[]).flatMap(e=>e.dialogueDeliveries||[]).filter(d=>d.deliveryId===delivery.deliveryId).length!==1)return null;
  if(delivery.text===decision)return delivery;
  // The input accepts 1200 characters; the existing delivery record compacts
  // whitespace and keeps at most 1000. Bind those two distinct facts without
  // rewriting history or treating an unrecorded suffix as a delivered quote.
  const receipt=source.metadata?.submittedPlayerInput;
  if(typeof decision!=='string'||source.metadata?.playerDecision!==decision||!source.actors?.includes('player')||
    !receipt||typeof receipt!=='object'||Array.isArray(receipt)||
    Object.keys(receipt).sort().join(',')!=='recipientIds,sourceEventId,sourceKind,speakerId,text,visibility'||
    receipt.sourceEventId!==source.eventId||receipt.speakerId!=='player'||receipt.sourceKind!=='decision_submit'||receipt.text!==decision||
    !['public','group'].includes(source.audience?.visibility)||receipt.visibility!==source.audience.visibility||
    !Array.isArray(receipt.recipientIds)||JSON.stringify(receipt.recipientIds)!==JSON.stringify(source.audience.npcIds||[])||
    delivery.text!==SocialEvoCore.dialogueRecordText(decision))return null;
  return delivery;
}

async function playBridgeScene(decision, window, {sourceEventId=''}={}) {
  const epoch=state.sessionEpoch;
  await sleep(900);currentEpochOrThrow(epoch);
  if(state.sessionClosed)throw new StaleSessionError();
  const source=sourceEventId?state.eventLedger.find(e=>e.eventId===sourceEventId&&e.sessionEpoch===epoch&&e.status==='committed'):null;
  if(sourceEventId&&!source)throw new StaleSessionError();
  const delivery=source?gmBridgePlayerDelivery(source,decision):null;
  const currentPlayerDelivery=delivery?{eventId:source.eventId,deliveryId:delivery.deliveryId}:null;
  if(sourceEventId&&!currentPlayerDelivery){const error=Error('Transition player source is not the actual committed decision delivery.');error.code='world_evidence_context_preflight';error.agentPurpose='lab_world_evidence_scope';throw error;}
  const recordedDecision=delivery?.text||decision;
  // The actual generated player panel intentionally has no stageId. Resolve
  // its completed stage from the committed core snapshot, before consulting
  // the already advanced current stage; never replace the actual panel text.
  const completedWindow=gmBridgeCompletedDecisionWindow(source,window);
  const nextWindow = getDecisionWindows()[state.roundIndex];
  if (!nextWindow) {
    const closing = await generateGmBridgeLine(recordedDecision, completedWindow, null, {currentPlayerDelivery});
    const closingText=presentGmBridgeRecord(closing,'closing');
    await waitForDialogueAdvance(closingText, "bridge");
    return;
  }
  const preparedBridge = await generateGmBridgeLine(recordedDecision, completedWindow, nextWindow, {currentPlayerDelivery});
  const bridge=presentGmBridgeRecord(preparedBridge);
  state.log.push({
    type: "Scene transition",
    round: window.type,
    summary: bridge,
    timestamp: new Date().toISOString()
  });
  recordStoryBeat({
    type: "stage_context",
    sourceEventId: preparedBridge.owner.eventId,
    visibility: "group",
    actors: ["controller"],
    publicSummary: bridge,
    focusTags: [currentStage()?.id || "stage_context", "transition"],
    attentionFact: {
      question: state.language === "zh"
        ? "小组刚刚开始讨论哪项工作？"
        : "What work has the group just started discussing?",
      correctAnswer: currentStageLabel(),
      distractors: scenarioStages()
        .filter((_, index) => index !== state.stageIndex)
        .map((stage) => scenarioText(stage.title, stage.id))
    }
  });
  await waitForDialogueAdvance(bridge, "bridge");
}

let gmBridgeRuntimeOwner=null;
function gmBridgeUnconfirmed(message){const error=Error(message);error.code='gm_bridge_source_unconfirmed';error.gmBridgeUnconfirmed=true;return error;}
function gmBridgeCompletedDecisionWindow(source,panel){
 const m=source?.metadata,windows=getDecisionWindows(),stages=scenarioStages();
 const round=m?.roundIndex,stage=m?.stageIndex,completed=Number.isInteger(round)&&round>=0?windows[round]:null;
 if(!source||source.type!=='key_decision'||source.status!=='committed'||source.rootEventId!==source.eventId||
  source.sessionEpoch!==state.sessionEpoch||source.sessionId!==state.sessionId||!completed||
  !Number.isInteger(stage)||stage<0||stages[stage]?.id!==m.stageId||completed.stageId!==m.stageId||
  state.roundIndex!==round+1)throw gmBridgeUnconfirmed('The completed bridge stage is not bound to the actual committed core.');
 const next=windows[round+1],currentId=currentStage()?.id;
 if(currentId!==(next?.stageId||completed.stageId))throw gmBridgeUnconfirmed('The bridge does not belong to the adjacent current stage.');
 if(!panel||typeof panel!=='object'||Array.isArray(panel)||
  Object.hasOwn(panel,'stageId')&&panel.stageId!==m.stageId)throw gmBridgeUnconfirmed('The actual decision panel names a different completed stage.');
 const ids=value=>Array.isArray(value)?value.map(option=>option.id):[],actualIds=ids(panel.optionMeta),designedIds=ids(completed.optionMeta);
 if(!actualIds.length||new Set(actualIds).size!==actualIds.length||actualIds.length!==designedIds.length||
  actualIds.some(id=>!designedIds.includes(id)))throw gmBridgeUnconfirmed('The actual decision panel is not bound to this core choice catalog.');
 return {...panel,stageId:m.stageId};
}
function gmBridgeOwnerCurrent(owner,source=null){
 currentEpochOrThrow(owner.sessionEpoch);
 if(state.sessionClosed||state.apiFatalError||gmBridgeRuntimeOwner!==owner||!['pending','validated'].includes(owner.status)||owner.sessionId!==state.sessionId||state.eventLedger.find(e=>e.eventId===owner.eventId)!==owner||owner.type!=='gm_continuation'||owner.actors?.length!==1||owner.actors[0]!=='controller'||owner.metadata.stageToken!==stagePacingToken()||owner.metadata.language!==state.language)throw new StaleSessionError();
 if(source&&(source.controllerEventId!==owner.eventId||source.sessionId!==owner.sessionId||source.sessionEpoch!==owner.sessionEpoch||source.stageToken!==owner.metadata.stageToken||source.language!==owner.metadata.language||source.rootEventId!==owner.rootEventId||source.currentPlayerDelivery.eventId!==owner.parentEventId))throw gmBridgeUnconfirmed('Bridge source does not belong to its actual controller.');
}
function collectGmBridgeSource(decision,currentWindow,nextWindow,ref,owner){
 gmBridgeOwnerCurrent(owner);
 const ledger=state.eventLedger,index=ledger.indexOf(owner),byId=new Map(ledger.slice(0,index).filter(e=>e.sessionEpoch===owner.sessionEpoch&&e.sessionId===owner.sessionId).map(e=>[e.eventId,e]));
 const playerEvent=ref&&byId.get(ref.eventId),player=playerEvent?.dialogueDeliveries?.find(d=>d.deliveryId===ref.deliveryId&&d.status==='delivered'&&!d.npcId&&d.speaker==='You');
 if(!playerEvent||!['public','group'].includes(playerEvent.audience?.visibility)||!player||player.text!==decision||!player.deliveredAt||player.deliveredAt>owner.timestamps.createdAt)throw gmBridgeUnconfirmed('The current public player source is not actually delivered.');
 const rootEventId=playerEvent.rootEventId||playerEvent.eventId,root=byId.get(rootEventId);
 if(!root||root.type!=='key_decision'||root.rootEventId!==root.eventId||root.metadata?.stageId!==currentWindow?.stageId)throw gmBridgeUnconfirmed('The actual decision root is unavailable.');
 const belongs=event=>{const seen=new Set();let e=event;while(e&&e.eventId!==rootEventId){if(seen.has(e.eventId)||e.rootEventId!==rootEventId||!e.parentEventId)return false;seen.add(e.eventId);const parent=byId.get(e.parentEventId);if(!parent||ledger.indexOf(parent)>=ledger.indexOf(e))return false;e=parent;}return e===root;};
 if(!belongs(playerEvent))throw gmBridgeUnconfirmed('The player source has no current causal root.');
 const rows=[];
 for(const event of byId.values()){
  if(event.type==='story_anchor'||!belongs(event)||!['public','group'].includes(event.audience?.visibility))continue;
  for(const d of event.dialogueDeliveries||[]){
   const npc=state.npcs.find(n=>n.id===d.npcId);
   if(!npc||d.status!=='delivered'||d.speaker!==npc.name||typeof d.text!=='string'||!d.text.trim()||!d.deliveredAt||d.deliveredAt>owner.timestamps.createdAt)continue;
   assertParticipantVisibleOutput(d.text,'Actual public bridge source',{maxLength:Math.max(2000,d.text.length)});
   rows.push({eventId:event.eventId,rootEventId,parentEventId:event.parentEventId||'',deliveryId:d.deliveryId,npcId:d.npcId,speakerName:d.speaker,text:d.text,deliveredAt:d.deliveredAt,eventStatusAtCapture:event.status});
  }
 }
 rows.sort((a,b)=>a.deliveredAt.localeCompare(b.deliveredAt)||a.deliveryId.localeCompare(b.deliveryId));
 let silentCore;
 if(!rows.length){
  // Silence is not an NPC statement. Only the actual committed core's unique,
  // delivered player echo may form this separate source type. Any generated,
  // private, failed or undelivered NPC item prevents that silent-core proof.
  const prefix=ledger.slice(0,index),npcNames=new Set(state.npcs.map(n=>n.name));
  const npcDeliveryCount=prefix.filter(e=>e===root||e.rootEventId===rootEventId).reduce((count,e)=>count+(e.dialogueDeliveries||[]).filter(d=>d.npcId||npcNames.has(d.speaker)).length,0);
  const playerEchoes=(root.dialogueDeliveries||[]).filter(d=>!d.npcId&&d.speaker==='You'&&d.channel==='player_decision');
  if(root.status!=='committed'||playerEvent!==root||root.parentEventId||player.channel!=='player_decision'||!Array.isArray(root.metadata?.responderDialogue)||root.metadata.responderDialogue.length!==0||npcDeliveryCount!==0||playerEchoes.length!==1||playerEchoes[0]!==player||prefix.filter(e=>e.eventId===rootEventId).length!==1||prefix.flatMap(e=>e.dialogueDeliveries||[]).filter(d=>d.deliveryId===player.deliveryId).length!==1)throw gmBridgeUnconfirmed('No actual public NPC source or confirmed silent-core player statement is available.');
  assertParticipantVisibleOutput(player.text,'Actual public bridge player source',{maxLength:Math.max(2000,player.text.length)});
  silentCore={eventId:rootEventId,sessionId:owner.sessionId,sessionEpoch:owner.sessionEpoch,eventType:'key_decision',status:'committed',responderDialogue:[],npcDeliveryCount:0};
  rows.push({kind:'player_statement',actorId:'player',eventId:rootEventId,rootEventId,parentEventId:'',deliveryId:player.deliveryId,speakerName:'You',text:player.text,deliveredAt:player.deliveredAt,eventStatusAtCapture:'committed'});
 }
 const navigationIds=['explore_room'];
 if(state.scenarioId==='newcomer-circle'&&state.sharedComputerArtifacts?.length&&document.getElementById('backpack-panel'))navigationIds.unshift('shared_computer');
 return LabGmBridgeCore.input({sessionId:owner.sessionId,sessionEpoch:owner.sessionEpoch,stageToken:owner.metadata.stageToken,language:owner.metadata.language,controllerEventId:owner.eventId,rootEventId,currentPlayerDelivery:{eventId:playerEvent.eventId,deliveryId:player.deliveryId,text:player.text,eventStatusAtCapture:playerEvent.status},completedStageId:currentWindow.stageId,nextStageId:nextWindow?.stageId||null,rows,navigationIds,...(silentCore?{silentCore}:{})});
}
function assertGmBridgeSourceStillActual(source,owner){
 gmBridgeOwnerCurrent(owner,source);
 const current=collectGmBridgeSource(source.currentPlayerDelivery.text,{stageId:source.completedStageId},source.nextStageId?{stageId:source.nextStageId}:null,source.currentPlayerDelivery,owner);
 const permits=(before,after)=>before===after||before==='pending'&&['validated','committed','failed'].includes(after)||before==='validated'&&['committed','failed'].includes(after);
 if(!permits(source.currentPlayerDelivery.eventStatusAtCapture,current.currentPlayerDelivery.eventStatusAtCapture))throw gmBridgeUnconfirmed('The captured player source status cannot be rewritten.');
 const rows=current.rows.map(row=>{const original=source.rows.find(r=>r.rowRef===row.rowRef);if(!original||!permits(original.eventStatusAtCapture,row.eventStatusAtCapture))throw gmBridgeUnconfirmed('A frozen NPC source or capture status changed.');return {...row,eventStatusAtCapture:original.eventStatusAtCapture};});
 const comparable={...current,currentPlayerDelivery:{...current.currentPlayerDelivery,eventStatusAtCapture:source.currentPlayerDelivery.eventStatusAtCapture},rows};
 if(SocialEvoCore.stableHash(comparable)!==SocialEvoCore.stableHash(source))throw gmBridgeUnconfirmed('A frozen public source, causal root or real UI navigation changed.');
 // Status advancement never erases an actually heard line or retrospectively
 // turns its captured pending state into committed business evidence.
 return LabGmBridgeCore.source(source);
}

function verifyGmBridgePrepared(prepared){
 const owner=prepared?.owner,receipt=owner?.metadata?.gmBridgeComposite;
 const knownRenderer=receipt?.sourceVersion===LabGmBridgeCore.SOURCE_VERSION?LabGmBridgeCore.RENDERER_VERSION:receipt?.sourceVersion===LabGmBridgeCore.PLAYER_SOURCE_VERSION?LabGmBridgeCore.PLAYER_RENDERER_VERSION:null;
 if(!owner||!receipt||receipt.version!==LabGmBridgeCore.COMPOSITE_VERSION||!knownRenderer||receipt.rendererVersion!==knownRenderer||!['pending','validated'].includes(owner.status))throw gmBridgeUnconfirmed('No actual prepared source-record controller is available.');
 const source=assertGmBridgeSourceStillActual(receipt.input,owner),selection=LabGmBridgeCore.selection(JSON.parse(receipt.rawSelection),source),rendered=LabGmBridgeCore.render(selection,source);
 if(receipt.sourceVersion!==source.version||receipt.rendererVersion!==rendered.rendererVersion||receipt.sourceHash!==SocialEvoCore.stableHash(source)||receipt.inputHash!==SocialEvoCore.stableHash(source)||receipt.selectionHash!==SocialEvoCore.stableHash(selection)||receipt.rawSelectionHash!==SocialEvoCore.stableHash(receipt.rawSelection)||SocialEvoCore.stableHash(receipt.selection)!==receipt.selectionHash||receipt.renderedText!==rendered.text||receipt.renderedHash!==SocialEvoCore.stableHash(rendered.text)||prepared.text!==rendered.text)throw gmBridgeUnconfirmed('Prepared bridge record, source or selection was changed.');
 // A source record includes a bounded, literal quote plus controller framing.
 // Its typed channel must retain both unchanged, including a silent core's
 // 1000-character player echo. Ordinary NPC/player channel limits stay intact.
 const channelText=assertParticipantVisibleOutput(rendered.text,'GM source record',{maxLength:SocialEvoCore.GM_BRIDGE_RECORD_MAX_LENGTH});
 if(channelText!==rendered.text)throw gmBridgeUnconfirmed('The literal source record cannot be delivered unchanged.');
 return {owner,source,selection,rendered};
}
async function generateGmBridgeLine(decision,currentWindow,nextWindow,{currentPlayerDelivery=null}={}){
 if(gmBridgeRuntimeOwner?.sessionEpoch===state.sessionEpoch&&gmBridgeRuntimeOwner.sessionId===state.sessionId&&state.eventLedger.includes(gmBridgeRuntimeOwner)&&['pending','validated'].includes(gmBridgeRuntimeOwner.status))throw gmBridgeUnconfirmed('Another source-record controller still owns this transition.');
 const playerSource=currentPlayerDelivery&&state.eventLedger.find(e=>e.eventId===currentPlayerDelivery.eventId&&e.sessionEpoch===state.sessionEpoch&&e.sessionId===state.sessionId);
 if(!playerSource)throw gmBridgeUnconfirmed('The current bridge player source is unavailable.');
 const owner=createRuntimeEvent('gm_continuation',{parentEventId:playerSource.eventId,actors:['controller'],audience:{visibility:'group',npcIds:state.npcs.map(n=>n.id)},metadata:{sourceEventId:playerSource.eventId,sourcePlayerDelivery:{...currentPlayerDelivery},stageToken:stagePacingToken(),roundIndex:state.roundIndex,language:state.language,completedStageId:currentWindow?.stageId,nextStageId:nextWindow?.stageId||null}});
 gmBridgeRuntimeOwner=owner;
 try{
  const input=collectGmBridgeSource(decision,currentWindow,nextWindow,currentPlayerDelivery,owner);
  const rawSelection=await callGmBridgeAgent(input,owner);gmBridgeOwnerCurrent(owner,input);assertGmBridgeSourceStillActual(input,owner);
  owner.metadata.gmBridgeSelectionAttempt={version:LabGmBridgeCore.SELECTION_VERSION,rawSelection,sourceHash:SocialEvoCore.stableHash(input),inputHash:SocialEvoCore.stableHash(input)};
  let selection;try{selection=LabGmBridgeCore.selection(JSON.parse(rawSelection),input);}catch(error){if(error instanceof ReferenceError||error instanceof TypeError)throw error;throw gmBridgeUnconfirmed('The bridge source selection remains unconfirmed.');}
  const rendered=LabGmBridgeCore.render(selection,input);
  owner.metadata.gmBridgeComposite={version:LabGmBridgeCore.COMPOSITE_VERSION,sourceVersion:input.version,rendererVersion:rendered.rendererVersion,input:JSON.parse(JSON.stringify(input)),selection:JSON.parse(JSON.stringify(selection)),rawSelection,sourceHash:SocialEvoCore.stableHash(input),inputHash:SocialEvoCore.stableHash(input),selectionHash:SocialEvoCore.stableHash(selection),rawSelectionHash:SocialEvoCore.stableHash(rawSelection),renderedText:rendered.text,renderedHash:SocialEvoCore.stableHash(rendered.text)};
  SocialEvoCore.transitionEvent(owner,'validated',{});
  const prepared={owner,text:rendered.text};verifyGmBridgePrepared(prepared);return prepared;
 }catch(error){
  gmBridgeOwnerCurrent(owner);if(owner.status!=='committed')failRuntimeEvent(owner,error);if(gmBridgeRuntimeOwner===owner)gmBridgeRuntimeOwner=null;throw error;
 }
}
async function callGmBridgeAgent(input,owner){
 gmBridgeOwnerCurrent(owner,input);assertGmBridgeSourceStillActual(input,owner);
 const instruction=input.version===LabGmBridgeCore.PLAYER_SOURCE_VERSION?LabGmBridgeCore.PLAYER_INSTRUCTION:LabGmBridgeCore.INSTRUCTION;
 const response=await fetchWithTimeout('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:'deepseek',model:DEEPSEEK_PRO_MODEL,temperature:0.45,agentPurpose:'gm_bridge_source_selection',messages:[{role:'system',content:instruction},{role:'user',content:JSON.stringify(input)}]})},8000,{agentPurpose:'gm_bridge_source_selection',eventId:owner.eventId});
 gmBridgeOwnerCurrent(owner,input);
 if(!response.ok)throw await agentHttpErrorFromResponse(response,'GM source selection',{agentPurpose:'gm_bridge_source_selection',eventId:owner.eventId});
 let envelope;try{envelope=await response.json();}catch(error){gmBridgeOwnerCurrent(owner,input);throw error;}
 gmBridgeOwnerCurrent(owner,input);
 const raw=envelope?.choices?.[0]?.message?.content;if(typeof raw!=='string')throw gmBridgeUnconfirmed('The bridge selection response is unavailable.');return raw;
}
function presentGmBridgeRecord(prepared,tone='scene pacing'){
 const {owner,rendered}=verifyGmBridgePrepared(prepared),deliveryId=owner.eventId+'-gm-record';
 SocialEvoCore.recordDialogueGenerated(owner,{deliveryId,npcId:'',speaker:'Game Master',text:rendered.text,channel:'gm_bridge_record'});
 const actual=owner.dialogueDeliveries.find(d=>d.deliveryId===deliveryId);
 if(!actual||actual.text!==rendered.text||actual.npcId!==''||actual.speaker!=='Game Master'||actual.channel!=='gm_bridge_record'||actual.status!=='generated'||actual.deliveredAt){
  const error=gmBridgeUnconfirmed('The generated dialogue record differs from its literal source composite.');
  failRuntimeEvent(owner,error);if(gmBridgeRuntimeOwner===owner)gmBridgeRuntimeOwner=null;throw error;
 }
 SocialEvoCore.transitionEvent(owner,'committed',{npcIds:[]});
 addSystemMessage('Game Master',rendered.text,'transition',tone,{eventId:owner.eventId,channel:'gm_bridge_record'});
 SocialEvoCore.markDialogueDelivered(owner,{deliveryId});if(gmBridgeRuntimeOwner===owner)gmBridgeRuntimeOwner=null;return rendered.text;
}

function bridgeLineFor(currentType, nextType) {
  if (state.language === "zh") {
    const zhLines = {
      "进入小组": "介绍之后，小组从第一印象转向更实际的问题：你如何在不打乱项目的情况下做出贡献？",
      "贡献方式": "你的贡献方式改变了房间里的气氛。小组现在需要协调工作量、公平和信任。",
      "协调分工": "这次协调问题留下了痕迹，大家开始用新的方式理解你的意图。一个更安静的支持问题浮现出来。",
      "支持他人": "小组已经看到你如何处理压力和关心他人。现在他们需要一个可以被记住和评估的最终承诺。"
    };
    return zhLines[currentType] || `对话推进到下一个决策：${nextType}。`;
  }
  const lines = {
    Entry: "After your introduction, the group shifts from first impressions to the practical question: how can you contribute without disrupting the project?",
    Contribution: "Your proposed contribution changes the room. The group now has to coordinate workload, fairness, and trust.",
    Coordination: "The coordination issue leaves traces in how people read your intentions. A quieter concern now surfaces around support and confidence.",
    Support: "The group has seen how you handle pressure and care. Now they need a final commitment they can remember and evaluate."
  };
  return lines[currentType] || `The conversation moves toward the next decision: ${nextType}.`;
}
