// DOM event wiring and startup flow. Load this after all runtime modules.
document.getElementById("start-config-btn").addEventListener("click", () => {
  if (!state.briefAcknowledged) {
    openStudyBrief();
    return;
  }
  openSingleGameConfig();
});

document.getElementById("select-newcomer-game-btn").addEventListener("click", () => {
  openSingleGameConfig();
});

document.getElementById("select-peer-support-game-btn").addEventListener("click", () => {
  openSingleGameConfig();
});

document.getElementById("select-community-volunteer-game-btn").addEventListener("click", () => {
  openSingleGameConfig();
});

function openSingleGameConfig() {
  selectScenario("newcomer-circle");
}

function selectScenario(scenarioId) {
  const playableIds = window.SocialEvoScenarios.playableScenarioIds || ["newcomer-circle"];
  state.scenarioId = playableIds.includes(scenarioId) && scenarioSpecs[scenarioId] ? scenarioId : "newcomer-circle";
  document.querySelectorAll(".game-card").forEach((card) => {
    const cardScenario = {
      "select-newcomer-game-btn": "newcomer-circle",
      "select-peer-support-game-btn": "peer-support",
      "select-community-volunteer-game-btn": "community-volunteer"
    }[card.id];
    card.classList.toggle("game-card-active", cardScenario === state.scenarioId);
  });
  renderScenarioStaticText();
  renderConfig();
  showScreen("config");
}

document.getElementById("about-btn").addEventListener("click", () => {
  const dialog = document.getElementById("project-info-dialog");
  if (dialog?.showModal) dialog.showModal();
});

document.getElementById("close-project-info-btn").addEventListener("click", () => {
  document.getElementById("project-info-dialog").close();
});

document.getElementById("project-info-dialog").addEventListener("click", (event) => {
  if (event.target.id === "project-info-dialog") event.target.close();
});

document.getElementById("confirm-brief-btn").addEventListener("click", () => {
  state.briefAcknowledged = true;
  document.getElementById("study-brief-dialog").close();
  updateBriefGate();
  openSingleGameConfig();
});

document.getElementById("study-brief-dialog").addEventListener("cancel", (event) => {
  if (!state.briefAcknowledged) event.preventDefault();
});

function lockAdminAccess() {
  state.adminMode = false;
  state.configAdminUnlocked = false;
}

function returnToMainMenu() {
  if (typeof studyPairRequested === "function" && studyPairRequested() && studyPairRuntime.pair) {
    renderStudyPairUi();
    return;
  }
  endSessionRuntime("menu");
  lockAdminAccess();
  showScreen("menu");
}

document.getElementById("back-main-menu-btn").addEventListener("click", returnToMainMenu);
document.getElementById("back-menu-btn").addEventListener("click", returnToMainMenu);
document.getElementById("begin-game-btn").addEventListener("click", beginGame);
document.getElementById("submit-decision-btn").addEventListener("click", submitDecision);
document.getElementById("close-side-talk-btn").addEventListener("click", closeSideTalk);
document.getElementById("close-task-board-btn").addEventListener("click", closeTaskBoard);
document.getElementById("close-backpack-btn").addEventListener("click", closeBackpack);
document.getElementById("submit-side-talk-btn").addEventListener("click", submitSideTalkFreeText);
document.getElementById("submit-artifact-btn").addEventListener("click", submitArtifact);
document.getElementById("submit-feedback-btn").addEventListener("click", submitSummaryFeedback);
document.getElementById("summary-menu-btn").addEventListener("click", returnToMainMenu);
document.getElementById("dialogue-history-toggle").addEventListener("click", () => {
  if (typeof openPlayerTool === "function") { openPlayerTool("journal", "history"); return; }
  const feed = document.getElementById("dialogue-feed");
  const button = document.getElementById("dialogue-history-toggle");
  const open = feed.classList.toggle("history-open");
  button.setAttribute("aria-expanded", String(open));
});
document.getElementById("dialogue-auto-toggle").addEventListener("change", (event) => {
  setDialogueAutoAdvance(event.target.checked);
});
document.getElementById("game-screen").addEventListener("click", (event) => {
  if (typeof isPlayerToolOpen === "function" && isPlayerToolOpen()) return;
  if (window.getSelection()?.toString().trim()) return;
  if (!state.dialogueAdvancePending || state.autoAdvanceDialogue || event.defaultPrevented) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  const scrollableSpeech = target.closest(".galgame-dialogue-text");
  if (scrollableSpeech && scrollableSpeech.scrollHeight > scrollableSpeech.clientHeight + 1) return;
  const interactiveTarget = target.closest([
    "a",
    "button",
    "input",
    "textarea",
    "select",
    "label",
    "summary",
    "[role='button']",
    "[role='tab']",
    "[contenteditable='true']",
    "[data-laptop-dock]",
    "#ui-mainline-hud",
    ".dialogue-feed"
  ].join(","));
  if (!interactiveTarget) continueDialogueManually();
});
document.addEventListener("click", (event) => {
  const laptop = event.target.closest("[data-laptop-dock]");
  if (!laptop) return;
  event.preventDefault();
  event.stopPropagation();
  openBackpack();
}, true);
document.getElementById("language-select").addEventListener("change", (event) => {
  state.language = event.target.value;
  applyLanguage();
  if (typeof renderPlayerExperience === "function") renderPlayerExperience();
});

applyLanguage();
updateBriefGate();

document.addEventListener("keydown", (event) => {
  if (typeof gameRecoveryNetworkPaused === "function" && gameRecoveryNetworkPaused("/api/chat")) return;
  if (typeof handlePlayerExperienceKey === "function" && handlePlayerExperienceKey(event)) return;
  if (event.defaultPrevented || event.isComposing) return;
  if (state.screen !== "game") return;
  const target = event.target;
  if (target && ["TEXTAREA", "INPUT", "SELECT"].includes(target.tagName)) return;
  if (event.key === "e" || event.key === "E") {
    event.preventDefault();
    commitProximityDialogue();
    return;
  }
  if (event.key === "b" || event.key === "B") {
    event.preventDefault();
    openBackpack();
    return;
  }
  const moves = {
    ArrowUp: [0, -playerMoveStep],
    ArrowDown: [0, playerMoveStep],
    ArrowLeft: [-playerMoveStep, 0],
    ArrowRight: [playerMoveStep, 0],
    w: [0, -playerMoveStep],
    s: [0, playerMoveStep],
    a: [-playerMoveStep, 0],
    d: [playerMoveStep, 0],
    W: [0, -playerMoveStep],
    S: [0, playerMoveStep],
    A: [-playerMoveStep, 0],
    D: [playerMoveStep, 0]
  };
  if (moves[event.key]) {
    event.preventDefault();
    movePlayer(moves[event.key][0], moves[event.key][1]);
  }
});

window.addEventListener("pagehide", () => {
  if (typeof studyPairRequested === "function" && studyPairRequested()) {void studyPairSaveCheckpoint("pagehide");return;}
  endSessionRuntime("pagehide");
});
window.addEventListener("beforeunload", () => {
  if (typeof studyPairRequested === "function" && studyPairRequested()) {void studyPairSaveCheckpoint("beforeunload");return;}
  endSessionRuntime("beforeunload");
});
if (typeof initializeStudyPair === "function") initializeStudyPair();
