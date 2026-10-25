// Optional streaming Qwen Flash / explicitly selected legacy NPC voice.
const VOICE_REQUEST_TIMEOUT_MS = 45000;
const VOICE_STREAM_IDLE_TIMEOUT_MS = 15000;
let voiceAudioContext = null;
const VOICE_PREFERENCE_KEY = "socialevo_voice_v1";
try {
  const saved = JSON.parse(localStorage.getItem(VOICE_PREFERENCE_KEY) || "{}");
  if (typeof saved.requested === "boolean") state.voiceModality.requested = saved.requested;
} catch (_error) { /* Audio preferences never affect study assignment or readiness. */ }

function normalizeVoiceRuntimeMetadata(value = {}) {
  value = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const provider = ["dashscope", "openai"].includes(value.provider) ? value.provider : value.provider ? "unavailable" : "openai";
  const engine = ["tts", "live", "qwen-flash", "qwen-next"].includes(value.engine)
    ? value.engine : value.engine ? "unavailable" : provider === "dashscope" ? "qwen-flash" : "tts";
  const model = typeof value.model === "string" && /^[a-zA-Z0-9._:/-]{0,160}$/.test(value.model) ? value.model : "";
  return {
    provider, engine, model,
    configured: value.configured === true && engine !== "unavailable" && provider !== "unavailable",
    dependencyReady: value.dependencyReady !== false,
    paraphrase: value.paraphrase === true || engine === "live",
    streaming: value.streaming !== false,
    requestTimeoutMs: Number.isFinite(Number(value.requestTimeoutMs)) && Number(value.requestTimeoutMs) > 0
      ? Math.min(150000, Number(value.requestTimeoutMs)) : 45000
  };
}

function voiceStudyRestriction(voice = state.voiceModality) {
  const study = Boolean(state.researchProfile?.active || (typeof studyModeRequested === "function" && studyModeRequested()));
  if ((voice.studyOwnerRequired || state.runtimeManifest?.pairedOnlyRecapArt) && !study) return "formal_entry";
  if (study && (voice.paraphrase || !((voice.provider === "dashscope" && voice.engine === "qwen-flash") ||
      (voice.provider === "openai" && voice.engine === "tts")))) return "verbatim_required";
  return "";
}

function voiceSettingsSnapshot() {
  const voice = state.voiceModality;
  return Object.freeze({
    requested: Boolean(voice.requested), enabled: Boolean(voice.enabled), configured: Boolean(voice.configured),
    availability: voice.availability, provider: voice.provider, engine: voice.engine, model: voice.model,
    paraphrase: Boolean(voice.paraphrase), playbackStatus: voice.status || "off"
  });
}

function prepareGameAudioGesture() {
  // Call directly from Begin/Continue, before their first asynchronous operation.
  // The following beginGame must reuse these contexts rather than close them.
  if (typeof stopLabBgm === "function") stopLabBgm();
  if (typeof prepareLabBgmPlayback === "function") void prepareLabBgmPlayback();
  if (state.voiceModality.requested) unlockVoicePlayback().catch(() => {});
}

function setVoicePreference(requested) {
  const voice = state.voiceModality;
  voice.requested = Boolean(requested);
  try { localStorage.setItem(VOICE_PREFERENCE_KEY, JSON.stringify({requested: voice.requested})); } catch (_error) {}
  if (voice.requested) {
    // Keep this synchronous gesture before any request or study storage work.
    unlockVoicePlayback().catch(() => {});
    if (state.screen === "game" && !state.sessionClosed && !state.finalOutcome && !voiceStudyRestriction()) startVoiceModality();
    else voice.status = "ready";
  } else {
    voice.enabled = false;
    stopVoicePlayback("preference_disabled");
  }
  // Enabling starts with the next visible line; it never regenerates the current one.
  renderVoiceModalityConfig();
  renderVoiceModalityHud();
  if (typeof studyPairRecordAudioSettings === "function") studyPairRecordAudioSettings("voice_enabled");
}

async function unlockVoicePlayback() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!voiceAudioContext || voiceAudioContext.state === "closed") {
    voiceAudioContext = new AudioContextClass({ latencyHint: "interactive" });
  }
  if (voiceAudioContext.state === "suspended") await voiceAudioContext.resume();
  return voiceAudioContext;
}

function voiceDeliveryForDialogue(emotion, tone, options = {}) {
  // Only labels attached to this visible line are inspected. Never read NPC
  // trust/belonging, persistent emotion, strategy, memory, or player input.
  const expression = typeof galgameExpressionFor === "function"
    ? galgameExpressionFor(emotion, tone)
    : "neutral";
  const cue = String(tone || "").toLowerCase();
  let speakingTone = "neutral";
  if (/tense|pressur|urgent|impatient|紧张|压力|急迫|不耐烦/u.test(cue)) speakingTone = "tense";
  else if (/support|reassur|encourag|支持|安慰|鼓励/u.test(cue)) speakingTone = "supportive";
  else if (/firm|direct|sharp|authorit|decisive|坚定|直接|权威|果断/u.test(cue)) speakingTone = "firm";
  else if (/cautious|guarded|wary|hesitan|evasiv|谨慎|警惕|迟疑|回避/u.test(cue)) speakingTone = "cautious";
  else if (/warm|kind|friendly|gentle|温和|友好|亲切|温暖/u.test(cue)) speakingTone = "warm";
  else if (/reflect|thought|reflective|思考|沉思|反思/u.test(cue)) speakingTone = "reflective";
  else if (/measur|precise|calm|composed|evaluative|克制|精确|平静|冷静|审视/u.test(cue)) speakingTone = "measured";
  const allowedStages = new Set(["stage_1_entry", "stage_2_first_failure", "stage_3_revision_conflict", "stage_4_credit"]);
  const currentId = typeof currentStage === "function" ? currentStage()?.id : "";
  const stage = state.isIntroPlaying ? "opening"
    : state.finalOutcome ? "ending"
      : allowedStages.has(currentId) ? currentId : "stage_1_entry";
  const situation = String(options.channel || "").startsWith("relationship_transfer") ? "relationship_transfer"
    : state.currentPrivateConversationNpcId || state.activeSideTalkNpcId ? "private_talk" : "group";
  return { emotion: expression, tone: speakingTone, stage, situation };
}

function renderVoiceModalityConfig() {
  const field = document.getElementById("voice-modality-field");
  const checkbox = document.getElementById("voice-modality-enabled");
  const note = document.getElementById("voice-modality-note");
  if (!field || !checkbox || !note) return;
  const voice = state.voiceModality;
  const settings = document.getElementById("ui-settings");
  if (settings && !document.getElementById("voice-settings-enabled")) {
    const section = document.createElement("section");
    section.className = "voice-settings-controls";
    section.innerHTML = '<label><span data-voice-settings-label></span><input id="voice-settings-enabled" type="checkbox" role="switch" aria-describedby="voice-settings-note"></label><small id="voice-settings-note"></small>';
    settings.querySelector("header")?.insertAdjacentElement("afterend", section);
  }
  const restriction = voiceStudyRestriction(voice);
  checkbox.checked = Boolean(voice.requested);
  checkbox.disabled = Boolean(!voice.requested && (restriction || voice.availabilityPending || !voice.configured));
  note.textContent = voice.availabilityPending
    ? t("voiceModeChecking")
    : voice.configured
      ? (voice.provider === "dashscope" ? t(voice.engine === "qwen-next" ? "qwenNextVoiceModeReady" : "qwenVoiceModeReady") : t("voiceModeReady")) + (voice.paraphrase ? " " + t("voiceLiveNotice") : "")
      : voice.availability === "unavailable"
        ? t("voiceModeUnavailable")
        : voice.provider === "dashscope" ? t(voice.dependencyReady === false ? "qwenVoiceDependencyMissing" : "qwenVoiceModeNotConfigured") : t("voiceModeNotConfigured");
  if(!voice.availabilityPending&&!voice.configured&&voice.availability!=="unavailable"&&
     voice.dependencyReady!==false&&!state.configAdminUnlocked) {
    note.textContent=state.language==="zh"?"本次语音暂不可用，仍可正常阅读文字对话。":"Voice is not configured for this session. You can still play with text.";
  }
  if (voice.configured && !restriction && (state.researchProfile?.active || (typeof studyModeRequested === "function" && studyModeRequested()))) {
    note.textContent = state.language === "zh"
      ? "角色语音已就绪。只朗读屏幕上的对话；可随时开关。"
      : "NPC voice is ready. It reads the on-screen dialogue; you can switch it on or off at any time.";
  }
  if (restriction === "formal_entry") note.textContent = state.language === "zh"
    ? "请从正式的两局游戏入口登记后使用角色语音。" : "Enter through the registered two-game study to use NPC voice.";
  else if (restriction === "verbatim_required") note.textContent = state.language === "zh"
    ? "本次仅支持逐字朗读，当前语音服务暂不可用；仍可阅读文字对话。" : "This session requires verbatim speech. The current voice service is unavailable; text remains available.";
  checkbox.onchange = () => setVoicePreference(checkbox.checked);
  const settingsCheckbox = document.getElementById("voice-settings-enabled");
  const settingsNote = document.getElementById("voice-settings-note");
  const settingsLabel = document.querySelector("[data-voice-settings-label]");
  if (settingsCheckbox) {
    settingsCheckbox.checked = checkbox.checked;
    settingsCheckbox.disabled = checkbox.disabled;
    settingsCheckbox.onchange = () => setVoicePreference(settingsCheckbox.checked);
  }
  if (settingsLabel) settingsLabel.textContent = state.language === "zh" ? "角色语音" : "NPC voice";
  if (settingsNote) settingsNote.textContent = note.textContent;
}

async function refreshVoiceModalityAvailability(options = {}) {
  const voice = state.voiceModality;
  if (voice.availabilityPending || (!options.force && voice.availability !== "unknown")) return;
  voice.availabilityPending = true;
  renderVoiceModalityConfig();
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch("/health", { cache: "no-store", signal: controller.signal });
    const payload = await response.json();
    if (!response.ok || payload?.status !== "ok") throw new Error("voice availability check failed");
    const metadata = normalizeVoiceRuntimeMetadata(payload.voice);
    Object.assign(voice, metadata, {generationStreaming: metadata.streaming, studyOwnerRequired: Boolean(payload.researchAB?.enabled)});
    voice.availability = voice.configured ? "ready" : "not_configured";
  } catch (_error) {
    voice.configured = false;
    voice.availability = "unavailable";
  } finally {
    window.clearTimeout(timeoutId);
    voice.availabilityPending = false;
    renderVoiceModalityConfig();
  }
}

function voiceStatusLabel() {
  const labels = {
    off: t("voiceStatusOff"),
    ready: t("voiceStatusReady"),
    loading: t("voiceStatusLoading"),
    speaking: t("voiceStatusSpeaking"),
    error: t("voiceStatusError")
  };
  return labels[state.voiceModality.status] || labels.off;
}

function renderVoiceModalityHud() {
  if (typeof syncLabBgm === 'function') syncLabBgm();
  const node = document.getElementById("voice-status");
  if (!node) return;
  const voice = state.voiceModality;
  node.classList.toggle("video-status-hidden", !voice.requested && !voice.enabled);
  node.innerHTML = `
    <span class="video-dot video-dot-${escapeHtml(voice.status || "off")}"></span>
    <span>${escapeHtml(voiceStatusLabel())}</span>
  `;
  const line = document.getElementById("galgame-voice-status");
  const label = document.getElementById("galgame-voice-status-text");
  const copy = document.getElementById("copy-voice-diagnostics");
  if (!line || !label || !copy) return;
  line.hidden = !voice.enabled || !voice.currentLineInfo || Boolean(state.researchProfile?.active);
  line.classList.toggle("voice-line-error", voice.status === "error");
  label.textContent = voice.status === "error"
    ? `${t("voiceLineFailed")} (${voice.lastFailure?.code || "voice_error"})`
    : voice.status === "loading" ? t(voice.provider === "dashscope" ? (voice.engine === "qwen-next" ? "qwenNextVoiceLineLoading" : "qwenVoiceLineLoading") : "voiceLineLoading")
      : voice.status === "speaking" ? t("voiceStatusSpeaking") : t("voiceLineFinished");
  copy.textContent = t("copyVoiceDiagnostics");
  copy.onpointerdown = (event) => event.stopPropagation();
  copy.onclick = async (event) => {
    event.stopPropagation();
    const value = JSON.stringify(voiceDiagnosticsSnapshot(), null, 2);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const field = document.createElement("textarea");
        field.value = value;
        field.style.position = "fixed";
        field.style.left = "-10000px";
        document.body.appendChild(field);
        try { field.select(); if (!document.execCommand("copy")) throw new Error("copy failed"); }
        finally { field.remove(); }
      }
      copy.textContent = t("voiceDiagnosticsCopied");
    } catch (_error) {
      copy.textContent = t("voiceDiagnosticsCopyFailed");
    }
  };
}

function voiceDiagnosticsSnapshot() {
  const voice = state.voiceModality;
  return {
    schemaVersion: "voice-diagnostics-v1", buildVersion: BUILD_VERSION,
    provider: voice.provider, model: voice.model, engine: voice.engine,
    requested: voice.requested, enabled: voice.enabled, configured: voice.configured,
    status: voice.status, audioContextState: voiceAudioContext?.state || "not_created",
    currentLine: voice.currentLineInfo, lastFailure: voice.lastFailure,
    lastStopReason: voice.lastStopReason, playbackTiming: voice.lastPlaybackTiming,
    recentCalls: state.apiCalls.filter((call) => call.endpoint === "/api/tts").slice(-8).map((call) => ({
      callId: call.callId, status: call.status, httpStatus: call.httpStatus,
      latencyMs: call.latencyMs, errorCode: call.errorCode, upstreamStatus: call.upstreamStatus
    }))
  };
}

function cleanupVoiceAudio() {
  const voice = state.voiceModality;
  if (voice.currentStream) {
    const stream = voice.currentStream;
    voice.currentStream = null;
    stream.player.cancel();
    stream.reader.cancel().catch(() => {});
  }
  if (voice.cancelAudioWait) voice.cancelAudioWait();
  voice.cancelAudioWait = null;
  if (voice.currentAudio) {
    voice.currentAudio.pause();
    voice.currentAudio.removeAttribute("src");
    voice.currentAudio.load?.();
  }
  voice.currentAudio = null;
  if (voice.currentObjectUrl) URL.revokeObjectURL(voice.currentObjectUrl);
  voice.currentObjectUrl = "";
}

function stopVoicePlayback(reason = "stopped") {
  const voice = state.voiceModality;
  voice.sequence += 1;
  if (voice.cancelLineWait) voice.cancelLineWait();
  voice.cancelLineWait = null;
  if (voice.abortController) voice.abortController.abort(reason);
  voice.abortController = null;
  cleanupVoiceAudio();
  voice.currentLinePromise = null;
  voice.currentSpeakerId = "";
  voice.currentLineInfo = null;
  voice.lastStopReason = reason;
  voice.status = voice.enabled ? "ready" : "off";
  renderVoiceModalityHud();
}

function resetVoiceRuntimeForNewSession() {
  stopVoicePlayback("new_session");
  const voice = state.voiceModality;
  voice.enabled = false;
  voice.status = "off";
  voice.statusMessage = "";
  voice.lastError = "";
  voice.unavailableLogged = false;
  renderVoiceModalityHud();
}

function startVoiceModality() {
  const voice = state.voiceModality;
  voice.enabled = Boolean(
    voice.requested && voice.configured && !voiceStudyRestriction(voice)
  );
  voice.status = voice.enabled ? "ready" : "off";
  if (voice.enabled) {
    state.log.push({
      type: "Voice modality",
      round: "Setup",
      summary: voice.provider === "dashscope"
        ? (voice.engine === "qwen-next"
          ? "Qwen Next legacy voice enabled: complete generation before WAV playback. Only visible NPC text and public delivery labels are sent; no microphone, reference audio, hidden state or study voice."
          : "Qwen Flash streaming voice enabled: fixed per-character/language system voices, PCM playback before generation completes. Only visible NPC text and public delivery labels are sent; no microphone, reference audio or hidden state.")
        : voice.paraphrase
        ? "GPT-Live natural voice preview enabled. Spoken phrasing may differ from source subtitles; voice cannot write NPC/game state. Only visible NPC lines and public delivery labels are sent. No microphone, stored audio, or study voice."
        : "OpenAI NPC voice enabled. Only validated visible NPC dialogue is sent; generated audio is not stored or exported.",
      provider: voice.provider,
      model: voice.model,
      speechMode: voice.provider === "dashscope" && voice.engine === "qwen-next" ? "source-text-prompt" : voice.paraphrase ? "natural-paraphrase" : "verbatim-tts",
      timestamp: new Date().toISOString()
    });
  }
  renderVoiceModalityHud();
  if (typeof studyPairRecordAudioSettings === "function") studyPairRecordAudioSettings("voice_started");
}

function stopVoiceModality() {
  stopVoicePlayback("voice_modality_stopped");
  state.voiceModality.enabled = false;
  state.voiceModality.status = "off";
  renderVoiceModalityHud();
}

function recordVoiceFailure(error) {
  const voice = state.voiceModality;
  voice.lastError = shorten(String(error?.message || error || ""), 180);
  voice.status = "error";
  const code = typeof error?.code === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(error.code) ? error.code : "voice_playback_error";
  const previous = voice.lastFailure;
  voice.lastFailure = {
    code, httpStatus: Number(error?.httpStatus || 0),
    speakerId: voice.currentLineInfo?.speakerId || "",
    sequence: voice.sequence, timestamp: new Date().toISOString()
  };
  if (!previous || previous.sequence !== voice.sequence) {
    state.log.push({
      type: "Voice modality unavailable",
      round: currentWindow()?.type || "Runtime",
      summary: voice.lastError || t("voiceModeUnavailable"),
      errorCode: code,
      httpStatus: voice.lastFailure.httpStatus,
      npc: voice.lastFailure.speakerId,
      timestamp: new Date().toISOString()
    });
    voice.unavailableLogged = true;
  }
  renderVoiceModalityHud();
  if (typeof studyPairRecordAudioSettings === "function") studyPairRecordAudioSettings("voice_error");
  if (typeof renderResearchLog === "function") renderResearchLog();
}

async function playVoiceAudioBlob(blob, sequence) {
  const voice = state.voiceModality;
  if (sequence !== voice.sequence || !voice.enabled) return { spoken: false, cancelled: true };
  const objectUrl = URL.createObjectURL(blob);
  const audio = new Audio(objectUrl);
  audio.preload = "auto";
  voice.currentObjectUrl = objectUrl;
  voice.currentAudio = audio;
  voice.status = "speaking";
  renderVoiceModalityHud();
  let cancelled = false;
  let resolveWait;
  const finished = new Promise((resolve, reject) => {
    resolveWait = resolve;
    audio.addEventListener("ended", resolve, { once: true });
    audio.addEventListener("error", () => reject(new Error("Voice audio playback failed.")), { once: true });
  });
  finished.catch(() => {}); // play() and the audio error event can reject together.
  // Register before play(), and settle this promise even if manual Next stops it.
  const cancelWait = () => { cancelled = true; resolveWait(); };
  voice.cancelAudioWait = cancelWait;
  try {
    await audio.play();
    await finished;
  } finally {
    if (voice.cancelAudioWait === cancelWait) voice.cancelAudioWait = null;
    if (sequence === voice.sequence) cleanupVoiceAudio();
  }
  return { spoken: !cancelled && sequence === voice.sequence, cancelled: cancelled || sequence !== voice.sequence };
}

async function playVoicePcmStream(response, sequence, controller, startedAt) {
  const voice = state.voiceModality;
  const context = await unlockVoicePlayback();
  if (!context || context.state !== "running" || !response.body?.getReader) {
    throw new Error("Streaming voice playback is unavailable; continue with text.");
  }
  if (sequence !== voice.sequence || !voice.enabled) return { spoken: false, cancelled: true };
  const sampleRate = Number(response.headers.get("X-SocialEvo-Audio-Sample-Rate"));
  if (sampleRate !== 24000 || response.headers.get("X-SocialEvo-Audio-Format") !== "pcm_s16le" || response.headers.get("X-SocialEvo-Audio-Channels") !== "1") {
    throw new Error("Voice service returned an unsupported streaming audio format.");
  }
  const reader = response.body.getReader();
  const timing = { firstChunkMs: null, firstBufferScheduledMs: null, receiveMs: null, playbackMs: null, underruns: 0 };
  voice.lastPlaybackTiming = timing;
  const player = new SocialEvoVoiceAudio.PcmStreamPlayer(context, {
    sampleRate,
    onStart: () => {
      if (sequence !== voice.sequence) return;
      timing.firstBufferScheduledMs = performance.now() - startedAt;
      voice.status = "speaking";
      renderVoiceModalityHud();
    }
  });
  const stream = { reader, player };
  voice.currentStream = stream;
  const cancel = () => { player.cancel(); reader.cancel().catch(() => {}); };
  controller.signal.addEventListener("abort", cancel, { once: true });
  let timer = null;
  const timeout = () => controller.abort("voice_stream_timeout");
  const checkCurrent = () => {
    if (controller.signal.aborted) {
      const error = new Error("Voice stream stopped or stalled; continue with text.");
      error.code = controller.signal.reason;
      throw error;
    }
    if (sequence !== voice.sequence || !voice.enabled) throw new StaleSessionError();
  };
  try {
    while (true) {
      checkCurrent();
      timer = window.setTimeout(timeout, VOICE_STREAM_IDLE_TIMEOUT_MS);
      const { done, value } = await reader.read();
      window.clearTimeout(timer);
      timer = null;
      checkCurrent();
      if (done) break;
      if (timing.firstChunkMs === null) timing.firstChunkMs = performance.now() - startedAt;
      player.enqueue(value);
    }
    if (!player.receivedBytes) throw new Error("Voice service returned empty audio.");
    timing.receiveMs = performance.now() - startedAt;
    const finished = player.finish();
    timer = window.setTimeout(timeout, Math.ceil((player.remainingSeconds() + 10) * 1000));
    const result = await finished;
    checkCurrent();
    timing.playbackMs = performance.now() - startedAt;
    timing.underruns = player.underruns;
    return result;
  } finally {
    if (timer) window.clearTimeout(timer);
    controller.signal.removeEventListener("abort", cancel);
    if (voice.currentStream === stream) voice.currentStream = null;
    player.cancel();
    await reader.cancel().catch(() => {});
    try { reader.releaseLock(); } catch (_error) { /* A cancelled read may be settling. */ }
  }
}

function prepareVoiceForDialogue(name, text, emotion, tone, options = {}) {
  const voice = state.voiceModality;
  stopVoicePlayback("dialogue_changed");
  const npc = state.npcs.find((item) => item.name === name);
  if (!voice.enabled || !voice.configured || voiceStudyRestriction(voice) || !npc || !String(text || "").trim()) return null;

  const sequence = ++voice.sequence;
  const controller = new AbortController();
  voice.abortController = controller;
  voice.currentSpeakerId = npc.id;
  voice.currentLineInfo = { speakerId: npc.id, sequence, textChars: String(text).trim().length };
  voice.lastError = "";
  voice.lastPlaybackTiming = null;
  voice.status = "loading";
  renderVoiceModalityHud();
  const startedAt = performance.now();
  const streamingSupported = Boolean((window.AudioContext || window.webkitAudioContext) && window.ReadableStream && window.SocialEvoVoiceAudio);
  const playback = (async () => {
    try {
      const response = await fetchWithTimeout("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": streamingSupported && voice.generationStreaming ? "audio/pcm" : voice.provider === "dashscope" ? "audio/wav" : "audio/mpeg",
          ...(state.researchProfile?.active ? {"X-SocialEvo-Study-Token": state.researchProfile.sessionToken} : {}) },
        body: JSON.stringify({
          speakerId: npc.id,
          text: String(text).trim(),
          language: state.language === "zh" ? "zh" : "en",
          delivery: voiceDeliveryForDialogue(emotion, tone, options)
        }),
        signal: controller.signal
      }, VOICE_REQUEST_TIMEOUT_MS, {
        agentPurpose: "npc_voice_tts"
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const error = new Error(payload?.error?.message || `Voice request failed with HTTP ${response.status}.`);
        error.code = payload?.error?.code || `voice_http_${response.status}`;
        error.httpStatus = response.status;
        throw error;
      }
      const contentType = response.headers.get("Content-Type") || "";
      if (!contentType.startsWith("audio/")) throw new Error("Voice service returned a non-audio response.");
      if (contentType.startsWith("audio/pcm")) {
        return await playVoicePcmStream(response, sequence, controller, startedAt);
      }
      const blob = await response.blob();
      if (!blob.size) throw new Error("Voice service returned empty audio.");
      return await playVoiceAudioBlob(blob, sequence);
    } catch (error) {
      if (sequence !== voice.sequence || (controller.signal.aborted && controller.signal.reason !== "voice_stream_timeout") || isStaleRequestError(error)) {
        return { spoken: false, cancelled: true };
      }
      cleanupVoiceAudio();
      recordVoiceFailure(error);
      return { spoken: false, cancelled: false };
    } finally {
      if (sequence === voice.sequence) {
        voice.abortController = null;
        voice.currentSpeakerId = "";
        if (voice.status !== "error") voice.status = voice.enabled ? "ready" : "off";
        renderVoiceModalityHud();
      }
    }
  })();
  let cancelLineWait;
  const cancelled = new Promise(resolve => { cancelLineWait = () => resolve({spoken: false, cancelled: true}); });
  voice.cancelLineWait = cancelLineWait;
  const line = Promise.race([playback, cancelled]).finally(() => {
    if (voice.cancelLineWait === cancelLineWait) voice.cancelLineWait = null;
  });
  voice.currentLinePromise = line;
  return line;
}

function currentVoiceLinePlaybackPromise() {
  return state.voiceModality.enabled ? state.voiceModality.currentLinePromise : null;
}
