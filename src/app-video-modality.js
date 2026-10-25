// Optional video modality for privacy-preserving visible social cues.
const VIDEO_FRAME_WIDTH = 320;
const VIDEO_FRAME_HEIGHT = 240;
const VIDEO_MAX_SAMPLES = 10;

function renderVideoModalityConfig() {
  const field = document.getElementById("video-modality-field");
  const checkbox = document.getElementById("video-modality-enabled");
  const intervalSelect = document.getElementById("video-sample-interval");
  const note = document.getElementById("video-modality-note");
  if (!field || !checkbox || !intervalSelect) return;

  checkbox.checked = !!state.videoModality.requested;
  intervalSelect.value = String(state.videoModality.sampleMs || 700);
  intervalSelect.disabled = !checkbox.checked;
  if (note) note.textContent = t("videoPrivacyNote");

  checkbox.onchange = () => {
    state.videoModality.requested = checkbox.checked;
    state.videoModality.enabled = checkbox.checked;
    intervalSelect.disabled = !checkbox.checked;
    renderVideoModalityConfig();
  };
  intervalSelect.onchange = () => {
    state.videoModality.sampleMs = Number(intervalSelect.value) || 700;
  };
}

function renderVideoModalityHud() {
  const node = document.getElementById("video-status");
  if (!node) {
    renderVideoDebugPanel();
    return;
  }
  const video = state.videoModality;
  node.classList.toggle("video-status-hidden", !video.requested && !video.enabled);
  const label = videoStatusLabel();
  node.innerHTML = `
    <span class="video-dot video-dot-${escapeHtml(video.status || "off")}"></span>
    <span>${escapeHtml(label)}</span>
  `;
  renderVideoDebugPanel();
}

function videoStatusLabel() {
  const status = state.videoModality.status || "off";
  const labels = {
    off: t("videoStatusOff"),
    starting: t("videoStatusStarting"),
    sampling: t("videoStatusSampling"),
    active: t("videoStatusActive"),
    weak: t("videoStatusWeak"),
    no_face: t("videoStatusNoFace"),
    unavailable: t("videoStatusUnavailable")
  };
  return labels[status] || labels.off;
}

async function startVideoModality() {
  const video = state.videoModality;
  const epoch = state.sessionEpoch;
  if (!video.enabled) {
    renderVideoModalityHud();
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    disableVideoModality(t("videoCameraUnsupported"));
    return;
  }
  video.status = "starting";
  video.statusMessage = "";
  video.failureCount = 0;
  video.unavailableLogged = false;
  renderVideoModalityHud();

  try {
    ensureVideoModalityNodes();
    video.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: VIDEO_FRAME_WIDTH },
        height: { ideal: VIDEO_FRAME_HEIGHT }
      },
      audio: false
    });
    if (epoch !== state.sessionEpoch || state.screen !== "game") {
      video.stream.getTracks().forEach((track) => track.stop());
      video.stream = null;
      return;
    }
    video.stream.getTracks().forEach((track) => {
      track.addEventListener("ended", () => {
        if (video.enabled) disableVideoModality(t("videoStatusUnavailable"));
      }, { once: true });
      track.addEventListener("mute", () => {
        if (video.enabled) {
          video.status = "weak";
          renderVideoModalityHud();
        }
      });
      track.addEventListener("unmute", () => {
        if (video.enabled) {
          video.status = "sampling";
          renderVideoModalityHud();
        }
      });
    });
    video.videoNode.srcObject = video.stream;
    await video.videoNode.play();
    video.status = "sampling";
    scheduleVideoSampling();
    state.log.push({
      type: "Video modality",
      round: "Setup",
      summary: `Video modality enabled; sampleMs=${video.sampleMs}. Raw frames are not stored or sent to DeepSeek.`,
      sampleMs: video.sampleMs,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    disableVideoModality(`${t("videoPermissionFailed")} ${shorten(String(error?.message || error || ""), 120)}`);
  }
  renderVideoModalityHud();
}

function stopVideoModality() {
  const video = state.videoModality;
  if (video.timerId) {
    window.clearInterval(video.timerId);
    video.timerId = null;
  }
  const stream = video.stream;
  video.stream = null;
  if (video.videoNode) video.videoNode.srcObject = null;
  if (stream) stream.getTracks().forEach((track) => track.stop());
  if (video.canvasNode) {
    const context = video.canvasNode.getContext("2d");
    context?.clearRect?.(0, 0, video.canvasNode.width, video.canvasNode.height);
  }
  video.isCapturing = false;
  video.status = "off";
  video.lastDebugFrameDataUrl = "";
  renderVideoModalityHud();
}

function disableVideoModality(message) {
  stopVideoModality();
  const video = state.videoModality;
  video.enabled = false;
  video.status = "unavailable";
  video.lastError = message;
  if (!video.unavailableLogged) {
    state.log.push({
      type: "Video modality unavailable",
      round: currentWindow()?.type || "Runtime",
      summary: message,
      timestamp: new Date().toISOString()
    });
    video.unavailableLogged = true;
  }
  renderVideoModalityHud();
  renderResearchLog();
}

function ensureVideoModalityNodes() {
  const video = state.videoModality;
  if (!video.videoNode) {
    video.videoNode = document.createElement("video");
    video.videoNode.setAttribute("playsinline", "");
    video.videoNode.muted = true;
    video.videoNode.className = "video-modality-hidden-node";
    document.body.appendChild(video.videoNode);
  }
  if (!video.canvasNode) {
    video.canvasNode = document.createElement("canvas");
    video.canvasNode.width = VIDEO_FRAME_WIDTH;
    video.canvasNode.height = VIDEO_FRAME_HEIGHT;
    video.canvasNode.className = "video-modality-hidden-node";
    document.body.appendChild(video.canvasNode);
  }
}

function scheduleVideoSampling() {
  const video = state.videoModality;
  if (video.timerId) window.clearInterval(video.timerId);
  video.timerId = window.setInterval(captureVideoModalityFrame, video.sampleMs || 700);
  captureVideoModalityFrame();
}

async function captureVideoModalityFrame() {
  const video = state.videoModality;
  if (!video.enabled || state.screen !== "game" || !video.videoNode || !video.canvasNode) return;
  if (video.isCapturing || video.videoNode.readyState < 2) return;
  video.isCapturing = true;
  try {
    const context = video.canvasNode.getContext("2d");
    context.drawImage(video.videoNode, 0, 0, VIDEO_FRAME_WIDTH, VIDEO_FRAME_HEIGHT);
    const imageDataUrl = video.canvasNode.toDataURL("image/jpeg", 0.55);
    video.lastDebugFrameDataUrl = state.adminMode ? imageDataUrl : "";
    const response = await fetchWithTimeout("/api/face-signal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageDataUrl })
    }, 10000, { agentPurpose: "visible_expression_detection" });
    if (!response.ok) {
      const text = await response.text();
      video.lastFaceApiOutput = state.adminMode ? {
        ok: false,
        status: response.status,
        body: shorten(text, 800),
        timestamp: new Date().toISOString()
      } : null;
      video.failureCount += 1;
      if (video.failureCount >= 2) {
        disableVideoModality(`Face API error ${response.status}: ${shorten(text, 140)}`);
      }
      return;
    }
    const apiOutput = await response.json();
    video.lastFaceApiOutput = state.adminMode ? apiOutput : null;
    const signal = normalizeFaceSignal(apiOutput);
    video.failureCount = 0;
    video.lastFaceSignal = signal;
    rememberVideoSample(signal);
    video.smoothedSignal = smoothedVideoSignal();
    video.visibleExpressionCue = SocialEvoCore.deriveVisibleExpressionCue(
      video.samples.slice(-5)
    );
    video.status = !signal.facePresent
      ? "no_face"
      : video.visibleExpressionCue.visibleExpressionCue === "unclear"
        ? "weak"
        : "active";
    const cueSignature = [
      video.visibleExpressionCue.visibleExpressionCue,
      video.visibleExpressionCue.stability
    ].join(":");
    const now = Date.now();
    if (cueSignature !== video.lastLoggedCue || now - video.lastCueLogAt >= 10000) {
      state.log.push({
        type: "Visible expression cue",
        round: currentWindow()?.type || "Runtime",
        summary: video.visibleExpressionCue.visibleExpressionCue,
        confidence: video.visibleExpressionCue.confidence,
        stability: video.visibleExpressionCue.stability,
        timestamp: new Date(now).toISOString()
      });
      video.lastLoggedCue = cueSignature;
      video.lastCueLogAt = now;
    }
  } catch (error) {
    if (isStaleRequestError(error)) return;
    video.lastFaceApiOutput = state.adminMode ? {
      ok: false,
      error: String(error?.message || error || ""),
      timestamp: new Date().toISOString()
    } : null;
    video.failureCount += 1;
    if (video.failureCount >= 2) {
      disableVideoModality(`Face API unavailable: ${shorten(String(error?.message || error || ""), 140)}`);
    }
  } finally {
    video.isCapturing = false;
    renderVideoModalityHud();
  }
}

function normalizeFaceSignal(signal) {
  const expression = signal?.expression || {};
  return {
    provider: signal?.provider || "face-api",
    facePresent: !!signal?.facePresent,
    confidence: clampNumber(signal?.confidence, 0, 1),
    expression: {
      joy: clampNumber(expression.joy, 0, 1),
      sorrow: clampNumber(expression.sorrow, 0, 1),
      anger: clampNumber(expression.anger, 0, 1),
      surprise: clampNumber(expression.surprise, 0, 1)
    },
    attention: clampNumber(signal?.attention, 0, 1),
    pose: signal?.pose || {},
    sampledAt: new Date().toISOString()
  };
}

function rememberVideoSample(signal) {
  const samples = state.videoModality.samples;
  samples.push(signal);
  while (samples.length > VIDEO_MAX_SAMPLES) samples.shift();
}

function smoothedVideoSignal() {
  const samples = state.videoModality.samples.filter((sample) => sample.facePresent);
  if (!samples.length) {
    return { facePresent: false, confidence: 0, expression: { joy: 0, sorrow: 0, anger: 0, surprise: 0 }, attention: 0 };
  }
  const recent = samples.slice(-5);
  const avg = (path) => recent.reduce((sum, sample) => sum + path(sample), 0) / recent.length;
  return {
    facePresent: true,
    confidence: round3(avg((sample) => sample.confidence)),
    expression: {
      joy: round3(avg((sample) => sample.expression.joy)),
      sorrow: round3(avg((sample) => sample.expression.sorrow)),
      anger: round3(avg((sample) => sample.expression.anger)),
      surprise: round3(avg((sample) => sample.expression.surprise))
    },
    attention: round3(avg((sample) => sample.attention)),
    sampleCount: recent.length,
    updatedAt: new Date().toISOString()
  };
}

function multimodalInstructionForAgent() {
  if (!state?.videoModality?.enabled) {
    return "No video modality is active.";
  }
  return "storyWorld.multimodalInteraction may contain a weak visibleExpressionCue. Treat it only as weak visible evidence for conversational pacing. Never mention camera, face or expression detection; never tell the player that they look nervous, sad, angry, or otherwise infer an inner state. Do not infer intent, honesty, identity, health, personality, or sensitive traits.";
}

function multimodalContextForAgent() {
  const video = state.videoModality;
  if (!video?.enabled) return { enabled: false };
  return video.visibleExpressionCue || {
      visibleExpressionCue: "unclear",
      confidence: 0,
      stability: "unclear"
  };
}

function renderVideoDebugPanel() {}

function prettyVideoDebugJson(value) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch (error) {
    return JSON.stringify({ error: String(error?.message || error || "") }, null, 2);
  }
}

function resetVideoRuntimeForNewSession() {
  stopVideoModality();
  state.videoModality.status = state.videoModality.requested ? "off" : "off";
  state.videoModality.statusMessage = "";
  state.videoModality.lastFaceSignal = null;
  state.videoModality.smoothedSignal = null;
  state.videoModality.visibleExpressionCue = null;
  state.videoModality.lastLoggedCue = "";
  state.videoModality.lastCueLogAt = 0;
  state.videoModality.lastDebugFrameDataUrl = "";
  state.videoModality.lastFaceApiOutput = null;
  state.videoModality.samples = [];
  state.videoModality.failureCount = 0;
  state.videoModality.lastError = "";
  state.videoModality.unavailableLogged = false;
  renderVideoDebugPanel();
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function round3(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}
