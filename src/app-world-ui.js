// World interaction state, public cues, and in-world UI helpers.
function isDialogueBubbleProtected() {
  return state.worldBubbleMode === "dialogue" && Date.now() < (state.dialogueBubbleUntil || 0);
}

function hideWorldBubbleIfNotProtected() {
  const bubble = document.getElementById("world-bubble");
  if (!bubble || isDialogueBubbleProtected()) return;
  bubble.classList.add("world-bubble-hidden");
  state.worldBubbleMode = "";
}

function showWorldBubble(name, text, mode = "dialogue") {
  const bubble = document.getElementById("world-bubble");
  if (!bubble) return;
  if (mode !== "dialogue" && isDialogueBubbleProtected()) return;
  const speaker = state.npcs.find((npc) => npc.name === name);
  const position = speaker
    ? speaker.position
    : name === "You"
      ? state.playerPosition
      : { x: 10, y: 18 };
  const anchor = `${clamp(position.x, 22, 78)}%`, top = `${clamp(position.y - 28, 8, 66)}%`;
  const copy = text.length > 150 ? `${text.slice(0, 147)}...` : text;
  if (bubble.style.getPropertyValue('--world-bubble-anchor') !== anchor) bubble.style.setProperty('--world-bubble-anchor', anchor);
  if (bubble.style.top !== top) bubble.style.top = top;
  if (bubble.textContent !== copy) bubble.textContent = copy;
  bubble.classList.remove("world-bubble-hidden");
  state.lastSpeaker = name;
  state.worldBubbleMode = mode;
  if (mode === "dialogue") {
    state.dialogueBubbleUntil = Date.now() + dialoguePauseMs(text, "npcResponse") + 800;
  }
}

function syncDialoguePacingControls() {
  const controls = document.getElementById("dialogue-pacing-controls");
  const toggle = document.getElementById("dialogue-auto-toggle");
  const manualWaitPending = Boolean(state.dialogueAdvancePending && !state.autoAdvanceDialogue);
  if (toggle) toggle.checked = Boolean(state.autoAdvanceDialogue);
  if (controls) controls.classList.toggle("dialogue-manual-mode", !state.autoAdvanceDialogue);
  document.getElementById("game-screen")?.classList.toggle("dialogue-awaiting-click", manualWaitPending);
  if (typeof renderPlayerExperience === "function") renderPlayerExperience();
}

function syncDecisionSubmitButton() {
  if(typeof renderOpeningQuestionControls==="function")renderOpeningQuestionControls();
  const button = document.getElementById("submit-decision-btn");
  if (!button) return;
  button.disabled = Boolean(
    state.apiFatalError ||
    state.isIntroPlaying ||
    state.isScenePlaying ||
    state.isGmThinking ||
    state.activeEventLock ||
    (!state.selectedOption && !document.getElementById("free-response")?.value.trim()) ||
    !state.decisionPanelVisible
  );
}

function setDecisionPanelVisible(visible) {
  const panel = document.getElementById("decision-panel");
  if (!panel) return;
  panel.classList.toggle("panel-hidden", !visible);
  if (visible) {
    const holdsSourceDialogue = ["opening_response", "npc_followup"].includes(currentWindow()?.kind);
    if (!holdsSourceDialogue && typeof hideGalgameDialogue === "function") hideGalgameDialogue();
    if (typeof closeSideTalk === "function") closeSideTalk({preserveDialogue:true});
    else document.getElementById("side-talk-panel")?.classList.add("panel-hidden");
    document.getElementById("task-board-panel")?.classList.add("panel-hidden");
    document.getElementById("backpack-panel")?.classList.add("panel-hidden");
    state.activeSideTalkNpcId = null;
    clearProximityUi();
    if (typeof holdPlayerResponsePortraits === "function") holdPlayerResponsePortraits(currentWindow());
  }
  updateWorldActivityClasses();
}

function setWorldHelp(text) {
  const help = document.querySelector(".world-help");
  if (help) help.textContent = text;
}

function updateWorldActivityClasses() {
  const world = document.getElementById("pixel-world");
  if (world) {
    world.classList.toggle("world-waiting", Boolean(state.isIntroPlaying || state.isScenePlaying));
    world.classList.toggle("world-gm-thinking", Boolean(state.isGmThinking));
    world.classList.toggle("world-decision-active", Boolean(state.decisionPanelVisible));
    world.classList.toggle("world-side-talk-active", isSideTalkOpen());
    world.classList.toggle("world-backpack-active", isBackpackOpen());
  }
  syncDecisionSubmitButton();
  if (typeof syncGalgameDialogueLifecycle === "function") syncGalgameDialogueLifecycle();
  if (typeof syncPlayerNavigationLock === "function") syncPlayerNavigationLock();
  if (typeof renderPlayerExperience === "function") renderPlayerExperience();
  if (typeof renderAgentWaiting === "function") renderAgentWaiting();
}

function isSideTalkOpen() {
  const panel = document.getElementById("side-talk-panel");
  return Boolean(
    state.activeSideTalkNpcId && panel && !panel.classList.contains("panel-hidden")
  );
}

function isTaskBoardOpen() {
  const panel = document.getElementById("task-board-panel");
  return Boolean(panel && !panel.classList.contains("panel-hidden"));
}

function isBackpackOpen() {
  const panel = document.getElementById("backpack-panel");
  return Boolean(panel && !panel.classList.contains("panel-hidden"));
}

function isFreeExplorationActive() {
  return (
    state.screen === "game" &&
    !(typeof labDayHandoff !== "undefined" && labDayHandoff) &&
    !state.sessionClosed &&
    !state.finalOutcome &&
    !state.apiFatalError &&
    !state.activeEventLock &&
    !state.dialogueAdvancePending &&
    !(typeof isPlayerToolOpen === "function" && isPlayerToolOpen()) &&
    !state.isIntroPlaying &&
    !state.isScenePlaying &&
    !state.isGmThinking &&
    !state.decisionPanelVisible &&
    !isSideTalkOpen() &&
    !isTaskBoardOpen() &&
    !isBackpackOpen()
  );
}

function canOpenBackpack() {
  if(typeof labStoryRuntime!=="undefined"&&labStoryRuntime)return false;
  return (
    state.screen === "game" &&
    !(typeof labDayHandoff !== "undefined" && labDayHandoff) &&
    !state.sessionClosed &&
    !state.finalOutcome &&
    !state.apiFatalError &&
    !state.activeEventLock &&
    !state.dialogueAdvancePending &&
    !(typeof isPlayerToolOpen === "function" && isPlayerToolOpen()) &&
    !state.isIntroPlaying &&
    !state.isScenePlaying &&
    !state.isGmThinking &&
    !state.decisionPanelVisible &&
    !isSideTalkOpen() &&
    !isTaskBoardOpen() &&
    !isBackpackOpen()
  );
}

function clearProximityUi() {
  state.nearbyNpcId = null;
  state.nearbyProjectObjectId = null;
  const hint = document.getElementById("proximity-hint");
  if (hint) hint.classList.add("proximity-hint-hidden");
  if (state.lastSpeaker !== "Game Master") hideWorldBubbleIfNotProtected();
}

function setInteractionLockMessage() {
  if (state.isIntroPlaying) {
    setWorldHelp(state.language === "zh" ? "开场正在播放，请稍等。" : "Opening scene is playing. Please wait.");
  } else if (state.isScenePlaying) {
    setWorldHelp(state.language === "zh" ? "NPC 正在回应你的选择，请等待他们说完。" : "NPCs are responding to your choice. Please wait.");
  } else if (state.isGmThinking) {
    setWorldHelp(state.language === "zh" ? "正在准备接下来的交流，请稍等。" : "Preparing the next exchange. Please wait.");
  } else if (state.decisionPanelVisible) {
    setWorldHelp(currentWindow()?.kind === "opening_response"
      ? (state.language === "zh" ? "先回应当前的问题，再继续交流。" : "Reply to the current question before continuing.")
      : (state.language === "zh" ? "请先完成当前关键决策。" : "Please finish the current key decision first."));
  } else if (isSideTalkOpen()) {
    setWorldHelp(state.language === "zh" ? "请先完成或关闭当前单独对话。" : "Please finish or close the current private check-in first.");
  } else if (isTaskBoardOpen()) {
    setWorldHelp(state.language === "zh" ? "请先关闭当前任务板。" : "Please close the current task board first.");
  }
}

function phaseKeyFrom(phase) {
  const normalized = String(phase || "").toLowerCase();
  if (["entry", "进入小组", "进入支持团队", "进入志愿队伍", "阶段 1：临时入组"].includes(phase) || /entry|forced entry|进入|临时入组/.test(normalized)) return "entry";
  if (["Contribution", "贡献方式", "承接贡献", "认领角色", "承担角色", "阶段 2：第一项任务"].includes(phase) || /contribution|role|first task|第一项任务|贡献|认领|承担/.test(normalized)) return "contribution";
  if (["Coordination", "协调分工", "边界时刻", "隐私边界", "资源冲突", "阶段 3：修改与责任转移"].includes(phase) || /coordination|boundary|privacy|resource|revision|conflict|修改|责任|甩锅|协调|边界|隐私|资源/.test(normalized)) return "coordination";
  if (["Support", "支持他人", "照顾支持者", "工作量公平"].includes(phase) || /support|care|workload|支持|照顾|工作量/.test(normalized)) return "support";
  if (["Final Commitment", "最终承诺", "最终流程", "最终确认", "阶段 4：贡献分配"].includes(phase) || /final|commit|credit|最终|承诺|贡献分配/.test(normalized)) return "final";
  return "general";
}

function phaseFocusText(phaseKey) {
  const zh = {
    entry: "临时进入实验室的第一印象",
    contribution: "你如何完成第一项任务",
    coordination: "修改争执和责任边界",
    support: "在压力下保护健康参与",
    final: "贡献分配能否公平可见",
    general: "下一步实验室互动"
  };
  const en = {
    entry: "the first impression of entering the lab",
    contribution: "how you handle the first task",
    coordination: "revision conflict and responsibility boundaries",
    support: "protecting healthy participation under pressure",
    final: "whether credit allocation is fair and visible",
    general: "the next lab interaction"
  };
  return (state.language === "zh" ? zh : en)[phaseKey] || phaseKey;
}

function isDeepSeekModel(model) {
  return model === DEEPSEEK_FLASH_MODEL || model === DEEPSEEK_PRO_MODEL;
}

function deepSeekApiModel(model) {
  return model === DEEPSEEK_FLASH_MODEL ? DEEPSEEK_FLASH_MODEL : DEEPSEEK_PRO_MODEL;
}
