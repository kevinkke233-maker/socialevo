// Dialogue logging, memory surfaces, shared-computer cues, and text sanitation.
function avatarSpriteForName(name) {
  if (name === "You") return activePlayerAvatarSprite();
  const npc = state.npcs.find((item) => item.name === name);
  return npc ? activeNpcAvatarSprite(npc) : null;
}

function messageAvatarMarkup(name, color) {
  const sprite = avatarSpriteForName(name);
  if (!sprite) {
    return `<div class="message-avatar system-avatar" style="--avatar-color:${color}">${escapeHtml(speakerInitials(name))}</div>`;
  }
  return spriteAvatarMarkup("message-avatar sprite-avatar", sprite, { avatarColor: color });
}

function speakerDisplayName(name) {
  if (state.language !== "zh") return name;
  if (name === "You") return "你";
  if (name === "Game Master") return "游戏主持";
  return name;
}

function speakerInitials(name) {
  const display = speakerDisplayName(name);
  if (state.language === "zh" && /[\u4e00-\u9fff]/u.test(display)) return display.slice(0, 2);
  return display.slice(0, 2);
}

const GALGAME_PORTRAIT_ROOT = "./assets/portraits/lab-entry";
const GALGAME_EXPRESSIONS = new Set([
  "neutral", "happy", "sad", "angry", "surprised", "worried", "skeptical", "relieved"
]);
const galgameExpressionMemory = new Map([["player", "neutral"]]);
const galgamePortraitLoadCache = new Map();
let galgamePartnerNpcId = "";
let galgameDialogueToken = 0;
let galgameDialogueFallbackTimer = null;
let galgameDialogueHeldForSequence = false;
let galgameNeutralPortraitsPreloaded = false;
let galgamePointerPolicyObserver = null, galgamePointerPolicyRoot = null;

function syncGalgameDialoguePointerPolicy() {
  const layer = document.getElementById("galgame-dialogue-layer");
  if (!layer) return;
  const passive = !layer.classList.contains("galgame-dialogue-hidden") &&
    typeof isFreeExplorationActive === "function" && isFreeExplorationActive() &&
    !isGalgameDialogueSequenceActive();
  if (layer.classList.contains("galgame-dialogue-passive") !== passive) {
    layer.classList.toggle("galgame-dialogue-passive", passive);
  }
}

function observeGalgameDialoguePointerLifecycle() {
  const root = document.getElementById("game-screen");
  if (!root || root === galgamePointerPolicyRoot) return;
  galgamePointerPolicyObserver?.disconnect();
  galgamePointerPolicyRoot = root;
  // Existing pacing/voice/modal renderers publish their state through this
  // subtree. Synchronize before the next pointer event, without wrapping them,
  // polling state, advancing a line, or doing any geometry/layout reads.
  galgamePointerPolicyObserver = new MutationObserver(syncGalgameDialogueLifecycle);
  galgamePointerPolicyObserver.observe(root, { subtree:true, childList:true,
    attributes:true, attributeFilter:["class","hidden","aria-hidden"] });
}

function galgamePortraitUrl(characterId, expression = "neutral") {
  const safeExpression = GALGAME_EXPRESSIONS.has(expression) ? expression : "neutral";
  return `${GALGAME_PORTRAIT_ROOT}/${characterId}/${safeExpression}.png`;
}

function galgameExpressionFor(emotion, tone) {
  const cue = `${emotion || ""} ${tone || ""}`.toLowerCase();
  const matches = (pattern) => pattern.test(cue);
  if (matches(/surpris|startl|shock|stun|惊讶|震惊|错愕|意外/u)) return "surprised";
  if (matches(/angry|anger|furious|irritat|frustrat|hostile|生气|愤怒|恼火|敌意/u)) return "angry";
  if (matches(/sad|hurt|disappoint|upset|regret|deflat|难过|受伤|失望|低落|委屈/u)) return "sad";
  if (matches(/reliev|settled|reassur|hopeful|proud|confident|encourag|decisive|释然|安心|松了|平静|信心|欣慰/u)) return "relieved";
  if (matches(/worried|concern|uneasy|anxious|nervous|tense|afraid|fear|pressure|担心|忧虑|不安|焦虑|紧张|害怕|压力/u)) return "worried";
  if (matches(/skeptic|guarded|doubt|suspicious|dismissive|evaluative|critical|cautious|wary|questioning|怀疑|警惕|防备|审视|谨慎|戒备|冷淡/u)) return "skeptical";
  if (matches(/happy|smil|warm|kind|pleased|approv|friendly|grateful|positive|开心|高兴|温暖|友好|赞许|满意|微笑/u)) return "happy";
  return "neutral";
}

function preloadGalgameNeutralPortraits() {
  if (galgameNeutralPortraitsPreloaded) return;
  galgameNeutralPortraitsPreloaded = true;
  ["player", ...state.npcs.map((npc) => npc.id)].forEach((characterId) => {
    loadGalgamePortrait(galgamePortraitUrl(characterId, "neutral")).catch(() => {});
  });
}

function loadGalgamePortrait(url) {
  if (galgamePortraitLoadCache.has(url)) return galgamePortraitLoadCache.get(url);
  const pending = new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = async () => {
      try {
        if (typeof image.decode === "function") await image.decode();
      } catch (_error) {
        // A completed load is still usable when decode() is unsupported or races on cached data.
      }
      resolve(url);
    };
    image.onerror = () => reject(new Error(`Unable to load Galgame portrait: ${url}`));
    image.src = url;
  });
  galgamePortraitLoadCache.set(url, pending);
  pending.catch(() => {
    if (galgamePortraitLoadCache.get(url) === pending) galgamePortraitLoadCache.delete(url);
  });
  return pending;
}

function setGalgamePortrait(image, characterId, expression, dialogueToken) {
  if (!image || !characterId) return Promise.resolve(false);
  const safeExpression = GALGAME_EXPRESSIONS.has(expression) ? expression : "neutral";
  const url = galgamePortraitUrl(characterId, safeExpression);
  const pendingKey = `${dialogueToken}:${url}`;
  if (image.dataset.characterId === characterId && image.dataset.expression === safeExpression &&
      image.complete && image.naturalWidth > 0) {
    image.dataset.pendingPortrait = pendingKey;
    image.classList.remove("galgame-portrait-loading");
    return Promise.resolve(true);
  }
  image.dataset.pendingPortrait = pendingKey;
  image.classList.add("galgame-portrait-loading");
  return loadGalgamePortrait(url).then(() => {
    if (dialogueToken !== galgameDialogueToken || image.dataset.pendingPortrait !== pendingKey) return false;
    image.src = url;
    image.dataset.characterId = characterId;
    image.dataset.expression = safeExpression;
    window.requestAnimationFrame(() => {
      if (dialogueToken === galgameDialogueToken && image.dataset.pendingPortrait === pendingKey) {
        image.classList.remove("galgame-portrait-loading");
      }
    });
    return true;
  }).catch(() => {
    if (dialogueToken !== galgameDialogueToken || image.dataset.pendingPortrait !== pendingKey) return false;
    if (safeExpression !== "neutral") {
      return setGalgamePortrait(image, characterId, "neutral", dialogueToken);
    }
    image.classList.add("galgame-portrait-loading");
    return false;
  });
}

function galgamePartnerForDialogue(name, options = {}) {
  const speakerNpc = state.npcs.find((npc) => npc.name === name);
  if (speakerNpc) {
    galgamePartnerNpcId = speakerNpc.id;
    return speakerNpc;
  }
  if (name !== "You") return null;
  const contextualId = options.partnerNpcId || state.currentPrivateConversationNpcId ||
    state.activeSideTalkNpcId || galgamePartnerNpcId;
  const partner = state.npcs.find((npc) => npc.id === contextualId) || null;
  if (partner) galgamePartnerNpcId = partner.id;
  return partner;
}

function syncDialogueSpeakerHighlight(speakerId = "") {
  // Visible delivery identity only; never infer a speaker from trust, mood,
  // treatment, voice availability, or the NPC nearest to the player.
  const world = document.getElementById("pixel-world");
  if (world) world.dataset.dialogueSpeakerId = speakerId;
  for (const node of document.querySelectorAll("#sprite-layer [data-actor-id]")) {
    node.classList.toggle("dialogue-speaking", Boolean(speakerId) && node.dataset.actorId === speakerId);
  }
}

function showGalgameDialogue(name, text, emotion, tone, options = {}) {
  const layer = document.getElementById("galgame-dialogue-layer");
  const playerPortrait = document.getElementById("galgame-player-portrait");
  const npcPortrait = document.getElementById("galgame-npc-portrait");
  const speakerName = document.getElementById("galgame-speaker-name");
  const dialogueText = document.getElementById("galgame-dialogue-text");
  if (!layer || !playerPortrait || !npcPortrait || !speakerName || !dialogueText) return false;

  preloadGalgameNeutralPortraits();
  const speakerNpc = state.npcs.find((npc) => npc.name === name) || null;
  const isPlayer = name === "You";
  const isSystem = !isPlayer && !speakerNpc;
  const speakerId = isPlayer ? "player" : speakerNpc?.id || "";
  const partner = galgamePartnerForDialogue(name, options);
  const expression = galgameExpressionFor(emotion, tone);
  const token = ++galgameDialogueToken;

  if (isPlayer) galgameExpressionMemory.set("player", expression);
  if (speakerNpc) galgameExpressionMemory.set(speakerNpc.id, expression);
  const playerExpression = galgameExpressionMemory.get("player") || "neutral";
  const partnerExpression = partner
    ? galgameExpressionMemory.get(partner.id) || galgameExpressionFor(partner.emotion, "")
    : "neutral";

  if (!isSystem) {
    setGalgamePortrait(playerPortrait, "player", playerExpression, token);
    if (partner) setGalgamePortrait(npcPortrait, partner.id, partnerExpression, token);
  }
  speakerName.textContent = speakerDisplayName(name);
  speakerName.dataset.deliveryLabel = state.language === "zh"
    ? (isSystem ? "旁白" : "发言") : (isSystem ? "Narration" : "Speaker");
  layer.dataset.speakerId = speakerId;
  syncDialogueSpeakerHighlight(speakerId);
  dialogueText.textContent = String(text || "");
  dialogueText.scrollTop = 0;
  galgameDialogueHeldForSequence = false;

  layer.classList.remove(
    "galgame-dialogue-hidden",
    "galgame-speaker-player",
    "galgame-speaker-npc",
    "galgame-speaker-system",
    "galgame-no-partner",
    "galgame-dialogue-long",
    "galgame-dialogue-dense"
  );
  layer.classList.add(isSystem
    ? "galgame-speaker-system"
    : isPlayer
      ? "galgame-speaker-player"
      : "galgame-speaker-npc");
  layer.classList.toggle("galgame-no-partner", !partner);
  layer.classList.toggle("galgame-dialogue-long", String(text || "").length > 110);
  layer.classList.toggle("galgame-dialogue-dense", String(text || "").length > 190);
  layer.setAttribute("aria-hidden", "false");
  document.getElementById("game-screen")?.classList.add("galgame-dialogue-active");
  const world = document.getElementById("pixel-world");
  world?.classList.add("galgame-dialogue-active");
  if (world && window.matchMedia("(max-width: 680px)").matches &&
      document.getElementById("game-screen")?.classList.contains("participant-mode")) {
    window.requestAnimationFrame(() => world.scrollIntoView({ block: "end", behavior: "auto" }));
  }

  const bubble = document.getElementById("world-bubble");
  if (bubble) bubble.classList.add("world-bubble-hidden");
  state.lastSpeaker = name;
  state.worldBubbleMode = "";
  state.dialogueBubbleUntil = 0;

  if (galgameDialogueFallbackTimer) window.clearTimeout(galgameDialogueFallbackTimer);
  const baseDelay = typeof dialoguePauseMs === "function"
    ? dialoguePauseMs(String(text || ""), isSystem ? "system" : "npcResponse")
    : 6000;
  galgameDialogueFallbackTimer = window.setTimeout(() => {
    if (token !== galgameDialogueToken || state.dialogueAdvancePending) return;
    finishGalgameDialogueLine();
  }, baseDelay + 1000);
  observeGalgameDialoguePointerLifecycle();
  syncGalgameDialoguePointerPolicy();
  return true;
}

function isGalgameDialogueSequenceActive() {
  const requiredReply = state.decisionPanelVisible &&
    ["opening_response", "npc_followup"].includes(currentWindow()?.kind);
  return Boolean(state.isIntroPlaying || state.isScenePlaying || state.isGmThinking ||
    state.dialogueAdvancePending || requiredReply ||
    state.activeEventLock || state.decisionPanelVisible ||
    (state.voiceModality?.enabled && ["loading","buffering","speaking"].includes(state.voiceModality.status)) ||
    (typeof isSideTalkOpen === "function" && isSideTalkOpen()) ||
    (typeof isPrivateDialogueActive === "function" && isPrivateDialogueActive()) ||
    (typeof isBackpackOpen === "function" && isBackpackOpen()) ||
    (typeof isTaskBoardOpen === "function" && isTaskBoardOpen()) ||
    (typeof isPlayerToolOpen === "function" && isPlayerToolOpen()) ||
    (typeof labStoryRuntime !== "undefined" && labStoryRuntime) ||
    (typeof labDayHandoff !== "undefined" && labDayHandoff));
}

function finishGalgameDialogueLine() {
  // Keep the same surface between lines/API waits, including the opening's
  // scripted walk. Never change dialogue pacing, voice cancellation or state.
  if (isGalgameDialogueSequenceActive()) galgameDialogueHeldForSequence = true;
  else hideGalgameDialogue();
}

function syncGalgameDialogueLifecycle() {
  if (galgameDialogueHeldForSequence && !isGalgameDialogueSequenceActive()) hideGalgameDialogue();
  syncGalgameDialoguePointerPolicy();
}

function hideGalgameDialogue(options = {}) {
  if (galgameDialogueFallbackTimer) window.clearTimeout(galgameDialogueFallbackTimer);
  galgameDialogueFallbackTimer = null;
  galgameDialogueHeldForSequence = false;
  galgameDialogueToken += 1;
  const layer = document.getElementById("galgame-dialogue-layer");
  if (layer) {
    layer.classList.add("galgame-dialogue-hidden");
    layer.classList.remove("galgame-dialogue-passive");
    layer.setAttribute("aria-hidden", "true");
    layer.dataset.speakerId = "";
  }
  syncDialogueSpeakerHighlight();
  document.getElementById("game-screen")?.classList.remove("galgame-dialogue-active");
  document.getElementById("pixel-world")?.classList.remove("galgame-dialogue-active");
  if (options.resetPartner) {
    galgamePartnerNpcId = "";
    galgameExpressionMemory.clear();
    galgameExpressionMemory.set("player", "neutral");
    ["galgame-player-portrait", "galgame-npc-portrait"].forEach((id) => {
      const image = document.getElementById(id);
      if (!image) return;
      image.dataset.pendingPortrait = "";
      image.classList.remove("galgame-portrait-loading");
    });
  }
}

function addDialogue(name, color, text, emotion, tone, options = {}) {
  const feed = document.getElementById("dialogue-feed");
  const message = document.createElement("article");
  message.className = "message";
  const safeName = escapeHtml(speakerDisplayName(name));
  const safeText = escapeHtml(text);
  const safeEmotion = escapeHtml(displayEmotion(emotion));
  const safeTone = escapeHtml(displayTone(tone));
  message.innerHTML = `
    ${messageAvatarMarkup(name, color)}
    <div class="message-body">
      <strong>${safeName}</strong>
      <p>${safeText}</p>
      <div class="message-meta">
        <span>${t("emotionLabel")}: ${safeEmotion}</span>
        <span>${t("toneLabel")}: ${safeTone}</span>
      </div>
    </div>
  `;
  feed.appendChild(message);
  feed.scrollTop = feed.scrollHeight;
  if (!showGalgameDialogue(name, text, emotion, tone, options)) {
    showWorldBubble(name, text, "dialogue");
  }
  if (options.recoveryTextOnly !== true && typeof prepareVoiceForDialogue === "function") prepareVoiceForDialogue(name, text, emotion, tone, options);
  rememberDialogue(name, text, emotion, tone, options);
  if (typeof recordDialogueSocialMemory === "function") {
    recordDialogueSocialMemory(name, text, emotion, tone);
  }
  maybeRegisterLaptopCue(name, text);
}

function rememberDialogue(name, text, emotion, tone, options = {}) {
  const privateNpcId = state.currentPrivateConversationNpcId || state.activeSideTalkNpcId || "";
  const actorNpc = state.npcs.find((npc) => npc.name === name);
  const actorId = name === "You" ? "player" : actorNpc?.id || "controller";
  const isPrivate = Boolean(privateNpcId) &&
    (actorId === "player" || actorId === privateNpcId);
  state.dialogueHistory.push({
    name,
    text,
    emotion,
    tone,
    actorId,
    visibility: isPrivate ? "private" : "group",
    audienceNpcIds: isPrivate ? [privateNpcId] : state.npcs.map((npc) => npc.id),
    round: options.round || currentWindow()?.type || state.finalOutcome?.endingRound || "Opening",
    eventId: options.eventId || "",
    channel: options.channel || "",
    timestamp: new Date().toISOString()
  });
  // Research capture is separate from the bounded context used by NPCs.
  if (typeof studyPairArchiveDialogue === "function") studyPairArchiveDialogue(state.dialogueHistory.at(-1));
  if(name==='Game Master'&&emotion==='transition'&&state.scenarioId==='newcomer-circle'){
    const entry=state.dialogueHistory.at(-1);
    state.log.push({type:'World evidence controller transition delivered',sessionEpoch:state.sessionEpoch,
      transition:{...entry,sessionEpoch:state.sessionEpoch,stageIndex:state.stageIndex,roundIndex:state.roundIndex},timestamp:entry.timestamp});
  }
  if (state.dialogueHistory.length > 80) state.dialogueHistory.shift();
}

function recentDialogueContext(limit = 8, access = {}) {
  const role = access.role || "group";
  const viewerNpcId = access.viewerNpcId || "";
  return state.dialogueHistory.filter((entry) => {
    if (role === "controller" || role === "researcher") return true;
    if (entry.visibility !== "private") return true;
    return Boolean(viewerNpcId) && (entry.audienceNpcIds || []).includes(viewerNpcId);
  }).slice(-limit).map((entry) => ({
    speaker: entry.name,
    text: shorten(entry.text, 180),
    emotion: entry.emotion,
    tone: entry.tone
  }));
}

function observableDialogueContext(limit = 8) {
  return recentDialogueContext(limit, { role: "group" });
}

function maybeRegisterLaptopCue(name, text) {
  if (!name || name === "You") return;
  const cue = detectLaptopCue(text);
  if (!cue || isStaleEvaluatedLaptopCue(cue)) return;
  state.pendingLaptopCue = {
    sourceName: name,
    text: shorten(String(text || ""), 220),
    suggestedTaskId: cue.taskId,
    kindHint: cue.kindHint,
    detectedAt: new Date().toISOString()
  };
  refreshGameHud();
}

function isStaleEvaluatedLaptopCue(cue) {
  const taskId = String(cue?.suggestedTaskId || cue?.taskId || "");
  if (!taskId) return false;
  const requiredTaskId = currentRequiredWorkspaceTask()?.taskId || "";
  return requiredTaskId !== taskId && Boolean(evaluatedWorkspaceSubmission(taskId));
}

function detectLaptopCue(text) {
  const value = String(text || "").trim();
  if (!value) return null;
  const normalized = normalizeDialogueLine(value);
  const compact = value.replace(/\s+/g, "");
  const zhMaterial = /(共享材料|共享文档|共享文件|文档|文件|材料|大纲|框架|表格|清单|幻灯片|草稿|笔记|记录|修改记录|验证步骤|电脑|平板|夹板|手册|说明|边界|资源|路线|物资|反馈卡|轮班|排班|案例卡|流程)/u.test(compact);
  const zhAction = /(看|查看|打开|读|过一遍|过一过|整理|完成|处理|提交|写|改|先|一起)/u.test(compact);
  const enMaterial = /(shared material|shared document|document|outline|framework|table|checklist|slide plan|slides|draft|notes|revision log|change log|verification step|laptop|computer|tablet|clipboard|manual|protocol|boundary note|resource list|route map|supply list|feedback card|shift plan|case card|case notes)/i.test(value);
  const enAction = /(review|look|open|read|scan|work on|finish|handle|submit|write|revise|check)/i.test(value);
  if (!((zhMaterial && zhAction) || (enMaterial && enAction))) return null;
  return {
    kindHint: /(提交|完成|整理|写|改|submit|finish|write|revise|work on)/i.test(value) ? "task" : "reference",
    taskId: inferLaptopCueTaskId(value)
  };
}

function inferLaptopCueTaskId(text) {
  const value = String(text || "");
  if (/(贡献|归属|credit|contribution|statement|authorship|认可|署名)/i.test(value)) return "contribution_statement";
  if (/(修改|修订|revision|revise|repair|改|下一版|检查点|checkpoint)/i.test(value)) return "revision_plan";
  if (/(责任|负责人|甩锅|归责|owner|responsibil|blame|handoff|交接)/i.test(value)) return "responsibility_split";
  if (/(数据集|样本|纳入标准|简报|图表|dataset|sample|criteria|brief|visualization|chart|evidence|claim)/i.test(value)) return "brief_review";
  return "understand_lab_power";
}

function requiredStageLaptopCue() {
  const required = currentRequiredWorkspaceTask();
  if (!required) return null;
  if(typeof labRevisionPreparationAllowed==="function"&&!labRevisionPreparationAllowed(required.taskId))return null;
  const title = scenarioText(required.template.title, required.taskId);
  const brief = scenarioText(required.template.brief, "");
  return {
    sourceName: "Game Master",
    text: state.language === "zh"
      ? `下一步需要在实验室电脑完成“${title}”。${brief}`
      : `The next step is to complete "${title}" on the lab computer. ${brief}`,
    suggestedTaskId: required.taskId,
    kindHint: "task",
    detectedAt: new Date().toISOString(),
    requiredByStage: true
  };
}

function laptopCueReadyHelp(cue, artifact = state.activeArtifactTask) {
  const title = artifact?.title || scenarioText(
    workspaceTaskTemplate(cue?.suggestedTaskId)?.title,
    cue?.suggestedTaskId || t("artifactTaskHeading")
  );
  const isReference = artifact?.kind === "reference";
  if (state.language === "zh") {
    return isReference
      ? `下一步：打开实验室电脑，查看“${title}”。`
      : `下一步：打开实验室电脑，完成“${title}”。`;
  }
  return isReference
    ? `Next: open the lab computer and review "${title}".`
    : `Next: open the lab computer and complete "${title}".`;
}

async function maybePreparePendingLaptopCue() {
  if (isEntryEpisodeStage()) return false; // Scope first; graded review belongs to the next work episode.
  if (state.apiFatalError) return false;
  const pendingCue = state.pendingLaptopCue;
  const stageCue = requiredStageLaptopCue();
  if (!pendingCue && !stageCue) return false;
  if (!stageCue && isStaleEvaluatedLaptopCue(pendingCue)) {
    state.pendingLaptopCue = null;
    refreshGameHud();
    return false;
  }
  // Keep dialogue-detected cues queued until the transition table actually requires that task.
  if (!stageCue) return false;
  const cue = stageCue
    ? {
        ...stageCue,
        sourceName: pendingCue?.sourceName || stageCue.sourceName,
        text: pendingCue?.text || stageCue.text
      }
    : pendingCue;
  state.pendingLaptopCue = null;
  const requiredTaskId = stageCue?.suggestedTaskId || "";
  if (reusableActiveLaptopTask(requiredTaskId)) {
    refreshGameHud();
    setWorldHelp(laptopCueReadyHelp(cue));
    return true;
  }
  await prepareLaptopTask(cue.suggestedTaskId, cue);
  const preparedForRequiredStage = !requiredTaskId || reusableActiveLaptopTask(requiredTaskId);
  if (!state.apiFatalError && preparedForRequiredStage &&
      (state.activeArtifactTask?.kind === "reference" || state.activeArtifactTask?.hasTask)) {
    state.log.push({
      type: "Laptop cue prepared",
      round: currentWindow()?.type || "Free movement",
      summary: `${cue.sourceName}: ${cue.text}`,
      artifactId: state.activeArtifactTask.id,
      artifactKind: state.activeArtifactTask.kind,
      timestamp: new Date().toISOString()
    });
    renderResearchLog();
    refreshGameHud();
    setWorldHelp(laptopCueReadyHelp(cue));
    return true;
  }
  return false;
}

function sharedComputerContext(limit = 5) {
  const allArtifacts = Array.isArray(state.sharedComputerArtifacts)
    ? state.sharedComputerArtifacts
    : [];
  const fixedDocuments = allArtifacts.filter((artifact) => artifact.immutable);
  const recentDocuments = allArtifacts.filter((artifact) => !artifact.immutable)
    .slice(-Math.max(0, limit - fixedDocuments.length));
  return [...fixedDocuments, ...recentDocuments].slice(0, limit).map((artifact) => ({
    id: artifact.id,
    immutable: Boolean(artifact.immutable),
    version: artifact.version || "",
    fileName: artifact.fileName || "",
    contentHash: artifact.contentHash || "",
    title: artifact.title,
    documentType: artifact.documentType,
    brief: artifact.brief,
    knownByNpcIds: artifact.knownByNpcIds,
    linkedTaskIds: artifact.linkedTaskIds || [],
    focusSectionIndex: normalizedReferenceFocusIndex(artifact),
    sections: artifact.sections,
    status: artifact.status,
    reviewedAt: artifact.reviewedAt || ""
  }));
}

function workspaceDocumentsForTask(sourceDocumentIds = [], sourceTaskId = "") {
  const explicitIds = new Set((sourceDocumentIds || []).map((id) => String(id)));
  return state.sharedComputerArtifacts.filter((artifact) => {
    if (!artifact?.immutable) return false;
    if (explicitIds.size) return explicitIds.has(artifact.id);
    return (artifact.linkedTaskIds || []).includes(sourceTaskId);
  }).map((artifact) => ({
    id: artifact.id,
    version: artifact.version || "",
    fileName: artifact.fileName || "",
    contentHash: artifact.contentHash || "",
    title: artifact.title,
    documentType: artifact.documentType,
    brief: artifact.brief,
    sections: artifact.sections
  }));
}

function storyWorldContext() {
  const scenario = currentScenario();
  const world = scenario.storyWorld?.[state.language] || scenario.storyWorld?.en || scenarioSpecs["newcomer-circle"].storyWorld.en;
  const multimodalInteraction = typeof multimodalContextForAgent === "function"
    ? multimodalContextForAgent()
    : { enabled: false };
  return {
    scenarioId: scenario.id,
    scenarioTitle: scenarioText(scenario.title),
    playerRole: scenarioText(scenario.playerRole),
    finalGoal: scenarioText(scenario.finalGoal),
    workspaceTool: scenarioText(scenarioWorkspace().title),
    multimodalInteraction,
    ...world,
    narrativeDay:typeof labDayContext==="function"?labDayContext():null
  };
}

function registerSharedComputerArtifact(artifact) {
  if (!artifact || artifact.kind !== "reference") return;
  const existing = state.sharedComputerArtifacts.find((item) => item.id === artifact.id);
  if (existing) return;
  state.sharedComputerArtifacts.push({
    id: artifact.id,
    immutable: false,
    version: "",
    fileName: "",
    contentHash: "",
    title: artifact.title,
    documentType: artifact.documentType,
    brief: artifact.brief,
    visualDescription: artifact.visualDescription,
    knownByNpcIds: artifact.knownByNpcIds,
    linkedTaskIds: artifact.sourceTaskId ? [artifact.sourceTaskId] : [],
    focusSectionIndex: normalizedReferenceFocusIndex(artifact),
    sections: artifact.sections,
    status: artifact.status,
    createdAt: new Date().toISOString(),
    reviewedAt: ""
  });
}

function markSharedComputerArtifactReviewed(artifactId) {
  const record = state.sharedComputerArtifacts.find((item) => item.id === artifactId);
  if (!record) return null;
  record.status = "reviewed";
  record.reviewedAt = new Date().toISOString();
  return record;
}

function sanitizeNpcDialogueStrict(value, npc) {
  let dialogue = String(value || "").replace(/\s+/g, " ").trim();
  dialogue = dialogue
    .replace(/^["']|["']$/g, "")
    .replace(new RegExp(`^${npc.name}\\s*[:：-]\\s*`, "i"), "")
    .replace(/\bRecent memory\s*:\s*.*$/i, "")
    .replace(/\bMemory\s*:\s*.*$/i, "")
    .replace(/\bStrategy\s*:\s*.*$/i, "")
    .replace(/\bCurrent emotion\s*:\s*.*$/i, "")
    .replace(/^I am feeling [^.。!?]*[.。!?]\s*/i, "")
    .trim();
  dialogue = shorten(dialogue, 280);
  assertRequestedLanguageText(dialogue, `${npc.name} dialogue`);
  assertParticipantVisibleOutput(dialogue, `${npc.name} dialogue`);
  if(typeof assertLabQuestionAnswerable==='function')assertLabQuestionAnswerable(dialogue,npc);
  return dialogue;
}

// Meaning and actor perspective are checked by the full-utterance QA Agent.
// Keep these synchronous interfaces for existing normalizers, not phrase gates.
function assertStoryWorldDialogue(){return true;}
function assertNpcPerspectiveDialogue(){return true;}

function sanitizeSurfaceLine(value, npc, dialogue) {
  let line = String(value || "").replace(/\s+/g, " ").trim();
  line = line
    .replace(/^["']|["']$/g, "")
    .replace(new RegExp(`^${npc.name}\\s*[:：-]\\s*`, "i"), "")
    .replace(/\bRecent memory\s*:\s*.*$/i, "")
    .replace(/\bMemory\s*:\s*.*$/i, "")
    .replace(/\bStrategy\s*:\s*.*$/i, "")
    .replace(/\bCurrent emotion\s*:\s*.*$/i, "")
    .trim();
  if (!line) line = surfaceLineFromDialogue(npc, dialogue);
  line = shorten(line, state.language === "zh" ? 42 : 92);
  try {
    assertRequestedLanguageText(line, `${npc.name} surfaceLine`);
  } catch (error) {
    if (!dialogue || !/not in (?:Simplified Chinese|English)/i.test(String(error?.message || ""))) {
      throw error;
    }
    line = surfaceLineFromDialogue(npc, dialogue);
    assertRequestedLanguageText(line, `${npc.name} surfaceLine`);
  }
  assertParticipantVisibleOutput(line, `${npc.name} surfaceLine`);
  return line;
}

function sanitizeSurfaceLineStrict(value, npc) {
  const line = String(value || "").replace(/\s+/g, " ").trim()
    .replace(/^["']|["']$/g, "")
    .replace(new RegExp(`^${npc.name}\\s*[:：-]\\s*`, "i"), "")
    .replace(/\bRecent memory\s*:\s*.*$/i, "")
    .replace(/\bMemory\s*:\s*.*$/i, "")
    .replace(/\bStrategy\s*:\s*.*$/i, "")
    .replace(/\bCurrent emotion\s*:\s*.*$/i, "")
    .trim();
  const shortened = shorten(line, state.language === "zh" ? 42 : 92);
  assertRequestedLanguageText(shortened, `${npc.name} surfaceLine`);
  assertParticipantVisibleOutput(shortened, `${npc.name} surfaceLine`);
  return shortened;
}

function surfaceLineFromDialogue(npc, dialogue) {
  const spoken = String(dialogue || "").replace(/\s+/g, " ").trim();
  if (!spoken) {
    return state.language === "zh"
      ? "我还在想刚才这一步意味着什么。"
      : "I am still thinking about what that last step means.";
  }
  const clipped = shorten(spoken.replace(/^嗯[，,]\s*/u, ""), state.language === "zh" ? 34 : 78);
  return clipped;
}

function hasRepeatedNpcLine(npc, dialogue) {
  const normalized = normalizeDialogueLine(dialogue);
  if (!normalized) return false;
  return state.dialogueHistory.some((entry) => (
    entry.name === npc.name && normalizeDialogueLine(entry.text) === normalized
  ));
}

function normalizeDialogueLine(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function addSystemMessage(name, text, emotion, tone, options = {}) {
  addDialogue(name, "#2f6f73", text, emotion, tone, options);
}

function addSceneDialogue(name, text, emotion, tone) {
  const npc = state.npcs.find((item) => item.name === name);
  if (npc) {
    addDialogue(npc.name, npc.color, text, emotion, tone);
  } else {
    addSystemMessage(name, text, emotion, tone);
  }
  state.log.push({
    type: "Opening scene",
    round: "Opening",
    summary: `${name}: ${text}`,
    timestamp: new Date().toISOString()
  });
  renderNpcRail();
  renderPixelWorld();
  renderResearchLog();
}
