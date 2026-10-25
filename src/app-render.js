function trajectoryNpcState(npc) {
  return {
    npcId: npc.id,
    name: npc.name,
    emotion: String(npc.emotion || ""),
    surfaceLine: String(npc.surfaceLine || ""),
    trust: Number(npc.trust || 0),
    belonging: Number(npc.belonging || 0),
    relationship: Object.fromEntries(
      relationshipKeys.map((key) => [key, Number(npc.relationship?.[key] || 0)])
    ),
    valueTradeoffs: Object.fromEntries(
      valueTradeoffKeys.map((key) => [key, Number(npc.valueTradeoffs?.[key] || 0)])
    ),
    strategy: String(npc.strategy || "")
  };
}

function createTrajectoryBaseline() {
  return {
    schemaVersion: "social-trajectory-baseline-v1",
    sessionId: state.sessionId,
    capturedAt: new Date().toISOString(),
    narrativeClock: typeof labDayContext === "function" ? labDayContext() : null,
    orderedStory: typeof labStoryFlowContext === "function" ? labStoryFlowContext() : null,
    npcs: state.npcs.map(trajectoryNpcState)
  };
}

function captureStageTrajectorySnapshot(stageIndex, sourceEventId = "") {
  const index = Math.max(0, Math.min(Number(stageIndex || 0), scenarioStages().length - 1));
  const existing = state.stageTrajectorySnapshots.find((item) => item.stageIndex === index);
  if (existing) return existing;
  const stage = scenarioStages()[index];
  const snapshot = {
    schemaVersion: "stage-trajectory-snapshot-v1",
    snapshotId: `snapshot-${state.sessionId}-stage-${index + 1}`,
    sessionId: state.sessionId,
    stageIndex: index,
    stageId: stage?.id || `stage-${index + 1}`,
    sourceEventId: String(sourceEventId || ""),
    committedEventCount: state.eventLedger.filter((event) => event.status === "committed").length,
    globalStoryBeatCount: state.storyBeatLedger.filter((beat) =>
      beat.status === "committed" && beat.countsTowardStage !== false
    ).length,
    capturedAt: new Date().toISOString(),
    narrativeClock: typeof labDayContext === "function" ? labDayContext() : null,
    orderedStory: typeof labStoryFlowContext === "function" ? labStoryFlowContext() : null,
    npcs: state.npcs.map(trajectoryNpcState)
  };
  state.stageTrajectorySnapshots.push(snapshot);
  state.stageTrajectorySnapshots.sort((left, right) => left.stageIndex - right.stageIndex);
  state.log.push({
    type: "Stage trajectory snapshot",
    round: stage?.id || `stage-${index + 1}`,
    summary: `Captured stage ${index + 1} appraisal state for ${snapshot.npcs.length} NPCs.`,
    sourceEventId: snapshot.sourceEventId,
    timestamp: snapshot.capturedAt
  });
  return snapshot;
}


// Rendering and scenario/task/laptop workspace UI.
function renderConfig() {
  if (typeof syncLabBgm === 'function') syncLabBgm();
  renderScenarioStaticText();
  renderEvolutionModeSelect();
  renderVideoModalityConfig();
  if (typeof renderVoiceModalityConfig === "function") {
    renderVoiceModalityConfig();
    refreshVoiceModalityAvailability().catch(() => {});
  }
  const videoField = document.getElementById("video-modality-field");
  const voiceField = document.getElementById("voice-modality-field");
  if (videoField) {
    videoField.hidden = studyModeRequested();
    videoField.style.display = studyModeRequested() ? "none" : "";
  }
  if (voiceField) {
    voiceField.hidden = false;
    voiceField.style.display = "";
  }
  if (typeof renderShellUi === "function") renderShellUi();
  if (typeof renderStudyPairUi === "function") renderStudyPairUi();
}

function renderEvolutionModeSelect() {
  const select = document.getElementById("evolution-mode");
  const description = document.getElementById("evolution-mode-description");
  const field = document.getElementById("game-mode-field");
  if (!select) return;
  const paired = studyModeRequested();
  if (field) field.hidden = paired;
  select.disabled = paired;
  const modes = ["self-evolving", "memory-only"];
  const selected = modes.includes(state.evolutionMode) ? state.evolutionMode : "self-evolving";
  select.replaceChildren();
  for (const mode of modes) {
    const option = document.createElement("option");
    option.value = mode;
    option.textContent = mode === "self-evolving" ? t("gameModeFull") : t("gameModeMemory");
    select.appendChild(option);
  }
  select.value = selected;
  const updateDescription = () => {
    if (description) description.textContent = evolutionModeDescription(select.value);
  };
  select.onchange = () => {
    if (!studyModeRequested() && modes.includes(select.value)) state.evolutionMode = select.value;
    updateDescription();
  };
  updateDescription();
}

function studyModeRequested() {
  return new URLSearchParams(window.location.search).get("study") === "1";
}

async function requestServerStudyProfile(participantId) {
  if (typeof studyPairRequested === "function" && studyPairRequested()) {
    return requestStudyPairProfile(participantId);
  }
  const enrollmentCode = new URLSearchParams(window.location.search).get("studyCode") || "";
  const response = await fetchWithTimeout("/api/study/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ participantId, enrollmentCode })
  }, 10000, { agentPurpose: "study_assignment" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || "Study session authorization failed.");
  }
  return normalizeServerStudyProfile(payload);
}

function normalizeServerStudyProfile(payload) {
  const profile = payload.profile || {};
  const sessionToken = payload.sessionToken || profile.sessionToken || "";
  const capabilities = profile.capabilities || {};
  const assignedCondition = capabilities.updateEmotion ? "self-evolving" : "memory-only";
  const expected = SocialEvoCore.conditionCapabilities(assignedCondition);
  const normalized = { id: assignedCondition, ...capabilities };
  if (!profile.active || !profile.assignmentId || !sessionToken ||
      profile.protocolVersion !== SocialEvoCore.STUDY_PROTOCOL_VERSION ||
      !SocialEvoCore.sameCapabilities(normalized, expected)) {
    throw new Error("Study server returned an invalid capability profile.");
  }
  return {
    active: true,
    assignmentId: profile.assignmentId,
    assignedCondition,
    protocolVersion: profile.protocolVersion || "",
    sessionToken,
    expiresAt: Number(profile.expiresAt || 0),
    serverValidated: true,
    capabilities: expected,
    ...(profile.pairId ? { pairId: profile.pairId, gameLabel: profile.gameLabel } : {})
  };
}

async function requestRuntimeManifest() {
  const response = await fetchWithTimeout("/health", { method: "GET", cache: "no-store" }, 5000, {
    agentPurpose: "runtime_manifest"
  });
  if (!response.ok) throw new Error("Runtime manifest is unavailable.");
  const payload = await response.json();
  if (payload.status !== "ok" || String(payload.apiContractVersion || "") !== API_CONTRACT_VERSION) {
    throw new Error("The game page and runtime service use different API contract versions.");
  }
  if (String(payload.buildVersion || "") !== BUILD_VERSION) {
    throw new Error("The game page and runtime service use different build versions.");
  }
  const textAgent = validateTextAgentConfiguration(payload.textAgent);
  return {
    buildVersion: String(payload.buildVersion || "unavailable-browser-build"),
    codeCommit: String(payload.codeCommit || "unavailable-browser-build"),
    scenarioVersion: String(payload.scenarioVersion || "lab-entry-v1"),
    apiContractVersion: String(payload.apiContractVersion),
    pairedOnlyRecapArt: Boolean(payload.researchAB?.enabled),
    ...(payload.studyAudio?.version === "study-audio-v1" ? {studyAudio: {
      version: "study-audio-v1", npcVoice: payload.studyAudio.npcVoice === "optional-verbatim" ? "optional-verbatim" : "unavailable",
      backgroundMusic: payload.studyAudio.backgroundMusic === "optional" ? "optional" : "unavailable",
      microphone: false, camera: false, settingsRecorded: payload.studyAudio.settingsRecorded === true
    }} : {}),
    ...(textAgent ? {textAgent:{...textAgent}} : {}),
    voice: normalizeVoiceRuntimeMetadata(payload.voice)
  };
}

async function beginGame(options = {}) {
  resetVideoRuntimeForNewSession();
  if (typeof resetVoiceRuntimeForNewSession === "function") resetVoiceRuntimeForNewSession();
  const participantInput = document.getElementById("participant-id");
  const participantWarning = document.getElementById("participant-warning");
  const startButton = document.getElementById("begin-game-btn");
  const participantId = participantInput ? participantInput.value.trim() : "";
  if (!participantId) {
    if (participantWarning) participantWarning.textContent = t("participantIdRequired");
    if (participantInput) participantInput.focus();
    return;
  }
  // Continue A→B prepares playback before its own storage awaits. Reuse those
  // contexts; the direct Begin click prepares its contexts here.
  if (options.audioPrepared !== true && typeof prepareGameAudioGesture === "function") prepareGameAudioGesture();
  if (typeof studyPairRequested === "function" && studyPairRequested()) {
    if (startButton) startButton.disabled = true;
    try { if(await studyPairBeforeBegin(participantId)===false){if(startButton)startButton.disabled=false;return;} }
    catch (error) {
      if (participantWarning) participantWarning.textContent = error.message;
      if (startButton) startButton.disabled = false;
      if (participantInput) participantInput.focus();
      return;
    }
    try {
      if (typeof studyQuestionnaireBeforeBegin === "function" && !await studyQuestionnaireBeforeBegin(participantId)) {
        if (startButton) startButton.disabled = false;
        return;
      }
    } catch(error) {
      if (participantWarning) participantWarning.textContent = error.message;
      if (startButton) startButton.disabled = false;
      return;
    }
  }
  const studyRequested = studyModeRequested();
  const adminEnabled = false;
  if (participantWarning) participantWarning.textContent = t("checkingAgentBackend");
  if (startButton) startButton.disabled = true;
  beginNewSessionEpoch(participantId);
  if (typeof studyPairRequested === "function" && studyPairRequested()) {
    state.researchProfile = {active: false, sessionToken: ""};
    studyPairPrepareGame();
  }
  state.sessionClosed = false;
  if (typeof resetLabRecapRuntime === 'function') resetLabRecapRuntime();
  try {
    state.runtimeManifest = await requestRuntimeManifest();
  } catch (error) {
    state.sessionClosed = true;
    if (participantWarning) {
      participantWarning.textContent = state.configAdminUnlocked
        ? `${t("runtimeRefreshRequired")} ${shorten(String(error?.message || error || ""), 140)}`
        : t("runtimeRefreshRequired");
    }
    if (startButton) startButton.disabled = false;
    return;
  }
  try {
    state.researchProfile = studyRequested
      ? await requestServerStudyProfile(participantId)
      : {
        active: false,
        assignmentId: "",
        assignedCondition: "",
        protocolVersion: "",
        sessionToken: "",
        expiresAt: 0,
        serverValidated: false
      };
  } catch (error) {
    endSessionRuntime("study_profile_failure");
    if (participantWarning) participantWarning.textContent = error.message;
    if (startButton) startButton.disabled = false;
    return;
  }
  const selectedGameMode = document.getElementById("evolution-mode")?.value;
  state.evolutionMode = state.researchProfile.active
    ? state.researchProfile.assignedCondition
    : ["self-evolving", "memory-only"].includes(selectedGameMode) ? selectedGameMode : "self-evolving";
  state.capabilities = state.researchProfile.active
    ? state.researchProfile.capabilities
    : SocialEvoCore.conditionCapabilities(state.evolutionMode);
  state.npcs = cloneNpcs();
  state.projectTasks = cloneProjectTasks();
  const videoCheckbox = document.getElementById("video-modality-enabled");
  const videoInterval = document.getElementById("video-sample-interval");
  state.videoModality.requested = state.researchProfile.active ? false : !!videoCheckbox?.checked;
  state.videoModality.enabled = state.researchProfile.active ? false : !!videoCheckbox?.checked;
  if (videoCheckbox && state.researchProfile.active) {
    videoCheckbox.checked = false;
    videoCheckbox.disabled = true;
  }
  state.videoModality.sampleMs = Number(videoInterval?.value) || state.videoModality.sampleMs || 700;
  state.voiceModality.provider = state.runtimeManifest.voice?.provider || "openai";
  state.voiceModality.engine = state.runtimeManifest.voice?.engine || "tts";
  state.voiceModality.model = state.runtimeManifest.voice?.model || "";
  state.voiceModality.paraphrase = Boolean(state.runtimeManifest.voice?.paraphrase);
  state.voiceModality.requestTimeoutMs = Number(state.runtimeManifest.voice?.requestTimeoutMs) || 45000;
  state.voiceModality.generationStreaming = state.runtimeManifest.voice?.streaming !== false;
  state.voiceModality.dependencyReady = state.runtimeManifest.voice?.dependencyReady !== false;
  state.voiceModality.studyOwnerRequired = Boolean(state.runtimeManifest.pairedOnlyRecapArt);
  state.voiceModality.configured = Boolean(state.runtimeManifest.voice?.configured);
  state.voiceModality.availability = state.voiceModality.configured ? "ready" : "not_configured";
  state.voiceModality.enabled = false;
  if (typeof renderVoiceModalityConfig === "function") renderVoiceModalityConfig();
  document.querySelectorAll("[data-npc-model]").forEach((select) => {
    const npc = state.npcs.find((item) => item.id === select.dataset.npcModel);
    if (npc) npc.model = select.value;
  });

  try {
    await verifyRequiredAgentBackends();
  } catch (error) {
    const message = agentFailureMessage(error);
    // No game has started or been bound to storage yet. A setup retry must not
    // turn this abandoned preflight into a restart terminal for the paired game.
    if (typeof studyPairRequested === "function" && studyPairRequested()) state.sessionClosed = true;
    if (participantWarning) participantWarning.textContent = message;
    if (startButton) startButton.disabled = false;
    state.log = [{
      type: "Agent backend startup failure",
      round: "Setup",
      summary: message,
      timestamp: new Date().toISOString()
    }];
    return;
  }
  if (participantWarning) participantWarning.textContent = "";
  if (startButton) startButton.disabled = false;
  state.apiFatalError = null;
  state.apiFatalCode = "";
  state.apiFatalContext = null;
  state.roundIndex = 0;
  state.selectedOption = "";
  state.selectedOptionIndex = -1;
  state.openingResponseAnswered = false;
  state.openingPresentation = null;
  state.sideTalkDraftIntent = null;
  if (typeof closePlayerTool === "function") closePlayerTool();
  if (typeof cancelPointerWalk === "function") cancelPointerWalk();
  state.stageIndex = 0;
  state.stageStatus = scenarioStages()[0]?.id || "stage_1_entry";
  state.stageEvolutionReports = [];
  state.storyBeatLedger = [];
  state.stageDirectorReports = [];
  state.stagePacing = emptyStagePacingState();
  state.entryEpisode = emptyEntryEpisode();
  resetEntryEpisodeRuntime();
  resetStagePacingRuntime();
  state.stageDirectorCue = "";
  state.trajectoryBaseline = typeof createTrajectoryBaseline === "function"
    ? createTrajectoryBaseline()
    : null;
  state.stageTrajectorySnapshots = [];
  state.offlineEvaluation = typeof emptyOfflineEvaluationState === "function"
    ? emptyOfflineEvaluationState()
    : {
      schemaVersion: "offline-social-evaluation-v1",
      status: "idle",
      attempts: 0,
      observable: null,
      evolution: null,
      error: "",
      requestedAt: "",
      completedAt: ""
    };
  state.globalAttentionChecks = [];
  state.globalAttentionScheduleEnabled = true;
  state.pendingTerminalOutcome = null;
  state.pendingPostDecisionContinuation = null;
  state.relationshipTransferProbe = null;
  state.attentionCheck = {
    completed: false,
    failed: false,
    attempts: []
  };
  state.dualScoreEndingEvidence = null;
  state.playerPosition = { ...activePlayerStart() };
  state.playerDirection = "down";
  state.playerWalkFrame = 0;
  state.lastSpeaker = null;
  state.worldBubbleMode = "";
  state.dialogueBubbleUntil = 0;
  state.dialogueAdvancePending = false;
  state.dialoguePacingChanges = [{
    autoAdvance: Boolean(state.autoAdvanceDialogue),
    source: "session_start",
    timestamp: new Date().toISOString()
  }];
  state.nearbyNpcId = null;
  state.nearbyProjectObjectId = null;
  state.activeSideTalkNpcId = null;
  state.currentPrivateConversationNpcId = null;
  state.activeArtifactTask = null;
  state.projectWorkflow = null;
  state.artifactDraft = "";
  state.selectedArtifactOption = "";
  state.artifactSubmissionStatus = "";
  state.artifactTaskLoading = false;
  state.artifactScoreReports = [];
  state.submittedArtifacts = [];
  state.sharedComputerArtifacts = cloneScenarioWorkspaceDocuments();
  state.openWorkspaceDocumentIds = [];
  state.pendingLaptopCue = null;
  state.participantId = participantId;
  state.adminMode = adminEnabled;
  state.sessionAdminModeAtStart = adminEnabled;
  state.pendingDecision = null;
  state.interactionsSinceDecision = 0;
  state.totalSideTalks = 0;
  state.sideTalkSemanticHistory = [];
  state.sideTalkOpportunityKeys = [];
  state.sideTalkRootRewardKeys = [];
  state.delayedDecisionTimerId = null;
  state.isIntroPlaying = true;
  state.isScenePlaying = false;
  state.isGmThinking = false;
  state.decisionPanelVisible = false;
  state.log = [];
  state.latestGoalAssessment = null;
  state.finalOutcome = null;
  state.userFeedback = null;
  state.log.push({
    type: "Session metadata",
    round: "Setup",
    summary: `Scenario=${currentScenario().id}; Participant/study ID: ${participantId}`,
    scenario: currentScenario().id,
    participantId,
    evolutionMode: state.evolutionMode,
    adminMode: state.adminMode,
    timestamp: new Date().toISOString()
  });
  const setupEvent = createRuntimeEvent("session_setup", {
    actors: ["controller"],
    audience: { visibility: "private", npcIds: [] },
    metadata: {
      scenarioId: currentScenario().id,
      conditionId: state.evolutionMode,
      capabilityVector: state.capabilities,
      adminMode: state.adminMode
    }
  });
  SocialEvoCore.transitionEvent(setupEvent, "validated");
  SocialEvoCore.transitionEvent(setupEvent, "committed", { npcIds: [] });
  state.dialogueHistory = [];
  if (typeof resetSocialMemoryRag === "function") {
    resetSocialMemoryRag();
    seedInitialSocialMemoryRag();
  }
  state.sessionMetrics = {
    ...(currentScenario().metrics || { groupProgress: 32, groupClimate: 58 }),
    actionCount: 0,
    interactionOpportunityCount: 0,
    interactionUseCount: 0,
    rewardedInteractionCount: 0
  };
  state.interpersonalScore = currentScenario().initialScores?.interpersonal ?? state.sessionMetrics.groupClimate;
  state.outcomeScore = currentScenario().initialScores?.outcome ?? state.sessionMetrics.groupProgress;

  showScreen("game");
  if (typeof hideGalgameDialogue === "function") hideGalgameDialogue({ resetPartner: true });
  document.getElementById("dialogue-feed").innerHTML = "";
  document.getElementById("dialogue-feed").classList.remove("history-open");
  document.getElementById("dialogue-feed").classList.add("dialogue-feed-collapsed");
  document.getElementById("dialogue-history-toggle").setAttribute("aria-expanded", "false");
  document.getElementById("task-board-panel")?.classList.add("panel-hidden");
  document.getElementById("side-talk-panel")?.classList.add("panel-hidden");
  document.getElementById("backpack-panel")?.classList.add("panel-hidden");
  renderGame();
  updateWorldActivityClasses();
  setDecisionPanelVisible(false);
  if (typeof studyPairAwaitInitialSave === "function" && await studyPairAwaitInitialSave() === false) return;
  startVideoModality().catch((error) => {
    disableVideoModality(`Video modality startup failed: ${shorten(String(error?.message || error || ""), 140)}`);
  });
  if (typeof startVoiceModality === "function") startVoiceModality();
  await playOpeningSequence();
  completeOpeningPresentation();
}

function completeOpeningPresentation() {
  if(state.sessionClosed || state.stageIndex!==0) return false;
  recordStoryBeat({
    type: "stage_context",
    sourceEventId: `opening-${state.sessionId}`,
    visibility: "group",
    actors: state.npcs.map((npc) => npc.id),
    publicSummary: state.language === "zh"
      ? "学院因原研究组经费变化，临时把玩家转入未准备接收新人的实验室。Prof. Zhao 要求先明确工作范围与责任，Dr. Lin 邀请玩家先表达想了解什么。"
      : "The department transferred the newcomer after the original group's funding change. Prof. Zhao asked for clear work and responsibility; Dr. Lin invited the player to say what they need to understand first.",
    focusTags: ["forced_entry", "power_structure", "newcomer"],
    attentionFact: {
      question: state.language === "zh"
        ? "开场时，谁说实验室没有计划接收新人，工作范围和责任要先说清楚？"
        : "At the opening, who said a newcomer had not been planned for and work and responsibility must be clarified?",
      correctAnswer: "Prof. Zhao",
      distractors: ["Dr. Lin", "Jun", "Emma"]
    }
  });
  state.isIntroPlaying = false;
  showOpeningResponseWindow();
  updateWorldActivityClasses();
  if(typeof studyPairMarkCheckpointDirty==='function')studyPairMarkCheckpointDirty('opening_complete',{saveSoon:true});
  return true;
}

async function playOpeningSequence({resume=false}={}) {
  const lines = currentScenario().openingLines || scenarioSpecs["newcomer-circle"].openingLines;
  const epoch=state.sessionEpoch;
  if(!resume || !state.openingPresentation) {
    let index=0,delivered=false;
    if(resume) {
      const history=studyPairRuntime.dialogue||state.dialogueHistory;
      let cursor=0;
      for(let i=0;i<lines.length;i++) {
        const line=lines[i];if(line.movePlayerTo)continue;
        const text=scenarioText(line.text),found=history.findIndex((d,n)=>n>=cursor&&d.text===text&&(d.name===line.speaker||line.kind==='system'&&d.name==='Game Master'));
        if(found<0)break;index=i;delivered=true;cursor=found+1;
      }
    }
    state.openingPresentation={index,delivered};
  }
  state.isIntroPlaying=true;state.isScenePlaying=true;updateWorldActivityClasses();
  for(let i=state.openingPresentation.index;i<lines.length;i++) {
    currentEpochOrThrow(epoch);const line=lines[i],alreadyDelivered=i===state.openingPresentation.index&&state.openingPresentation.delivered;
    state.openingPresentation={index:i,delivered:alreadyDelivered};
    if(line.movePlayerTo) {
      const target=line.movePlayerTo==='opening'?activeOpeningPlayerPosition():line.movePlayerTo;
      await movePlayerAlongPath(target.x,target.y);
    } else {
      const text=scenarioText(line.text),name=line.speaker||'Game Master';
      if(alreadyDelivered)showGalgameDialogue(name,text,line.emotion||'neutral',line.tone||'neutral');
      else if(line.kind==='system'||name==='Game Master')addSystemMessage('Game Master',text,line.emotion||'pacing',line.tone||'open-ended setup');
      else addSceneDialogue(name,text,line.emotion||'attentive',line.tone||'natural');
      state.openingPresentation.delivered=true;
      if(typeof studyPairMarkCheckpointDirty==='function')studyPairMarkCheckpointDirty('opening_line',{saveSoon:true});
      await waitForDialogueAdvance(text,'opening');
    }
    currentEpochOrThrow(epoch);state.openingPresentation={index:i+1,delivered:false};
  }
  state.isScenePlaying=false;
}

async function speakOpeningLine(name, zhText, enText, emotion, tone) {
  const text = state.language === "zh" ? zhText : enText;
  addSceneDialogue(name, text, emotion, tone);
  await waitForDialogueAdvance(text, "opening");
}

function showOpeningDecisionWindow() {
  const candidate = getDecisionWindows()[0];
  state.pendingDecision = {
    ...candidate,
    source: "opening",
    sourceType: candidate.type,
    decisionCue: scenarioText(currentScenario().openingDecisionCue)
  };
  state.decisionPanelVisible = true;
  renderDecisionPanel(state.pendingDecision);
  setDecisionPanelVisible(true);
  setWorldHelp(scenarioText(currentScenario().openingHelp, t("openingDecisionHelp")));
  state.log.push({
    type: "Opening fixed decision",
    round: candidate.type,
    summary: state.pendingDecision.question,
    options: state.pendingDecision.options.join(" | "),
    timestamp: new Date().toISOString()
  });
  renderResearchLog();
}

function currentWindow() {
  return state.pendingDecision || getDecisionWindows()[state.roundIndex];
}

function getDecisionWindows() {
  const windows = currentScenario().decisionWindows || scenarioSpecs["newcomer-circle"].decisionWindows;
  const result = windows[state.language] || windows.en || decisionWindows;
  // Do not ask the identical introduction twice. Action IDs/utterances and the
  // formal stage prerequisite/evolution pipeline stay unchanged.
  return result;
}

function renderGame() {
  const window = currentWindow();
  renderScenarioStaticText();
  renderAdminVisibility();
  document.getElementById("round-label").textContent = currentStageLabel();
  document.getElementById("decision-type").textContent = decisionWindowPlayerTitle(window);
  document.getElementById("decision-question").textContent = window.question;
  document.getElementById("gm-note").textContent = window.gmNote;
  renderOptions(window.options);
  renderNpcRail();
  renderPixelWorld();
  renderSessionState();
  renderResearchLog();
  renderBackpack();
  renderVideoModalityHud();
  if (typeof renderVoiceModalityHud === "function") renderVoiceModalityHud();
  syncDialoguePacingControls();
  document.getElementById("free-response").value = "";
  setDecisionPanelVisible(state.decisionPanelVisible);
  if (typeof renderPlayerExperience === "function") renderPlayerExperience();
}

function renderAdminVisibility() {
  state.adminMode = false;
  state.configAdminUnlocked = false;
  const gameScreen = document.getElementById("game-screen");
  if (gameScreen) {
    gameScreen.classList.remove("admin-mode-active");
    gameScreen.classList.add("participant-mode");
  }
}

function renderDecisionPanel(window) {
  document.getElementById("round-label").textContent = currentStageLabel();
  document.getElementById("decision-type").textContent = decisionWindowPlayerTitle(window);
  document.getElementById("decision-question").textContent = window.question;
  document.getElementById("gm-note").textContent = window.gmNote;
  renderOptions(window.options);
  document.getElementById("free-response").value = "";
  if (typeof resetPlayerResponsePresentation === "function") resetPlayerResponsePresentation();
  syncDecisionSubmitButton();
}

function renderOptions(options) {
  const node = document.getElementById("decision-options");
  node.innerHTML = "";
  state.selectedOption = "";
  state.selectedOptionIndex = -1;
  options.forEach((option, index) => {
    const button = document.createElement("button");
    button.className = "option-btn";
    button.type = "button";
    const number = document.createElement("span"), label = document.createElement("span");
    number.className = "ui-option-number"; number.textContent = String(index + 1);
    label.textContent = decisionOptionLabel(option); button.append(number, label);
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => {
      state.selectedOption = decisionOptionLabel(option);
      state.selectedOptionIndex = index;
      [...node.children].forEach((child) => { child.classList.remove("selected"); child.setAttribute("aria-pressed", "false"); });
      button.classList.add("selected");
      button.setAttribute("aria-pressed", "true");
      syncDecisionSubmitButton();
    });
    node.appendChild(button);
  });
}

function decisionOptionLabel(option) {
  if (option && typeof option === "object") return scenarioText(option.label, option.text || "");
  return String(option || "");
}

function renderNpcRail() {
  const rail = document.getElementById("npc-rail");
  rail.innerHTML = "";
  state.npcs.forEach((npc) => {
    const card = document.createElement("article");
    card.className = "npc-card";
    const sprite = activeNpcAvatarSprite(npc);
    card.innerHTML = `
      <div class="npc-card-header">
        ${spriteAvatarMarkup("npc-card-avatar sprite-avatar", sprite, { avatarColor: npc.color })}
        <div>
          <h4>${npc.name}</h4>
          <p>${npc.model}</p>
        </div>
      </div>
      <p><strong>${t("emotionLabel")}:</strong> ${escapeHtml(displayEmotion(npc.emotion))}</p>
      <div class="npc-stats">
        <div class="stat-row"><span>${t("trustLabel")}</span><div class="meter"><span style="width:${npc.trust}%"></span></div><span>${npc.trust}</span></div>
        <div class="stat-row"><span>${t("belongingLabel")}</span><div class="meter"><span style="width:${npc.belonging}%"></span></div><span>${npc.belonging}</span></div>
      </div>
    `;
    rail.appendChild(card);
  });
}

function npcRole(npc) {
  if (state.language === "zh" && npc.roleZh) return npc.roleZh;
  if (state.language !== "zh") return npc.role;
  const roles = {
    mina: "项目协调者",
    leo: "支持型同伴",
    sam: "谨慎规划者",
    riley: "尖锐的守门人",
    nora: "不太自信的贡献者"
  };
  return roles[npc.id] || npc.role;
}

function displayEmotion(emotion) {
  const value = String(emotion || "").trim();
  if (state.language !== "zh" || /[\u4e00-\u9fff]/u.test(value)) return value || "attentive";
  const normalized = normalizeDialogueLine(value);
  const exact = {
    helpful: "愿意帮忙",
    thoughtful: "认真思考",
    cautious: "谨慎",
    dismissive: "冷淡",
    attentive: "专注",
    decisive: "坚定",
    waiting: "等待中",
    continue: "继续观察",
    "quietly hopeful": "安静但有希望",
    "carefully welcoming": "谨慎欢迎",
    "session closed": "已结束",
    "goal reached": "目标达成",
    "guarded but slightly less dismissive": "仍戒备但缓和一点",
    "heard and steadier": "被听见且更稳定",
    "more oriented": "更清楚方向",
    "unimpressed but attentive": "不太认同但在听",
    "cold and impatient": "冷淡且不耐烦",
    guarded: "戒备",
    reassured: "安心一些",
    "more confident": "更有信心",
    concerned: "担心",
    focused: "专注",
    direct: "直接",
    sharp: "尖锐",
    gentle: "温和"
  };
  if (exact[normalized]) return exact[normalized];
  const parts = [];
  if (normalized.includes("cautious")) parts.push("谨慎");
  if (normalized.includes("hopeful")) parts.push("有希望");
  if (normalized.includes("guarded")) parts.push("戒备");
  if (normalized.includes("dismissive")) parts.push("冷淡");
  if (normalized.includes("help")) parts.push("愿意帮忙");
  if (normalized.includes("thought")) parts.push("认真思考");
  if (normalized.includes("concern")) parts.push("担心");
  if (normalized.includes("confident")) parts.push("更有信心");
  if (normalized.includes("attentive")) parts.push("专注");
  return parts.length ? [...new Set(parts)].join("、") : value;
}

function displayTone(tone) {
  const value = String(tone || "").trim();
  if (state.language !== "zh" || /[\u4e00-\u9fff]/u.test(value)) return value || "自然";
  const normalized = normalizeDialogueLine(value);
  const exact = {
    structured: "有结构",
    direct: "直接",
    sharp: "尖锐",
    warm: "温暖",
    gentle: "温和",
    inviting: "邀请式",
    clear: "清楚",
    closing: "收束",
    "goal check": "目标判断",
    "scene pacing": "场景推进",
    "private side conversation": "单独交流",
    "autonomous group exchange": "自主小组交流",
    "player choice": "玩家选择",
    "group exchange": "小组交流",
    "quick question": "继续前的问题",
    "session closed": "本局结束",
    continue: "继续"
  };
  return exact[normalized] || value;
}

function npcStyle(npc) {
  if (state.language === "zh" && npc.styleZh) return npc.styleZh;
  if (state.language !== "zh") return npc.style;
  const styles = {
    mina: "冷静、有结构",
    leo: "温暖、会反思",
    sam: "直接但尊重",
    riley: "刻薄、不耐烦、戒备",
    nora: "温和、有些犹豫"
  };
  return styles[npc.id] || npc.style;
}

// Nameplates are presentation only. Cache sizes on mount/text/ResizeObserver
// changes; RAF actor motion below uses inline sprite geometry, not DOM reads.
let npcNameplateGeometry = null;
function renderNpcNameplates(layer, actors) {
  const world = document.getElementById("pixel-world");
  if (!world?.classList.contains("lab-art-ready")) {
    world?.classList.remove("npc-nameplate-layout");
    document.getElementById("npc-nameplate-overflow")?.setAttribute("hidden", "");
    for (const node of layer.children) {
      const label = node.querySelector(".sprite-name");
      if (label) label.hidden = false;
    }
    return;
  }
  world.classList.add("npc-nameplate-layout");
  if (!npcNameplateGeometry || npcNameplateGeometry.layer !== layer) {
    npcNameplateGeometry?.observer.disconnect();
    const header = world.querySelector(":scope > .game-header");
    const geometry = npcNameplateGeometry = { layer, world, header,
      width: layer.clientWidth, height: layer.clientHeight, headerHeight: header?.offsetHeight || 0,
      sizes: new WeakMap(), keys: new WeakMap(), positions: new Map(), entries: [] };
    geometry.observer = new ResizeObserver(changes => {
      let changed = false;
      for (const entry of changes) {
        const box = entry.borderBoxSize?.[0];
        const width = box?.inlineSize || entry.contentRect.width;
        const height = box?.blockSize || entry.contentRect.height;
        if (entry.target === layer) {
          if (geometry.width !== width || geometry.height !== height) {
            geometry.width = width; geometry.height = height; changed = true;
          }
        } else if (entry.target === header) {
          if (geometry.headerHeight !== height) { geometry.headerHeight = height; changed = true; }
        } else if (width && height) {
          const old = geometry.sizes.get(entry.target);
          if (!old || old.width !== width || old.height !== height) {
            geometry.sizes.set(entry.target, { width, height }); changed = true;
          }
        }
      }
      if (changed && geometry === npcNameplateGeometry && world.classList.contains("npc-nameplate-layout")) placeNpcNameplates(geometry);
    });
    geometry.observer.observe(layer);
    if (header) geometry.observer.observe(header);
  }
  const g = npcNameplateGeometry;
  g.entries = actors.map(actor => {
    const node = [...layer.children].find(n => n.dataset.actorId === actor.id);
    return { actor, node, label: node.querySelector(".sprite-name") };
  });
  // Batch first/text-change measurements before writing any label positions.
  for (const { node, label } of g.entries) {
    const key = `${label.textContent}|${node.classList.contains("dialogue-speaking")}`;
    if (g.keys.get(label) !== key) {
      label.hidden = false;
      g.sizes.set(label, { width: label.offsetWidth, height: label.offsetHeight });
      g.keys.set(label, key); g.observer.observe(label);
    }
  }
  placeNpcNameplates(g);
}

function placeNpcNameplates(g) {
  if (!g.width || !g.height) return;
  const gap = 4, bodies = g.entries.map(({ actor, node }) => {
    const x = actor.position.x * g.width / 100, y = actor.position.y * g.height / 100;
    const width = parseFloat(node.style.getPropertyValue("--sprite-display-width")) || 48;
    const height = parseFloat(node.style.getPropertyValue("--sprite-display-height")) || 48;
    const rect = { left: x-width/2, top: y-height, right: x+width/2, bottom: y };
    // Also protect the visible head/art silhouette, not only the button box.
    const art = node.querySelector(".lab-sprite-art"), anchor = art?.style.left.match(/50% - ([\d.-]+)px/);
    if (anchor) {
      const artWidth = parseFloat(art.style.width), anchorX = Number(anchor[1]);
      const left = x-(art.style.transform === "scaleX(-1)" ? artWidth-anchorX : anchorX);
      const bottom = y-parseFloat(art.style.bottom);
      rect.left = Math.min(rect.left, left); rect.right = Math.max(rect.right, left+artWidth);
      rect.top = Math.min(rect.top, bottom-parseFloat(art.style.height)); rect.bottom = Math.max(rect.bottom, bottom);
    }
    return { ...rect, x, y, buttonLeft: x-width/2, buttonTop: y-height };
  });
  const overlaps = (a, b) => a.left < b.right+gap && a.right > b.left-gap && a.top < b.bottom+gap && a.bottom > b.top-gap;
  const placed = [], overflow = [];
  // NPC names get first choice; the player's non-interactive label is last.
  for (const { actor, label } of [...g.entries].sort((a,b) => Number(a.actor.id === "player")-Number(b.actor.id === "player"))) {
    const size = g.sizes.get(label), body = bodies[g.entries.findIndex(e => e.actor.id === actor.id)];
    if (!size?.width || !size.height) continue;
    const { width: w, height: h } = size, candidates = [], previous = g.positions.get(actor.id);
    if (previous) candidates.push([body.x+previous.x, body.y+previous.y]);
    const cx = body.x-w/2, cy = (body.top+body.bottom-h)/2;
    candidates.push([cx,body.top-h-gap], [cx,body.bottom+gap], [body.right+gap,cy], [body.left-w-gap,cy]);
    for (let ring=1;ring<=3;ring++) {
      for (const offset of [-ring,ring]) {
        candidates.push([cx+offset*(w+gap),body.top-h-gap], [cx+offset*(w+gap),body.bottom+gap],
          [body.left-w-gap,cy+offset*(h+gap)], [body.right+gap,cy+offset*(h+gap)]);
      }
    }
    let chosen;
    for (const [x,y] of candidates) {
      const rect = { left:x, top:y, right:x+w, bottom:y+h };
      if (x < gap || y < g.headerHeight+gap || rect.right > g.width-gap || rect.bottom > g.height-gap) continue;
      if (bodies.some(b => overlaps(rect,b)) || placed.some(b => overlaps(rect,b))) continue;
      chosen = rect; break;
    }
    label.hidden = !chosen;
    if (!chosen) { if (actor.id !== "player") overflow.push(actor); continue; }
    placed.push(chosen); g.positions.set(actor.id, { x:chosen.left-body.x, y:chosen.top-body.y });
    const x = `${chosen.left-body.buttonLeft}px`, y = `${chosen.top-body.buttonTop}px`;
    if (label.style.getPropertyValue("--nameplate-x") !== x) label.style.setProperty("--nameplate-x", x);
    if (label.style.getPropertyValue("--nameplate-y") !== y) label.style.setProperty("--nameplate-y", y);
  }
  // If a tiny/crowded map has no nearby slot, offer real name buttons OUTSIDE
  // the map, never a transparent/intercepting label or a forced conversation.
  let picker = document.getElementById("npc-nameplate-overflow");
  if (!overflow.length) { if (picker) picker.hidden = true; return; }
  if (!picker) {
    picker = document.createElement("nav"); picker.id = "npc-nameplate-overflow";
    g.world.after(picker);
  }
  picker.hidden = false;
  picker.setAttribute("aria-label", state.language === "zh" ? "按名字走近成员" : "Approach a member by name");
  const ids = new Set(overflow.map(a => a.id));
  for (const button of [...picker.children]) if (!ids.has(button.dataset.npcNameId)) button.remove();
  for (const actor of overflow) {
    let button = [...picker.children].find(n => n.dataset.npcNameId === actor.id);
    if (!button) {
      button = document.createElement("button"); button.type = "button"; button.dataset.npcNameId = actor.id;
      button.addEventListener("click", event => {
        event.preventDefault(); event.stopPropagation();
        const npc = state.npcs.find(n => n.id === button.dataset.npcNameId);
        if (npc) approachNpcForConversation(npc);
      });
      picker.append(button);
    }
    if (button.textContent !== actor.name) button.textContent = actor.name;
    button.setAttribute("aria-label", t("talkWith",actor.name));
  }
}

function renderWorldActors() {
  // Measure before changing actors, then share this frame's scale. Reading the
  // world between each actor's style writes forces repeated layout on walks.
  const unit = labSceneScale();
  renderLabArtScene(unit);
  const layer = document.getElementById("sprite-layer");
  if (!layer) return;
  const actors = [{id:"player",name:t("playerName"),position:state.playerPosition,direction:state.playerDirection,walkFrame:state.playerWalkFrame},...state.npcs];
  for (const actor of actors) {
    let node = [...layer.children].find(item => item.dataset.actorId === actor.id);
    const isPlayer = actor.id === "player";
    if (!node) {
      node = document.createElement(isPlayer ? "div" : "button"); node.dataset.actorId = actor.id;
      node.classList.add("pixel-sprite",isPlayer ? "player" : "npc");
      if (!isPlayer) {
        node.type = "button";
        node.addEventListener("click", event => {
          event.preventDefault(); event.stopPropagation();
          const npc = state.npcs.find(item => item.id === node.dataset.actorId);
          if (npc) approachNpcForConversation(npc);
        });
      }
      const name = document.createElement("span"); name.className = "sprite-name"; node.append(name); layer.append(node);
    }
    const label = node.querySelector(".sprite-name");
    node.classList.toggle("dialogue-speaking", document.getElementById("pixel-world")?.dataset.dialogueSpeakerId === actor.id);
    if (label.textContent !== actor.name) label.textContent = actor.name;
    const x = `${actor.position.x}%`, y = `${actor.position.y}%`;
    if (node.style.left !== x) node.style.left = x;
    if (node.style.top !== y) node.style.top = y;
    const depth = String(Math.round(actor.position.y * 10));
    if (node.style.zIndex !== depth) node.style.zIndex = depth;
    node.classList.toggle("npc-moving",!isPlayer && actor.movementState === "moving");
    if (!isPlayer) {
      const name = t("talkWith",actor.name);
      if (node.getAttribute("aria-label") !== name) node.setAttribute("aria-label",name);
      if (node.style.getPropertyValue("--npc-color") !== actor.color) node.style.setProperty("--npc-color",actor.color);
    }
    const base = isPlayer ? activePlayerSprite() : activeNpcSprite(actor);
    const standingTile = walkingSpriteFor(base,actor.direction || "down",actor.walkFrame || 0);
    const tile = !isPlayer&&typeof labRoutineSprite==="function"?labRoutineSprite(actor,standingTile):standingTile;
    const key = tile.type === "image-calibrated" ? `${tile.url}:${tile.frameColumn}:${tile.frameRow}:${tile.pose||"standing"}:${unit}` : JSON.stringify(tile);
    if (node.dataset.spriteTile !== key) { setSpriteTile(node,tile,unit); node.dataset.spriteTile = key; }
    if(typeof applyLabRoutinePresentation==="function")applyLabRoutinePresentation(node,actor);
  }
  for (const node of [...layer.children]) if (node.dataset.actorId && !actors.some(actor => actor.id === node.dataset.actorId)) node.remove();
  renderNpcNameplates(layer, actors);
  if(typeof syncLabRoutines==="function")syncLabRoutines();
}

function renderPixelWorld() {
  const dock = document.getElementById("expression-dock");
  if (!dock) return;
  renderWorldActors(); dock.replaceChildren();
  if (state.adminMode) state.npcs.forEach(npc => {
    const expression = document.createElement("article");
    expression.className = `expression-card ${emotionClass(npc.emotion)}`;
    expression.innerHTML = `
      ${spriteAvatarMarkup("expression-face",activeNpcAvatarSprite(npc),{borderColor:npc.color})}
      <strong>${npc.name}</strong><span>${t("emotionLabel")}: ${escapeHtml(displayEmotion(npc.emotion))}</span><span>${t("trustLabel")} ${npc.trust}</span>`;
    dock.append(expression);
  });
  const laptop = document.createElement("button");
  const workspaceTitle = scenarioText(scenarioWorkspace().title, t("laptopToolTitle"));
  const laptopStatus = state.activeArtifactTask?.kind === "reference"
    ? state.activeArtifactTask.title || t("sharedArtifactHeading")
    : state.activeArtifactTask?.hasTask
      ? state.activeArtifactTask.title || t("artifactTaskHeading")
      : t("artifactTaskNoneTitle");
  laptop.className = `expression-card laptop-dock-card ${state.activeArtifactTask?.hasTask || state.activeArtifactTask?.kind === "reference" ? "laptop-has-task" : ""}`;
  laptop.type = "button";
  laptop.dataset.laptopDock = "true";
  laptop.setAttribute("aria-disabled", String(!canOpenBackpack() || isBackpackOpen()));
  laptop.setAttribute("aria-label", `${workspaceTitle}: ${laptopStatus}`);
  laptop.title = `${workspaceTitle}: ${laptopStatus}`;
  laptop.innerHTML = `
    <span class="laptop-dock-icon workspace-tool-icon ${workspaceIconClass()}" aria-hidden="true"></span>
    <strong>${escapeHtml(workspaceTitle)}</strong>
    <span class="laptop-dock-status">${escapeHtml(laptopStatus)}</span>
  `;
  dock.appendChild(laptop);
}

function setSpriteTile(element, sprite, unit) {
  element.classList.toggle("lab-calibrated-sprite", sprite?.type === "image-calibrated");
  if (sprite?.type === "image-calibrated") {
    applyLabSpriteFrame(element, sprite, unit);
    return;
  }
  element.querySelector(".lab-sprite-art")?.remove();
  element.querySelector(".lab-contact-shadow")?.remove();
  element.classList.toggle("asset-image-sprite", isImageSprite(sprite));
  if (isImageSprite(sprite)) {
    element.style.setProperty("--sprite-image", `url("${cssUrl(sprite.url)}")`);
    if (sprite.type === "image-grid") {
      const scale = sprite.scale || 3;
      const frameWidth = sprite.frameWidth || 16;
      const frameHeight = sprite.frameHeight || 16;
      const columns = sprite.columns || 1;
      const rows = sprite.rows || 1;
      const displayWidth = sprite.displayWidth || frameWidth * scale;
      const displayHeight = sprite.displayHeight || frameHeight * scale;
      element.style.setProperty("--sprite-bg-x", `${-(sprite.frameColumn || 0) * frameWidth * scale}px`);
      element.style.setProperty("--sprite-bg-y", `${-(sprite.frameRow || 0) * frameHeight * scale}px`);
      element.style.setProperty("--sprite-background-size", `${frameWidth * columns * scale}px ${frameHeight * rows * scale}px`);
      element.style.setProperty("--sprite-display-width", `${displayWidth}px`);
      element.style.setProperty("--sprite-display-height", `${displayHeight}px`);
    } else {
      element.style.setProperty("--sprite-bg-x", "center");
      element.style.setProperty("--sprite-bg-y", "center");
      element.style.setProperty("--sprite-background-size", "contain");
      element.style.removeProperty("--sprite-display-width");
      element.style.removeProperty("--sprite-display-height");
    }
    return;
  }
  element.style.removeProperty("--sprite-image");
  element.style.removeProperty("--sprite-background-size");
  element.style.removeProperty("--sprite-display-width");
  element.style.removeProperty("--sprite-display-height");
  element.style.setProperty("--sprite-bg-x", `${-sprite.x * 3}px`);
  element.style.setProperty("--sprite-bg-y", `${-sprite.y * 3}px`);
}

function walkingSpriteFor(baseSprite, direction = "down", frame = 0) {
  if (isImageSprite(baseSprite)) {
    if (baseSprite.type === "image-calibrated") {
      return {...baseSprite, frameColumn: baseSprite.directionColumns[direction] ?? 0,
        frameRow: Math.abs(frame) % 3};
    }
    if (baseSprite.type === "image-grid") {
      const directionColumnsForSprite = baseSprite.directionColumns || { down: 0, up: 1, left: 2, right: 3 };
      const frameRows = baseSprite.frameRows || [baseSprite.idleRow || 0, 1, 2];
      return {
        ...baseSprite,
        frameColumn: directionColumnsForSprite[direction] ?? directionColumnsForSprite.down ?? 0,
        frameRow: frameRows[Math.abs(frame) % frameRows.length] || 0
      };
    }
    return baseSprite;
  }
  const baseRow = Math.round(baseSprite.y / 17);
  const frameOffsets = [0, -1, 1];
  const row = clamp(baseRow + frameOffsets[Math.abs(frame) % frameOffsets.length], 0, 17);
  const col = directionColumns[direction] ?? directionColumns.down;
  return spriteTile(col, row);
}

function renderSessionState() {
  const node = document.getElementById("session-state");
  if (!node) return;
  const metrics = state.sessionMetrics;
  const stage = currentStage();
  const adminScores = state.adminMode
    ? `
      <div class="state-pill admin-score-pill"><span>${t("interpersonalScore")}</span><strong>${state.interpersonalScore}</strong></div>
      <div class="state-pill admin-score-pill"><span>${t("outcomeScore")}</span><strong>${state.outcomeScore}</strong></div>
    `
    : "";
  node.innerHTML = `
    <div class="state-pill"><span>${t("participant")}</span><strong>${escapeHtml(state.participantId || t("notSet"))}</strong></div>
    <div class="state-pill"><span>${t("currentStage")}</span><strong>${escapeHtml(stage ? scenarioText(stage.title, stage.id) : t("notSet"))}</strong></div>
    <div class="state-pill"><span>${t("labProgress")}</span><strong>${metrics.groupProgress}</strong></div>
    <div class="state-pill"><span>${t("labClimate")}</span><strong>${metrics.groupClimate}</strong></div>
    <div class="state-pill"><span>${t("evolutionMode")}</span><strong>${escapeHtml(evolutionModeLabel(state.evolutionMode))}</strong></div>
    ${adminScores}
  `;
  renderTaskBoard();
  renderCurrentObjective();
}

function refreshGameHud() {
  renderBackpack();
  renderPixelWorld();
  renderSessionState();
  renderTaskBoard();
  renderResearchLog();
  updateProximityInteraction();
}

function renderTaskBoard() {
  const targets = [
    document.getElementById("task-board"),
    document.getElementById("task-board-world-list")
  ].filter(Boolean);
  if (!targets.length) return;
  const taskHtml = (tasks, showProgress) => tasks.map((task) => {
    const statusClass = showProgress ? task.progress >= 100 ? "task-done" : task.progress > 0 ? "task-active" : "" : "";
    return `
      <article class="task-item ${statusClass}">
        <span class="task-status-dot" aria-hidden="true"></span>
        <div>
          <strong>${escapeHtml(localizedTaskField(task, "title"))}</strong>
          <span>${escapeHtml(localizedTaskField(task, "detail"))}</span>
        </div>
        ${showProgress ? `<span class="task-progress">${Math.round(task.progress)}%</span>` : ""}
      </article>
    `;
  }).join("");
  targets.forEach((node) => {
    const researchView = node.id === "task-board";
    node.innerHTML = taskHtml(researchView ? state.projectTasks : playerVisibleProjectTasks(), researchView);
  });
  const guidance = document.getElementById("task-board-guidance");
  if (guidance) guidance.textContent = scenarioText(scenarioTaskBoard().guidance, t("taskBoardGuidance"));
  const next = document.getElementById("next-step");
  if (next) next.textContent = `${t("nextStepLabel")}: ${nextStepText()}`;
}

// The wall board lists work the player can know about now. The complete task
// catalogue and numeric progress remain available in the research view.
function playerVisibleProjectTasks() {
  if (currentScenario().id !== "newcomer-circle") return state.projectTasks;
  const index = Number(state.stageIndex || 0);
  const revealed = new Set(["understand_lab_power"]);
  if (index >= 1) revealed.add("brief_review");
  if (index >= 2) revealed.add("revision_plan");
  if (index >= 2 && typeof labAnchorRecord === "function" && labAnchorRecord("return_blame")) revealed.add("responsibility_split");
  if (index >= 3 && typeof projectOutcomeReceipt === "function" && projectOutcomeReceipt()) revealed.add("contribution_statement");
  return state.projectTasks.filter(task => revealed.has(task.id));
}

function renderCurrentObjective() {
  const node = document.getElementById("current-objective");
  if (!node) return;
  node.textContent = nextStepText();
  if (typeof renderPlayerExperience === "function") renderPlayerExperience();
}

function nextStepText() {
  if(typeof stageMissingRequiredMaterial==='function'&&stageMissingRequiredMaterial())return stageRequiredMaterialText();
  if(typeof labStoryNextAction==="function"&&labStoryNextAction())return labStoryNextAction();
  if (isEntryEpisodeStage() && state.openingResponseAnswered) return entryEpisodeNextAction();
  if (typeof stageKeyDecisionReady === "function" && stageKeyDecisionReady()) {
    return state.language === "zh" ? "可以参加小组讨论，也可以继续交流，准备好后再加入。" : "Join the group discussion when ready, or keep talking first.";
  }
  if (typeof stagePacingReportIsCurrent === "function" && stagePacingReportIsCurrent() && stagePacingState().report.publicCue) return stagePacingState().report.publicCue;
  const required = currentRequiredWorkspaceTask();
  if (required) {
    const title = scenarioText(required.template.title, required.taskId);
    return state.language === "zh"
      ? `下一步：使用实验室电脑完成“${title}”。`
      : `Next: use the lab computer to complete "${title}".`;
  }
  const gate = currentStageTransitionGate();
  if (gate.reason === "social_interaction_required") {
    return currentStageConsultationCue();
  }
  if (state.stageDirectorCue) return state.stageDirectorCue;
  const unfinished = playerVisibleProjectTasks().find((task) => task.progress < 100);
  if (!unfinished) {
    return scenarioText(currentScenario().allTasksDoneObjective);
  }
  if (state.totalSideTalks === 0) {
    return scenarioText(currentScenario().firstTalkObjective);
  }
  return state.language === "zh"
    ? `下一步可以推进：${localizedTaskField(unfinished, "title")}。如果团队请你查看或处理内容，点击右下角${scenarioText(scenarioWorkspace().title)}或按 B。`
    : `Next, work on: ${localizedTaskField(unfinished, "title")}. If the team asks you to review or handle something, open the lower-right ${scenarioText(scenarioWorkspace().title)} or press B.`;
}

function updateProjectTasksFromEvent(kind, actionCode) {
  if (!state.projectTasks.length) return;
  let changed = false;
  const bump = (id, amount) => {
    const task = state.projectTasks.find((item) => item.id === id);
    if (!task) return;
    const nextProgress = clamp(task.progress + amount, 0, 100);
    if (nextProgress !== task.progress) {
      task.progress = nextProgress;
      changed = true;
    }
  };
  if (kind === "sideTalk") bump("understand_lab_power", 24);
  if (["bounded_collaboration", "responsibility_visibility", "transparent_credit"].includes(actionCode)) {
    bump("responsibility_split", kind === "decision" ? 24 : 12);
  }
  if (["evidence_clarification", "responsibility_visibility"].includes(actionCode)) {
    bump("brief_review", kind === "decision" ? 20 : 10);
    bump("revision_plan", kind === "decision" ? 24 : 12);
  }
  if (["passive_avoidance", "bounded_collaboration"].includes(actionCode)) {
    bump("understand_lab_power", 10);
  }
  if (changed) refreshGameHud();
}

function renderBackpack() {
  document.getElementById("backpack-panel")?.classList.toggle("entry-episode-workspace",isEntryEpisodeStage());
  const guidance = document.getElementById("backpack-guidance");
  const documentsNode = document.getElementById("workspace-documents");
  const summary = document.getElementById("artifact-task-summary");
  const optionsNode = document.getElementById("artifact-options");
  const optionLabel = document.getElementById("artifact-option-label");
  const noteLabel = document.getElementById("artifact-note-label");
  const input = document.getElementById("artifact-draft-input");
  const warning = document.getElementById("artifact-warning");
  const button = document.getElementById("submit-artifact-btn");
  if (!summary || !optionsNode || !input || !button) return;
  summary.hidden=false;optionsNode.hidden=false;
  if (guidance) guidance.textContent = scenarioText(scenarioWorkspace().guidance, t("backpackGuidance"));
  const view=workspaceStateView(),candidate=state.activeArtifactTask;
  const artifact = candidate?.kind==='reference'||view.canSubmit&&candidate?.sourceTaskId===view.taskId?candidate:null;
  renderWorkspaceDocuments(documentsNode, artifact);
  renderWorkspaceUi();
  document.getElementById("entry-workspace-receipt")?.remove();
  renderEntryWorkspaceReceipt(document.getElementById("workspace-records-pane"));
  if(typeof renderProjectWorkflowBackpack==='function'&&renderProjectWorkflowBackpack())return;
  if(typeof renderCreditWorkflowWorkspace==='function'&&renderCreditWorkflowWorkspace())return;
  if(guidance)guidance.hidden=false;
  if(warning)warning.hidden=false;

  if (state.artifactTaskLoading) {
    summary.innerHTML = `<p class="side-talk-empty">${escapeHtml(t("artifactTaskLoading"))}</p>`;
    optionsNode.innerHTML = "";
    input.value = "";
    input.disabled = true;
    input.hidden = true;
    if (optionLabel) optionLabel.hidden = true;
    if (noteLabel) noteLabel.hidden = true;
    button.disabled = true;
    button.hidden = true;
    if (warning) warning.textContent = "";
    return;
  }

  if (artifact?.kind === "reference") {
    const knownNames = artifact.knownByNpcIds
      .map((id) => state.npcs.find((npc) => npc.id === id)?.name || id)
      .join(", ");
    const focusIndex = normalizedReferenceFocusIndex(artifact);
    const focusedSection = focusIndex >= 0 ? artifact.sections[focusIndex] : null;
    const sectionMarkup = (section, className = "") => `
      <section class="artifact-reference-section ${className}">
        <strong>${escapeHtml(section.heading)}</strong>
        ${workspaceSectionBodyMarkup(section)}
      </section>
    `;
    const materialMarkup = focusedSection
      ? `
        <p><strong>${escapeHtml(t("sharedArtifactFocus"))}:</strong></p>
        <div class="artifact-reference-sections artifact-reference-focus">
          ${sectionMarkup(focusedSection, "artifact-reference-section-focused")}
        </div>
        <details class="artifact-reference-full">
          <summary>${escapeHtml(t("sharedArtifactFullDocument"))}</summary>
          <div class="artifact-reference-sections">
            ${artifact.sections.map((section, index) => sectionMarkup(section, index === focusIndex ? "artifact-reference-section-muted-focus" : "")).join("")}
          </div>
        </details>
      `
      : `
        <p><strong>${escapeHtml(t("sharedArtifactSections"))}:</strong></p>
        <div class="artifact-reference-sections">
          ${artifact.sections.map((section) => sectionMarkup(section)).join("")}
        </div>
      `;
    summary.innerHTML = `
      <article class="artifact-task-card artifact-reference-card">
        <div class="artifact-visual" aria-hidden="true">
          <span class="artifact-visual-icon workspace-tool-icon ${workspaceIconClass()}"></span>
          <p>${escapeHtml(artifact.visualDescription || artifact.brief || "")}</p>
        </div>
        <h4>${escapeHtml(t("sharedArtifactHeading"))}: ${escapeHtml(artifact.title)}</h4>
        <p>${escapeHtml(artifact.brief || "")}</p>
        <p><strong>${escapeHtml(t("sharedArtifactKnownBy"))}:</strong> ${escapeHtml(knownNames || state.npcs.map((npc) => npc.name).join(", "))}</p>
        ${materialMarkup}
        ${artifact.status === "reviewed" ? `<span class="artifact-status">${escapeHtml(t("sharedArtifactReviewed"))}</span>` : ""}
      </article>
    `;
    bindWorkspaceSourceTableKeys(summary);
    optionsNode.innerHTML = "";
    input.value = "";
    input.disabled = true;
    input.hidden = true;
    if (optionLabel) optionLabel.hidden = true;
    if (noteLabel) noteLabel.hidden = true;
    button.hidden = artifact.status === "reviewed";
    button.disabled = Boolean(state.isScenePlaying || state.isGmThinking || state.apiFatalError || artifact.status === "reviewed");
    button.textContent = t("acknowledgeSharedArtifact");
    if (warning) warning.textContent = "";
    return;
  }

  if (!artifact || !artifact.hasTask) {
    summary.innerHTML = `
      <article class="artifact-task-card artifact-task-empty">
        <div class="artifact-visual artifact-visual-empty" aria-hidden="true"></div>
        <h4>${escapeHtml(t("artifactTaskNoneTitle"))}</h4>
        <p>${escapeHtml(artifact?.brief || scenarioText(scenarioWorkspace().noTask, t("artifactNoTask")))}</p>
      </article>
    `;
    optionsNode.innerHTML = "";
    input.value = "";
    input.disabled = true;
    input.hidden = true;
    if (optionLabel) optionLabel.hidden = true;
    if (noteLabel) noteLabel.hidden = true;
    button.disabled = true;
    button.hidden = true;
    if (warning) warning.textContent = "";
    return;
  }

  const task = state.projectTasks.find((item) => item.id === artifact.sourceTaskId);
  const sourceDocuments = workspaceDocumentsForTask(
    artifact.sourceDocumentIds,
    artifact.sourceTaskId
  );
  const sourceDocumentMarkup = sourceDocuments.length
    ? `<div class="workspace-task-source">
        <strong>${escapeHtml(t("workspaceSourceFile"))}:</strong>
        ${sourceDocuments.map((document) => `
          <button type="button" class="workspace-source-link" data-open-workspace-document="${escapeHtml(document.id)}">
            <span class="workspace-document-icon workspace-document-icon-inline" aria-hidden="true"></span>
            ${escapeHtml(document.fileName || document.title)}
          </button>
        `).join("")}
      </div>`
    : "";
  const status = artifact.status && artifact.status !== "draft"
    ? `<span class="artifact-status">${escapeHtml(artifactStatusLabel(artifact.status))}</span>`
    : "";
  summary.innerHTML = `
    <article class="artifact-task-card">
      <div class="artifact-visual" aria-hidden="true">
        <span class="artifact-visual-icon workspace-tool-icon ${workspaceIconClass()}"></span>
        <p>${escapeHtml(artifact.visualDescription || artifact.brief || "")}</p>
      </div>
      <h4>${escapeHtml(t("artifactTaskHeading"))}: ${escapeHtml(artifact.title)}</h4>
      <p>${escapeHtml(artifact.brief || artifact.detail || "")}</p>
      ${sourceDocumentMarkup}
      <p><strong>${escapeHtml(t("artifactTargetLabel"))}:</strong> ${escapeHtml(artifact.targetNpcName)}</p>
      <p><strong>${escapeHtml(t("artifactCriteriaLabel"))}:</strong></p>
      <ul>${artifact.criteria.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      ${status}
    </article>
  `;
  summary.querySelectorAll("[data-open-workspace-document]").forEach((sourceButton) => {
    sourceButton.addEventListener("click", () => {
      const documentId = sourceButton.dataset.openWorkspaceDocument || "";
      if (!documentId) return;
      if (!state.openWorkspaceDocumentIds.includes(documentId)) {
        state.openWorkspaceDocumentIds.push(documentId);
      }
      renderBackpack();
      showWorkspaceDocument(documentId);
    });
  });
  optionsNode.innerHTML = "";
  input.hidden = false;
  if (optionLabel) optionLabel.hidden = false;
  if (noteLabel) noteLabel.hidden = false;
  button.hidden = false;
  button.textContent = typeof currentArtifactSubmissionRecovery==='function'&&currentArtifactSubmissionRecovery()
    ?(state.language==='zh'?'重新提交':'Retry submission'):
    (typeof creditWorkflowWorkspacePhase==='function'&&creditWorkflowWorkspacePhase()==='submission'?(state.language==='zh'?'送审贡献说明':'Submit contribution statement for review'):t("submitArtifact"));
  (artifact.options || []).forEach((option) => {
    const buttonNode = document.createElement("button");
    buttonNode.className = `side-talk-option artifact-option ${state.selectedArtifactOption === option.id ? "selected" : ""}`;
    buttonNode.type = "button";
    buttonNode.setAttribute('aria-pressed',String(state.selectedArtifactOption===option.id));
    buttonNode.innerHTML = `<strong>${escapeHtml(option.label)}</strong>${option.action!==option.label?`<span>${escapeHtml(option.action)}</span>`:""}`;
    buttonNode.addEventListener("click", () => {
      state.artifactDraft = input.value || "";
      state.selectedArtifactOption = option.id;
      // Change the selection in place: keep focus, scroll, draft and material
      // expansion intact instead of destroying the clicked button/form.
      optionsNode.querySelectorAll('.artifact-option').forEach(item=>{const selected=item===buttonNode;item.classList.toggle('selected',selected);item.setAttribute('aria-pressed',String(selected));});
      syncWorkspaceSubmitAvailability();
    });
    optionsNode.appendChild(buttonNode);
  });
  input.disabled = false;
  input.value = state.artifactDraft || "";
  button.disabled = Boolean(state.isScenePlaying || state.isGmThinking || state.apiFatalError || !state.selectedArtifactOption);
  if (warning && state.artifactSubmissionStatus !== "submitting") warning.textContent = typeof artifactSubmissionRecoveryNotice==='function'?artifactSubmissionRecoveryNotice():'';
  if(typeof syncWorkspaceSubmitAvailability==='function')syncWorkspaceSubmitAvailability();
}

// Format the supplied score rows for display only. Source bodies, hashes and
// agent context keep the original text; no missing score is filled or computed.
function workspaceSectionBodyMarkup(section) {
  const body = String(section.body || "");
  const lines = body.trim().split(/\r?\n/);
  const cells = lines.map((line) => line.split("|").map((cell) => cell.trim()));
  const pairedTable = cells.length > 1 && cells[0].length === 3 && cells[0][0] === "ID" &&
    cells[0].every(Boolean) && cells.slice(1).every((row) =>
      row.length === 3 && /^P\d{2}$/.test(row[0]) && row.slice(1).every((cell) => /^(?:\d{1,3}|—)$/.test(cell)));
  if (!pairedTable) return `<p>${escapeHtml(body)}</p>`;
  return `
    <div class="workspace-source-table-scroll" role="region" aria-label="${escapeHtml(section.heading)}" tabindex="0">
      <table class="workspace-source-table">
        <caption>${escapeHtml(section.heading)}</caption>
        <thead><tr>${cells[0].map((cell) => `<th scope="col">${escapeHtml(cell)}</th>`).join("")}</tr></thead>
        <tbody>${cells.slice(1).map((row) => `<tr><th scope="row">${escapeHtml(row[0])}</th>${row.slice(1).map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>
    </div>`;
}

function bindWorkspaceSourceTableKeys(node) {
  node.querySelectorAll('.workspace-source-table-scroll').forEach((region) => {
    region.addEventListener('keydown', (event) => {
      if (event.target !== region || event.altKey || event.ctrlKey || event.metaKey ||
          !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
      event.stopPropagation(); // Keep the game's movement keys out of this reader.
      if (['ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      region.scrollLeft = event.key === 'Home' ? 0 : event.key === 'End' ? region.scrollWidth :
        region.scrollLeft + (event.key === 'ArrowRight' ? 40 : -40);
    });
  });
}

function renderWorkspaceDocuments(node, activeArtifact = null) {
  if (!node) return;
  const documents = state.sharedComputerArtifacts.filter((artifact) => artifact?.immutable);
  if (!documents.length) {
    node.innerHTML = "";
    node.hidden = true;
    return;
  }
  node.hidden = false;
  node.setAttribute("aria-label", t("workspaceFilesHeading"));
  const linkedIds = new Set(activeArtifact?.sourceDocumentIds || []);
  node.innerHTML = `
    <p class="workspace-documents-heading">${escapeHtml(t("workspaceFilesHeading"))}</p>
    <div class="workspace-document-list">
      ${documents.map((document) => {
        const isOpen = state.openWorkspaceDocumentIds.includes(document.id);
        const isLinked = linkedIds.has(document.id) ||
          (document.linkedTaskIds || []).includes(activeArtifact?.sourceTaskId || "");
        return `
          <details class="workspace-document ${isLinked ? "workspace-document-linked" : ""}"
              data-workspace-document-id="${escapeHtml(document.id)}" ${isOpen ? "open" : ""}>
            <summary>
              <span class="workspace-document-icon" aria-hidden="true"></span>
              <span class="workspace-document-name">
                <strong>${escapeHtml(document.fileName || document.title)}</strong>
                <small>${escapeHtml(t("workspaceVersion"))} ${escapeHtml(document.version || "1.0")} · ${escapeHtml(t("workspaceReadOnly"))}</small>
              </span>
            </summary>
            <div class="workspace-document-content">
              <h4>${escapeHtml(document.title)}</h4>
              <p>${escapeHtml(document.brief || "")}</p>
              ${(document.sections || []).map((section) => `
                <section>
                  <strong>${escapeHtml(section.heading)}</strong>
                  ${workspaceSectionBodyMarkup(section)}
                </section>
              `).join("")}
            </div>
          </details>
        `;
      }).join("")}
    </div>
  `;
  bindWorkspaceSourceTableKeys(node);
  node.querySelectorAll("[data-workspace-document-id]").forEach((details) => {
    details.addEventListener("toggle", () => {
      const documentId = details.dataset.workspaceDocumentId || "";
      const openIds = new Set(state.openWorkspaceDocumentIds);
      if (details.open) openIds.add(documentId);
      else openIds.delete(documentId);
      if (details.open&&isBackpackOpen()&&workspaceTab==='materials'&&workspaceElementPresented(details)) recordWorkspaceDocumentViewed(documentId);
      state.openWorkspaceDocumentIds = [...openIds];
    });
  });
}

function artifactStatusLabel(status) {
  if (status === "accepted") return t("artifactAccepted");
  if (status === "needs_revision") return t("artifactNeedsRevision");
  if (status === "rejected") return t("artifactRejected");
  return status || "";
}

let laptopTaskPreparationSequence = 0;
async function prepareLaptopTask(suggestedTaskId = "", laptopCue = null) {
  if(typeof creditWorkflowWorkspacePhase==='function'&&['record','feedback'].includes(creditWorkflowWorkspacePhase())){renderBackpack();return false;}
  if(typeof labRevisionPreparationAllowed==="function"&&!labRevisionPreparationAllowed(suggestedTaskId)){setWorldHelp(labStoryNextAction());return false;}
  const sequence = ++laptopTaskPreparationSequence, token = stagePacingToken();
  const isCurrentPreparation = () => sequence === laptopTaskPreparationSequence && token === stagePacingToken() && !state.sessionClosed && !state.apiFatalError;
  state.artifactTaskLoading = true;
  state.selectedArtifactOption = "";
  state.artifactDraft = "";
  state.artifactSubmissionStatus = "";
  renderBackpack();
  try {
    const plan = await generateLaptopTaskPlan(suggestedTaskId, laptopCue);
    if (!isCurrentPreparation()||typeof creditWorkflowWorkspacePhase==='function'&&['record','feedback'].includes(creditWorkflowWorkspacePhase())) return;
    state.activeArtifactTask = plan;
    if (state.activeArtifactTask?.kind === "reference") {
      registerSharedComputerArtifact(state.activeArtifactTask);
    }
  } catch (error) {
    if (!isCurrentPreparation() || isStaleRequestError(error)) return;
    stopForAgentFailure(error, "laptop task agent");
    return;
  } finally {
    if (sequence === laptopTaskPreparationSequence && token === stagePacingToken()) state.artifactTaskLoading = false;
  }
  refreshGameHud();
}

async function generateLaptopTaskPlan(suggestedTaskId = "", laptopCue = null) {
  const designedPlan = designedWorkspaceTaskPlan(suggestedTaskId, laptopCue);
  if (designedPlan) return normalizeLaptopTaskPlan(designedPlan);
  const suggestedTask = suggestedTaskId
    ? state.projectTasks.find((task) => task.id === suggestedTaskId)
    : null;
  const retrievedSocialMemory = typeof retrieveSocialMemoryForAgent === "function"
    ? retrieveSocialMemoryForAgent({
      purpose: "workspace_agent",
      queryText: `${laptopCue?.text || ""} ${suggestedTask ? localizedTaskField(suggestedTask, "title") : ""} ${scenarioFinalGoalForAgent()}`,
      taskTitle: suggestedTask ? localizedTaskField(suggestedTask, "title") : "",
      workspaceTitle: scenarioText(scenarioWorkspace().title, "workspace"),
      tags: ["workspace", "task", suggestedTaskId || ""].filter(Boolean),
      allowPrivate: false,
      limit: 8
    })
    : null;
  const taskContext = {
    language: requestedLanguageLabel(),
    currentPhase: getDecisionWindows()[state.roundIndex]?.type || "Free movement",
    laptopCue: laptopCue ? {
      sourceName: laptopCue.sourceName,
      text: laptopCue.text,
      kindHint: laptopCue.kindHint,
      suggestedTaskId: laptopCue.suggestedTaskId
    } : null,
    suggestedTask: suggestedTask ? {
      id: suggestedTask.id,
      title: localizedTaskField(suggestedTask, "title"),
      detail: localizedTaskField(suggestedTask, "detail"),
      progress: suggestedTask.progress
    } : null,
    storyWorld: storyWorldContext(),
    projectTasks: state.projectTasks.map((task) => ({
      id: task.id,
      title: localizedTaskField(task, "title"),
      detail: localizedTaskField(task, "detail"),
      progress: task.progress
    })),
    groupMetrics: state.sessionMetrics,
    sharedComputerArtifacts: sharedComputerContext(),
    retrievedSocialMemory,
    npcs: state.npcs.map((npc) => ({
      id: npc.id,
      name: npc.name,
      role: npc.role,
      emotion: npc.emotion,
      trust: npc.trust,
      belonging: npc.belonging,
      recentMemory: npc.memory.slice(-3),
      strategy: npc.strategy
    })),
    recentDialogue: recentDialogueContext(16, { role: "controller" }),
    finalGoal: scenarioFinalGoalForAgent()
  };
  const response = await fetchWithTimeout("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: "deepseek",
      model: DEEPSEEK_PRO_MODEL,
      temperature: 0.42,
      agentPurpose: "workspace_plan",
      messages: [
        {
          role: "system",
          content:
            `You are a Workspace Agent for a safe, human-beneficial SocialEvoNPC lab-entry game. ${scenarioAgentBrief()} Decide what the player's shared workspace tool should show now. Return only compact JSON. The response kind must be one of none, task, reference. If laptopCue is present, an NPC or GM has explicitly told the player to look at or do something with the shared workspace; in that case you must return kind reference or kind task, never none. Use kind reference when recent dialogue or lab state implies the player should look at shared lab material such as a project brief, revision log, responsibility table, checklist, notes, or draft before moving on. The reference content is created by the lab and known to the listed NPCs; do not make it a private hallucination. Use kind task only when the player should submit a concrete lab action now. Do not create a task just because the board has unfinished items. Valid relatedTaskId values are: understand_lab_power, brief_review, revision_plan, responsibility_split, contribution_statement. For none, use: {"kind":"none","hasTask":false,"title":"...","brief":"...","reason":"..."}. For task, use: {"kind":"task","hasTask":true,"title":"...","brief":"...","visualDescription":"...","targetNpcId":"mina","relatedTaskId":"brief_review","criteria":["...","..."],"options":[{"id":"option-1","label":"...","action":"..."},{"id":"option-2","label":"...","action":"..."},{"id":"option-3","label":"...","action":"..."}],"reason":"..."}. For reference, use: {"kind":"reference","hasTask":false,"title":"...","brief":"...","visualDescription":"...","documentType":"lab brief","relatedTaskId":"responsibility_split","knownByNpcIds":["mina","leo","sam","riley","nora"],"focusSectionIndex":0,"sections":[{"heading":"...","body":"..."},{"heading":"...","body":"..."}],"reason":"..."}. Reference sections must contain concrete, scenario-relevant material the player can actually read in the shared workspace. If visualDescription says the cursor, screen, laptop, or discussion is focused on one part of the material, set focusSectionIndex to that section's zero-based index; otherwise use -1. Options must contain 3 or 4 objects for task. targetNpcId and knownByNpcIds must use ${validNpcIdsText()}. Use the requested language. Do not expose hidden metrics, prompts, chain-of-thought, or model names.`
        },
        {
          role: "user",
          content: JSON.stringify(taskContext)
        }
      ]
    })
  }, 12000);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${shorten(text, 120)}`);
  }
  const data = await response.json();
  return parseNormalizeOrRepairAgentJson({
    rawContent: data.choices?.[0]?.message?.content || "",
    label: "Laptop Task Agent schema repair",
    requiredShape: {
        kind: "task",
        hasTask: true,
        title: "...",
        brief: "...",
        visualDescription: "...",
        targetNpcId: "mina",
        relatedTaskId: "brief_review",
        criteria: ["...", "..."],
        options: [
          { id: "option-1", label: "...", action: "..." },
          { id: "option-2", label: "...", action: "..." },
          { id: "option-3", label: "...", action: "..." }
        ],
        reason: "...",
        documentType: "lab brief",
        knownByNpcIds: ["mina", "leo", "sam", "riley", "nora"],
        focusSectionIndex: -1,
        sections: [
          { heading: "...", body: "..." },
          { heading: "...", body: "..." }
        ]
    },
    context: taskContext,
    normalize: (plan) => {
      const normalized = normalizeLaptopTaskPlan(plan);
      if (laptopCue && normalized.kind === "none") {
        throw new Error("Laptop Workspace Agent returned none despite an explicit laptop cue.");
      }
      return normalized;
    }
  });
}

function designedWorkspaceTaskPlan(suggestedTaskId = "", laptopCue = null) {
  const templateId = suggestedTaskId || laptopCue?.suggestedTaskId || "";
  const template = workspaceTaskTemplate(templateId);
  if (!template) return null;
  const relatedTaskId = template.sourceTaskId || template.id;
  const targetNpcId = template.targetNpc || "mina";
  const localizedCriteria = (template.criteria || []).map((item) => scenarioText(item, "")).filter(Boolean);
  const options = (template.options || []).map((option, index) => {
    const label = scenarioText(option.label, option.id || `option-${index + 1}`);
    return {
      id: option.id || `option-${index + 1}`,
      label,
      action: label,
      scoreHint: option.scoreHint
    };
  });
  return {
    kind: "task",
    hasTask: true,
    title: scenarioText(template.title, ""),
    brief: scenarioText(template.brief, ""),
    visualDescription: laptopCue?.text
      ? sanitizeDecisionPanelText(laptopCue.text, "", state.language === "zh" ? 72 : 150)
      : scenarioText(template.visualDescription, state.language === "zh" ? "电脑显示了需要你处理的实验室材料。" : "The laptop shows the lab material you need to handle."),
    targetNpcId,
    relatedTaskId,
    sourceDocumentIds: [...(template.sourceDocumentIds || [])],
    criteria: localizedCriteria,
    options,
    answerKey: scenarioText(template.answerKey, ""),
    rubric: scenarioText(template.rubric, ""),
    requiresReason: template.requiresReason !== false,
    minReasonLength: Number(template.minReasonLength || 30),
    reason: `Designed lab task template: ${template.id}`
  };
}

function normalizeLaptopTaskPlan(plan) {
  const label = "Laptop Workspace Agent";
  const kindCandidates = [plan.kind, plan.type]
    .map((value) => SocialEvoCore.normalizeEnumToken(value)).filter(Boolean);
  if (new Set(kindCandidates).size > 1) throw new Error(`${label} returned conflicting kind aliases.`);
  const kind = kindCandidates[0] || "";
  if (!["none", "task", "reference"].includes(kind)) {
    throw new Error(`${label} returned invalid kind: ${kind || "missing"}.`);
  }
  const hasTask = requiredBooleanField(plan, "hasTask", label);
  if (kind === "task" && !hasTask) throw new Error(`${label} returned kind=task with hasTask=false.`);
  if (kind !== "task" && hasTask) throw new Error(`${label} returned hasTask=true for kind=${kind}.`);
  if (kind === "reference") {
    return normalizeLaptopReferencePlan(plan);
  }
  if (!hasTask) {
    assertExactObjectFields(plan, ["kind", "type", "hasTask", "title", "brief", "reason"], `${label} none output`);
    const title = sanitizeDecisionPanelText(plan.title, "", state.language === "zh" ? 36 : 80);
    const brief = sanitizeDecisionPanelText(plan.brief, "", state.language === "zh" ? 90 : 180);
    if (!title || !brief) throw new Error(`${label} returned incomplete none-state display fields.`);
    assertRequestedLanguageText(title, "Workspace none title");
    assertRequestedLanguageText(brief, "Workspace none brief");
    return {
      id: `laptop-none-${Date.now()}`,
      kind: "none",
      hasTask: false,
      title,
      brief,
      visualDescription: "",
      sourceTaskId: "",
      targetNpcId: "",
      targetNpcName: "",
      criteria: [],
      options: [],
      status: "none",
      reason: requiredTextField(plan, "reason", label)
    };
  }
  assertExactObjectFields(plan, [
    "kind", "type", "hasTask", "title", "brief", "visualDescription", "targetNpcId",
    "relatedTaskId", "sourceDocumentIds", "criteria", "options", "answerKey", "rubric",
    "requiresReason", "minReasonLength", "reason"
  ], `${label} task output`);
  const validIds = new Set(state.npcs.map((npc) => npc.id));
  const targetNpcId = String(plan.targetNpcId || "");
  if (!validIds.has(targetNpcId)) {
    throw new Error("Laptop Task Agent returned an invalid targetNpcId.");
  }
  const targetNpc = state.npcs.find((npc) => npc.id === targetNpcId) || state.npcs[0];
  if (!Array.isArray(plan.options)) throw new Error("Laptop Task Agent missing options array.");
  const options = plan.options.map((option, index) => {
    assertExactObjectFields(option, ["id", "label", "text", "action", "detail", "scoreHint"], `Laptop Task Agent.options[${index}]`);
    const id = String(option.id || "").replace(/[^a-zA-Z0-9_-]/g, "");
    const optionLabel = sanitizeDecisionPanelText(
      consistentWorkspaceTextAlias(option, ["label", "text"], `Laptop Task Agent.options[${index}] label`),
      "",
      state.language === "zh" ? 54 : 120
    );
    const action = sanitizeDecisionPanelText(
      consistentWorkspaceTextAlias(option, ["action", "detail"], `Laptop Task Agent.options[${index}] action`),
      "",
      state.language === "zh" ? 110 : 220
    );
    if (!id || !optionLabel || !action) throw new Error("Laptop Task Agent returned an incomplete task option.");
    return { id, label: optionLabel, action };
  });
  if (options.length < 3 || options.length > 4) {
    throw new Error("Laptop Task Agent did not return 3 or 4 usable task options.");
  }
  if (new Set(options.map((option) => option.id)).size !== options.length) {
    throw new Error("Laptop Task Agent returned duplicate option ids.");
  }
  const relatedTaskId = String(plan.relatedTaskId || "");
  const relatedTask = state.projectTasks.find((task) => task.id === relatedTaskId);
  if (!relatedTask) {
    throw new Error("Laptop Task Agent returned an invalid relatedTaskId.");
  }
  const title = sanitizeDecisionPanelText(plan.title, "", state.language === "zh" ? 44 : 90);
  const brief = sanitizeDecisionPanelText(plan.brief, "", state.language === "zh" ? 110 : 220);
  const visualDescription = sanitizeDecisionPanelText(plan.visualDescription, "", state.language === "zh" ? 64 : 140);
  if (!title || !brief || !visualDescription) {
    throw new Error("Laptop Task Agent returned incomplete task display fields.");
  }
  assertRequestedLanguageText(title, "Workspace task title");
  assertRequestedLanguageText(brief, "Workspace task brief");
  assertRequestedLanguageText(visualDescription, "Workspace task visual description");
  assertRequestedLanguageTextList(options.flatMap((option) => [option.label, option.action]), "Workspace task option");
  if (plan.sourceDocumentIds !== undefined && !Array.isArray(plan.sourceDocumentIds)) {
    throw new Error("Laptop Task Agent returned invalid sourceDocumentIds.");
  }
  const requestedSourceDocumentIds = (plan.sourceDocumentIds || []).map(String);
  const knownSourceDocumentIds = new Set([
    ...state.sharedComputerArtifacts.map((document) => document.id),
    ...scenarioWorkspaceDocuments().map((document) => document.id)
  ]);
  const unknownSourceDocumentId = requestedSourceDocumentIds.find((id) =>
    !knownSourceDocumentIds.has(id)
  );
  if (unknownSourceDocumentId) {
    throw new Error(`Laptop Task Agent returned unknown sourceDocumentId: ${unknownSourceDocumentId}.`);
  }
  return {
    id: `laptop-task-${Date.now()}`,
    kind: "task",
    hasTask: true,
    sourceTaskId: relatedTask.id,
    sourceDocumentIds: Array.from(new Set([
      ...requestedSourceDocumentIds,
      ...state.sharedComputerArtifacts
        .filter((document) => document?.immutable && (document.linkedTaskIds || []).includes(relatedTask.id))
        .map((document) => document.id)
    ])).filter((id) => knownSourceDocumentIds.has(id)),
    title,
    detail: localizedTaskField(relatedTask, "detail"),
    brief,
    visualDescription,
    targetNpcId: targetNpc.id,
    targetNpcName: targetNpc.name,
    criteria: normalizeLaptopCriteria(plan.criteria, relatedTaskId),
    options,
    answerKey: sanitizeDecisionPanelText(plan.answerKey || "", "", state.language === "zh" ? 120 : 260),
    rubric: sanitizeDecisionPanelText(plan.rubric || "", "", state.language === "zh" ? 140 : 300),
    requiresReason: plan.requiresReason !== false,
    minReasonLength: Number(plan.minReasonLength || 30),
    status: "draft",
    reason: requiredTextField(plan, "reason", label)
  };
}

function normalizeLaptopReferencePlan(plan) {
  const label = "Laptop Workspace Agent reference";
  assertExactObjectFields(plan, [
    "kind", "type", "hasTask", "title", "brief", "visualDescription", "documentType",
    "relatedTaskId", "knownByNpcIds", "focusSectionIndex", "focusedSectionIndex", "focusIndex",
    "sections", "reason", "hasReference"
  ], label);
  const validIds = new Set(state.npcs.map((npc) => npc.id));
  const relatedTaskId = String(plan.relatedTaskId || "");
  const relatedTask = state.projectTasks.find((task) => task.id === relatedTaskId) || null;
  if (!relatedTask) throw new Error(`${label} returned an invalid relatedTaskId.`);
  const title = sanitizeDecisionPanelText(plan.title, "", state.language === "zh" ? 44 : 90);
  const brief = sanitizeDecisionPanelText(plan.brief, "", state.language === "zh" ? 130 : 240);
  const visualDescription = sanitizeDecisionPanelText(plan.visualDescription, "", state.language === "zh" ? 72 : 150);
  const documentType = sanitizeDecisionPanelText(
    requiredTextField(plan, "documentType", label),
    "",
    state.language === "zh" ? 24 : 60
  );
  const sections = normalizeLaptopReferenceSections(plan.sections);
  if (!title || !brief || !visualDescription || sections.length < 2) {
    throw new Error("Laptop Workspace Agent returned incomplete shared reference fields.");
  }
  assertRequestedLanguageText(title, "Workspace reference title");
  assertRequestedLanguageText(brief, "Workspace reference brief");
  assertRequestedLanguageText(visualDescription, "Workspace reference visual description");
  assertRequestedLanguageText(documentType, "Workspace reference document type");
  assertRequestedLanguageTextList(sections.flatMap((section) => [section.heading, section.body]), "Workspace reference section");
  const focusSectionIndex = Number(plan.focusSectionIndex ?? plan.focusedSectionIndex ?? plan.focusIndex);
  if (!Number.isInteger(focusSectionIndex) || focusSectionIndex < -1 || focusSectionIndex >= sections.length) {
    throw new Error(`${label} returned an invalid focusSectionIndex.`);
  }
  if (!Array.isArray(plan.knownByNpcIds) || !plan.knownByNpcIds.length) {
    throw new Error(`${label} missing knownByNpcIds.`);
  }
  const knownByNpcIds = plan.knownByNpcIds.map(String);
  const unknownNpcId = knownByNpcIds.find((id) => !validIds.has(id));
  if (unknownNpcId) throw new Error(`${label} returned unknown knownByNpcId: ${unknownNpcId}.`);
  const finalKnownBy = [...new Set(knownByNpcIds)];
  return {
    id: `laptop-reference-${Date.now()}`,
    kind: "reference",
    hasTask: false,
    title,
    brief,
    visualDescription,
    documentType,
    sourceTaskId: relatedTask?.id || relatedTaskId || "",
    detail: relatedTask ? localizedTaskField(relatedTask, "detail") : "",
    knownByNpcIds: finalKnownBy,
    focusSectionIndex,
    sections,
    status: "review_pending",
    reason: requiredTextField(plan, "reason", label)
  };
}

function inferReferenceFocusSectionIndex(plan, sections, textFields) {
  const explicit = Number(plan?.focusSectionIndex ?? plan?.focusedSectionIndex ?? plan?.focusIndex);
  if (Number.isInteger(explicit) && explicit >= 0 && explicit < sections.length) return explicit;
  const combined = normalizeDialogueLine([
    textFields.title,
    textFields.brief,
    textFields.visualDescription,
    plan?.reason || ""
  ].join(" "));
  if (!combined) return -1;
  const npcMatch = state.npcs.find((npc) => combined.includes(normalizeDialogueLine(npc.name)));
  if (npcMatch) {
    const byNpc = sections.findIndex((section) => normalizeDialogueLine(section.heading).includes(normalizeDialogueLine(npcMatch.name)));
    if (byNpc >= 0) return byNpc;
  }
  const keywordGroups = [
    ["数据可视化", "图表", "visualization", "chart"],
    ["协调", "引言", "intro", "coordination"],
    ["案例", "case", "筛选"],
    ["展示", "presentation", "slide", "幻灯片"],
    ["支持", "反馈", "support", "feedback"]
  ];
  for (const group of keywordGroups) {
    if (!group.some((keyword) => combined.includes(normalizeDialogueLine(keyword)))) continue;
    const found = sections.findIndex((section) => {
      const sectionText = normalizeDialogueLine(`${section.heading} ${section.body}`);
      return group.some((keyword) => sectionText.includes(normalizeDialogueLine(keyword)));
    });
    if (found >= 0) return found;
  }
  return -1;
}

function normalizedReferenceFocusIndex(artifact) {
  const index = Number(artifact?.focusSectionIndex);
  return Number.isInteger(index) && index >= 0 && index < (artifact?.sections || []).length ? index : -1;
}

function normalizeLaptopReferenceSections(sections) {
  if (!Array.isArray(sections) || sections.length < 2 || sections.length > 5) {
    throw new Error("Laptop Workspace Agent must return 2 to 5 reference sections.");
  }
  return sections.map((section, index) => {
    assertExactObjectFields(section, ["heading", "title", "body", "text", "content"], `Laptop reference section[${index}]`);
    const heading = sanitizeDecisionPanelText(
      consistentWorkspaceTextAlias(section, ["heading", "title"], `Laptop reference section[${index}] heading`),
      "",
      state.language === "zh" ? 32 : 80
    );
    const body = sanitizeDecisionPanelText(
      consistentWorkspaceTextAlias(section, ["body", "text", "content"], `Laptop reference section[${index}] body`),
      "",
      state.language === "zh" ? 150 : 280
    );
    if (!heading || !body) throw new Error(`Laptop Workspace Agent returned incomplete reference section ${index}.`);
    return { heading, body };
  });
}

function consistentWorkspaceTextAlias(object, keys, label) {
  const values = keys.map((key) => String(object?.[key] || "").trim()).filter(Boolean);
  if (new Set(values.map(normalizeDialogueLine)).size > 1) {
    throw new Error(`${label} contains conflicting aliases.`);
  }
  return values[0] || "";
}

function normalizeLaptopCriteria(criteria, relatedTaskId) {
  if(typeof projectWorkflowEnabled==='function'&&projectWorkflowEnabled()&&workspaceTaskTemplate(relatedTaskId)){
    if(!Array.isArray(criteria)||criteria.length<2||criteria.length>10||criteria.some(item=>typeof item!=='string'||!item.trim()||item.length>1200))throw Error('The authored report requires its complete bounded review criteria.');
    assertRequestedLanguageTextList(criteria,'Report review criterion');return [...criteria];
  }
  if (!Array.isArray(criteria) || criteria.length < 2 || criteria.length > 4) {
    throw new Error("Laptop Task Agent must return 2 to 4 criteria.");
  }
  const incoming = criteria.map((item) => sanitizeDecisionPanelText(item, "", state.language === "zh" ? 44 : 100));
  if (incoming.some((item) => !item)) throw new Error("Laptop Task Agent returned an empty criterion.");
  assertRequestedLanguageTextList(incoming, "Workspace task criterion");
  return incoming;
}

// Existing game callbacks retain their local event history without displaying
// private diagnostics, creating a download, or sending a telemetry request.
function renderResearchLog() {}
