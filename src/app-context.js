// Runtime context, state, scenario getters, and initialization helpers.
const {
  modelOptions,
  evolutionModes,
  relationshipKeys,
  valueTradeoffKeys,
  DEEPSEEK_FLASH_MODEL,
  DEEPSEEK_PRO_MODEL,
  API_CONTRACT_VERSION,
  BUILD_VERSION,
  CHAT_REQUEST_TIMEOUT_MS,
  discussionOffsets,
  characterSeparation,
  propCollisionPadding,
  playerMoveStep,
  interactionRange,
  conversationStayRange,
  directionColumns,
  spriteTile,
  playerSprite,
  npcSprites,
  scenarioLayouts,
  dialogueTiming
} = window.SocialEvoConfig;

const { i18n } = window.SocialEvoI18n;
const SocialEvoCore = window.SocialEvoCore;

const {
  baseNpcs,
  decisionWindows,
  decisionWindowsZh,
  decisionOptionUtterances,
  baseProjectTasks,
  scenarioSpecs
} = window.SocialEvoScenarios;

function t(key, ...args) {
  const lookup=key==='briefEndBody'&&scenarioSpecs[state?.scenarioId]?.projectWorkflow?'briefEndCreditBody':key;
  const value = i18n[state?.language || "en"]?.[lookup] ?? i18n.en[lookup] ?? key;
  return typeof value === "function" ? value(...args) : value;
}

function currentScenario() {
  return scenarioSpecs[state.scenarioId] || scenarioSpecs["newcomer-circle"];
}

function scenarioLayout() {
  return scenarioLayouts[state.scenarioId] || scenarioLayouts["newcomer-circle"];
}

function activeWalkableBounds() {
  return scenarioLayout().walkableBounds || scenarioLayouts["newcomer-circle"].walkableBounds;
}

function activeCollisionObstacles() {
  if(state.scenarioId==="newcomer-circle"&&typeof labSceneFloorGeometry==="function")return labSceneFloorGeometry();
  return scenarioLayout().collisionObstacles || scenarioLayouts["newcomer-circle"].collisionObstacles;
}

function activeTaskBoardObject() {
  if(state.scenarioId==="newcomer-circle")return {id:"task-board",position:{x:15,y:74}};
  return scenarioLayout().taskBoardObject || scenarioLayouts["newcomer-circle"].taskBoardObject;
}

function activePlayerStart() {
  return scenarioLayout().playerStart || scenarioLayouts["newcomer-circle"].playerStart;
}

function activeOpeningPlayerPosition() {
  return scenarioLayout().openingPlayerPosition || activePlayerStart();
}

function scenarioWorldClass() {
  return scenarioLayout().worldClass || "room-newcomer-layout";
}

function scenarioText(value, fallback = "") {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value[state.language] || value.en || fallback;
  }
  return value || fallback;
}

function scenarioPromptText(value, language = state.language) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value[language] || value.en || "";
  }
  return value || "";
}

function scenarioAgent() {
  return currentScenario().agent || scenarioSpecs["newcomer-circle"].agent;
}

function scenarioAgentLabel() {
  return scenarioAgent().label || scenarioLabel();
}

function scenarioPlayerLabel() {
  return scenarioAgent().playerLabel || "the player";
}

function scenarioGroupLabel() {
  return scenarioAgent().groupLabel || "the group";
}

function playerVisibleNarrativeBoundaryInstruction() {
  return "[PLAYER_VISIBLE_NARRATIVE_BOUNDARY_V1] Keep every player-visible field inside the present fictional world. Internal scenario instructions, stage IDs/order, mandatory future incidents, treatment mechanisms, readiness/end gates and success criteria guide execution; they are not dialogue, document contents or scene facts to retell. Do not reveal that criticism, blame, contribution conflict or a particular ending must happen, and do not describe future scenes as a fixed route. Explain current available actions, actual supplied materials, known deadlines, established plans and already delivered events naturally when relevant. A real seven-day submission deadline or an announced review is ordinary project information; a planned result is not an award already won. Distinguish an actual current procedural requirement from a hidden game-completion condition. Answer the player's question without explaining the game's design, stages, research conditions, model behavior or hidden state. Preserve each person's position, uncertainty and all actual source facts; do not rewrite history or force a reaction or outcome.";
}

function scenarioAgentBrief() {
  const multimodalRule = typeof multimodalInstructionForAgent === "function"
    ? multimodalInstructionForAgent()
    : "No video modality is active.";
  return [
    `Current scenario: ${scenarioAgentLabel()}.`,
    `Player role: ${scenarioPlayerLabel()}.`,
    `Group: ${scenarioGroupLabel()}.`,
    `Shared workspace tool: ${scenarioText(scenarioWorkspace().title, "workspace tool")}.`,
    `Final goal: ${scenarioFinalGoalForAgent()}.`,
    playerVisibleNarrativeBoundaryInstruction(),
    `Language rule: ${requestedLanguageInstruction()}`,
    `Multimodal rule: ${multimodalRule}`
  ].join(" ");
}

function requestedLanguageLabel() {
  return state.language === "zh" ? "Simplified Chinese" : "English";
}

function requestedLanguageInstruction() {
  return state.language === "zh"
    ? "The UI language is Simplified Chinese. Every player-visible string you output must be in Simplified Chinese. Do not output English sentences. Proper nouns, NPC names, IDs, model names, SocialEvoNPC, DeepSeek, API, GM, NPC, and short keyboard labels may remain unchanged."
    : "The UI language is English. Every player-visible string you output must be in English.";
}

function scenarioFinalGoalForAgent() {
  return scenarioPromptText(scenarioAgent().finalGoal);
}

function scenarioSuccessCriterionForAgent() {
  return scenarioPromptText(scenarioAgent().endSuccess);
}

function scenarioFailureCriterionForAgent() {
  return scenarioPromptText(scenarioAgent().endFailure);
}

function validNpcIdsText() {
  return state.npcs.map((npc) => npc.id).join(", ");
}

function scenarioLabel() {
  return currentScenario().title.en || currentScenario().id;
}

function scenarioWorkspace() {
  return currentScenario().workspace || scenarioSpecs["newcomer-circle"].workspace;
}

function scenarioWorkspaceDocuments() {
  return currentScenario().workspaceDocuments || [];
}

function cloneScenarioWorkspaceDocuments() {
  return scenarioWorkspaceDocuments().map((document) => {
    const sections = (document.sections || []).map((section, index) => ({
      id: String(section.id || `section-${index + 1}`),
      heading: scenarioText(section.heading, ""),
      body: scenarioText(section.body, "")
    }));
    const localized = {
      id: String(document.id || ""),
      kind: "reference",
      hasTask: false,
      immutable: document.immutable !== false,
      version: String(document.version || "1.0"),
      fileName: scenarioText(document.fileName, document.id || "project-brief.txt"),
      title: scenarioText(document.title, document.id || ""),
      documentType: scenarioText(document.documentType, "shared material"),
      brief: scenarioText(document.brief, ""),
      visualDescription: scenarioText(document.visualDescription, ""),
      knownByNpcIds: [...(document.knownByNpcIds || [])],
      linkedTaskIds: [...(document.linkedTaskIds || [])],
      sourceTaskId: "",
      focusSectionIndex: -1,
      sections,
      status: "available",
      createdAt: "scenario_fixture",
      reviewedAt: ""
    };
    localized.contentHash = SocialEvoCore.stableHash({
      id: localized.id,
      version: localized.version,
      fileName: localized.fileName,
      title: localized.title,
      documentType: localized.documentType,
      sections: localized.sections
    });
    return localized;
  }).filter((document) => document.id && document.title && document.sections.length);
}

function scenarioTaskBoard() {
  return currentScenario().taskBoard || scenarioSpecs["newcomer-circle"].taskBoard;
}

function scenarioStages() {
  return currentScenario().stages || [];
}

function currentStage() {
  const stages = scenarioStages();
  if (!stages.length) return null;
  const index = Math.max(0, Math.min(state.stageIndex || 0, stages.length - 1));
  return stages[index];
}

// Keep controller phase identity separate from the label shown to players.
function decisionWindowPlayerTitle(window) {
  const declared=getDecisionWindows().find(candidate=>window.stageId
    ? candidate.stageId===window.stageId
    : candidate.type===window.sourceType||candidate.type===window.type);
  return declared?.displayTitle||window.displayTitle||window.type||currentStageLabel();
}

function currentStageLabel() {
  const stage = currentStage();
  return stage ? scenarioText(stage.title, stage.id || "") : "";
}

function storyBeatProgressForStage(stageIndex = state.stageIndex) {
  return SocialEvoCore.storyBeatProgress(state.storyBeatLedger || [], stageIndex);
}

function recordStoryBeat(input = {}) {
  const stageIndex = Number(input.stageIndex ?? state.stageIndex ?? 0);
  const stage = scenarioStages()[stageIndex] || currentStage();
  const sourceEventId = String(input.sourceEventId || "");
  const existing = (state.storyBeatLedger || []).find((beat) =>
    sourceEventId && beat.sourceEventId === sourceEventId && beat.type === input.type
  );
  if (existing) return existing;
  const progress = storyBeatProgressForStage(stageIndex);
  const globalOrdinal = (state.storyBeatLedger || []).filter((beat) =>
    beat.status === "committed" && beat.countsTowardStage !== false
  ).length + 1;
  const beat = SocialEvoCore.createStoryBeat({
    ...input,
    beatId: input.beatId || `beat-${state.sessionId}-${globalOrdinal}`,
    sessionId: state.sessionId,
    sessionEpoch: state.sessionEpoch,
    stageIndex,
    stageId: stage?.id || `stage-${stageIndex + 1}`,
    globalOrdinal,
    stageOrdinal: progress.count + 1
  });
  if (beat.type !== "director_cue") state.stageDirectorCue = "";
  state.storyBeatLedger.push(beat);
  state.log.push({
    type: "Story beat committed",
    beatId: beat.beatId,
    eventId: beat.sourceEventId,
    round: scenarioText(stage?.title, beat.stageId),
    summary: beat.publicSummary,
    beatType: beat.type,
    globalOrdinal: beat.globalOrdinal,
    stageOrdinal: beat.stageOrdinal,
    timestamp: beat.timestamp
  });
  return beat;
}

function dueGlobalAttentionCheckpoint() {
  if (!state.globalAttentionScheduleEnabled) return 0;
  return SocialEvoCore.nextAttentionCheckpoint(
    state.storyBeatLedger || [],
    state.globalAttentionChecks || []
  );
}

function publicStoryBeatContext(limit = 10) {
  return (state.storyBeatLedger || []).slice(-limit).map((beat) => ({
    beatId: beat.beatId,
    stageId: beat.stageId,
    globalOrdinal: beat.globalOrdinal,
    stageOrdinal: beat.stageOrdinal,
    type: beat.type,
    actors: beat.actors,
    visibility: beat.visibility,
    summary: beat.visibility === "private"
      ? "The player completed a private consultation; its words are not public."
      : beat.publicSummary,
    focusTags: beat.focusTags
  }));
}

function attentionDistractorsFromNpcs(correctName) {
  return state.npcs.map((npc) => npc.name)
    .filter((name) => normalizeDialogueLine(name) !== normalizeDialogueLine(correctName))
    .slice(0, 3);
}

function storyBeatCapacityBlocksConsultation() {
  return false; // Historical export counts do not consume conversation slots.
}

function fixedStudyStageTargetReached(progress = storyBeatProgressForStage()) {
  return false;
}

function syncStageToRound() {
  const stages = scenarioStages();
  if (!stages.length) {
    state.stageIndex = 0;
    state.stageStatus = "";
    return;
  }
  state.stageIndex = Math.max(0, Math.min(state.roundIndex || 0, stages.length - 1));
  state.stageStatus = stages[state.stageIndex]?.id || "";
}

function attentionCheckForStage(stageIndex) {
  return (currentScenario().comprehensionChecks || []).find(
    (check) => Number(check.beforeStageIndex) === Number(stageIndex)
  ) || null;
}

function workspaceTaskTemplate(taskId) {
  return (currentScenario().workspaceTaskTemplates || []).find((task) => task.id === taskId) || null;
}

function completedSocialInteractionsForStage(stageId = currentStage()?.id || "") {
  const roots = new Set((state.sideTalkSemanticHistory || [])
    .filter((item) => String(item.stageId || "") === String(stageId || ""))
    .map((item) => String(item.rootEventId || item.contentHash || ""))
    .filter(Boolean));
  return roots.size;
}

function currentStageConsultationCue() {
  const stage = currentStage();
  return scenarioText(stage?.consultationCue, state.language === "zh"
    ? "先和一位实验室成员交流，听听对方如何看待当前情况。"
    : "Talk with one lab member first and hear how they see the current situation.");
}

function currentStageTransitionGate() {
  return SocialEvoCore.validateStageTransition({
    nextStageIndex: state.roundIndex,
    submittedArtifacts: state.submittedArtifacts,
    comprehensionCompleted: state.roundIndex !== 1 || Boolean(state.attentionCheck?.completed),
    completedSocialInteractions: completedSocialInteractionsForStage(),
    sessionEnded: Boolean(state.finalOutcome || state.sessionClosed)
  });
}

function evaluatedWorkspaceSubmission(taskId) {
  return SocialEvoCore.evaluatedArtifactForTask(state.submittedArtifacts, taskId);
}

function currentStageTransitionRule() {
  return SocialEvoCore.STAGE_TRANSITIONS.find(
    (rule) => Number(rule.stageIndex) === Number(state.roundIndex)
  ) || null;
}

function artifactSubmissionCompletesCurrentStage(source) {
  if (String(source || "").trim().toLowerCase() !== "artifact submission") return false;
  const rule = currentStageTransitionRule();
  const latestSubmission = state.submittedArtifacts.at(-1);
  if (!rule?.requiredArtifactId || !latestSubmission) return false;
  return Boolean(SocialEvoCore.evaluatedArtifactForTask(
    [latestSubmission],
    rule.requiredArtifactId
  ));
}

function currentRequiredWorkspaceTask() {
  const gate = currentStageTransitionGate();
  if (gate.reason !== "artifact_evaluation_required" || !gate.requiredArtifactId) return null;
  const template = workspaceTaskTemplate(gate.requiredArtifactId);
  if (!template) return null;
  return {
    taskId: gate.requiredArtifactId,
    template,
    gate
  };
}

function scenarioVisual() {
  return currentScenario().visual || scenarioSpecs["newcomer-circle"].visual || {};
}

function scenarioThemeClass() {
  return scenarioVisual().themeClass || "scenario-newcomer";
}

function activePlayerSprite() {
  return scenarioVisual().playerSprite || playerSprite;
}

function activeNpcSprite(npcOrId) {
  const id = typeof npcOrId === "string" ? npcOrId : npcOrId?.id;
  return scenarioVisual().npcSprites?.[id] || npcSprites[id] || npcSprites.mina;
}

function avatarSpriteFor(sprite) {
  if (sprite?.avatarUrl) {
    return {
      type: "image-static",
      url: sprite.avatarUrl,
      frameWidth: sprite.frameWidth,
      frameHeight: sprite.frameHeight,
      scale: 1
    };
  }
  return sprite;
}

function activePlayerAvatarSprite() {
  return scenarioVisual().playerAvatar || avatarSpriteFor(activePlayerSprite());
}

function activeNpcAvatarSprite(npcOrId) {
  const id = typeof npcOrId === "string" ? npcOrId : npcOrId?.id;
  return scenarioVisual().npcAvatars?.[id] || avatarSpriteFor(activeNpcSprite(npcOrId));
}

function isImageSprite(sprite) {
  return String(sprite?.type || "").startsWith("image-");
}

function spriteClass(baseClass, sprite) {
  return `${baseClass}${isImageSprite(sprite) ? " asset-image-sprite" : ""}`;
}

function cssUrl(value) {
  return String(value || "").replace(/"/g, "%22");
}

function spriteStyleText(sprite, extra = {}) {
  const styles = [];
  if (extra.avatarColor) styles.push(`--avatar-color:${extra.avatarColor}`);
  if (extra.borderColor) styles.push(`border-color:${extra.borderColor}`);
  if (!sprite) return styles.join("; ");
  if (isImageSprite(sprite)) {
    styles.push(`--sprite-image:url("${cssUrl(sprite.url)}")`);
    if (sprite.type === "image-grid") {
      const scale = sprite.scale || 3;
      const frameWidth = sprite.frameWidth || 16;
      const frameHeight = sprite.frameHeight || 16;
      const columns = sprite.columns || 1;
      const rows = sprite.rows || 1;
      styles.push(`--sprite-bg-x:${-(sprite.frameColumn || 0) * frameWidth * scale}px`);
      styles.push(`--sprite-bg-y:${-(sprite.frameRow || 0) * frameHeight * scale}px`);
      styles.push(`--sprite-background-size:${frameWidth * columns * scale}px ${frameHeight * rows * scale}px`);
    } else {
      styles.push("--sprite-bg-x:center");
      styles.push("--sprite-bg-y:center");
      styles.push("--sprite-background-size:contain");
    }
  } else {
    styles.push(`--sprite-bg-x:${-sprite.x * 3}px`);
    styles.push(`--sprite-bg-y:${-sprite.y * 3}px`);
  }
  return styles.join("; ");
}

function directAvatarStyleText(extra = {}) {
  const styles = [];
  if (extra.avatarColor) styles.push(`--avatar-color:${extra.avatarColor}`);
  if (extra.borderColor) styles.push(`border-color:${extra.borderColor}`);
  return styles.join("; ");
}

function imageAvatarMarkup(baseClass, sprite, extra = {}) {
  const className = `${baseClass} asset-image-sprite direct-avatar-image`;
  return `<img class="${className}" src="${escapeHtml(sprite.url)}" alt="" style="${directAvatarStyleText(extra)}">`;
}

function spriteAvatarMarkup(baseClass, sprite, extra = {}) {
  if (isImageSprite(sprite) && sprite.type === "image-static") {
    return imageAvatarMarkup(baseClass, sprite, extra);
  }
  return `<div class="${spriteClass(baseClass, sprite)}" style="${spriteStyleText(sprite, extra)}"></div>`;
}

function workspaceIconClass() {
  return scenarioVisual().workspaceIconClass || "workspace-laptop";
}

function renderScenarioStaticText() {
  const scenario = currentScenario();
  document.body.dataset.scenario = scenario.id;
  const app = document.getElementById("app");
  if (app) {
    app.classList.remove("scenario-newcomer", "scenario-peer-support", "scenario-community-volunteer");
    app.classList.add(scenarioThemeClass());
  }
  const world = document.getElementById("pixel-world");
  if (world) {
    world.classList.remove("room-newcomer-layout", "room-peer-layout", "room-community-layout");
    world.classList.add(scenarioWorldClass());
  }
  const setText = (id, value) => {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  };
  setText("scenario-title", scenarioText(scenario.title));
  document.querySelectorAll("[data-i18n='scenarioTitle']").forEach((node) => {
    node.textContent = scenarioText(scenario.title);
  });
  document.querySelectorAll("[data-i18n='scenarioHeading']").forEach((node) => {
    node.textContent = scenarioText(scenario.scenarioHeading, t("scenarioHeading"));
  });
  document.querySelectorAll("[data-i18n='scenarioDescription']").forEach((node) => {
    node.textContent = scenarioText(scenario.description);
  });
  document.querySelectorAll("[data-i18n='finalGoalText']").forEach((node) => {
    node.textContent = scenarioText(scenario.finalGoal);
  });
  document.querySelectorAll("[data-i18n='playerRoleText']").forEach((node) => {
    node.textContent = scenarioText(scenario.playerRole);
  });
  document.querySelectorAll("[data-i18n='npcEvolutionText']").forEach((node) => {
    node.textContent = scenarioText(scenario.npcEvolution);
  });
  document.querySelectorAll("[data-i18n='gameGoalText']").forEach((node) => {
    node.textContent = scenarioText(scenario.gameGoal);
  });
  document.querySelectorAll("[data-i18n='initialObjective']").forEach((node) => {
    node.textContent = scenarioText(scenario.initialObjective);
  });
  document.querySelectorAll("[data-i18n='taskBoardEyebrow']").forEach((node) => {
    node.textContent = scenarioText(scenarioTaskBoard().eyebrow, t("taskBoardEyebrow"));
  });
  document.querySelectorAll("[data-i18n='taskBoardTitle']").forEach((node) => {
    node.textContent = scenarioText(scenarioTaskBoard().title, t("taskBoardTitle"));
  });
  document.querySelectorAll("[data-i18n='backpackEyebrow']").forEach((node) => {
    node.textContent = scenarioText(scenarioWorkspace().title, t("backpackEyebrow"));
  });
  document.querySelectorAll("[data-i18n='backpackTitle']").forEach((node) => {
    node.textContent = scenarioText(scenarioWorkspace().panelTitle, t("backpackTitle"));
  });
  document.querySelectorAll("[data-i18n='laptopToolTitle']").forEach((node) => {
    node.textContent = scenarioText(scenarioWorkspace().title, t("laptopToolTitle"));
  });
  document.querySelectorAll("[data-i18n='laptopToolBody']").forEach((node) => {
    node.textContent = scenarioText(scenarioWorkspace().body, t("laptopToolBody"));
  });
  document.querySelectorAll(".workspace-tool-icon, .laptop-tool-icon, .inventory-tool-icon, .laptop-dock-icon").forEach((node) => {
    node.classList.remove("workspace-laptop", "workspace-tablet", "workspace-clipboard");
    node.classList.add("workspace-tool-icon", workspaceIconClass());
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}







const state = {
  screen: "menu",
  scenarioId: "newcomer-circle",
  language: "en",
  briefAcknowledged: false,
  npcs: [],
  projectTasks: [],
  roundIndex: 0,
  selectedOption: "",
  selectedOptionIndex: -1,
  openingResponseAnswered: false,
  openingPresentation: null,
  sideTalkDraftIntent: null,
  playerPosition: { x: 50, y: 84 },
  lastSpeaker: null,
  worldBubbleMode: "",
  dialogueBubbleUntil: 0,
  autoAdvanceDialogue: true,
  dialogueAdvancePending: false,
  dialoguePacingChanges: [],
  nearbyNpcId: null,
  nearbyProjectObjectId: null,
  playerDirection: "down",
  playerWalkFrame: 0,
  activeSideTalkNpcId: null,
  currentPrivateConversationNpcId: null,
  activeArtifactTask: null,
  artifactDraft: "",
  selectedArtifactOption: "",
  artifactSubmissionStatus: "",
  artifactTaskLoading: false,
  artifactScoreReports: [],
  submittedArtifacts: [],
  sharedComputerArtifacts: [],
  openWorkspaceDocumentIds: [],
  pendingLaptopCue: null,
  participantId: "",
  adminMode: false,
  sessionAdminModeAtStart: false,
  configAdminUnlocked: false,
  researchProfile: {
    active: false,
    assignmentId: "",
    assignedCondition: "",
    protocolVersion: "",
    sessionToken: "",
    expiresAt: 0,
    serverValidated: false
  },
  studyPair: null,
  evolutionMode: "self-evolving",
  capabilities: SocialEvoCore.conditionCapabilities("self-evolving"),
  sessionId: "",
  sessionEpoch: 0,
  sessionStartedAt: "",
  sessionEndedAt: "",
  sessionClosed: true,
  terminalExports: [],
  terminalExportKeys: [],
  runtimeManifest: {
    buildVersion: BUILD_VERSION,
    codeCommit: "unavailable-browser-build",
    scenarioVersion: "lab-entry-v1",
    apiContractVersion: API_CONTRACT_VERSION
  },
  eventSequence: 0,
  eventLedger: [],
  activeEventLock: null,
  committedNpcEvents: [],
  apiCalls: [],
  apiCallSequence: 0,
  stageIndex: 0,
  stageStatus: "stage_1_entry",
  stageEvolutionReports: [],
  storyBeatLedger: [],
  stageDirectorReports: [],
  stagePacing: null,
  projectWorkflow: null,
  creditWorkflow: null,
  entryEpisode: null,
  stageDirectorCue: "",
  trajectoryBaseline: null,
  stageTrajectorySnapshots: [],
  offlineEvaluation: {
    schemaVersion: "offline-social-evaluation-v1",
    status: "idle",
    attempts: 0,
    observable: null,
    evolution: null,
    error: "",
    requestedAt: "",
    completedAt: ""
  },
  globalAttentionChecks: [],
  globalAttentionScheduleEnabled: true,
  pendingTerminalOutcome: null,
  pendingPostDecisionContinuation: null,
  relationshipTransferProbe: null,
  attentionCheck: {
    completed: false,
    failed: false,
    attempts: []
  },
  interpersonalScore: 50,
  outcomeScore: 30,
  dualScoreEndingEvidence: null,
  pendingDecision: null,
  interactionsSinceDecision: 0,
  totalSideTalks: 0,
  sideTalkSemanticHistory: [],
  sideTalkOpportunityKeys: [],
  sideTalkRootRewardKeys: [],
  delayedDecisionTimerId: null,
  isIntroPlaying: false,
  isScenePlaying: false,
  isGmThinking: false,
  apiFatalError: null,
  apiFatalCode: "",
  apiFatalContext: null,
  decisionPanelVisible: false,
  log: [],
  dialogueHistory: [],
  socialMemoryRag: {
    enabled: true,
    memoryStore: [],
    memoryOperations: [],
    retrievalTraces: [],
    lastRetrieval: null
  },
  latestGoalAssessment: null,
  finalOutcome: null,
  userFeedback: null,
  videoModality: {
    enabled: false,
    requested: false,
    sampleMs: 700,
    status: "off",
    statusMessage: "",
    stream: null,
    timerId: null,
    videoNode: null,
    canvasNode: null,
    isCapturing: false,
    lastSampleAt: 0,
    lastFaceSignal: null,
    smoothedSignal: null,
    visibleExpressionCue: null,
    lastLoggedCue: "",
    lastCueLogAt: 0,
    lastDebugFrameDataUrl: "",
    lastFaceApiOutput: null,
    samples: [],
    failureCount: 0,
    lastError: "",
    unavailableLogged: false
  },
  voiceModality: {
    requested: false,
    enabled: false,
    configured: false,
    availability: "unknown",
    availabilityPending: false,
    provider: "dashscope",
    engine: "qwen-flash",
    model: "qwen-audio-3.1-tts-flash",
    dependencyReady: false,
    paraphrase: false,
    requestTimeoutMs: 45000,
    generationStreaming: true,
    status: "off",
    statusMessage: "",
    sequence: 0,
    abortController: null,
    currentAudio: null,
    currentStream: null,
    cancelAudioWait: null,
    lastPlaybackTiming: null,
    currentObjectUrl: "",
    currentLinePromise: null,
    currentSpeakerId: "",
    currentLineInfo: null,
    lastFailure: null,
    lastStopReason: "",
    lastError: "",
    unavailableLogged: false
  },
  sessionMetrics: {
    groupProgress: 32,
    groupClimate: 58,
    actionCount: 0,
    interactionOpportunityCount: 0,
    interactionUseCount: 0,
    rewardedInteractionCount: 0
  }
};

const screens = {
  menu: document.getElementById("menu-screen"),
  gameSelect: document.getElementById("game-select-screen"),
  config: document.getElementById("config-screen"),
  game: document.getElementById("game-screen"),
  summary: document.getElementById("summary-screen"),
  studyComplete: document.getElementById("study-complete-screen")
};

function showScreen(name) {
  if (typeof studyPairTick === "function") studyPairTick();
  if (state.screen === "summary" && name !== "summary" && typeof resetLabRecapRuntime === "function") {
    resetLabRecapRuntime();
  }
  if (state.screen === "game" && name !== "game") {
    if (typeof hideGalgameDialogue === "function") hideGalgameDialogue({ resetPartner: true });
    if (typeof stopVideoModality === "function") stopVideoModality();
    if (typeof stopVoiceModality === "function") stopVoiceModality();
    if (typeof abortAllActiveRequests === "function") abortAllActiveRequests("screen_change");
    if (typeof cancelScheduledWork === "function") cancelScheduledWork();
  }
  Object.entries(screens).forEach(([key, node]) => {
    node?.classList.toggle("screen-active", key === name);
  });
  state.screen = name;
  if (typeof renderShellUi === "function") renderShellUi();
  if (typeof studyPairTick === "function") studyPairTick();
  if (typeof renderStudyPairUi === "function") renderStudyPairUi();
  if (name === "config") document.getElementById("participant-id")?.focus({preventScroll:true});
}

function updateBriefGate() {
  const startButton = document.getElementById("start-config-btn");
  const note = document.getElementById("brief-required-note");
  if (startButton) startButton.disabled = false;
  if (note) note.textContent = state.briefAcknowledged ? "" : t("briefRequired");
}

function openStudyBrief() {
  if (state.briefAcknowledged) return;
  const dialog = document.getElementById("study-brief-dialog");
  if (dialog?.showModal) dialog.showModal();
}

function applyLanguage(options = {}) {
  document.documentElement.lang = state.language === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    const translated = t(node.dataset.i18n);
    if (translated !== node.dataset.i18n) node.textContent = translated;
  });
  const languageSelect = document.getElementById("language-select");
  if (languageSelect) languageSelect.value = state.language;
  const sideInput = document.getElementById("side-talk-input");
  if (sideInput) sideInput.placeholder = t("sidePlaceholder");
  const artifactInput = document.getElementById("artifact-draft-input");
  if (artifactInput) artifactInput.placeholder = t("artifactDraftPlaceholder");
  const decisionInput = document.getElementById("free-response");
  if (decisionInput) decisionInput.placeholder = t("decisionPlaceholder");
  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    node.placeholder = t(node.dataset.i18nPlaceholder);
  });
  renderScenarioStaticText();
  if (options.renderScreen !== false) {
    if (state.screen === "config") renderConfig();
    if (state.screen === "game") renderGame();
    if (state.screen === "summary") showSummary();
  }
  if (typeof renderStudyPairUi === "function") renderStudyPairUi();
  updateBriefGate();
  if (typeof renderShellUi === "function") renderShellUi();
}

function evolutionModeLabel(mode) {
  const labels = {
    "self-evolving": t("evolutionModeSelf"),
    "memory-only": t("evolutionModeMemory"),
    static: t("evolutionModeStatic"),
    "self-evolving-no-rag": state.language === "zh" ? "自进化（无 RAG）" : "Self-evolving (no RAG)",
    "self-evolving-no-relationship-strategy": state.language === "zh"
      ? "自进化（冻结关系与策略）"
      : "Self-evolving (relationship/strategy frozen)"
  };
  return labels[mode] || labels["self-evolving"];
}

function evolutionModeDescription(mode) {
  const descriptions = {
    "self-evolving": t("evolutionModeSelfDesc"),
    "memory-only": t("evolutionModeMemoryDesc"),
    static: t("evolutionModeStaticDesc"),
    "self-evolving-no-rag": state.language === "zh"
      ? "保留自进化，但上下文只使用固定近期窗口。"
      : "Self-evolution stays active, using only a fixed recent context window.",
    "self-evolving-no-relationship-strategy": state.language === "zh"
      ? "记忆与其他评估可更新，但关系模型和未来策略被冻结。"
      : "Memory and other appraisal may update; relationship and strategy stay frozen."
  };
  return descriptions[mode] || descriptions["self-evolving"];
}

function cloneProjectTasks() {
  return (currentScenario().tasks || baseProjectTasks).map((task) => ({ ...task }));
}

function localizedTaskField(task, key) {
  const value = task[key];
  if (value && typeof value === "object") return value[state.language] || value.en || "";
  return value || "";
}

function cloneNpcs() {
  const placed = [];
  return (currentScenario().npcs || baseNpcs).map((npc) => {
    const home=state.scenarioId==="newcomer-circle"&&typeof labStationHome==="function"?labStationHome(npc.id):null;
    const position = nearestUnoccupiedWalkablePoint(home||npc.position, { existingNpcs: placed, includePlayer: false });
    const cloned = {
      ...npc,
      initialEmotion: npc.emotion,
      initialTrust: npc.trust,
      initialBelonging: npc.belonging,
      initialStrategy: npc.strategy,
      homePosition: { ...position },
      position,
      values: [...npc.values],
      memory: [...npc.memory],
      structuredMemory: [initialStructuredMemory(npc)],
      relationship: initialRelationshipForNpc(npc),
      valueTradeoffs: initialValueTradeoffsForNpc(npc),
      evolutionHistory: [],
      surfaceLine: "",
      movementState: "idle",
      direction: "down",
      walkFrame: 0
    };
    placed.push(cloned);
    return cloned;
  });
}

function initialStructuredMemory(npc) {
  return SocialEvoCore.normalizeMemoryAtom({
    sourceEventId: `initial-${npc.id}`,
    ownerNpcId: npc.id,
    visibility: "owner",
    knowledgeType: "npc_interpretation",
    summary: npc.memory[0] || npc.role || "",
    interpretation: npc.strategy || "",
    confidence: 1,
    importance: 0.7,
    evidenceIds: [`initial-${npc.id}`],
    tags: ["initial", npc.id]
  });
}

function initialRelationshipForNpc(npc) {
  if (npc.initialRelationship) return { ...npc.initialRelationship };
  const competence = {
    mina: 50,
    leo: 48,
    sam: 42,
    riley: 28,
    nora: 40
  };
  const care = {
    mina: 50,
    leo: 58,
    sam: 38,
    riley: 24,
    nora: 45
  };
  const reliability = {
    mina: 46,
    leo: 50,
    sam: 36,
    riley: 22,
    nora: 39
  };
  const disruption = {
    mina: 38,
    leo: 30,
    sam: 48,
    riley: 62,
    nora: 44
  };
  return {
    competence: competence[npc.id] ?? 42,
    care: care[npc.id] ?? 42,
    reliability: reliability[npc.id] ?? 42,
    disruption: disruption[npc.id] ?? 42
  };
}

function relationshipEvolutionConstraintsForAgent(npc, eventImportance) {
  return {
    neutralPoint: SocialEvoCore.RELATIONSHIP_NEUTRAL_POINT,
    currentRelationship: { ...(npc?.relationship || {}) },
    eventImportance: eventImportance === null
      ? "set_by_proposal"
      : Number(eventImportance || 0),
    crossingRule:
      "A relationship delta may move toward neutral, but must not cross the neutral point unless importance is at least 0.85 or the proposal cites two independent root events."
  };
}

function relationshipEvolutionPromptRule() {
  return "Treat relationshipDeltas as local adjustments to the supplied current values. " +
    `For an ordinary event, a delta may move a value toward ${SocialEvoCore.RELATIONSHIP_NEUTRAL_POINT} but must not move it past ${SocialEvoCore.RELATIONSHIP_NEUTRAL_POINT} to the opposite side. ` +
    "Crossing is allowed only when importance is at least 0.85 or two independent root events are cited.";
}

function initialValueTradeoffsForNpc(npc) {
  if (npc.initialValueTradeoffs) return { ...npc.initialValueTradeoffs };
  const profiles = {
    mina: { task: 64, inclusion: 52, fairness: 68, psychologicalSafety: 50 },
    leo: { task: 42, inclusion: 72, fairness: 56, psychologicalSafety: 68 },
    sam: { task: 76, inclusion: 34, fairness: 48, psychologicalSafety: 38 },
    riley: { task: 68, inclusion: 24, fairness: 36, psychologicalSafety: 28 },
    nora: { task: 46, inclusion: 54, fairness: 48, psychologicalSafety: 70 }
  };
  return { ...(profiles[npc.id] || { task: 50, inclusion: 50, fairness: 50, psychologicalSafety: 50 }) };
}
