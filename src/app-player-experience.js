// Approved player UI: presentation only. No hidden scores, treatment selection,
// generated dialogue fallback, or changes to the stage/social prerequisite rules.
const PLAYER_UI_VERSION = "lab-entry-player-ui-v33";
const OPENING_CONTINUITY_VERSION="opening-question-continuity-v1";
let openingQuestionPending=null;
const PLAYER_UI_COPY = {
  en: {now:"Current action", stage:"Stage", journal:"Notes", guide:"Guide", settings:"Settings", notebook:"Notebook", history:"Dialogue history", people:"Members", next:"Next", close:"Close", own:"Use my own words", back:"Back to options", confirm:"Confirm reply", draft:"Topics fill a draft; only Send submits it.", send:"Send", reply:"Your reply", waiting:"Waiting for your response", opening:"How would you like to introduce yourself?", formal:"Having heard the situation, how would you like to participate in the lab?", known:"What you have heard", empty:"No conversation notes yet.", return:"Back to the lab", guideTitle:"Game goal and controls", skip:"Dismiss", guideAgain:"Press H to open this guide again.", walk:"Move closer to someone", walkBody:"Hold WASD or the arrow keys to walk, or click a clear place on the floor. Choose who you want to meet.", talk:"Start a conversation", talkBody:"Approach a member and press E, or click their character/name to walk over and talk. Topics fill a draft; Send submits it. After a reply, continue or end the exchange. When a group discussion is available, join when ready.", notes:"Keep the context nearby", notesBody:"J shows goals, members and dialogue you have already seen. B opens the shared computer. H opens this guide.", large:"Larger dialogue text", contrast:"High-contrast reading surface", motion:"Reduce decorative motion", hints:"Show operation hints", moveKeys:"Move", interactKeys:"Talk / interact", inputHint:"Ctrl / ⌘ + Enter to send; Enter adds a new line.", noRoute:"That place cannot be reached. Try a clear spot on the floor.", voice:"Voice settings", voiceNote:"Switch NPC voice on or off here. Changes apply to the next line; text remains available.", noSideStats:"Member profiles and conversation notes.", consentReply:"Choose a reply or write your own words.", loading:"Preparing the reply…", speakerMina:"Research advisor", speakerLeo:"Labmate", speakerSam:"Senior graduate student", speakerRiley:"Project lead", speakerNora:"Labmate"},
  zh: {now:"当前行动", stage:"阶段", journal:"笔记", guide:"指南", settings:"设置", notebook:"笔记本", history:"对话记录", people:"成员", next:"下一步", close:"关闭", own:"用自己的话回应", back:"返回选项", confirm:"确认回应", draft:"点选话题只填入草稿，确认发送后才会提交。", send:"发送", reply:"你的回应", waiting:"对话正在等待你", opening:"你想怎么介绍自己？", formal:"了解初步情况后，你希望以什么方式参与实验室的工作？", known:"你已经听到的信息", empty:"还没有对话记录。", return:"回到实验室", guideTitle:"游戏目标与操作", skip:"收起", guideAgain:"之后按 H 可再次查看。", walk:"先走近，认识一个人。", walkBody:"按住 WASD / 方向键连续移动，或直接点击空地。你可以自己选择先与谁交流。", talk:"靠近后，就能自然开口。", talkBody:"靠近成员后按 E，或点击人物 / 名字自动走近后交谈。话题先填入草稿，发送后才提交；收到回应后，可以继续问或结束交谈；可以参加小组讨论时，准备好再加入。", notes:"不记得了，就打开笔记。", notesBody:"J 查看目标、成员和你已经看到的对话；B 打开共享电脑；需要操作提示时按 H。", large:"大字号对话", contrast:"高对比阅读背景", motion:"减少界面装饰动态", hints:"显示操作提示", moveKeys:"移动", interactKeys:"交谈 / 互动", inputHint:"Ctrl / ⌘ + Enter 发送；Enter 换行。", noRoute:"暂时无法到达这里，请选择一处空地。", voice:"声音设置", voiceNote:"可随时开关角色语音；开启后从下一句生效，仍可正常阅读文字。", noSideStats:"这里保留成员的公开资料和已有的交流记录。", consentReply:"请选择一句回应，或用自己的话回答。", loading:"正在准备回应……", speakerMina:"指导教师", speakerLeo:"同组学生", speakerSam:"资深研究生", speakerRiley:"项目负责人", speakerNora:"同组学生"}
};
const PLAYER_GUIDE_STEPS = ["Start", "Talk", "Work", "Submit", "Notes", "Time"];
function playerUiText(key) { return PLAYER_UI_COPY[state.language === "zh" ? "zh" : "en"][key] || key; }
let playerTool = "", playerJournalTab = "now", playerGuideStep = 0, playerToolSavedAuto = null, playerOwnDraft = "", playerToolFocusBeforeOpen = null;
let playerUiPreferences = { large: false, contrast: false, motion: false, hints: true, dark: false };
try {
  const saved = JSON.parse(localStorage.getItem("socialevo_player_ui_v1") || "{}");
  for (const key of Object.keys(playerUiPreferences)) if (typeof saved[key] === "boolean") playerUiPreferences[key] = saved[key];
} catch (_error) { /* Cosmetic preferences never affect game readiness. */ }

function isPlayerToolOpen() { return Boolean(playerTool); }
function playerPresentationMetadata() { return {version: PLAYER_UI_VERSION,socialWorldVersion:typeof LabSocialWorldCore==='undefined'?null:LabSocialWorldCore.VERSION,replyChoicesVersion:ReplyOptionsAgentCore.VERSION,reviewEpisodeVersion:LabReviewEpisodeCore.VERSION,cooperationVersion:LabCooperationCore.VERSION,reviewMaterialsVersion:LabReviewMaterialsCore.VERSION,groupThreadVersion:LabGroupThreadCore.VERSION,workEvidenceVersion:LabMaterialEvidenceCore.VERSION,playstylePresentationVersion:"lab-playstyle-ui-v1", openingContinuityVersion:OPENING_CONTINUITY_VERSION,dialogueContinuityVersion:DIALOGUE_CONTINUITY_VERSION, shellVersion:"lab-entry-shell-v1", titleArtworkVersion:"lab-entry-cover-v2", preferences: {...playerUiPreferences},
  artVersion: currentScenario().id === "newcomer-circle" ? window.SocialEvoLabArt.version : null,
  stagePacingVersion:SocialEvoCore.STAGE_PACING_VERSION,workRevisionVersion:typeof LabWorkRevisionCore==='undefined'?null:LabWorkRevisionCore.VERSION,expressionDelivery:'validated-speech-result',workEpisodesVersion:typeof LabWorkEpisodeCore==='undefined'?null:LabWorkEpisodeCore.VERSION,entryConversationVersion:ENTRY_CONVERSATION_VERSION,npcContactVersion:NPC_CONTACT_VERSION,labSceneVersion:LAB_SCENE_VERSION,labRoutineVersion:LAB_ROUTINE_VERSION,labPoseArtVersion:window.SocialEvoLabPoses.version,labSceneScale:labSceneScale(),labDayVersion:LAB_DAY_VERSION,labEnvironmentVersion:LAB_ENVIRONMENT_VERSION,workspaceUiVersion:WORKSPACE_UI_VERSION,npcReadabilityVersion:NPC_READABILITY_VERSION,dialogueGroundingVersion:typeof LAB_DIALOGUE_GROUNDING_VERSION==='undefined'?null:LAB_DIALOGUE_GROUNDING_VERSION,bgmVersion:typeof LAB_BGM_VERSION==='undefined'?null:LAB_BGM_VERSION,recapVersion:typeof LabRecapCore==='undefined'?null:LabRecapCore.VERSION,labStoryVersion:LAB_STORY_VERSION,narrativeDay:labDayContext(),
  viewport: {width:window.innerWidth,height:window.innerHeight},
  navigation: typeof playerNavigationSnapshot === "function" ? {version:"player-navigation-v1",speedPxPerSecond:PLAYER_NAVIGATION_SPEED} : null,
  dialogueBudget: typeof privateConversationBudgetSnapshot === "function" ? privateConversationBudgetSnapshot() : null}; }
function applyPlayerUiPreferences() {
  const root = document.getElementById("game-screen");
  for (const key of Object.keys(playerUiPreferences)) {
    root?.classList.toggle(`ui-${key}`, playerUiPreferences[key]);
    const input = document.getElementById(`ui-pref-${key}`); if (input) input.checked = playerUiPreferences[key];
  }
  if (typeof renderShellUi === "function") renderShellUi();
}
function initializePlayerExperience() {
  const world = document.getElementById("pixel-world"), root = document.getElementById("game-screen");
  if (!world || !root || document.getElementById("ui-objective")) return;
  root.classList.add("player-experience");
  world.setAttribute("tabindex", "-1");
  const prompts = document.createElement("div"); prompts.id = "ui-world-prompts";
  const proximity = document.getElementById("proximity-hint"), help = world.querySelector(".world-help");
  if (proximity) prompts.append(proximity); if (help) prompts.append(help); world.append(prompts);
  const header = root.querySelector(":scope > .game-header");
  if (header) {
    world.prepend(header);
    const title = header.querySelector(":scope > div"); title?.classList.add("ui-brand");
    title?.insertAdjacentHTML("afterbegin", '<span class="ui-brand-mark" aria-hidden="true">L</span>');
    const goal = header.querySelector(".goal-strip");
    const objective = document.createElement("section"); objective.id = "ui-objective";
    objective.innerHTML = '<div class="ui-objective-heading"><span data-ux="now"></span><span id="ui-stage-count"></span></div><h3 id="ui-objective-title"></h3>';
    if (goal) { objective.append(goal); goal.querySelector("strong")?.setAttribute("hidden", ""); goal.querySelector(".eyebrow")?.setAttribute("hidden", ""); }
    const mainlineHud=document.getElementById('ui-mainline-hud');
    if(mainlineHud)mainlineHud.prepend(objective);else world.append(objective);
    const nav = document.createElement("nav"); nav.className = "ui-game-nav"; nav.setAttribute("aria-label", "Game menus");
    nav.innerHTML = '<button type="button" data-ui-tool="journal"><kbd>J</kbd><span data-ux="journal"></span></button><button type="button" data-ui-tool="guide"><kbd>H</kbd><span data-ux="guide"></span></button><button type="button" data-ui-tool="settings"><kbd>Esc</kbd><span data-ux="settings"></span></button>';
    header.append(nav);
  }
  const actions = document.createElement("div"); actions.className = "ui-speech-actions";
  const copy = world.querySelector(".galgame-dialogue-copy");
  const history = document.getElementById("dialogue-history-toggle"), pacing = document.getElementById("dialogue-pacing-controls");
  if (history) actions.append(history); if (pacing) actions.append(pacing);
  actions.insertAdjacentHTML("beforeend", '<button type="button" data-ui-tool="settings" data-ux="voice"></button>');
  copy?.append(actions);
  const advance = document.createElement("button"); advance.id = "ui-continue-dialogue"; advance.type = "button";
  advance.onclick = continueDialogueManually; actions.append(advance);
  const panel = document.getElementById("decision-panel");
  panel?.setAttribute("role", "dialog"); panel?.setAttribute("aria-labelledby", "decision-question");
  panel?.insertAdjacentHTML("afterbegin", '<div class="ui-response-caption"><span data-ux="reply"></span><small data-ux="waiting"></small></div>');
  const freeLabel = panel?.querySelector(".free-response-label"), free = document.getElementById("free-response");
  const editor = document.createElement("div"); editor.id = "ui-response-editor"; editor.hidden = true;
  if (freeLabel) editor.append(freeLabel); if (free) editor.append(free);
  editor.insertAdjacentHTML("beforeend", '<button type="button" id="ui-back-options" data-ux="back"></button>');
  const submit = document.getElementById("submit-decision-btn"); if (submit) panel.insertBefore(editor, submit);
  const own = document.createElement("button"); own.id = "ui-own-reply"; own.type = "button";
  own.onclick = () => {
    if(openingQuestionIsCurrent())openingQuestionPending.replyEditorTouched=true;
    editor.hidden = false; document.getElementById("decision-options").hidden = true; own.hidden = true;
    state.selectedOption = ""; state.selectedOptionIndex = -1;
    document.querySelectorAll("#decision-options .option-btn").forEach(button => { button.classList.remove("selected"); button.setAttribute("aria-pressed", "false"); });
    if (free) free.value = playerOwnDraft; syncDecisionSubmitButton(); free?.focus();
  };
  if (submit) panel.insertBefore(own, submit);
  const optionsStatus=document.createElement("p");optionsStatus.id="ui-reply-options-status";optionsStatus.hidden=true;panel.insertBefore(optionsStatus,editor);
  const openingNote=document.createElement("p");openingNote.id="ui-opening-reply-note";openingNote.hidden=true;panel.insertBefore(openingNote,editor);
  const openingLeave=document.createElement("button");openingLeave.id="ui-opening-defer";openingLeave.type="button";openingLeave.hidden=true;
  openingLeave.onclick=deferOpeningQuestion;panel.insertBefore(openingLeave,submit);
  document.getElementById("ui-back-options").onclick = () => { playerOwnDraft = free?.value || ""; if (free) free.value = ""; editor.hidden = true; document.getElementById("decision-options").hidden = false; own.hidden = false; syncDecisionSubmitButton(); };
  free?.addEventListener("input", () => {if(openingQuestionIsCurrent())openingQuestionPending.replyEditorTouched=true;syncDecisionSubmitButton();});
  const side = document.getElementById("side-talk-panel");
  side?.insertAdjacentHTML("beforeend", '<p class="ui-draft-note" data-ux="draft"></p><p class="ui-input-hint" data-ux="inputHint"></p>');
  document.getElementById("side-talk-input")?.addEventListener("input", () => { state.sideTalkDraftIntent = null; syncSideTalkSendButton(); });
  world.insertAdjacentHTML("beforeend", `
    <aside id="ui-journal" class="ui-tool-panel" hidden aria-labelledby="ui-journal-heading">
      <header><div><small>YOUR NOTEBOOK</small><h2 id="ui-journal-heading" data-ux="journal"></h2></div><button type="button" class="ui-tool-close" data-ui-close="true" aria-label="Close">×</button></header>
      <nav class="ui-journal-tabs" role="tablist"><button type="button" role="tab" data-ui-tab="now" data-ux="now"></button><button type="button" role="tab" data-ui-tab="people" data-ux="people"></button><button type="button" role="tab" data-ui-tab="history" data-ux="history"></button></nav>
      <div id="ui-journal-now"></div><div id="ui-journal-people" hidden></div><div id="ui-journal-history" hidden><p id="ui-history-empty"></p></div>
      <p class="ui-journal-note" data-ux="noSideStats"></p>
    </aside>
    <section id="ui-guide" class="ui-tool-panel ui-guide-panel" hidden aria-labelledby="ui-guide-title"><header><span data-ux="guideTitle"></span><button type="button" data-ui-close="true" data-ux="skip"></button></header><div class="ui-guide-progress" id="ui-guide-progress"></div><h2 id="ui-guide-title"></h2><p id="ui-guide-copy"></p><div class="ui-guide-keys"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span> / </span><kbd>E</kbd><kbd>J</kbd><kbd>B</kbd></div><footer><small data-ux="guideAgain"></small><button type="button" id="ui-guide-next" data-ux="next"></button></footer></section>
    <section id="ui-settings" class="ui-tool-panel ui-settings-panel" hidden aria-labelledby="ui-settings-title"><header><h2 id="ui-settings-title" data-ux="settings"></h2><button type="button" data-ui-close="true" aria-label="Close">×</button></header><label><span id="ui-auto-label"></span><input type="checkbox" id="ui-pref-auto"></label><label><span data-ux="large"></span><input type="checkbox" id="ui-pref-large"></label><label><span data-ux="contrast"></span><input type="checkbox" id="ui-pref-contrast"></label><label><span data-ux="motion"></span><input type="checkbox" id="ui-pref-motion"></label><label><span data-ux="hints"></span><input type="checkbox" id="ui-pref-hints"></label><label><span data-i18n="shellDarkReading"></span><input type="checkbox" id="ui-pref-dark"></label><p data-ux="voiceNote"></p></section>
    <footer class="ui-control-strip"><div class="ui-movement-hint"><kbd>WASD</kbd><span data-ux="moveKeys"></span><span class="ui-click-hint" data-i18n="shellClickMove"></span></div><button type="button" id="ui-workspace-button"><span data-i18n="shellWorkspace"></span><kbd>B</kbd></button></footer><div id="ui-walk-target" hidden aria-hidden="true"></div>`);
  const feed = document.getElementById("dialogue-feed"); if (feed) document.getElementById("ui-journal-history").append(feed);
  document.querySelectorAll("[data-ui-tool]").forEach(button => button.addEventListener("click", () => openPlayerTool(button.dataset.uiTool)));
  for (const panel of world.querySelectorAll(".ui-tool-panel")) {
    panel.setAttribute("role","dialog");panel.setAttribute("aria-modal","true");
  }
  document.querySelectorAll("[data-ui-close]").forEach(button => button.addEventListener("click", closePlayerTool));
  document.querySelectorAll("[data-ui-tab]").forEach(button => button.addEventListener("click", () => { playerJournalTab = button.dataset.uiTab; renderPlayerJournal(); }));
  document.getElementById("ui-guide-next").onclick = () => { if (playerGuideStep >= PLAYER_GUIDE_STEPS.length - 1) closePlayerTool(); else { playerGuideStep++; renderPlayerExperience(); } };
  document.getElementById("ui-workspace-button").onclick = () => openBackpack();
  document.getElementById("ui-pref-auto").onchange = event => {
    playerToolSavedAuto = null; setDialogueAutoAdvance(event.target.checked, {source:"ui_settings"});
  };
  for (const key of Object.keys(playerUiPreferences)) document.getElementById(`ui-pref-${key}`).onchange = event => {
    playerUiPreferences[key] = event.target.checked; applyPlayerUiPreferences();
    try { localStorage.setItem("socialevo_player_ui_v1", JSON.stringify(playerUiPreferences)); } catch (_error) {}
  };
  world.addEventListener("click", event => {
    if (event.defaultPrevented || event.target.closest("button,input,textarea,select,label,a,.ui-tool-panel,#ui-mainline-hud,#ui-stage-entry,#ui-lab-story,#ui-lab-time,#ui-day-handoff,#ui-lab-core-handoff,#ui-entry-episode,#ui-private-continuation,.world-decision-panel,.side-talk-panel,.backpack-panel,.task-board-panel,.galgame-dialogue-copy,.expression-dock") || !isFreeExplorationActive()) return;
    const box = world.getBoundingClientRect();
    walkPlayerFromPointer({x: (event.clientX - box.left) / box.width * 100, y: (event.clientY - box.top) / box.height * 100});
  });
  applyPlayerUiPreferences(); renderPlayerExperience();
}
function closePlayerTool() {
  const wasOpen=Boolean(playerTool);
  if (playerToolSavedAuto !== null) { const saved = playerToolSavedAuto; playerToolSavedAuto = null; setDialogueAutoAdvance(saved, {source:"ui_tool_close"}); }
  playerTool = ""; for (const name of ["journal", "guide", "settings"]) { const node = document.getElementById(`ui-${name}`); if (node) node.hidden = true; }
  const history = document.getElementById("dialogue-history-toggle"); history?.setAttribute("aria-expanded", "false");
  if (playerToolFocusBeforeOpen?.isConnected && playerToolFocusBeforeOpen.getClientRects().length) playerToolFocusBeforeOpen.focus({preventScroll:true});
  playerToolFocusBeforeOpen = null;
  // Opening the journal/guide/settings temporarily hides mainline entries.
  // Closing must restore them from current state, not wait for another event.
  if(wasOpen&&state.screen==='game'){updateWorldActivityClasses();updateProximityInteraction();}
}
function openPlayerTool(name, tab = "now") {
  if (state.screen !== "game" || !["journal", "guide", "settings"].includes(name)) return;
  const opener = document.activeElement;
  cancelPointerWalk(); closePlayerTool(); playerToolFocusBeforeOpen = opener; playerTool = name; playerJournalTab = tab; playerGuideStep = 0;
  document.getElementById(`ui-${name}`).hidden = false;
  if (state.dialogueAdvancePending && state.autoAdvanceDialogue) { playerToolSavedAuto = true; setDialogueAutoAdvance(false, {source:"ui_tool_open"}); }
  if (name === "journal") document.getElementById("dialogue-history-toggle")?.setAttribute("aria-expanded", String(tab === "history"));
  renderPlayerExperience();
  document.querySelector(`#ui-${name} [data-ui-close]`)?.focus({preventScroll:true});
}
function renderPlayerExperience() {
  if (typeof renderVoiceModalityConfig === 'function') renderVoiceModalityConfig();
  if (typeof syncLabBgm === 'function') syncLabBgm();
  if (!document.getElementById("ui-objective")) return;
  document.querySelectorAll("[data-ux]").forEach(node => { node.textContent = playerUiText(node.dataset.ux); });
  const stage = currentStage(), stageNo = Math.min(scenarioStages().length, Math.max(1, Number(state.stageIndex || 0) + 1));
  document.getElementById("ui-stage-count").textContent = labDayContext()?.label || "";
  document.getElementById("round-label").textContent = currentWindow()?.kind === "opening_response"
    ? playerUiText("reply") : labDayContext()?.label || playerUiText("now");
  if(labDayHandoff)document.getElementById("round-label").textContent=`Day ${labDayHandoff.notice.fromDay} → Day ${labDayHandoff.notice.toDay}`;
  const required = currentRequiredWorkspaceTask();
  document.getElementById("ui-objective-title").textContent = entryEpisodeChoicePending() ? (entryEpisodeState().receiptViewedAt
    ? (state.language==="zh"?"准备首次核查":"Prepare for the first review") : (state.language==="zh"?"查看起步记录":"Review your starting arrangement"))
    : isEntryEpisodeStage() && state.openingResponseAnswered && !entryEpisodeState().scopeReviewed ? (state.language==="zh"?"了解起步范围":"Understand the starting scope")
    : stageKeyDecisionReady() ? t("shellNextDiscussion")
    : required ? scenarioText(required.template.title,required.taskId)
      : stageNo === 1 ? t("shellMeetMembers") : scenarioText(stage?.title, playerUiText("now"));
  const requiredMaterial=typeof stageMissingRequiredMaterial==='function'?stageMissingRequiredMaterial():null;
  if(requiredMaterial){document.getElementById('ui-objective-title').textContent=state.language==='zh'?'查看讨论材料':'Review the discussion material';document.getElementById('current-objective').textContent=stageRequiredMaterialText(requiredMaterial);if(!state.activeEventLock&&!state.isScenePlaying&&!state.isGmThinking&&!state.dialogueAdvancePending)setWorldHelp(stageRequiredMaterialText(requiredMaterial));}
  document.getElementById("ui-own-reply").textContent = playerUiText("own");
  document.getElementById("submit-decision-btn").textContent = playerUiText("confirm");
  document.getElementById("submit-side-talk-btn").textContent = playerUiText("send");
  document.getElementById("ui-auto-label").textContent = state.language === "zh" ? "自动推进对话" : "Advance dialogue automatically";
  document.getElementById("ui-pref-auto").checked = state.autoAdvanceDialogue;
  const advance = document.getElementById("ui-continue-dialogue");
  if (advance) { advance.textContent = state.language === "zh" ? "继续 · 空格" : "Continue · Space"; advance.hidden = Boolean(!state.dialogueAdvancePending || state.autoAdvanceDialogue); }
  const guide = "shellGuide" + PLAYER_GUIDE_STEPS[playerGuideStep];
  document.getElementById("ui-guide-title").textContent = t(guide);
  document.getElementById("ui-guide-copy").textContent = t(guide + "Body");
  document.getElementById("ui-guide-progress").textContent = `${playerGuideStep + 1} / ${PLAYER_GUIDE_STEPS.length}`;
  document.getElementById("ui-guide-next").textContent = playerUiText(playerGuideStep === PLAYER_GUIDE_STEPS.length - 1 ? "return" : "next");
  if (playerTool === "journal") renderPlayerJournal();
  if (typeof renderPrivateConversationControls === "function") renderPrivateConversationControls();
  if (typeof renderStagePacingControls === "function") renderStagePacingControls();
  renderOpeningQuestionControls();
  if(typeof renderLabEnvironment==='function')renderLabEnvironment();
  if(typeof renderLabTimeControls==="function")renderLabTimeControls();
  if(typeof syncWorkspaceSubmitAvailability==='function')syncWorkspaceSubmitAvailability();
  if(typeof syncProjectWorkflowAvailability==='function')syncProjectWorkflowAvailability();
  if(typeof syncCreditWorkflowAvailability==='function')syncCreditWorkflowAvailability();
  if(typeof renderReviewEpisode==='function')renderReviewEpisode();
  if(typeof renderLabStoryControls==="function")renderLabStoryControls();
  if(typeof renderLabCoreHandoff==="function")renderLabCoreHandoff();
  const root = document.getElementById("game-screen"); root.classList.toggle("ui-side-composer", isSideTalkOpen());
  if (typeof renderShellUi === "function") renderShellUi();
  renderEntryEpisodeControls();
  if(typeof renderTechnicalStopRecovery==='function')renderTechnicalStopRecovery();
  if(typeof reviewEpisodeSnapshot==='function'){
    const episode=reviewEpisodeSnapshot();if(episode&&!requiredMaterial){const copy=REVIEW_EPISODE_COPY[state.language]||REVIEW_EPISODE_COPY.en;
      document.getElementById('ui-objective-title').textContent=episode.phase==='handoff'?(state.language==='zh'?'查看回应，再确认交接':'Review replies, then confirm handoff'):copy.title;
      document.getElementById('current-objective').textContent=copy.notes[episode.phase];
    }
  }
  if(innerWidth<=760){const objective=document.getElementById("ui-objective"),room=document.getElementById("pixel-world");
    if(objective.getBoundingClientRect().height>0)room.style.setProperty('--lab-objective-bottom',`${objective.getBoundingClientRect().bottom-room.getBoundingClientRect().top+14}px`);}
}
function renderPlayerJournal() {
  for (const tab of ["now", "people", "history"]) document.getElementById(`ui-journal-${tab}`).hidden = tab !== playerJournalTab;
  document.querySelectorAll("[data-ui-tab]").forEach(button => button.setAttribute("aria-selected", String(button.dataset.uiTab === playerJournalTab)));
  document.getElementById("ui-history-empty").textContent = playerUiText("empty");
  document.getElementById("ui-history-empty").hidden = state.dialogueHistory.length > 0;
  const now = document.getElementById("ui-journal-now"); now.replaceChildren();
  const title = document.createElement("h3"); title.textContent = scenarioText(currentStage()?.title, playerUiText("now"));
  const objective = document.createElement("p"); objective.textContent = document.getElementById("current-objective")?.textContent || "";
  const known = document.createElement("h4"); known.textContent = playerUiText("known"); now.append(title, objective);
  const requiredMaterial=typeof stageMissingRequiredMaterial==='function'?stageMissingRequiredMaterial():null;
  if(requiredMaterial){const owner=stagePacingToken(),button=document.createElement('button');button.id='ui-journal-open-required-material';button.type='button';button.textContent=state.language==='zh'?`打开“${requiredMaterial.title}”`:`Open "${requiredMaterial.title}"`;button.onclick=()=>{if(owner!==stagePacingToken())return;closePlayerTool();void openStageRequiredMaterial();};now.append(button);}
  now.append(known);
  if(openingQuestionIsCurrent()&&openingQuestionPending.deferred){
    const question=openingQuestionPending,button=document.createElement('button');button.id='ui-journal-resume-question';button.type='button';
    button.textContent=state.language==='zh'?`接着回应 ${question.npcName}`:`Continue replying to ${question.npcName}`;
    button.onclick=()=>{if(openingQuestionPending!==question||!openingQuestionIsCurrent())return;closePlayerTool();resumeOpeningQuestion();};now.append(button);
  }
  const delivered = state.dialogueHistory.filter(entry => entry.visibility !== "private").slice(-3);
  for (const entry of delivered) { const p = document.createElement("p"); p.textContent = `${speakerDisplayName(entry.name)}: ${entry.text}`; now.append(p); }
  if (!delivered.length) { const p = document.createElement("p"); p.textContent = playerUiText("empty"); now.append(p); }
  const people = document.getElementById("ui-journal-people"); people.replaceChildren();
  if(typeof renderSocialPeople==='function'){renderSocialPeople(people);return;}
  const roles = {mina:"speakerMina",leo:"speakerLeo",sam:"speakerSam",riley:"speakerRiley",nora:"speakerNora"};
  for (const npc of state.npcs) {
    const row = document.createElement("article"), img = document.createElement("img"), copy = document.createElement("div"), name = document.createElement("strong"), role = document.createElement("p"), talk = document.createElement("button");
    img.src = galgamePortraitUrl(npc.id, "neutral"); img.alt = ""; name.textContent = npc.name; role.textContent = playerUiText(roles[npc.id]);
    talk.type = "button"; talk.textContent = playerUiText("interactKeys"); talk.onclick = () => { closePlayerTool(); approachNpcForConversation(npc); };
    copy.append(name, role); row.append(img, copy, talk); people.append(row);
  }
}
function resetPlayerResponsePresentation() {
  playerOwnDraft = "";
  const editor = document.getElementById("ui-response-editor"), own = document.getElementById("ui-own-reply");
  if (editor) editor.hidden = true; if (own) own.hidden = false;
  document.getElementById("decision-options").hidden = false;
  document.getElementById("pixel-world").dataset.responseKind = currentWindow()?.kind || "key_decision";
  renderPlayerExperience();
}
function holdPlayerResponsePortraits(decision) {
  if (!["opening_response", "npc_followup"].includes(decision?.kind)) return;
  const npc = state.npcs.find(item => item.id === decision.sourceNpcId); if (!npc) return;
  const seen = state.dialogueHistory.filter(entry => entry.name === npc.name).at(-1);
  showGalgameDialogue(npc.name, decision.sourceDialogue || decision.question, seen?.emotion || "neutral", seen?.tone || "neutral");
  if (galgameDialogueFallbackTimer) window.clearTimeout(galgameDialogueFallbackTimer);
  galgameDialogueFallbackTimer = null;
}
function syncSideTalkSendButton() {
  const input = document.getElementById("side-talk-input"), button = document.getElementById("submit-side-talk-btn");
  if (button) button.disabled = Boolean(!input?.value.trim() || state.activeEventLock || state.isScenePlaying || state.apiFatalError);
  const close = document.getElementById("close-side-talk-btn");
  if (close) close.disabled = Boolean(isSideTalkOpen() && (state.activeEventLock || state.isScenePlaying || state.dialogueAdvancePending));
  const submitting = Boolean(isSideTalkOpen() && state.activeEventLock);
  if (input) input.readOnly = submitting;
  document.querySelectorAll('#side-talk-options button').forEach(option => { option.disabled = submitting; });
}
function cancelPointerWalk() { if (typeof stopPlayerNavigation === "function") stopPlayerNavigation("ui_interrupt"); }
async function walkPlayerFromPointer(point) {
  return navigatePlayerTo(point);
}
function handlePlayerExperienceKey(event) {
  if (state.screen !== "game" || event.defaultPrevented || event.isComposing) return false;
  const target = event.target, typing = target?.matches?.("input,textarea,select,[contenteditable='true']");
  if (playerTool && event.key === "Tab") {
    const panel=document.getElementById(`ui-${playerTool}`);
    const focusable=[...panel.querySelectorAll('button,input,textarea,select,[tabindex="0"]')].filter(node=>!node.disabled&&node.getClientRects().length);
    const first=focusable[0],last=focusable[focusable.length-1];
    if(event.shiftKey&&document.activeElement===first) {event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&document.activeElement===last) {event.preventDefault();first?.focus();}
    return true;
  }
  if (event.key === "Escape" && !event.altKey && !event.ctrlKey && !event.metaKey) {
    if(typeof labStoryRuntime!=="undefined"&&labStoryRuntime){event.preventDefault();cancelLabStory();return true;}
    if(npcContactRuntime||npcContactFailureCurrent()){event.preventDefault();cancelNpcFirstContact();return true;}
    event.preventDefault(); if (playerTool) closePlayerTool(); else if ((state.pendingDecision?.openingContinuation||state.pendingDecision?.publicContinuation)) deferOpeningQuestion(); else if (isSideTalkOpen()) closeSideTalk(); else if (typeof isPrivateContinuationOpen === "function" && isPrivateContinuationOpen()) finishPrivateConversation(); else if (isBackpackOpen()) closeBackpack(); else if (isTaskBoardOpen()) closeTaskBoard(); else openPlayerTool("settings"); return true;
  }
  if (typing) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault(); if (target.id === "side-talk-input" && !document.getElementById("submit-side-talk-btn").disabled) submitSideTalkFreeText(); else if (target.id === "free-response" && !document.getElementById("submit-decision-btn").disabled) submitDecision();
    }
    return true;
  }
  // Native action-button activation and panel scrolling are not game movement
  // or a request to advance a manually paced line of dialogue.
  if(target?.closest?.('#ui-mainline-hud')&&['Enter',' ','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key))return true;
  if (event.altKey || event.ctrlKey || event.metaKey) return true;
  const key = event.key.toLowerCase();
  if (["j", "h"].includes(key)) { event.preventDefault(); openPlayerTool(key === "j" ? "journal" : "guide"); return true; }
  if (playerTool) return true;
  if (state.decisionPanelVisible) {
    if (!document.getElementById("ui-response-editor").hidden) return true;
    if (/^[1-9]$/.test(event.key)) { event.preventDefault(); document.querySelectorAll("#decision-options .option-btn")[Number(event.key)-1]?.click(); return true; }
    if (event.key === "Enter") { event.preventDefault(); if (!document.getElementById("submit-decision-btn").disabled) submitDecision(); return true; }
  }
  if (state.dialogueAdvancePending && !state.autoAdvanceDialogue && ["Enter", " "].includes(event.key)) {
    event.preventDefault(); continueDialogueManually(); return true;
  }
  if (typeof handlePlayerNavigationKey === "function" && handlePlayerNavigationKey(event)) return true;
  return false;
}

function showOpeningResponseWindow() {
  const candidate = getDecisionWindows()[0], npc = state.npcs.find(item => item.id === "mina") || state.npcs[0];
  const last = state.dialogueHistory.filter(entry => entry.name === npc?.name).at(-1);
  state.pendingDecision = {...candidate, kind:"opening_response", source:"opening_presentation", sourceNpcId:npc?.id,
    sourceNpcName:npc?.name, sourceDialogue:last?.text || playerUiText("opening"), question:isEntryEpisodeStage()
      ? (state.language==="zh"?"你想先了解什么，或先说明自己的情况？":"What would you like to understand first, or say about your arrival?") : playerUiText("opening")};
  const zh=state.language==='zh';
  const introductions=[
    {label:{en:'Explain the transfer and ask about the project.',zh:'说明转组情况，先了解项目。'},utterance:{en:'I have just been transferred here and do not know the project yet. Could you explain what the lab is working on?',zh:'我刚被转到这里，对项目还不熟悉。能先介绍一下目前在做什么吗？'}},
    {label:{en:'Ask about a bounded starting role.',zh:'先问清可以承担的范围。'},utterance:{en:'I would like to contribute, but I need to understand the materials and responsibilities before promising a task.',zh:'我愿意参与，但想先了解材料和责任范围，再决定能承担什么。'}},
    {label:{en:'Acknowledge the unexpected arrival.',zh:'承认突然到来的尴尬，先听情况。'},utterance:{en:'I know this transfer was unexpected. I would like to hear the situation first rather than make assumptions.',zh:'我知道这次转组很突然。我想先听清楚这里的情况，不急着作承诺。'}},
    {label:{en:'Listen before choosing a role.',zh:'先听安排，再表达自己的想法。'},utterance:{en:'I would like to hear how the work is currently organized, then explain where I may be able to help.',zh:'我想先听听目前的工作怎么安排，再说说我可能从哪里帮忙。'}}
  ];
  state.pendingDecision.options=introductions.map(item=>scenarioText(item.label));
  state.pendingDecision.optionMeta=introductions.map((item,index)=>({id:`opening-introduction-${index}`,utterance:item.utterance}));
  state.decisionPanelVisible = true;
  renderDecisionPanel(state.pendingDecision); setDecisionPanelVisible(true);
  setWorldHelp(playerUiText("consentReply"));
}
function openingQuestionIsCurrent(){
  const p=openingQuestionPending;
  return Boolean(p&&p.epoch===state.sessionEpoch&&p.stageId===currentStage()?.id&&
    !state.sessionClosed&&!state.apiFatalError&&!state.finalOutcome);
}
function resetOpeningQuestionRuntime(){
  openingQuestionPending=null;
  cancelInactiveReplyOptionsRequests();document.getElementById("ui-reply-options-status")?.setAttribute("hidden","");
  if((state.pendingDecision?.openingContinuation||state.pendingDecision?.publicContinuation)){state.pendingDecision=null;state.decisionPanelVisible=false;document.getElementById("decision-panel")?.classList.add("panel-hidden");}
  document.getElementById("pixel-world")?.removeAttribute("data-opening-continuation");
  for(const id of ["ui-opening-defer","ui-opening-reply-note"]){const node=document.getElementById(id);if(node)node.hidden=true;}
}
function renderOpeningQuestionControls(){
  const active=Boolean(openingQuestionIsCurrent()&&(state.pendingDecision?.openingContinuation||state.pendingDecision?.publicContinuation)&&state.decisionPanelVisible),zh=state.language==="zh";
  if(!active)document.getElementById("ui-reply-options-status")?.setAttribute("hidden","");
  const world=document.getElementById("pixel-world");if(world)world.toggleAttribute("data-opening-continuation",active);
  const button=document.getElementById("ui-opening-defer"),note=document.getElementById("ui-opening-reply-note");
  if(button){button.hidden=!active;button.textContent=zh?"先去看看 · Esc":"Explore first · Esc";button.disabled=Boolean(state.activeEventLock||state.isScenePlaying||state.dialogueAdvancePending);}
  if(note){note.hidden=!active;note.textContent=zh?`回应 ${openingQuestionPending?.npcName||""} · 这段交流会被在场成员听到`:`Reply to ${openingQuestionPending?.npcName||""} · This exchange is heard by the room`;}
  const label=document.querySelector("#ui-response-editor label [data-i18n]");
  if(label)label.textContent=active?(zh?"你想怎么回应？":"What would you like to say?"):t(label.dataset.i18n);
  if(active&&world){const copy=document.querySelector(".galgame-dialogue-copy"),room=world.getBoundingClientRect();
    if(copy&&copy.getBoundingClientRect().height>0)world.style.setProperty("--opening-reply-bottom",`${Math.max(180,room.bottom-copy.getBoundingClientRect().top+12)}px`);}
  const free=document.getElementById("free-response");if(free)free.readOnly=Boolean(active&&(state.activeEventLock||state.isScenePlaying));
  if(active){document.getElementById("submit-decision-btn").textContent=playerUiText("send");document.getElementById("ui-back-options").hidden=!state.pendingDecision.options?.length;document.getElementById("ui-own-reply").textContent=zh?"自定义回答":"Custom reply";}
  else {const back=document.getElementById("ui-back-options");if(back)back.hidden=false;}
}
function resumeOpeningQuestion({fromDeliveredOpening=false}={}){
  if(!openingQuestionIsCurrent())return false;
  const p=openingQuestionPending,source=state.eventLedger.find(e=>e.eventId===p.eventId);
  const lockOk=!state.activeEventLock||state.activeEventLock.eventId===p.eventId;
  const voiceBusy=state.voiceModality?.enabled&&["loading","buffering","speaking"].includes(state.voiceModality.status);
  const directHandoff=fromDeliveredOpening&&source?.status==="committed"&&lockOk&&!state.isIntroPlaying&&!state.isGmThinking&&
    !state.decisionPanelVisible&&!state.dialogueAdvancePending&&!voiceBusy&&!isSideTalkOpen()&&!isBackpackOpen()&&!isTaskBoardOpen()&&!isPlayerToolOpen();
  if(!entryEpisodeSafeBoundary()&&!directHandoff)return false;
  const actual=source?.status==='committed'&&source.sessionEpoch===state.sessionEpoch&&source.audience?.visibility==='group'&&source.dialogueDeliveries?.some(d=>d.npcId===p.npcId&&d.status==='delivered'&&d.text===p.dialogue);
  const replySource=actual?replyOptionsSource(p.eventId,p.npcId,p.dialogue):null;
  const choices=replyOptionsRows(replySource);
  state.pendingDecision={kind:p.kind==="public"?"npc_followup":"opening_response",source:p.kind==="public"?"public_story_continuation":"opening_question_continuation",openingContinuation:p.kind!=="public",publicContinuation:p.kind==="public",
    type:currentStageLabel(),question:p.dialogue,sourceDialogue:p.dialogue,sourceNpcId:p.npcId,sourceNpcName:p.npcName,
    rootEventId:p.rootEventId,parentEventId:p.eventId,options:choices.map(c=>c.label),optionMeta:choices.map((c,i)=>({id:`reply-branch-${i}`,utterance:c.utterance,sourceQuote:c.sourceQuote})),gmNote:""};
  p.deferred=false;state.isScenePlaying=false;state.decisionPanelVisible=true;
  renderDecisionPanel(state.pendingDecision);setDecisionPanelVisible(true);
  const editor=document.getElementById("ui-response-editor"),free=document.getElementById("free-response"),custom=Boolean(!choices.length||p.customEditor||p.draft);
  editor.hidden=!custom;document.getElementById("ui-own-reply").hidden=custom;document.getElementById("decision-options").hidden=custom;
  free.value=p.draft;playerOwnDraft=p.draft||p.ownDraft||'';free.placeholder=state.language==="zh"?`直接回应 ${p.npcName}，或接着问你想了解的事。`:`Reply to ${p.npcName}, or ask what you would like to know.`;
  if(!custom&&Number.isInteger(p.selectedReplyIndex))document.querySelectorAll('#decision-options .option-btn')[p.selectedReplyIndex]?.click();
  if(replySource){state.pendingDecision.replyOptionsCacheKey=replyOptionsEntry(replySource)?.status==='ready'?replySource.key:'';requestReplyOptions(replySource);replyOptionsStatus(document.getElementById("ui-reply-options-status"),replySource);}
  syncDecisionSubmitButton();renderOpeningQuestionControls();(custom?free:document.querySelector('#decision-options .option-btn'))?.focus({preventScroll:true});
  return true;
}
function deferOpeningQuestion(){
  if(!openingQuestionIsCurrent()||!(state.pendingDecision?.openingContinuation||state.pendingDecision?.publicContinuation)||state.activeEventLock||state.isScenePlaying||state.dialogueAdvancePending)return false;
  const p=openingQuestionPending;p.draft=document.getElementById("free-response").value;p.ownDraft=playerOwnDraft;p.customEditor=!document.getElementById('ui-response-editor').hidden;p.selectedReplyIndex=state.selectedOptionIndex;p.deferred=true;p.reminderDismissed=false;cancelInactiveReplyOptionsRequests();
  const source=state.eventLedger.find(e=>e.eventId===p.eventId);if(source)source.metadata.openingQuestionDeferredAt=new Date().toISOString();
  state.pendingDecision=null;state.decisionPanelVisible=false;state.isScenePlaying=false;if(p.kind!=="public"&&!entryEpisodeState().scopeReviewed)entryEpisodeState().guide="offered";
  setDecisionPanelVisible(false);hideGalgameDialogue();updateWorldActivityClasses();setWorldHelp(p.kind==="public"?(labStoryNextAction()||nextStepText()):entryEpisodeNextAction());return true;
}
function openingReplyInvitesAnswer(text,npcId){
  const value=String(text||"").trim();
  if(!value||isAddressedToAnotherNpc(value,npcId))return false;
  if(/[?？]/u.test(value)&&/(你|新人|同学|you\b|your|想先|what|which|how)/i.test(value))return true;
  return /你(?:想|希望|更想|准备|打算|觉得|认为|需要).{0,24}(?:哪|什么|怎么|是否)/u.test(value)
    || /你.{0,28}(?:愿不愿意|要不要|能不能|可不可以|吗|呢)(?:[。！.]|$)/u.test(value)
    || /(?:^|[.!]\s*)(?:what|which|how|would|could|do|are|can|will)\b.{0,22}\byou\b/i.test(value);
}
function offerOpeningQuestion(npc,update,event){
  const delivered=event.dialogueDeliveries?.find(d=>d.channel==="opening_response_npc"&&d.npcId===npc.id&&d.status==="delivered");
  if(!isEntryEpisodeStage()||event.type!=="opening_response"||event.audience?.visibility!=="group"||event.sessionEpoch!==state.sessionEpoch||event.status!=="committed"||!delivered||!openingReplyInvitesAnswer(delivered.text,npc.id))return false;
  openingQuestionPending={npcId:npc.id,npcName:npc.name,dialogue:delivered.text,eventId:event.eventId,
    rootEventId:event.rootEventId||event.eventId,epoch:state.sessionEpoch,stageId:currentStage()?.id,draft:"",deferred:false};
  event.metadata.openingContinuityVersion=OPENING_CONTINUITY_VERSION;event.metadata.openingQuestionOfferedAt=new Date().toISOString();
  return resumeOpeningQuestion({fromDeliveredOpening:true});
}
async function submitOpeningResponse(window, answer, event) {
  const npc = state.npcs.find(item => item.id === window.sourceNpcId);
  if (!npc) throw new Error("opening source NPC missing");
  state.isScenePlaying = true; updateWorldActivityClasses();
  setWorldHelp(playerUiText("loading"));
  // Validated three-field real NPC speech, never a canned demo response. No
  // appraisal/evolution proposals, stage advance, consultation credit or extra
  // counted StoryBeat: this is a sub-turn of the shared opening scene.
  const update = await callNpcApi(npc, answer, window.openingContinuation?"Opening question response":"Opening introduction",
    {openingPresentation:true,...(window.openingContinuation?{openingContinuation:true,openingQuestion:window.sourceDialogue}:{})});
  currentEpochOrThrow(event.sessionEpoch);
  event.metadata.presentationUnit = `opening-${state.sessionId}`;
  event.metadata.countedSeparatelyAsStoryBeat = false;
  SocialEvoCore.recordDialogueGenerated(event, [
    {deliveryId:`${event.eventId}-opening-player`, speaker:"You", text:answer, channel:"opening_response_player"},
    {deliveryId:`${event.eventId}-opening-npc`, speaker:npc.name, npcId:npc.id, text:update.dialogue, channel:"opening_response_npc"}
  ]);
  commitRuntimeEvent(event, [], () => {
    if(window.openingContinuation){const parent=state.eventLedger.find(e=>e.eventId===window.parentEventId);if(parent)parent.metadata.openingQuestionAnsweredByEventId=event.eventId;openingQuestionPending=null;}
    state.openingResponseAnswered = true; state.pendingDecision = null; state.decisionPanelVisible = false;
    state.log.push({type:"Opening presentation response", eventId:event.eventId, round:window.type, summary:answer,
      npc:npc.name, presentationVersion:PLAYER_UI_VERSION, stageAdvanced:false, timestamp:new Date().toISOString()});
    return {presentationOnly:true, npcId:npc.id};
  });
  setDecisionPanelVisible(false);cancelInactiveReplyOptionsRequests();document.getElementById("ui-reply-options-status")?.setAttribute("hidden","");
  addDialogue("You", "#222831", answer, "responsive", "opening introduction", {eventId:event.eventId,channel:"opening_response_player"});
  SocialEvoCore.markDialogueDelivered(event,{deliveryId:`${event.eventId}-opening-player`});
  await waitForDialogueAdvance(answer,"playerDecision");
  currentEpochOrThrow(event.sessionEpoch);
  addDialogue(npc.name,npc.color,update.dialogue,update.emotion,update.tone,{eventId:event.eventId,channel:"opening_response_npc"});
  SocialEvoCore.markDialogueDelivered(event,{deliveryId:`${event.eventId}-opening-npc`});
  await waitForDialogueAdvance(update.dialogue,"opening");
  currentEpochOrThrow(event.sessionEpoch);
  // Hand off directly from speech to reply, before any free-exploration
  // lifecycle hides the portrait or flashes the tutorial for a frame.
  // A real answered sub-turn still changes the presented context. Offering
  // another question must not bypass the readiness refresh forever.
  void scheduleStageProgressCheck('opening response actually delivered');
  if(offerOpeningQuestion(npc,update,event)){refreshGameHud();return;}
  state.isScenePlaying = false; updateWorldActivityClasses(); refreshGameHud();
  setWorldHelp(currentStageConsultationCue()); updateProximityInteraction();
  void scheduleStageProgressCheck('opening introduction delivered');
}
window.addEventListener("resize",()=>{if(openingQuestionIsCurrent())renderOpeningQuestionControls();});
initializePlayerExperience();
