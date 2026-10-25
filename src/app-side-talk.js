// Private NPC interaction and autonomous NPC-to-NPC exchange.
// A composer identity is presentation-only: reopening the same NPC must not
// accept an option response from a previously closed composer.
let sideTalkComposerSequence = 0;
let sideTalkTopicSequence = 0;
let sideTalkTopicRequest = null;
const SIDE_TALK_TOPIC_TIMEOUT_MS = 20000;

function cancelSideTalkTopicRequest() {
  const request = sideTalkTopicRequest;
  sideTalkTopicRequest = null;
  if (!request) return;
  window.clearTimeout(request.timeoutId);
  request.controller.abort("private_composer_cancelled");
}

function showSideTalkTopicUnavailable(npc, error) {
  const node = document.getElementById("side-talk-options");
  node.replaceChildren();
  const message = document.createElement("p");
  message.className = "side-talk-empty";
  message.setAttribute("role", "status");
  message.textContent = state.language === "zh"
    ? "推荐话题暂时不可用。你可以直接输入，也可以重试或关闭。"
    : "Suggested topics are unavailable. You can type your own message, retry, or close.";
  const retry = document.createElement("button");
  retry.type = "button";
  retry.className = "side-talk-option";
  retry.dataset.retryTopics = "true";
  retry.textContent = state.language === "zh" ? "重试推荐话题" : "Retry suggested topics";
  retry.onclick = () => {
    if (isSideTalkOpen() && state.activeSideTalkNpcId === npc.id && !state.activeEventLock) void renderSideTalkOptions(npc);
  };
  node.append(message, retry);
  renderSideTalkContext(npc);
  node.setAttribute("aria-busy", "false");
  state.log.push({type:"Optional private topics unavailable",npcId:npc.id,
    summary:shorten(String(error?.message || "No validated topics returned."),180),
    callId:String(error?.callId || ""),timestamp:new Date().toISOString()});
  renderResearchLog();
  if (typeof syncSideTalkSendButton === "function") syncSideTalkSendButton();
}
function observablePrivateInteractionCue(sourceNpc, sideTalkResult) {
  return {
    sourceNpcId: sourceNpc.id,
    sourceNpcName: sourceNpc.name,
    interactionOccurred: true,
    observableCue: "private_interaction_occurred",
    confidence: 0.35,
    limitation: "Private words, reply, intent, memory, and meaning were not observable."
  };
}

function sideTalkStageId() {
  return currentStage()?.id || currentWindow()?.type || "free_movement";
}

function registerSideTalkOpportunity(npc) {
  const key = `${sideTalkStageId()}|${npc.id}`;
  if (state.sideTalkOpportunityKeys.includes(key)) return false;
  state.sideTalkOpportunityKeys.push(key);
  state.sessionMetrics.interactionOpportunityCount =
    Number(state.sessionMetrics.interactionOpportunityCount || 0) + 1;
  return true;
}

function openSideTalk(npc, options = {}) {
  if(typeof labStoryRuntime!=="undefined"&&labStoryRuntime){setInteractionLockMessage();return false;}
  if (!isFreeExplorationActive()) {
    setInteractionLockMessage();
    return;
  }
  if (typeof privateConversationBudgetReached === "function" && privateConversationBudgetReached()) {
    setWorldHelp(state.language === "zh" ? "这一阶段的单独交流已完成，请继续当前实验室任务或小组讨论。" : "Private exchanges for this stage are complete. Continue the current lab task or group discussion.");
    return;
  }
  if (storyBeatCapacityBlocksConsultation()) {
    const required = currentRequiredWorkspaceTask();
    setWorldHelp(required
      ? (state.language === "zh"
        ? `先在实验室电脑完成“${scenarioText(required.template.title, required.taskId)}”，再继续小组交流。`
        : `Complete "${scenarioText(required.template.title, required.taskId)}" on the lab computer before continuing the group discussion.`)
      : (state.language === "zh"
        ? "当前信息已经足够，请先进入小组的关键讨论。"
        : "There is enough context now; move into the group's key discussion."));
    return;
  }
  if (!options.skipFirstContact && needsNpcFirstContact(npc)) {void startNpcFirstContact(npc,options);return;}
  state.sideTalkContinuityContext=privateDialogueReentryContext(npc,{newTopic:Boolean(options.newTopic)});
  state.activeSideTalkNpcId = npc.id;
  faceActorToward(npc,state.playerPosition);
  sideTalkComposerSequence += 1;
  registerSideTalkOpportunity(npc);
  const panel = document.getElementById("side-talk-panel");
  const title = document.getElementById("side-talk-title");
  const input = document.getElementById("side-talk-input");
  const warning = document.getElementById("safety-warning");
  title.textContent = t("talkWith", npc.name);
  input.value = "";
  state.sideTalkContextLine = options.lastReply || options.lastGreeting || state.sideTalkContinuityContext.previousExchange?.text || "";
  state.sideTalkDraftIntent = null;
  if(!options.newTopic)restorePrivateComposerDraft(npc);
  warning.textContent = "";
  if (typeof yieldLabRoutineActor === "function") yieldLabRoutineActor(npc);
  panel.classList.remove("panel-hidden");
  panel.scrollTop=0;
  if(options.continueThread || options.lastGreeting) {
    const node=document.getElementById("side-talk-options");node.replaceChildren();node.setAttribute("aria-busy","false");
    const context=document.createElement("p");context.className="entry-thread-context";
    context.textContent=`${npc.name}: ${String(options.lastReply||options.lastGreeting||"")}`;node.append(context);
    // Continue means responding to the same delivered line, not asking another
    // options agent to restart the topic. Change-topic still uses real options.
    if(!renderSideTalkBranchReplies(npc)&&options.lastGreeting) void renderSideTalkOptions(npc,{contextLine:options.lastGreeting});
  } else if(!options.newTopic&&!renderSideTalkBranchReplies(npc)) renderSideTalkOptions(npc);
  else if(options.newTopic)renderSideTalkOptions(npc);
  if(options.selectedReply){input.value=options.selectedReply;state.sideTalkDraftIntent={text:input.value,intent:'clarify_intent'};}
  const line = proximityLine(npc);
  if (line&&!state.sideTalkContextLine) showWorldBubble(npc.name, line, "proximity");
  updateWorldActivityClasses();
  showGalgameDialogue("You", "", "neutral", "neutral", { partnerNpcId: npc.id });
  if (galgameDialogueFallbackTimer) window.clearTimeout(galgameDialogueFallbackTimer);
  galgameDialogueFallbackTimer = null;
  if (typeof syncSideTalkSendButton === "function") syncSideTalkSendButton();
}

function privateBranchReplies(npc,line=state.sideTalkContextLine){
  const context=state.sideTalkContinuityContext;
  const source=context?.previousExchange;
  if(!source||source.text!==line||source.stageId!==currentStage()?.id||context?.mode==='new_topic'||context?.mode==='stage_bridge'||!openingReplyInvitesAnswer(line,npc.id))return [];
  return replyOptionsRows(replyOptionsSource(source.eventId,npc.id,line));
}
function renderSideTalkBranchReplies(npc){
  const context=state.sideTalkContinuityContext,previous=context?.previousExchange;
  if(!previous||previous.text!==state.sideTalkContextLine||previous.stageId!==currentStage()?.id||['new_topic','stage_bridge'].includes(context.mode)||!openingReplyInvitesAnswer(previous.text,npc.id))return false;
  const replySource=replyOptionsSource(previous.eventId,npc.id,previous.text);if(!replySource)return false;
  const choices=privateBranchReplies(npc);requestReplyOptions(replySource);
  cancelSideTalkTopicRequest();const node=document.getElementById('side-talk-options');node.replaceChildren();node.setAttribute('aria-busy','false');renderSideTalkContext(npc);
  const status=document.createElement('p');status.className='side-talk-empty';node.append(status);replyOptionsStatus(status,replySource);
  for(const c of choices){const button=document.createElement('button');button.type='button';button.className='side-talk-option';button.textContent=c.label;button.dataset.replyBranch='true';button.setAttribute('aria-pressed','false');
    button.onclick=()=>{const input=document.getElementById('side-talk-input');input.value=c.utterance;state.sideTalkDraftIntent={text:c.utterance,intent:'clarify_intent'};node.querySelectorAll('[data-reply-branch]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));syncSideTalkSendButton();};node.append(button);}
  const custom=document.createElement('button');custom.type='button';custom.className='side-talk-option';custom.dataset.customReply='true';custom.textContent=state.language==='zh'?'自定义回答':'Custom reply';
  custom.onclick=()=>{const input=document.getElementById('side-talk-input');if(state.sideTalkDraftIntent)input.value='';state.sideTalkDraftIntent=null;node.querySelectorAll('[data-reply-branch]').forEach(b=>b.setAttribute('aria-pressed','false'));syncSideTalkSendButton();input.focus({preventScroll:true});};node.append(custom);return true;
}

function closeSideTalk({preserveDialogue = false} = {}) {
  const wasOpen = isSideTalkOpen();
  // Once Send acquires the transaction lock, a user dismissal cannot abandon
  // safety review or the reply. The internal submit transition opts in below.
  if (wasOpen && !preserveDialogue && !state.apiFatalError && !state.sessionClosed &&
      (state.activeEventLock || state.isScenePlaying || state.dialogueAdvancePending)) return false;
  if(wasOpen){const npc=state.npcs.find(n=>n.id===state.activeSideTalkNpcId);
    if(preserveDialogue){if(npc)privateComposerDrafts.delete(privateComposerDraftKey(npc));}
    else savePrivateComposerDraft(npc);}
  cancelSideTalkTopicRequest();cancelInactiveReplyOptionsRequests();
  state.sideTalkContinuityContext=null;state.sideTalkContextLine="";
  const panel = document.getElementById("side-talk-panel");
  const focusWasInside = Boolean(document.activeElement?.closest?.("#side-talk-panel"));
  sideTalkComposerSequence += 1;
  panel.classList.add("panel-hidden");
  state.activeSideTalkNpcId = null;
  state.sideTalkDraftIntent = null;
  document.getElementById("side-talk-input").value = "";
  document.getElementById("side-talk-options").replaceChildren();
  document.getElementById("side-talk-options").setAttribute("aria-busy", "false");
  document.getElementById("safety-warning").textContent = "";
  if (wasOpen && !preserveDialogue) {
    if (typeof stopVoicePlayback === "function") stopVoicePlayback("private_draft_closed");
    hideGalgameDialogue();
    document.getElementById("galgame-dialogue-text").textContent = "";
    document.getElementById("galgame-speaker-name").textContent = "";
  }
  updateWorldActivityClasses();
  if (wasOpen && !preserveDialogue) {
    if (focusWasInside) document.getElementById("pixel-world").focus({preventScroll:true});
    setWorldHelp(currentStageConsultationCue());
    updateProximityInteraction();
    if (!state.apiFatalError && !state.sessionClosed && typeof onPrivateConversationDraftClosed === "function") onPrivateConversationDraftClosed();
  }
  return true;
}

function renderSideTalkContext(npc) {
  if(!state.sideTalkContextLine)return;
  const line=document.createElement("p");line.className="entry-thread-context";
  const c=state.sideTalkContinuityContext,zh=state.language==='zh';
  const label=c?.mode==='stage_bridge'?(zh?'此前的交流':'Earlier exchange'):(zh?'接着此前的交流':'Continue the previous exchange');
  line.textContent=`${label} · ${npc.name}: ${state.sideTalkContextLine}`;
  document.getElementById("side-talk-options").prepend(line);
}
async function renderSideTalkOptions(npc) {
  cancelSideTalkTopicRequest();
  const sequence = sideTalkComposerSequence, epoch = state.sessionEpoch, stageId=sideTalkStageId(), language=state.language;
  const request = {controller:new AbortController(),deadlineAt:Date.now()+SIDE_TALK_TOPIC_TIMEOUT_MS,
    callId:`call-${state.sessionId}-private-topics-${++sideTalkTopicSequence}`,timeoutId:null};
  sideTalkTopicRequest = request;
  request.timeoutId = window.setTimeout(() => {
    request.controller.abort(new RequestTimeoutError("Suggested topics timed out."));
  }, SIDE_TALK_TOPIC_TIMEOUT_MS);
  const isCurrentComposer = () => sequence === sideTalkComposerSequence && epoch === state.sessionEpoch && stageId===sideTalkStageId() && language===state.language &&
    request === sideTalkTopicRequest &&
    state.activeSideTalkNpcId === npc.id && isSideTalkOpen() && !state.sessionClosed && !state.apiFatalError;
  const node = document.getElementById("side-talk-options");
  node.setAttribute("aria-busy", "true");
  node.innerHTML = `<p class="side-talk-empty" role="status">${state.language === "zh" ? "正在准备推荐话题；你也可以直接输入，或关闭。" : "Preparing suggested topics; you can also type directly or close."}</p>`;
  renderSideTalkContext(npc);
  let options = [];
  try {
    options = await generateSideTalkOptions(npc, request);
  } catch (error) {
    if (isStaleRequestError(error) || !isCurrentComposer()) return;
    showSideTalkTopicUnavailable(npc, error);
    return;
  } finally {
    window.clearTimeout(request.timeoutId);
    if (isCurrentComposer()) node.setAttribute("aria-busy", "false");
  }
  if (!isCurrentComposer()) return;
  node.innerHTML = "";
  renderSideTalkContext(npc);
  if (!options.length) {
    showSideTalkTopicUnavailable(npc);
    return;
  }
  options.forEach((option) => {
    const button = document.createElement("button");
    button.className = `side-talk-option side-talk-option-${npc.id}`;
    button.type = "button";
    button.textContent = option.label;
    button.addEventListener("click", () => {
      const input = document.getElementById("side-talk-input");
      input.value = option.label;
      state.sideTalkDraftIntent = {text: option.label, intent: option.intent};
      [...node.children].forEach(child => child.setAttribute("aria-pressed", String(child === button)));
      if (typeof syncSideTalkSendButton === "function") syncSideTalkSendButton();
      input.focus();
    });
    node.appendChild(button);
  });
  if (typeof syncSideTalkSendButton === "function") syncSideTalkSendButton();
}

async function submitSideTalkFreeText() {
  if (state.apiFatalError || !isSideTalkOpen() || state.isIntroPlaying || state.isScenePlaying || state.decisionPanelVisible) return;
  const npc = state.npcs.find((item) => item.id === state.activeSideTalkNpcId);
  if (!npc) return;
  const input = document.getElementById("side-talk-input");
  const text = input.value.trim();
  state.sideTalkRecovery=null;
  const intent = state.sideTalkDraftIntent?.text === text ? state.sideTalkDraftIntent.intent : "general_check_in";
  if (!text) return;
  const warning = document.getElementById("safety-warning");
  const button = document.getElementById("submit-side-talk-btn");
  const event = acquireEventLock("private_chat", {
    actors: ["player", npc.id],
    audience: { visibility: "private", npcIds: [npc.id] },
    metadata: { targetNpcId: npc.id }
  });
  if (!event) return;
  captureSubmittedPlayerInput(event, text, {sourceKind: 'side_talk_submit'});
  if (button) button.disabled = true;
  if (typeof syncSideTalkSendButton === "function") syncSideTalkSendButton();
  try {
    if (warning) warning.textContent = t("safetyReviewing");
    const safety = await reviewPlayerInputSafety(text, {
      channel: "private_chat",
      npcName: npc.name,
      intent
    });
    if (!safety.ok) {
      failRuntimeEvent(event, { code: "safety_rejected", message: safety.message });
      if (warning) warning.textContent = safety.message;
      return;
    }
    if (warning) warning.textContent = "";
    await applySideTalk(npc, text, intent, event);
  } catch (error) {
    failRuntimeEvent(event, error);
    stopForAgentFailure(error, `${npc.name} private response flow`);
  } finally {
    releaseEventLock(event);
    if (typeof syncSideTalkSendButton === "function") syncSideTalkSendButton();
    else if (button) button.disabled = Boolean(state.isScenePlaying || state.apiFatalError);
  }
}

async function applySideTalk(npc, playerText, intent, existingEvent = null) {
  if (state.apiFatalError || !isSideTalkOpen() || state.isIntroPlaying || state.isScenePlaying || state.decisionPanelVisible) return;
  const event = existingEvent || acquireEventLock("private_chat", {
    actors: ["player", npc.id],
    audience: { visibility: "private", npcIds: [npc.id] },
    metadata: { targetNpcId: npc.id, generatedOption: true }
  });
  if (!event) return;
  const snapshot = runtimeSnapshot();
  let heardPlayerHistory=null;
  const continuity=privateDialogueReentryContext(npc);
  event.metadata.conversationContinuation={version:DIALOGUE_CONTINUITY_VERSION,sourceEventId:continuity.previousExchange?.eventId||"",sourceStageId:continuity.previousExchange?.stageId||"",currentStageId:currentStage()?.id};
  state.isScenePlaying = true;
  updateWorldActivityClasses();
  setWorldHelp(state.language === "zh" ? "NPC 正在理解并回应你的话，请稍等。" : "NPC is reading and responding. Please wait.");
  SocialEvoCore.recordDialogueGenerated(event, {
    deliveryId: `${event.eventId}-player-private`,
    speaker: "You",
    text: playerText,
    channel: "private_chat_player"
  });
  addDialogue("You", "#222831", playerText, "private check-in", "private side conversation", {eventId:event.eventId,channel:'private_chat_player'});
  SocialEvoCore.markDialogueDelivered(event, {
    deliveryId: `${event.eventId}-player-private`
  });
  heardPlayerHistory=JSON.parse(JSON.stringify(state.dialogueHistory));
  closeSideTalk({preserveDialogue:true});

  let result;
  let actionClassification;
  let novelty;
  let responseGenerationStarted=false;
  try {
    actionClassification = await classifyFreeTextCanonicalAction(playerText, {
      type: sideTalkStageId(),
      question: `Private interaction with ${npc.name}`
    }, event);
    novelty = SocialEvoCore.evaluateInteractionNovelty(state.sideTalkSemanticHistory, {
      rootEventId: event.rootEventId,
      npcId: npc.id,
      stageId: sideTalkStageId(),
      actionCode: actionClassification.actionCode,
      evidenceSpan: actionClassification.evidenceSpan
    });
    responseGenerationStarted=true;
    result = await generateSideTalkResponse(npc, playerText, intent);
  } catch (error) {
    const restored=restoreRuntimeSnapshot(snapshot);
    if(restored&&heardPlayerHistory&&!event.dialogueDeliveries.some(d=>d.npcId&&d.status==='delivered'))state.dialogueHistory=heardPlayerHistory;
    failRuntimeEvent(event, error);
    const unavailableReply=responseGenerationStarted&&isQaOutputUnavailableError(error,event)&&!event.dialogueDeliveries.some(d=>d.npcId&&d.status==='delivered');
    if((isAgentOutputValidationError(error)||unavailableReply)&&event.sessionEpoch===state.sessionEpoch&&!state.sessionClosed){
      state.isScenePlaying=false;state.isGmThinking=false;state.activeSideTalkNpcId=npc.id;
      state.sideTalkRecovery={epoch:state.sessionEpoch,stageId:currentStage()?.id,npcId:npc.id,eventId:event.eventId};
      releaseEventLock(event);hideGalgameDialogue();document.getElementById('side-talk-panel').classList.remove('panel-hidden');
      document.getElementById('side-talk-input').value=playerText;state.sideTalkDraftIntent={text:playerText,intent};
      const message=unavailableReply?(state.language==='zh'?'回应暂不可用，尚未交付角色回复。你的话和草稿已保留；点重试或修改后发送，也可以关闭。':'The reply is unavailable and has not been delivered. Your message and draft are retained; retry, edit and send, or close.'):(state.language==='zh'?'这次回应暂时未能可靠接续，尚未交付 NPC 的回复。你的话已保留，可重试、修改或关闭；不会默认得到回应或推进剧情。':'This reply could not be reliably continued and was not delivered. Your message is retained; retry, edit or close. No response or progress is assumed.');
      document.getElementById('safety-warning').textContent=message;setWorldHelp(message);updateWorldActivityClasses();syncSideTalkSendButton();return;
    }
    stopForAgentFailure(error, `${npc.name} side-talk response agent`);
    return;
  }
  event.metadata.playerMessage = shorten(playerText, 500);
  event.metadata.intent = intent;
  event.metadata.actionClassification = actionClassification;
  event.metadata.interactionNovelty = {
    isNovel: novelty.isNovel,
    similarity: novelty.similarity,
    matchedRootEventId: novelty.matchedRootEventId
  };
  event.metadata.npcResponse = shorten(result.dialogue, 500);
  SocialEvoCore.recordDialogueGenerated(event, {
    deliveryId: `${event.eventId}-npc-${npc.id}`,
    npcId: npc.id,
    speaker: npc.name,
    text: result.dialogue,
    channel: "private_chat_response"
  });
  const appraisalInput = novelty.isNovel ? result : {};
  const proposal = {
    ...SocialEvoCore.gateEvolutionPatch(appraisalInput, state.evolutionMode),
    npcId: npc.id,
    evidenceIds: [event.eventId],
    importance: 0.68,
    researchReason: novelty.isNovel
      ? result.researchReason
      : "Repeated semantically equivalent interaction in the same NPC/stage/action cell.",
    evidence: [{
      id: event.eventId,
      sourceEventId: event.eventId,
      visibility: "private",
      ownerNpcId: npc.id
    }]
  };
  let trace;
  try {
    commitRuntimeEvent(event, [proposal], (preparedProposals) => {
      const preparedProposal = preparedProposals[0];
      persistNeutralEpisodicMemory(npc, {
        eventId: event.eventId,
        evidenceIds: [event.eventId],
        type: "private_chat",
        phase: currentWindow()?.type || "Free movement",
        playerAction: playerText
      });
      trace = applyNpcEvolution(npc, preparedProposal, {
        eventId: event.eventId,
        evidenceIds: preparedProposal.evidenceIds,
        type: "private_chat",
        phase: currentWindow()?.type || "Free movement",
        playerAction: playerText
      });
      recordAppraisalOutcome(event, npc, trace, {
        evidenceIds: preparedProposal.evidenceIds,
        noChangeReason: novelty.isNovel ? undefined : "semantically_irrelevant"
      });
      if (novelty.isNovel) {
        state.sessionMetrics.groupProgress = clamp(state.sessionMetrics.groupProgress + result.progressDelta, 0, 100);
        state.sessionMetrics.groupClimate = clamp(state.sessionMetrics.groupClimate + result.climateDelta, 0, 100);
        updateProjectTasksFromEvent("sideTalk", actionClassification.actionCode);
        state.sideTalkSemanticHistory.push({
          ...novelty.record,
          eventId: event.eventId,
          timestamp: new Date().toISOString()
        });
        state.sessionMetrics.rewardedInteractionCount =
          Number(state.sessionMetrics.rewardedInteractionCount || 0) + 1;
      }
      const rootRewardKey = `${event.rootEventId}|${npc.id}|${sideTalkStageId()}|${actionClassification.actionCode}`;
      if (!state.sideTalkRootRewardKeys.includes(rootRewardKey)) {
        state.sideTalkRootRewardKeys.push(rootRewardKey);
      }
      state.sessionMetrics.actionCount = Number(state.sessionMetrics.actionCount || 0) + 1;
      state.sessionMetrics.interactionUseCount =
        Number(state.sessionMetrics.interactionUseCount || 0) + 1;
      state.interactionsSinceDecision += 1;
      state.totalSideTalks += 1;
      if (novelty.isNovel) recordStoryBeat({
        type: "private_consultation",
        sourceEventId: event.eventId,
        visibility: "private",
        actors: ["player", npc.id],
        publicSummary: `${npc.name}: ${shorten(result.dialogue, 320)}`,
        focusTags: [sideTalkStageId(), npc.id, actionClassification.actionCode],
        attentionFact: {
          question: state.language === "zh"
            ? "你在这一阶段刚才选择和谁单独交流？"
            : "Who did you just choose to consult privately in this stage?",
          correctAnswer: npc.name,
          distractors: attentionDistractorsFromNpcs(npc.name)
        }
      });
      return { npcId: npc.id };
    });
  } catch (error) {
    restoreRuntimeSnapshot(snapshot);
    failRuntimeEvent(event, error);
    stopForAgentFailure(error, `${npc.name} private evolution commit`);
    return;
  }
  releaseEventLock(event);

  state.currentPrivateConversationNpcId = npc.id;
  try {
    // Delivery follows the validated reply in BOTH conditions; a frozen
    // appraisal state must not freeze a baseline's speaking expression/tone.
    addDialogue(npc.name, npc.color, result.dialogue, result.emotion, result.tone);
    SocialEvoCore.markDialogueDelivered(event, {
      deliveryId: `${event.eventId}-npc-${npc.id}`
    });
  } finally {
    state.currentPrivateConversationNpcId = null;
  }
  state.log.push({
    type: "Side conversation",
    eventId: event.eventId,
    round: currentWindow()?.type || "Free movement",
    summary: `${npc.name}: ${result.memory}`,
    npc: npc.name,
    model: npc.model,
    emotion: npc.emotion,
    intent,
    source: result.source,
    evolutionMode: state.evolutionMode,
    relationshipDeltas: trace.applied.relationshipDeltas,
    valueTradeoffDeltas: trace.applied.valueTradeoffDeltas,
    safetyReasons: trace.applied.safety.reasons,
    timestamp: new Date().toISOString()
  });
  renderNpcRail();
  renderPixelWorld();
  renderSessionState();
  renderResearchLog();
  if (state.delayedDecisionTimerId) window.clearTimeout(state.delayedDecisionTimerId);
  state.delayedDecisionTimerId = null;
  void scheduleStageProgressCheck('private reply delivered');
  waitForDialogueAdvance(result.dialogue, "sideTalk")
    .then(() => {
      currentEpochOrThrow(event.sessionEpoch);
      if(state.sessionClosed||state.apiFatalError||event.metadata.stageId!==currentStage()?.id)return;
      if (typeof offerPrivateConversationContinuation === "function" && offerPrivateConversationContinuation(npc, result, event)) return;
      return continueAfterSideTalk(npc, result, event);
    })
    .catch((error) => {
      if (isStaleRequestError(error)) return;
      stopForAgentFailure(error, "post-private autonomous flow");
    });
}

async function continueAfterSideTalk(sourceNpc, sideTalkResult, rootEvent) {
  const token=stagePacingToken();
  const exchange = await playAutonomousNpcExchange(sourceNpc, sideTalkResult, rootEvent);
  if(token!==stagePacingToken()) return;
  await updateSilentObserversAfterInteraction(sourceNpc, sideTalkResult, exchange, rootEvent);
  if(token!==stagePacingToken()) return;
  state.isScenePlaying = false;
  updateWorldActivityClasses();
  void maybeTriggerDecision('public exchange delivered');
  state.isScenePlaying=true;updateWorldActivityClasses();
  const followUpStarted = await maybeStartNpcFollowUp(sourceNpc, sideTalkResult, exchange, rootEvent);
  if(token!==stagePacingToken()) return;
  state.isScenePlaying=false;updateWorldActivityClasses();
  if (followUpStarted) {
    return;
  }
  if (startGlobalAttentionCheckIfNeeded()) return;
  const laptopPrepared = await maybePreparePendingLaptopCue();
  if(token!==stagePacingToken()) return;
  if (laptopPrepared) return;
  void maybeTriggerDecision("side conversation");
}

async function maybeStartNpcFollowUp(sourceNpc, sideTalkResult, exchange, rootEvent) {
  const questionTurn = latestNpcQuestionTurn(sourceNpc, sideTalkResult, exchange);
  if (!questionTurn) return false;
  // A prepared summary or private question is not a delivered public question.
  // Reuse the source-only semantic branch UI: no fabricated four-answer quiz,
  // no private RAG context, and no extra transaction before the player replies.
  const event=state.eventLedger.find(e=>e.eventId===exchange?.eventId),npc=state.npcs.find(n=>n.id===questionTurn.npcId);
  if(!npc||!event||event.sessionEpoch!==state.sessionEpoch||event.status!=='committed'||event.audience?.visibility!=='group'||state.sessionClosed||state.apiFatalError||state.finalOutcome||isSideTalkOpen()||state.decisionPanelVisible)return false;
  return offerPublicStoryQuestion(npc,{dialogue:questionTurn.question},event);
}

function latestNpcQuestionTurn(sourceNpc, sideTalkResult, exchange) {
  const candidates = [
    // Private questions stay in the owner conversation. Ending that exchange
    // must not turn its question/answer into a group-visible follow-up.
    ...(exchange?.summaries || []).map((item) => ({
      npcId: item.speakerId,
      npcName: item.speakerName,
      question: item.dialogue
    }))
  ].filter((item) => item.npcId && isPlayerDirectedQuestion(item.question, item.npcId));
  return candidates[candidates.length - 1] || null;
}

function isPlayerDirectedQuestion(text, speakerId = "") {
  const value = String(text || "").trim();
  if (!value) return false;
  if (isAddressedToAnotherNpc(value, speakerId)) return false;
  const hasQuestionMark = /[?？]/u.test(value);
  if (isEntryEpisodeStage() && !hasQuestionMark && /(你可以|you can|you could)/i.test(value) && !/(吗|呢|是否|能不能|愿不愿意|would you|could you|do you)/i.test(value)) return false;
  const addressesPlayer = /(新人|新同学|玩家|你|你们|your|you\b)/i.test(value);
  const asksInformation = /(什么|怎么|哪|是否|可以|能不能|愿不愿意|要不要|吗|what|how|which|whether|could|would|can|will|do you|are you)/i.test(value);
  return addressesPlayer && (hasQuestionMark || asksInformation);
}

function isAddressedToAnotherNpc(text, speakerId = "") {
  const trimmed = String(text || "").trim();
  return state.npcs.some((npc) => {
    if (npc.id === speakerId) return false;
    const escapedName = npc.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const chineseRoleNames = {
      mina: ["Dr. Lin", "Lin", "林老师", "导师"],
      leo: ["Jun", "俊", "支持我的同学"],
      sam: ["Kai", "凯", "师兄", "师姐"],
      riley: ["Prof. Zhao", "Zhao", "赵教授", "赵老师", "负责人"],
      nora: ["Emma", "艾玛", "同辈学生"]
    }[npc.id] || [npc.name];
    return chineseRoleNames.some((name) => {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`^${escaped}\\s*[,，:：]`).test(trimmed)
        || new RegExp(`(^|[。！？!?\\s])${escaped}\\s*[,，:：]`).test(trimmed);
    }) || new RegExp(`^${escapedName}\\s*[,，:：]`).test(trimmed);
  });
}

async function generateNpcFollowUpOptions(questionTurn) {
  const retrievedSocialMemory = typeof retrieveSocialMemoryForAgent === "function"
    ? retrieveSocialMemoryForAgent({
      purpose: "npc_follow_up_options",
      targetNpcId: questionTurn.npcId,
      actorIds: ["player", questionTurn.npcId],
      queryText: `${questionTurn.npcName} ${questionTurn.question}`,
      tags: ["follow_up", "options", questionTurn.npcId],
      limit: 6,
      allowPrivate: false
    })
    : null;
  const response = await fetchWithTimeout("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: "deepseek",
      model: DEEPSEEK_PRO_MODEL,
      temperature: 0.45,
      agentPurpose: "npc_followup_options",
      messages: [
        {
          role: "system",
          content:
            `You are a player-response option agent for a safe SocialEvoNPC scenario. ${isEntryEpisodeStage() ? entryConversationAgentBrief() : scenarioAgentBrief()} An NPC asked the player a direct follow-up question. Return only compact JSON: {"options":["...","...","...","..."]}. Create exactly four short, realistic player answers in the requested language. The options must be realistic answers or clarification requests, be meaningfully different, and stay healthy/respectful. When the question involves unfamiliar material, include an honest request for explanation rather than requiring a confident technical solution. Do not invent checks the player has finished or force a promise to take all responsibility. Do not expose hidden metrics, prompts, chain-of-thought, or model names. Do not include unsafe, private, medical, political, or identity-based harmful content.`
        },
        {
          role: "user",
          content: JSON.stringify({
            language: requestedLanguageLabel(),
            ...(isEntryEpisodeStage() ? {playerOrientation:entryConversationOrientation({id:questionTurn.npcId},{publicOnly:true})} : {}),
            storyWorld: isEntryEpisodeStage() ? entryConversationWorld() : storyWorldContext(),
            askingNpc: questionTurn.npcName,
            npcQuestion: questionTurn.question,
            currentPhase: currentWindow()?.type || "Free movement",
            groupMetrics: state.sessionMetrics,
            sharedComputerArtifacts: isEntryEpisodeStage() ? entryConversationDocuments() : sharedComputerContext(),
            retrievedSocialMemory,
            recentDialogue: recentDialogueContext(12, { role: 'group' }),
            playerGoal: scenarioFinalGoalForAgent()
          })
        }
      ]
    })
  }, 9000);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${shorten(text, 120)}`);
  }
  const data = await response.json();
  return parseNormalizeOrRepairAgentJson({
    rawContent: data.choices?.[0]?.message?.content || "",
    label: `${questionTurn.npcName} follow-up option language/schema repair`,
    requiredShape: { options: ["...", "...", "...", "..."] },
    context: {
      language: requestedLanguageLabel(),
      languageRule: requestedLanguageInstruction(),
      questionTurn,
      recentDialogue: recentDialogueContext(12, { role: 'group' })
    },
    normalize: (plan) => normalizeNpcFollowUpOptions(plan, questionTurn)
  });
}

function optionText(option) {
  if (option && typeof option === "object") {
    const candidates = [option.label, option.text, option.option]
      .map((value) => String(value || "").trim()).filter(Boolean);
    if (new Set(candidates.map(normalizeDialogueLine)).size > 1) {
      throw new Error("Follow-up option returned conflicting text aliases.");
    }
    return candidates[0] || "";
  }
  return option;
}

function normalizeNpcFollowUpOptions(plan, questionTurn) {
  const label = `${questionTurn.npcName} follow-up option agent`;
  assertExactObjectFields(plan, ["options"], label);
  if (!Array.isArray(plan.options) || plan.options.length !== 4) {
    throw new Error(`${questionTurn.npcName} follow-up option agent did not return exactly four usable options.`);
  }
  const options = plan.options.map((option, index) => {
    if (option && typeof option === "object" && !Array.isArray(option)) {
      assertExactObjectFields(option, ["label", "text", "option"], `${label}.options[${index}]`);
    } else if (typeof option !== "string") {
      throw new Error(`${label} returned a non-text option.`);
    }
    const raw=String(optionText(option)||'').trim();
    if(raw.length>512)throw new Error(`${label} returned an excessively long option.`);
    const text = sanitizeDecisionPanelText(raw, "", 512);
    if (!text) throw new Error(`${label} returned an empty option.`);
    return text;
  });
  if (new Set(options).size !== options.length) throw new Error(`${label} returned duplicate options.`);
  assertRequestedLanguageTextList(options, `${questionTurn.npcName} follow-up option`);
  options.forEach((option, index) => {
    assertParticipantVisibleOutput(option, `${questionTurn.npcName} follow-up option[${index}]`);
  });
  return options;
}

async function playAutonomousNpcExchange(sourceNpc, sideTalkResult, rootEvent) {
  const candidate = currentWindow();
  const exchange = { speakerIds: [], summaries: [], eventId: "", rootEventId: rootEvent?.rootEventId || rootEvent?.eventId || "" };
  if (!candidate || state.roundIndex >= getDecisionWindows().length) return exchange;
  const plan = await assessNpcDialogueOpportunity(sourceNpc, sideTalkResult, candidate);
  state.log.push({
    type: "NPC dialogue controller",
    round: candidate.type,
    summary: plan.reason,
    shouldStart: plan.shouldStart,
    maxTurns: plan.maxTurns,
    stopCondition: plan.stopCondition,
    timestamp: new Date().toISOString()
  });
  renderResearchLog();
  if (!plan.shouldStart || !plan.turns.length) return exchange;

  const exchangeCue = state.language === "zh"
    ? "旁边的组员也接上了这个话题。"
    : "A couple of group members pick up the thread.";
  setWorldHelp(exchangeCue);
  addSystemMessage("Game Master", exchangeCue, "group exchange", "scene cue");
  await waitForDialogueAdvance(exchangeCue, "system", { autoDelayMs: 450 });

  const event = createRuntimeEvent("autonomous_exchange", {
    rootEventId: rootEvent?.rootEventId || rootEvent?.eventId || "",
    parentEventId: rootEvent?.eventId || "",
    actors: plan.turns.slice(0, plan.maxTurns).map((turn) => turn.speakerId),
    audience: { visibility: "group", npcIds: state.npcs.map((npc) => npc.id) },
    metadata: {
      groupThreadVersion:LabGroupThreadCore.VERSION,
      sourceNpcId: sourceNpc.id,
      observableCue: observablePrivateInteractionCue(sourceNpc, sideTalkResult)
    }
  });
  exchange.eventId = event.eventId;
  exchange.rootEventId = event.rootEventId;
  const generated = [];
  try {
    for (const turn of plan.turns.slice(0, plan.maxTurns)) {
      currentEpochOrThrow(event.sessionEpoch);
      const npc = state.npcs.find((item) => item.id === turn.speakerId);
      if (!npc) continue;
      const turnContext = { ...sideTalkResult, intent: turn.intent || sideTalkResult.intent || "emotion_check" };
      const update = await generateAutonomousNpcExchangeUpdate(
        npc, sourceNpc, turnContext, candidate.type, event, LabGroupThreadCore.project(generated)
      );
      currentEpochOrThrow(event.sessionEpoch);
      generated.push({ npc, update, turnContext });
    }
  } catch (error) {
    SocialEvoCore.failEvent(event, error);
    throw error;
  }
  event.metadata.publicExchange = generated.map(({ npc, update }) => ({
    speakerId: npc.id,
    dialogue: shorten(update.dialogue, 240),
    tone: update.tone,
    visibleEmotionLabel: update.emotion
  }));
  SocialEvoCore.recordDialogueGenerated(event, generated.map(({ npc, update }) => ({
    deliveryId: `${event.eventId}-npc-${npc.id}`,
    npcId: npc.id,
    speaker: npc.name,
    text: update.dialogue,
    channel: "autonomous_exchange"
  })));
  const proposals = generated.map(({ npc, update }) => ({
    ...SocialEvoCore.gateEvolutionPatch(update, state.evolutionMode),
    npcId: npc.id,
    evidenceIds: [event.eventId],
    importance: 0.66,
    researchReason: update.researchReason,
    evidence: [{
      id: event.eventId,
      sourceEventId: event.eventId,
      visibility: "group",
      ownerNpcId: ""
    }]
  }));
  const traceByNpc = new Map();
  try {
    for (const { npc, update } of generated) {
      await moveNpcToDiscussion(npc, sourceNpc, exchange.speakerIds.length);
      addDialogue(npc.name, npc.color, update.dialogue, update.emotion, update.tone);
      SocialEvoCore.markDialogueDelivered(event, {
        deliveryId: `${event.eventId}-npc-${npc.id}`
      });
      exchange.speakerIds.push(npc.id);
      exchange.summaries.push({
        speakerId: npc.id,
        speakerName: npc.name,
        dialogue: update.dialogue,
        memory: update.memory,
        emotion: update.emotion,
        tone: update.tone
      });
      await waitForDialogueAdvance(update.dialogue, "npcResponse");
    }
  } catch (error) {
    SocialEvoCore.failEvent(event, error);
    throw error;
  }
  commitRuntimeEvent(event, proposals, (preparedProposals) => {
    generated.forEach(({ npc }, index) => {
      const proposal = preparedProposals[index];
      traceByNpc.set(npc.id, applyNpcEvolution(npc, proposal, {
        eventId: event.eventId,
        evidenceIds: proposal.evidenceIds,
        type: "npc_exchange",
        phase: candidate.type,
        sourceNpc: sourceNpc.name,
        playerAction: "Observable interaction cue followed by a public group exchange."
      }));
      recordAppraisalOutcome(event, npc, traceByNpc.get(npc.id), {
        evidenceIds: proposal.evidenceIds
      });
    });
    const firstSpeaker = generated[0]?.npc;
    if (firstSpeaker) {
      recordStoryBeat({
        type: "group_exchange",
        sourceEventId: event.eventId,
        visibility: "group",
        actors: generated.map(({ npc }) => npc.id),
        publicSummary: generated.map(({ npc, update }) =>
          `${npc.name}: ${shorten(update.dialogue, 180)}`
        ).join(" "),
        focusTags: [sideTalkStageId(), "group_exchange", sourceNpc.id],
        attentionFact: {
          question: state.language === "zh"
            ? "刚才谁加入了公开的小组交流？"
            : "Who joined the public group exchange just now?",
          correctAnswer: firstSpeaker.name,
          distractors: attentionDistractorsFromNpcs(firstSpeaker.name)
        }
      });
    }
    return { npcIds: generated.map(({ npc }) => npc.id) };
  });
  generated.forEach(({ npc, update, turnContext }) => {
    const trace = traceByNpc.get(npc.id);
    state.log.push({
      type: "Autonomous NPC exchange",
      eventId: event.eventId,
      round: candidate.type,
      summary: `${npc.name}: ${update.dialogue}`,
      npc: npc.name,
      sourceNpc: sourceNpc.name,
      intent: turnContext.intent,
      source: update.source,
      evolutionMode: state.evolutionMode,
      relationshipDeltas: trace.applied.relationshipDeltas,
      valueTradeoffDeltas: trace.applied.valueTradeoffDeltas,
      safetyReasons: trace.applied.safety.reasons,
      timestamp: new Date().toISOString()
    });
  });
  renderNpcRail();
  renderPixelWorld();
  renderResearchLog();
  return exchange;
}

async function updateSilentObserversAfterInteraction(sourceNpc, sideTalkResult, exchange, rootEvent) {
  const participantIds = new Set([sourceNpc.id, ...exchange.speakerIds]);
  const observers = state.npcs.filter((npc) => !participantIds.has(npc.id));
  if (!observers.length) return;
  const candidate = currentWindow();
  const event = createRuntimeEvent("silent_observation", {
    rootEventId: exchange?.rootEventId || rootEvent?.rootEventId || rootEvent?.eventId || "",
    parentEventId: exchange?.eventId || rootEvent?.eventId || "",
    actors: observers.map((npc) => npc.id),
    audience: { visibility: "group", npcIds: state.npcs.map((npc) => npc.id) },
    metadata: {
      sourceNpcId: sourceNpc.id,
      observableCue: observablePrivateInteractionCue(sourceNpc, sideTalkResult),
      publicExchangeEventPresent: Boolean(exchange.summaries.length),
      observedExchange: exchange.summaries.map((item) => ({
        speakerId: item.speakerId,
        dialogue: shorten(item.dialogue, 240),
        tone: item.tone,
        visibleEmotionLabel: item.emotion
      }))
    }
  });
  setWorldHelp(state.language === "zh"
    ? "其他组员正在消化刚才的交流..."
    : "The others are taking in the exchange...");
  const hasPublicEvidence = Boolean(exchange.summaries.length);
  if (!hasPublicEvidence) {
    commitRuntimeEvent(event, [], () => {
      observers.forEach((npc) => {
        if (typeof recordSocialMemoryEvent === "function") {
          recordSocialMemoryEvent({
            type: "observable_cue",
            sourceEventId: event.eventId,
            rootEventId: event.rootEventId,
            ownerNpcId: npc.id,
            visibility: "owner",
            knowledgeType: "uncertain",
            summary: "A private interaction occurred nearby; its words and meaning were not observable.",
            confidence: 0.35,
            importance: 0.3,
            evidenceIds: [event.eventId],
            tags: ["observable_cue", "privacy_limited"]
          });
        }
        event.noChangeEvaluations.push(SocialEvoCore.createNoChangeEvaluation({
          event,
          npcId: npc.id,
          consideredEvidenceIds: [event.eventId],
          evaluatedFields: [
            "emotion", "trust", "belonging", "relationship",
            "situationalPriority", "strategy"
          ],
          noChangeReason: "privacy_unavailable"
        }));
      });
      return { npcIds: [] };
    });
    renderResearchLog();
    return;
  }
  let updates;
  try {
    updates = await Promise.all(observers.map(async (npc) => {
      const update = await generateSilentObserverUpdate(
        npc, sourceNpc, sideTalkResult, exchange,
        candidate?.type || "Free movement", event
      );
      return { npc, update };
    }));
  } catch (error) {
    SocialEvoCore.failEvent(event, error);
    throw error;
  }
  const proposals = updates.filter(Boolean).map(({ npc, update }) => {
    const gated = SocialEvoCore.gateEvolutionPatch(update, state.evolutionMode);
    return {
      ...gated,
      relationshipDeltas: gated.relationshipDeltas,
      strategy: gated.strategy,
      npcId: npc.id,
      evidenceIds: [event.eventId],
      importance: 0.65,
      confidence: 0.65,
      researchReason: update.researchReason,
      evidence: [{
        id: event.eventId,
        sourceEventId: event.eventId,
        visibility: "group",
        ownerNpcId: ""
      }]
    };
  });
  const traceByNpc = new Map();
  commitRuntimeEvent(event, proposals, (preparedProposals) => {
    updates.filter(Boolean).forEach(({ npc }, index) => {
      const proposal = preparedProposals[index];
      traceByNpc.set(npc.id, applyNpcEvolution(npc, proposal, {
        eventId: event.eventId,
        evidenceIds: proposal.evidenceIds,
        type: "silent_observation",
        phase: candidate?.type || "Free movement",
        sourceNpc: sourceNpc.name,
        playerAction: hasPublicEvidence
          ? "Observable cue and public NPC exchange."
          : "Weak observable interaction cue only."
      }));
      recordAppraisalOutcome(event, npc, traceByNpc.get(npc.id), {
        evidenceIds: proposal.evidenceIds
      });
    });
    return { npcIds: observers.map((npc) => npc.id) };
  });

  updates.filter(Boolean).forEach(({ npc, update }) => {
    const trace = traceByNpc.get(npc.id);
    state.log.push({
      type: "Silent observer update",
      eventId: event.eventId,
      round: candidate?.type || "Free movement",
      summary: `${npc.name}: ${update.memory}`,
      npc: npc.name,
      sourceNpc: sourceNpc.name,
      observedSpeakers: exchange.speakerIds.join(", "),
      evolutionMode: state.evolutionMode,
      relationshipDeltas: trace.applied.relationshipDeltas,
      valueTradeoffDeltas: trace.applied.valueTradeoffDeltas,
      safetyReasons: trace.applied.safety.reasons,
      timestamp: new Date().toISOString()
    });
  });
  renderNpcRail();
  renderPixelWorld();
  renderResearchLog();
}

async function generateSilentObserverUpdate(npc, sourceNpc, sideTalkResult, exchange, phase, event = null) {
  if (!isDeepSeekModel(npc.model)) {
    throw new Error(`No agent backend configured for ${npc.model}.`);
  }
  return callSilentObserverApi(npc, sourceNpc, sideTalkResult, exchange, phase, event);
}

async function callSilentObserverApi(npc, sourceNpc, sideTalkResult, exchange, phase, event = null) {
  const hasGroupExchange = Boolean(exchange.summaries.length);
  const retrievedSocialMemory = typeof retrieveSocialMemoryForAgent === "function"
    ? retrieveSocialMemoryForAgent({
      purpose: "silent_observer_update",
      allowPrivate: false,
      targetNpcId: npc.id,
      actorIds: ["player", sourceNpc.id, npc.id],
      queryText: `${sourceNpc.name} ${phase} ${exchange.summaries.map((item) => item.dialogue).join(" ")}`,
      tags: ["silent_observer", "npc_exchange", npc.id, sourceNpc.id],
      limit: 7
    })
    : null;
  const observerContext = {
    language: requestedLanguageLabel(),
    observingNpc: {
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
      recentMemory: [],
      strategy: npc.strategy
    },
    evolutionMode: state.evolutionMode,
    evolutionConstraints: relationshipEvolutionConstraintsForAgent(npc, 0.65),
    storyWorld: storyWorldContext(),
    phase,
    observationType: hasGroupExchange ? "visible_check_in_plus_group_exchange" : "visible_check_in_only",
    observableCue: observablePrivateInteractionCue(sourceNpc, sideTalkResult),
    observedExchange: exchange.summaries,
    sharedComputerArtifacts: sharedComputerContext(),
    retrievedSocialMemory,
    recentDialogue: recentDialogueContext(14, { role: "group" }),
    objective: state.language === "zh"
      ? "让未发言 NPC 合理地知道房间里刚发生的公开/半公开交流，但不要让他们像自己参与了对话。"
      : "Let silent NPCs reasonably update from the nearby public/semi-public exchange without pretending they participated."
  };
  const response = await fetchWithTimeout("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: "deepseek",
      model: deepSeekApiModel(npc.model),
      temperature: 0.45,
      agentPurpose: "silent_observer_update",
      messages: [
        {
          role: "system",
          content:
            `You control one safe NPC in a SocialEvoNPC scenario. ${scenarioAgentBrief()} You silently noticed only an observable interaction cue between the player and another NPC, plus any explicitly public NPC exchange supplied below. You do not know the private words, reply, memory, intent, or hidden meaning. Never reconstruct or quote them. You are not speaking now. Return only compact JSON with these required non-empty keys: emotion, relationshipDeltas, valueTradeoffDeltas, memory, structuredMemory, researchReason. Use this required object shape: {"emotion":"...","relationshipDeltas":{"competence":0,"care":0,"reliability":0,"disruption":0},"valueTradeoffDeltas":{"task":0,"inclusion":0,"fairness":0,"psychologicalSafety":0},"memory":"...","structuredMemory":{"event":"...","interpretation":"...","impact":"...","futureUse":"..."},"researchReason":"..."}. Do not include controller-owned fields such as importance, confidence, evidenceIds, sourceEventId, eventId, or npcId. ${relationshipEvolutionPromptRule()} strategy is optional: include it only when legal public evidence justifies a persistent strategy change; otherwise omit it so the existing strategy remains unchanged. surfaceLine is optional under the same rule. Keep any update weak and uncertain when only the observable cue exists. Do not claim you participated or heard private details.`
        },
        {
          role: "user",
          content: JSON.stringify(observerContext)
        }
      ]
    })
  }, 9000, {
    agentPurpose: "silent_observer_update",
    eventId: event?.eventId || ""
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${shorten(text, 120)}`);
  }
  const data = await response.json();
  return parseNormalizeOrRepairAgentJson({
    rawContent: data.choices?.[0]?.message?.content || "",
    label: `${npc.name} silent observer schema repair`,
    requiredShape: {
        emotion: "...",
        relationshipDeltas: { competence: 0, care: 0, reliability: 0, disruption: 0 },
        valueTradeoffDeltas: { task: 0, inclusion: 0, fairness: 0, psychologicalSafety: 0 },
        memory: "...",
        structuredMemory: { event: "...", interpretation: "...", impact: "...", futureUse: "..." },
        researchReason: "..."
    },
    context: observerContext,
    eventId: event?.eventId || "",
    normalize: (update) => normalizeSilentObserverUpdate(update, npc, event)
  });
}

function normalizeSilentObserverUpdate(update, npc, event = null) {
  const label = `${npc.name} silent observer agent`;
  const allowedFields = [
    "emotion", "relationshipDeltas", "relationshipImpact", "valueTradeoffDeltas", "valueDeltas",
    "memory", "structuredMemory", "strategy", "researchReason", "surfaceLine", "surface_line",
    "proximityLine", "hoverLine"
  ];
  update = canonicalizeAppraisalResponseEnvelope(update, allowedFields, label, {
    agentPurpose: "silent_observer_update",
    eventId: event?.eventId || ""
  });
  const surfaceLineInput = ["surfaceLine", "surface_line", "proximityLine", "hoverLine"]
    .map((key) => optionalTextValue(update?.[key]))
    .find(Boolean);
  const surfaceLine = surfaceLineInput
    ? sanitizeSurfaceLineStrict(surfaceLineInput, npc)
    : undefined;
  const memory = requiredTextField(update, "memory", label);
  const structuredMemory = requiredStructuredMemory(update, label);
  if (surfaceLineInput && !surfaceLine) {
    throw new Error(`${label} returned an unusable optional surfaceLine.`);
  }
  return {
    emotion: requiredTextField(update, "emotion", label),
    memory,
    structuredMemory,
    relationshipDeltas: requiredRelationshipDeltas(update, label),
    valueTradeoffDeltas: requiredValueTradeoffDeltas(update, label),
    strategy: optionalTextValue(update.strategy) || undefined,
    surfaceLine,
    researchReason: optionalTextValue(update.researchReason) || structuredMemory.impact,
    source: "llm_silent_observer"
  };
}

async function assessNpcDialogueOpportunity(sourceNpc, sideTalkResult, candidate) {
  try {
    return await callNpcDialogueControllerAgent(sourceNpc, sideTalkResult, candidate);
  } catch (error) {
    state.log.push({
      type: "NPC dialogue controller unavailable",
      round: candidate.type,
      summary: `Dialogue controller did not return usable output: ${error.message}`,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}

async function callNpcDialogueControllerAgent(sourceNpc, sideTalkResult, candidate) {
  const retrievedSocialMemory = typeof retrieveSocialMemoryForAgent === "function"
    ? retrieveSocialMemoryForAgent({
      purpose: "npc_dialogue_controller",
      role: "controller",
      allowPrivate: false,
      actorIds: state.npcs.map((npc) => npc.id),
      queryText: `${sourceNpc.name} ${candidate?.type || ""} private interaction occurred`,
      tags: ["dialogue_controller", "npc_exchange", sourceNpc.id],
      limit: 8
    })
    : null;
  const response = await fetchWithTimeout("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: "deepseek",
      model: DEEPSEEK_PRO_MODEL,
      temperature: 0.3,
      agentPurpose: "npc_dialogue_controller",
      messages: [
        {
          role: "system",
          content:
            `You are an NPC Dialogue Controller Agent for a safe, human-beneficial SocialEvoNPC scenario. ${scenarioAgentBrief()} Members are working in an existing lab, not waiting to comment on every private chat. Default to shouldStart=false: a private interaction occurring alone supplies NO new public topic, information need or reason to interrupt colleagues. Start a brief public exchange only when an actually delivered PUBLIC unresolved discussion gives these members a concrete reason to respond now. Do not infer its topic, content, agreement or emotions from private words or counts. Mere room presence, role familiarity or project pressure without a current public conversational need is not enough. Return only compact JSON with exactly shouldStart, reason, maxTurns, stopCondition, turns. turns contains objects with exactly speakerId and intent. Valid speakerId values: ${validNpcIdsText()}, excluding sourceNpc. Valid intents: emotion_check, concern_check, support, clarify_intent. No dialogue, responses, user_query, action plans or extra fields. Keep maxTurns 0..3 and, when starting, equal to turns.length. Disagreement, a useful clarification or remaining quietly at work are all natural; never force a chorus, hostility or support.`
        },
        {
          role: "user",
          content: JSON.stringify({
            language: requestedLanguageLabel(),
            storyWorld: storyWorldContext(),
            candidateDecision: candidate,
            sourceNpc: {
              id: sourceNpc.id,
              name: sourceNpc.name,
              role: sourceNpc.role
            },
            observableCue: observablePrivateInteractionCue(sourceNpc, sideTalkResult),
            currentStageId:currentStage()?.id,
            sharedComputerArtifacts: sharedComputerContext(),
            retrievedSocialMemory,
            npcs: state.npcs.map((npc) => ({
              id: npc.id,
              name: npc.name,
              role: npc.role
            })),
            recentDialogue: recentDialogueContext(12, { role: "group" }),
            objective: state.language === "zh"
              ? "让 NPC 间交流只在自然、有信息价值或社会动力需要时发生；交流应在形成足够上下文后停止，不要无限聊天。"
              : "Let NPC-to-NPC dialogue occur only when it is natural, informative, or socially necessary; stop once enough context has formed rather than chatting indefinitely."
          })
        }
      ]
    })
  }, 7000);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${shorten(text, 120)}`);
  }
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";
  return parseNormalizeOrRepairAgentJson({
    rawContent: content,
    label: "NPC dialogue controller output",
    requiredShape: {
      shouldStart: false,
      reason: "...",
      maxTurns: 0,
      stopCondition: "",
      turns: []
    },
    context: {
      sourceNpcId: sourceNpc.id,
      candidateType: candidate?.type || "",
      observableCue: observablePrivateInteractionCue(sourceNpc, sideTalkResult),
      validNpcIds: state.npcs.map((npc) => npc.id)
    },
    normalize: (value) => normalizeNpcDialoguePlan(value, sourceNpc, sideTalkResult)
  });
}

function normalizeNpcDialoguePlan(plan, sourceNpc, sideTalkResult) {
  const label = "NPC dialogue controller";
  assertExactObjectFields(plan, ["shouldStart", "reason", "maxTurns", "stopCondition", "turns"], label);
  const validIds = new Set(state.npcs.map((npc) => npc.id));
  const validIntents = new Set(["emotion_check", "concern_check", "support", "clarify_intent"]);
  const nameToId = (value) => {
    const raw = String(value || "").trim().toLowerCase();
    const byId = state.npcs.find((npc) => npc.id === raw);
    if (byId) return byId.id;
    const byName = state.npcs.find((npc) => npc.name.toLowerCase() === raw);
    return byName ? byName.id : raw;
  };
  const shouldStart = requiredBooleanField(plan, "shouldStart", label);
  const reason = requiredTextField(plan, "reason", label);
  const maxTurns = Number(plan.maxTurns);
  if (!Number.isInteger(maxTurns) || maxTurns < 0 || maxTurns > 3) {
    throw new Error("NPC dialogue controller returned invalid maxTurns.");
  }
  if (!Array.isArray(plan.turns)) throw new Error("NPC dialogue controller missing turns array.");
  const turns = plan.turns.map((turn, index) => {
    assertExactObjectFields(turn, ["speakerId", "intent"], `${label}.turns[${index}]`);
    const speakerId = nameToId(requiredTextField(turn, "speakerId", `${label}.turns[${index}]`));
    const intent = SocialEvoCore.normalizeEnumToken(requiredTextField(turn, "intent", `${label}.turns[${index}]`));
    if (!validIds.has(speakerId)) throw new Error(`${label} returned unknown speakerId: ${speakerId}.`);
    if (speakerId === sourceNpc.id) throw new Error(`${label} selected the source NPC for an autonomous turn.`);
    if (!validIntents.has(intent)) throw new Error(`${label} returned invalid intent: ${intent}.`);
    return { speakerId, intent };
  });
  if (new Set(turns.map((turn) => turn.speakerId)).size !== turns.length) {
    throw new Error("NPC dialogue controller returned duplicate speaker turns.");
  }
  if (shouldStart && !turns.length) throw new Error("NPC dialogue controller requested dialogue but returned no valid speaker turns.");
  if (shouldStart && !String(plan.stopCondition || "").trim()) throw new Error("NPC dialogue controller requested dialogue but returned no stopCondition.");
  if (shouldStart && maxTurns !== turns.length) throw new Error("NPC dialogue controller maxTurns must equal turns.length.");
  if (!shouldStart && (maxTurns !== 0 || turns.length)) throw new Error("NPC dialogue controller returned turns while shouldStart=false.");

  return {
    shouldStart,
    reason,
    maxTurns: shouldStart ? maxTurns : 0,
    stopCondition: String(plan.stopCondition || ""),
    turns: shouldStart ? turns : []
  };
}

async function generateAutonomousNpcExchangeUpdate(npc, sourceNpc, sideTalkResult, phase, event = null, groupThread=null) {
  if (isDeepSeekModel(npc.model)) {
    for(let attempt=0;attempt<2;attempt++){
      if(event)currentEpochOrThrow(event.sessionEpoch);
      try{const update=await callAutonomousNpcExchangeApi(npc,sourceNpc,sideTalkResult,phase,event,groupThread);if(event)currentEpochOrThrow(event.sessionEpoch);assertLabGroupReply(update.dialogue,groupThread);await validateLabSubmittedTextClaim(update.dialogue,npc,{eventId:event?.eventId,groupThreadEventId:event?.eventId||'',context:{groupThread,currentPublicCue:observablePrivateInteractionCue(sourceNpc,sideTalkResult)}});return update;}
      catch(error){if(!(isDuplicateGroupTurnError(error)||isAgentOutputValidationError(error))||attempt>0)throw error;state.log.push({type:'NPC group speech regenerated',npcId:npc.id,summary:'Exact undelivered repeated turn discarded; one fresh response with the same public prefix.',timestamp:new Date().toISOString()});}
    }
  }
  throw new Error(`No agent backend configured for ${npc.model}.`);
}

async function callAutonomousNpcExchangeApi(npc, sourceNpc, sideTalkResult, phase, event = null, groupThread=null) {
  const retrievedSocialMemory = typeof retrieveSocialMemoryForAgent === "function"
    ? retrieveSocialMemoryForAgent({
      purpose: "autonomous_npc_exchange",
      allowPrivate: false,
      targetNpcId: npc.id,
      actorIds: ["player", npc.id, sourceNpc.id],
      queryText: `${sourceNpc.name} ${phase} visible interaction cue`,
      tags: ["npc_exchange", npc.id, sourceNpc.id],
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
      agentPurpose: "autonomous_npc_exchange",
      messages: [
        {
          role: "system",
          content:
            `You control one safe NPC in a SocialEvoNPC scenario. ${isEntryEpisodeStage() ? entryConversationAgentBrief() : scenarioAgentBrief()} You may speak to the group after noticing only the supplied observable cue. You do not know what was said privately and must not reconstruct, quote, or respond to private details. Return only compact JSON with required keys: dialogue, emotion, tone, relationshipDeltas, valueTradeoffDeltas, memory, structuredMemory, researchReason. strategy and surfaceLine are optional: include either only when the observable evidence justifies a persistent change; otherwise omit it. Do not include controller-owned fields such as importance, confidence, evidenceIds, sourceEventId, eventId, or npcId. relationshipDeltas must contain exactly competence, care, reliability, disruption. valueTradeoffDeltas must contain exactly task, inclusion, fairness, psychologicalSafety. Every delta is numeric from -5 to 5. Never place trust, belonging, progress, climate, or taskProgress inside either delta object. ${relationshipEvolutionPromptRule()} structuredMemory must contain non-empty event, interpretation, impact, futureUse. Keep the spoken line natural and grounded in public context or the visible cue; uncertainty is appropriate.`
        },
        {
          role: "user",
          content: JSON.stringify({
            ...(groupThread?{groupThread,publicTurnToRespondTo:groupThread.latestTurn}:{}),
            language: requestedLanguageLabel(),
            ...(isEntryEpisodeStage() ? {playerOrientation:entryConversationOrientation(npc,{publicOnly:true})} : {}),
            storyWorld: isEntryEpisodeStage() ? entryConversationWorld() : storyWorldContext(),
            speakerNpc: {
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
              recentMemory: [],
              strategy: npc.strategy
            },
            evolutionMode: state.evolutionMode,
            evolutionConstraints: relationshipEvolutionConstraintsForAgent(npc, 0.66),
            sourceNpc: {
              id: sourceNpc.id,
              name: sourceNpc.name,
              role: sourceNpc.role
            },
            observableCue: observablePrivateInteractionCue(sourceNpc, sideTalkResult),
            phase,
            groupMetrics: state.sessionMetrics,
            sharedComputerArtifacts: isEntryEpisodeStage() ? entryConversationDocuments() : sharedComputerContext(),
            retrievedSocialMemory,
            recentDialogue: recentDialogueContext(14, { role: "group" }),
            objective: state.language === "zh"
              ? "让 NPC 间交流像真实小组成员自然接话，而不是每个人机械发表观点。"
              : "Make NPC-to-NPC dialogue feel like real group members naturally picking up a thread, not everyone mechanically stating a position."
          })
        }
      ]
    })
  }, 12000, {
    agentPurpose: "autonomous_npc_exchange",
    eventId: event?.eventId || ""
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${shorten(text, 120)}`);
  }
  const data = await response.json();
  return parseNormalizeOrRepairAgentJson({
    rawContent: data.choices?.[0]?.message?.content || "",
    label: `${npc.name} autonomous exchange language/schema repair`,
    requiredShape: autonomousNpcExchangeRequiredShape(),
    context: {
      ...(groupThread?{groupThread}:{}),
      language: requestedLanguageLabel(),
      languageRule: requestedLanguageInstruction(),
      speakerNpc: { id: npc.id, name: npc.name, role: npc.role, emotion: npc.emotion },
      sourceNpc: { id: sourceNpc.id, name: sourceNpc.name, role: sourceNpc.role },
      observableCue: observablePrivateInteractionCue(sourceNpc, sideTalkResult),
      phase,
      recentDialogue: recentDialogueContext(14, { role: 'group' })
    },
    eventId: event?.eventId || "",
    normalize: (update) => normalizeAutonomousNpcExchangeUpdate(
      update, npc, sourceNpc, sideTalkResult, phase, event
    )
  });
}

function autonomousNpcExchangeRequiredShape() {
  return {
    dialogue: "...",
    emotion: "...",
    tone: "...",
    relationshipDeltas: { competence: 0, care: 0, reliability: 0, disruption: 0 },
    valueTradeoffDeltas: { task: 0, inclusion: 0, fairness: 0, psychologicalSafety: 0 },
    memory: "...",
    structuredMemory: { event: "...", interpretation: "...", impact: "...", futureUse: "..." },
    researchReason: "..."
  };
}

function normalizeAutonomousNpcExchangeUpdate(update, npc, sourceNpc, sideTalkResult, phase, event = null) {
  const label = `${npc.name} autonomous exchange agent`;
  const allowedFields = [
    "dialogue", "emotion", "tone", "relationshipDeltas", "relationshipImpact",
    "valueTradeoffDeltas", "valueDeltas", "memory", "structuredMemory", "strategy",
    "surfaceLine", "researchReason"
  ];
  update = canonicalizeAppraisalResponseEnvelope(update, allowedFields, label, {
    agentPurpose: "autonomous_npc_exchange",
    eventId: event?.eventId || ""
  });
  const dialogue = sanitizeNpcDialogueStrict(update.dialogue, npc);
  if (!dialogue) throw new Error("Empty autonomous NPC dialogue.");
  assertParticipantVisibleOutput(dialogue, label, {
    forbiddenFragments: [sideTalkResult.dialogue, sideTalkResult.memory]
  });
  const surfaceLineInput = optionalTextValue(update.surfaceLine);
  const surfaceLine = surfaceLineInput
    ? sanitizeSurfaceLineStrict(surfaceLineInput, npc)
    : undefined;
  if (surfaceLineInput && !surfaceLine) {
    throw new Error(`${label} returned an unusable optional surfaceLine.`);
  }
  const structuredMemory = requiredStructuredMemory(update, label);
  let source = "llm";
  if (hasRepeatedNpcLine(npc, dialogue) || !dialogueGroundedInObservableCue(dialogue, sourceNpc)) {
    source = "llm_unverified";
  }
  return {
    dialogue,
    emotion: requiredTextField(update, "emotion", label),
    tone: requiredTextField(update, "tone", label),
    memory: requiredTextField(update, "memory", label),
    structuredMemory,
    relationshipDeltas: requiredRelationshipDeltas(update, label),
    valueTradeoffDeltas: requiredValueTradeoffDeltas(update, label),
    strategy: optionalTextValue(update.strategy) || undefined,
    surfaceLine,
    researchReason: optionalTextValue(update.researchReason) || structuredMemory.impact,
    source
  };
}

function dialogueGroundedInObservableCue(dialogue, sourceNpc) {
  const spoken = normalizeDialogueLine(dialogue);
  if (spoken.includes(sourceNpc.name.toLowerCase())) return true;
  return spoken.length >= 12;
}

function proximityLine(npc) {
  if (npc.surfaceLine) return npc.surfaceLine;
  const recentLine = recentNpcSurfaceLine(npc);
  if (recentLine) return recentLine;
  return "";
}

function recentNpcSurfaceLine(npc) {
  const recent = [...state.dialogueHistory].reverse().find((entry) => entry.name === npc.name);
  if (!recent) return "";
  return sanitizeSurfaceLine("", npc, recent.text);
}

function npcInteractionContext(npc) {
  const window = currentWindow();
  const phaseKey = phaseKeyFrom(window?.type || "");
  const latestMemory = npc.memory[npc.memory.length - 1] || "";
  const trustBand = npc.trust >= 70 ? "high" : npc.trust >= 40 ? "medium" : "low";
  const belongingBand = npc.belonging >= 70 ? "high" : npc.belonging >= 40 ? "medium" : "low";
  return {
    phaseKey,
    phaseLabel: phaseFocusText(phaseKey),
    latestMemory,
    trustBand,
    belongingBand,
    hasEvolved: npc.memory.length > 1 || state.roundIndex > 0 || state.totalSideTalks > 0
  };
}

function dynamicProximityLineZh(npc, context) {
  const phase = context.phaseLabel;
  const trustNote = context.trustBand === "high"
    ? "我现在更愿意把你纳入计划。"
    : context.trustBand === "low"
      ? "我还没有完全放心，需要看到更具体的行动。"
      : "我在观察你能不能把刚才的选择落实下来。";
  const lines = {
    mina: {
      entry: `刚才的互动已经改变了第一印象。接下来我会看这次临时转组能不能变得公平、现实。${trustNote}`,
      contribution: `现在重点是你能接下什么基于证据的工作，同时不继承无限责任。${trustNote}`,
      coordination: `我正在看旧项目问题和当前责任是不是足够可见。只有这样才谈得上公平。`,
      support: `支持别人是好事，但实验室也需要清楚的学术边界。${trustNote}`,
      final: `我们已经有足够多的互动记忆了。最后我想看到贡献和署名能被检查。`
    },
    leo: {
      entry: `我能感觉到房间里的紧张在变化。现在的问题是，你的出现能不能让大家更愿意说实话。`,
      contribution: `如果你的工作能让项目更清楚，同时不把你变成替罪羊，实验室氛围会好一点。`,
      coordination: `公平不只是任务数量，也包括大家能不能安全地说出遗留问题。`,
      support: `这个阶段我会看你能不能保护自己，也保护别人不被不公平归责。`,
      final: `我希望最后结果能承认真实贡献，也让大家保留基本尊重。`
    },
    sam: {
      entry: `我已经听到一些正面信号，但项目压力还在那里。下一步需要更具体。`,
      contribution: `现在我关心的是你的判断能不能真的降低风险。证据越清楚，交接风险越低。`,
      coordination: `如果你能让责任归属清楚起来，我对甩锅的担心会下降。`,
      support: `支持可以，但不能让研究结论更站不住脚。帮忙也需要证据。`,
      final: `最后贡献必须可见。一份清楚的修改记录，比漂亮话有用。`
    },
    riley: {
      entry: `我还没被说服。你刚才的选择可以算一个信号，但信任不是这么快来的。`,
      contribution: `现在别讲姿态，讲你具体能降低什么研究风险。`,
      coordination: `可见修改记录至少能让我看到谁在做事。没有可见贡献，我不会改变判断。`,
      support: `支持别人可以，但别把它当成赢得好感的表演。先做出站得住脚的东西。`,
      final: `最后我看的是贡献记录能不能站得住。别让我猜。`
    },
    nora: {
      entry: `你刚才把情况说得比较清楚，这让我没那么紧张。接下来我会看谁站在哪边。`,
      contribution: `如果你的任务能接上实验室已有工作，而不是突然抢走空间，我会更安心。`,
      coordination: `修改记录可能会帮到我，因为我有时不确定什么时候开口才安全。`,
      support: `我现在最在意的是，困难能不能被处理，而不是被公开甩锅。`,
      final: `如果最后记录是透明的，我会更敢承认实际发生了什么。`
    }
  };
  return lines[npc.id]?.[context.phaseKey] || `${phase}正在推进，我也在根据刚才的互动重新判断你。`;
}

function dynamicProximityLineEn(npc, context) {
  const phase = context.phaseLabel;
  const trustNote = context.trustBand === "high"
    ? "I am more willing to include you in the plan now."
    : context.trustBand === "low"
      ? "I still need more concrete follow-through before I relax."
      : "I am watching whether your earlier choice turns into action.";
  const lines = {
    mina: {
      entry: `The first impression has shifted. Now I am watching whether this transfer can become fair and realistic. ${trustNote}`,
      contribution: `The question is what evidence-based work you can take on without inheriting unlimited responsibility. ${trustNote}`,
      coordination: "I am watching whether old project problems and current ownership become visible enough to be fair.",
      support: `Support matters, but the lab also needs clear academic boundaries. ${trustNote}`,
      final: "We have enough shared memory now. I want contribution and credit to be checkable."
    },
    leo: {
      entry: "The room is tense, but I am watching whether your presence helps people speak more honestly.",
      contribution: "If your work makes the project clearer without making you a scapegoat, the lab climate improves.",
      coordination: "Fairness is not only workload; it is whether people can safely name inherited problems.",
      support: "At this stage I am watching whether you protect yourself and others from unfair blame.",
      final: "I hope the final outcome recognizes real work while still leaving people respected."
    },
    sam: {
      entry: "I have heard a few positive signals, but the project pressure is still real. The next step needs specifics.",
      contribution: "I care about whether your judgment actually reduces risk. More evidence means less handoff trouble.",
      coordination: "If you make ownership visible, my concern about responsibility getting dumped goes down.",
      support: "Support is fine, but it cannot make the research claim weaker. Help still needs evidence.",
      final: "The final contribution has to be visible. A clean revision record beats a good speech."
    },
    riley: {
      entry: "I am not convinced yet. Your earlier choice counts as a signal, but trust does not arrive that fast.",
      contribution: "Do not sell the attitude; tell me what research risk you can actually reduce.",
      coordination: "A visible revision log at least shows who is doing work. No visible contribution, no changed judgment.",
      support: "Support can matter, but do not use it as a performance for approval. Produce something defensible first.",
      final: "At the end I care whether the contribution record is defensible. Do not make me guess."
    },
    nora: {
      entry: "Because you named the situation carefully, I feel a little less tense. Now I am watching who takes sides.",
      contribution: "I will feel steadier if your task fits the lab's work instead of suddenly taking over space.",
      coordination: "A revision log might help me because I am not always sure when it is safe to speak.",
      support: "What matters to me now is whether difficulty can be handled without public blame.",
      final: "If the final record is transparent, I would feel safer admitting what actually happened."
    }
  };
  return lines[npc.id]?.[context.phaseKey] || `${phase} is moving forward, and I am updating my view from what just happened.`;
}
