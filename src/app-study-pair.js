// Paired study orchestration and read-only research collection. Conditions remain
// server assigned; none of these archives are input to an NPC or scoring agent.
const studyPairRuntime = {
  initialization: null, pair: null, profile: null, error: "", busy: false, busyAction: null,
  restored: false, telemetry: null, dialogue: [], retrieval: [], sessionId: "",
  checkpointPromise: null, lastCheckpointSignature: "", lastCheckpointAt: 0,
  initialSaveResolve: null, initialSavePending: false, terminalRecord: null,
  checkpointGeneration: 0, checkpointJob: null, checkpointQueue: [], checkpointSequence: -1,
  checkpointDirty: true, dirtyRevision: 0, savedRevision: -1, scheduledCheckpoint: 0,
  scheduledCheckpointAt: 0, lastCheckpointAttemptAt: 0,
  checkpointConflict: false, failedCheckpoint: null, checkpointError: "",
  terminalGate: null, terminalPendingRecord: null, acknowledgedCheckpointSequence: -1,
  recoveryPromise: null, recoveryPending: false, recoveryError: "", recoverySource: "", recoveryGeneration: 0,
  recoveryDiagnostic: null,
  keepsakes: null, keepsakeLoading: false, keepsakeError: "", keepsakeLabel: "A", keepsakeRequest: 0
};

function studyPairRequested() {
  const query = new URLSearchParams(window.location.search);
  return query.get("study") === "1" && query.get("paired") === "1";
}

function studyPairText(zh, en) { return state.language === "zh" ? zh : en; }
function studyPairClone(value) { return JSON.parse(JSON.stringify(value)); }
function studyPairConflictCode(code){return ['checkpoint_sequence_conflict','checkpoint_stale_save','checkpoint_sequence_required','terminal_checkpoint_conflict','inactive_study_game','session_already_bound'].includes(code);}
function studyPairFlagConflict(code){
  studyPairRuntime.checkpointConflict=true;
  studyPairRuntime.recoveryDiagnostic={code,at:new Date().toISOString()};
  studyPairRuntime.recoveryError=studyPairText('保存记录有更新，请点击重试恢复，以最新进度继续。本页不会覆盖已有记录或自动重发回复。','Saved progress has changed. Click Retry recovery to continue from the latest record. This page will not overwrite saved progress or automatically resend replies.');
  studyPairRuntime.error=studyPairRuntime.recoveryError;
  if(typeof showGameRecoveryConflict==='function')showGameRecoveryConflict();
}
function studyPairLabel(label = studyPairRuntime.pair?.currentGame) {
  return label === "B" ? studyPairText("第二局（B）", "Second game (B)") : studyPairText("第一局（A）", "First game (A)");
}

function studyPairRequestToken(){
 const pair=studyPairRuntime.pair,game=pair?.currentGame,fresh=studyPairRuntime.profile;
 if(!pair||!['A','B'].includes(game))return "";
 const freshMatches=fresh?.pairId===pair?.pairId&&fresh?.gameLabel===game&&Boolean(fresh?.assignmentId);
 const current=state.researchProfile;
 if(current?.active&&current.pairId===pair?.pairId&&current.gameLabel===game&&(!freshMatches||current.assignmentId===fresh.assignmentId))return current.sessionToken||'';
 return freshMatches?fresh.sessionToken||'':'';
}
function studyPairAccountError(code){
 if(!studyPairRequested()||!['account_session_revoked','account_session_replaced','account_session_expired','pair_owner_required','invalid_study_session'].includes(code))return false;
 if(typeof showAccountLoginRequired==='function')showAccountLoginRequired();return true;
}
async function studyAccountBeforePasswordSetup(){
 const pair=studyPairRuntime.pair,game=pair?.games?.[pair.currentGame];
 if(!pair||studyPairRuntime.busy||studyPairRuntime.recoveryPending||studyPairRuntime.checkpointConflict||typeof studyAccountAuthenticationPaused==='function'&&studyAccountAuthenticationPaused())return false;
 if(!studyPairRuntime.telemetry||studyPairRuntime.sessionId!==state.sessionId||!state.sessionId)return state.screen==='config'||!game?.sessionId||Boolean(game.completed&&game.saved);
 const stopped=Boolean(state.sessionClosed||state.apiFatalError);
 if(state.activeEventLock||!stopped&&(state.isIntroPlaying||state.isScenePlaying||state.isGmThinking||state.dialogueAdvancePending)||studyPairRuntime.initialSavePending||typeof activeRequestRegistry!=='undefined'&&activeRequestRegistry.size)return false;
 const record=studyPairRuntime.terminalPendingRecord||studyPairRuntime.terminalRecord;
 if(record&&!record.persistence?.persisted){if(!await studyPairPersistTerminal(record))return false;}
 if(studyPairRuntime.terminalGate||studyPairRuntime.terminalPendingRecord)return false;
 const session=state.sessionId,generation=studyPairRuntime.checkpointGeneration,label=pair.currentGame;
 if(!await studyPairSaveCheckpoint('account_password_setup'))return false;
 return session===state.sessionId&&generation===studyPairRuntime.checkpointGeneration&&studyPairRuntime.pair?.currentGame===label&&!studyPairRuntime.busy&&!studyPairRuntime.checkpointDirty&&
  studyPairCheckpointKey()===studyPairRuntime.lastCheckpointSignature&&!state.activeEventLock&&(stopped||!state.isIntroPlaying&&!state.isScenePlaying&&!state.isGmThinking&&!state.dialogueAdvancePending)&&
  !(typeof activeRequestRegistry!=='undefined'&&activeRequestRegistry.size);
}
function studyAccountBeforeReload(){
 if(typeof cloudSaveRuntime!=='undefined')cloudSaveRuntime.reloading=true;
 if(typeof gameRecoveryRuntime!=='undefined')gameRecoveryRuntime.paused=true;
 if(studyPairRuntime.scheduledCheckpoint)clearTimeout(studyPairRuntime.scheduledCheckpoint);studyPairRuntime.scheduledCheckpoint=0;
 for(const request of studyPairRuntime.checkpointQueue)request.resolve(false);studyPairRuntime.checkpointQueue=[];
 if(typeof abortAllActiveRequests==='function')abortAllActiveRequests('account_navigation');
}
async function studyPairRequest(path, body, options = {}) {
  if(body!==undefined&&typeof studyAccountAuthenticationPaused==='function'&&studyAccountAuthenticationPaused()){const error=new Error(studyPairText('请重新登录后继续。','Log in again to continue.'));error.code='account_session_revoked';throw error;}
  const controller = new AbortController();
  const exportRequest = path === "/api/session-terminal" || path === "/api/study/pair/checkpoint";
  const timeout = window.setTimeout(() => controller.abort(), exportRequest ? 110000 : 20000);
  try {
    const bodyJson=body===undefined?undefined:typeof options.bodyJson==='string'?options.bodyJson:JSON.stringify(body);
    // Large string BodyInit blocks the UI while Fetch prepares the upload.
    // Blob streams the same UTF-8 JSON bytes; retain bodyJson as the immutable
    // retry source and leave checkpoint capture, sequence and CAS unchanged.
    const uploadBody=exportRequest&&typeof Blob==='function'&&bodyJson!==undefined
      ?new Blob([bodyJson],{type:'application/json'}):bodyJson;
    const token=options.token||studyPairRequestToken();
    const response = await fetch(path, {
      method: body === undefined ? "GET" : "POST", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json", ...(token ? {"X-SocialEvo-Study-Token": token} : {}) },
      ...(body === undefined ? {} : { body: uploadBody }), signal: controller.signal,
      ...(options.keepalive ? {keepalive: true} : {})
    });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 404 && options.allowMissing) return {ok: true, pair: null};
    if (response.ok && payload.ok !== true) throw new Error(studyPairText("服务器回复不完整，尚未确认读取或保存，请重试。", "The server response is incomplete. Loading or saving is not confirmed; please retry."));
    if (!response.ok || payload.ok === false) {
      const code = payload?.error?.code || payload.code || "";
      if (response.status === 409 && /participant|claimed|occupied|taken/i.test(code)) {
        throw new Error(studyPairText("这个编号已经被使用，请核对研究者分配给你的编号。", "This participant code is already in use. Check the code assigned by the researcher."));
      }
      const error=new Error(payload?.error?.message || studyPairText(`保存或读取失败（${response.status}），请重试。`, `Could not save or load (${response.status}). Please retry.`));
      error.code=code;error.httpStatus=response.status;studyPairAccountError(code);throw error;
    }
    return payload;
  } catch (error) {
    if (error.name === "AbortError") throw new Error(studyPairText("连接超时，尚未确认保存，请重试。", "The connection timed out. Saving has not been confirmed; please retry."));
    throw error;
  } finally { window.clearTimeout(timeout); }
}

function studyPairAccept(payload, restored = false) {
  const pair = payload?.pair;
  if (pair && (!/^P(?:[1-9]|[1-4][0-9]|50)$/.test(pair.participantId || "") ||
      !pair.pairId || !["A", "B"].includes(pair.currentGame) || !pair.games?.A || !pair.games?.B)) {
    throw new Error(studyPairText("研究会话资料不完整，请联系研究者。", "The study session is incomplete. Contact the researcher."));
  }
  studyPairRuntime.pair = pair || null;
  studyPairRuntime.profile = payload?.profile || null;
  studyPairRuntime.restored = restored;
  state.studyPair = pair ? {pairId: pair.pairId, participantId: pair.participantId, currentGame: pair.currentGame, status: pair.status} : null;
  studyPairRuntime.error = "";
  const input = document.getElementById("participant-id");
  if (pair && input) input.value = pair.participantId;
  renderStudyPairUi();
  return pair;
}

async function studyPairLoadCurrent(options = {}) {
  try {
    const payload = await studyPairRequest("/api/study/pair", undefined, {allowMissing: true});
    // Verify a just-authenticated return before accepting another browser owner
    // or requesting any game/questionnaire contents from that account.
    if(typeof studyAccountValidateReturn==='function')studyAccountValidateReturn(payload);
    studyPairAccept(payload, true);
    if (payload.pair?.status === "completed") {
      if (typeof studyQuestionnaireAvailability === "function" && await studyQuestionnaireAvailability()) {
        const questionnaire=await studyQuestionnaireLoad();
        if(questionnaire.currentForm){
          studyQuestionnairePresent(questionnaire,showStudyPairComplete,['comparison']);
          if(typeof studyAccountReturnComplete==='function')studyAccountReturnComplete(payload);
          return payload;
        }
      }
      showStudyPairComplete();
    } else if (payload.pair?.games?.[payload.pair.currentGame]?.sessionId && options.recover !== false) {
      const game=payload.pair.games[payload.pair.currentGame];
      if(state.sessionId!==game.sessionId || studyPairRuntime.sessionId!==game.sessionId) {
        const restored=await studyPairRecoverCurrent();
        if(restored===false) {
          const error=new Error(studyPairRuntime.recoveryError || studyPairText('暂未能恢复原进度，请重试恢复。已有记录保留。','Saved progress could not be restored. Retry recovery; existing records are retained.'));
          error.code='account_return_restore_failed'; error.accountSafe=true; throw error;
        }
      }
    }
    const recoveryDeferred=options.recover===false && payload.pair?.status!=='completed' && payload.pair?.games?.[payload.pair.currentGame]?.sessionId;
    if(!recoveryDeferred && typeof studyAccountReturnComplete==='function')studyAccountReturnComplete(payload);
    return payload;
  } catch(error) {
    if(typeof studyAccountReturnFailed==='function')studyAccountReturnFailed(error);
    throw error;
  }
}

async function studyPairRecoverCurrent() {
  if(studyPairRuntime.recoveryPromise)return studyPairRuntime.recoveryPromise;
  const pair=studyPairRuntime.pair,game=pair?.games?.[pair.currentGame];
  if(!pair || !game?.sessionId || pair.status==='completed')return false;
  const generation=++studyPairRuntime.recoveryGeneration;
  studyPairRuntime.recoveryPending=true;studyPairRuntime.recoveryError='';studyPairRuntime.error='';
  showScreen('config');renderStudyPairUi();
  const pending=(async()=>{
    try {
      const recovery=await studyPairRequest('/api/study/pair/recovery');
      if(generation!==studyPairRuntime.recoveryGeneration || pair.pairId!==studyPairRuntime.pair?.pairId || pair.currentGame!==studyPairRuntime.pair.currentGame)return false;
      if(!recovery.recovery?.export || recovery.pair?.pairId!==pair.pairId || recovery.pair?.currentGame!==pair.currentGame || recovery.recovery.export.session?.sessionId!==game.sessionId)throw Error(studyPairText('恢复记录与本局不一致，尚未开始新局。请重试。','The recovery record does not match this game. No new game has started. Please retry.'));
      if(typeof restoreStudyPairGame!=='function')throw Error(studyPairText('游戏恢复组件尚未就绪，请刷新页面后重试。','The game recovery component is unavailable. Refresh and retry.'));
      studyPairAccept(recovery,true);
      if(typeof studyQuestionnaireAvailability==='function' && await studyQuestionnaireAvailability())await studyQuestionnaireLoad();
      const result=await restoreStudyPairGame(recovery);
      if(generation!==studyPairRuntime.recoveryGeneration)return false;
      studyPairRuntime.recoverySource=recovery.recovery.source;
      studyPairRuntime.recoveryError='';studyPairRuntime.error='';
      if(typeof studyQuestionnaireRestoreAfterGame==='function')await studyQuestionnaireRestoreAfterGame(result);
      studyPairMarkCheckpointDirty('session_recovered',{saveSoon:true});
      return true;
    } catch(error) {
      if(generation!==studyPairRuntime.recoveryGeneration)return false;
      studyPairRuntime.recoveryDiagnostic={code:error.code || 'recovery_failed',name:error.name || 'Error',message:String(error.message || error).slice(0,1000),at:new Date().toISOString()};
      studyPairRuntime.recoveryError=studyPairText('暂未能恢复最近保存的进度，已有记录保留。请重试恢复；仍失败请联系研究者。','The latest saved progress could not be restored. Saved records are retained. Retry recovery; contact the researcher if it still fails.');
      studyPairRuntime.error=studyPairRuntime.recoveryError;showScreen('config');return false;
    } finally {
      if(generation===studyPairRuntime.recoveryGeneration){studyPairRuntime.recoveryPending=false;studyPairRuntime.recoveryPromise=null;renderStudyPairUi();}
    }
  })();
  studyPairRuntime.recoveryPromise=pending;return pending;
}

async function studyPairRetryRecovery(){
  if(studyPairRuntime.checkpointConflict){window.location.reload();return false;}
  const payload=await studyPairLoadCurrent({recover:false});
  if(payload.pair?.status==='completed')return true;
  const game=payload.pair?.games?.[payload.pair.currentGame];
  if(game?.sessionId) {
    const restored=await studyPairRecoverCurrent();
    if(restored!==false) {
      if(typeof studyAccountReturnComplete==='function')studyAccountReturnComplete(payload);
    } else if(typeof studyAccountReturnFailed==='function') {
      const error=new Error(studyPairRuntime.recoveryError || studyPairText('暂未能恢复原进度，请重试恢复。已有记录保留。','Saved progress could not be restored. Retry recovery; existing records are retained.'));
      error.code='account_return_restore_failed'; error.accountSafe=true; studyAccountReturnFailed(error);
    }
    return restored;
  }
  studyPairRuntime.recoveryError='';studyPairRuntime.error='';showScreen('config');return true;
}

async function studyPairBeforeBegin(participantId) {
  if (!/^P(?:[1-9]|[1-4][0-9]|50)$/.test(participantId)) {
    throw new Error(studyPairText("请输入研究者分配的编号 P1–P50（例如 P7），不需要姓名。", "Enter your assigned code P1–P50 (for example, P7), without a name."));
  }
  if(typeof studyAccountProgressCheck==='function')studyAccountProgressCheck(true);
  try {
    if (studyPairRuntime.initialization) await studyPairRuntime.initialization;
    if (studyPairRuntime.error&&!(typeof studyAccountIsLoginMode==='function'&&studyAccountIsLoginMode())) await studyPairLoadCurrent();
  } finally {
    if(typeof studyAccountProgressCheck==='function')studyAccountProgressCheck(false);
  }
  if(typeof studyAccountBeforeBegin==='function'&&await studyAccountBeforeBegin(participantId)!==true)return false;
  const pair = studyPairRuntime.pair;
  if (!pair) return;
  if (pair.participantId !== participantId) throw new Error(studyPairText("此浏览器已绑定另一个编号，请联系研究者。", "This browser is linked to another code. Contact the researcher."));
  if (pair.status === "completed") throw new Error(studyPairText("两局已经完成，不需要再次开始。", "Both games are complete; no new game is needed."));
  const game = pair.games[pair.currentGame];
  if (game.saved || game.completed) throw new Error(studyPairText("本局已保存，请使用“继续”按钮。", "This game is saved. Use the Continue button."));
  if (game.sessionId) {
    await studyPairRecoverCurrent();
    throw new Error(studyPairRuntime.recoveryError || studyPairText('已恢复本局，请从恢复后的页面继续。','This game has been restored. Continue from the restored page.'));
  }
}

async function requestStudyPairProfile(participantId) {
  const pair=studyPairRuntime.pair,currentProfile=studyPairRuntime.profile;
  if(pair?.participantId===participantId&&currentProfile?.pairId===pair.pairId&&currentProfile.gameLabel===pair.currentGame&&currentProfile.assignmentId&&currentProfile.sessionToken)return normalizeServerStudyProfile({profile:currentProfile});
  const payload = await studyPairRequest("/api/study/pair", {participantId});
  studyPairAccept(payload);
  const profile = normalizeServerStudyProfile(payload);
  if (profile.pairId !== payload.pair?.pairId || profile.gameLabel !== payload.pair?.currentGame) throw new Error("The study profile does not match the assigned game.");
  return profile;
}

function studyPairActivity() {
  if (document.visibilityState === "hidden") return "background";
  if (state.screen !== "game") return state.screen === "summary" ? "summary" : "setup";
  if(typeof gameRecoveryRuntime!=='undefined' && (gameRecoveryRuntime.paused || gameRecoveryRuntime.restoring))return 'blocked';
  if (state.dialogueAdvancePending) return "reading";
  if (state.isIntroPlaying || state.isScenePlaying || state.isGmThinking || state.activeEventLock || state.artifactTaskLoading || studyPairRuntime.initialSavePending) return "blocked";
  return "interactive";
}

function studyPairTick() {
  const telemetry = studyPairRuntime.telemetry;
  if (!telemetry || telemetry.sessionId !== state.sessionId) return;
  const now = performance.now(), interval = Math.max(0, now - telemetry.lastTick);
  const previous = telemetry.current;
    if (previous) {
    const stage = telemetry.stages[previous.stageId] ||= {wallClockMs: 0, visibleMs: 0, interactiveMs: 0, blockedMs: 0, readingMs: 0, backgroundMs: 0, setupMs: 0};
    if (!telemetry.endedAt) {
      telemetry.wallClockMs += interval;
      stage.wallClockMs += interval;
      if (previous.activity === "background") {telemetry.backgroundMs += interval;stage.backgroundMs += interval;}
      else {
        telemetry.visibleMs += interval;stage.visibleMs += interval;
        const key = `${previous.activity}Ms`;
        if (["interactiveMs", "blockedMs", "readingMs", "setupMs"].includes(key)) {telemetry[key] += interval;stage[key] += interval;}
      }
    } else if (previous.activity === "summary") telemetry.summaryVisibleMs += interval;
  }
  const activity = studyPairActivity();
  const stageId = state.screen === "game" || state.screen === "summary" ? String(state.stageStatus || "setup") : "setup";
  if (!previous || previous.activity !== activity || previous.stageId !== stageId) {
    telemetry.transitions.push({at: new Date().toISOString(), elapsedMs: Math.max(0, now - telemetry.monotonicStartedAt), activity, stageId});
    if (!telemetry.endedAt && previous && previous.stageId !== stageId) studyPairMarkCheckpointDirty('stage_boundary',{saveSoon:true});
  }
  telemetry.current = {activity, stageId};
  telemetry.lastTick = now;
  telemetry.observedElapsedMs=Math.max(0,now-telemetry.monotonicStartedAt);
}

function studyPairEvent(type, details = {}) {
  const telemetry = studyPairRuntime.telemetry;
  if (!telemetry) return;
  studyPairTick();
  telemetry.events.push({type, at: new Date().toISOString(), elapsedMs: Math.max(0, performance.now() - telemetry.monotonicStartedAt), ...details});
  studyPairMarkCheckpointDirty(type);
}

function studyPairAudioSettings() {
  // Presentation telemetry only. Never used as NPC context or game evidence.
  return {
    version: "study-audio-v1",
    voice: typeof voiceSettingsSnapshot === "function" ? voiceSettingsSnapshot() : null,
    music: typeof labBgmSnapshot === "function" ? labBgmSnapshot() : null,
    microphone: false,
    camera: false
  };
}

function studyPairRecordAudioSettings(reason = "settings_changed") {
  if (!studyPairRequested() || !studyPairRuntime.telemetry ||
      studyPairRuntime.sessionId !== state.sessionId ||
      !state.researchProfile?.pairId || studyPairRuntime.pair?.status === "completed") return;
  studyPairEvent("audio_settings", {
    reason, gameLabel: state.researchProfile.gameLabel, settings: studyPairAudioSettings()
  });
}

function studyPairRecordRecapExposure(owner) {
  if (typeof studyQuestionnaireGamePending === "function" && studyQuestionnaireGamePending()) return;
  if(!owner?.paired || owner.hub || state.screen!=="summary" || studyPairRuntime.pair?.status==="completed" || studyPairRuntime.sessionId!==state.sessionId || !studyPairRuntime.telemetry)return;
  const factsHash=SocialEvoCore.stableHash(owner.facts),events=studyPairRuntime.telemetry.events;
  if(events.some(event=>event.type==="recap_presentation_shown" && event.gameLabel===owner.gameLabel && event.factsHash===factsHash))return;
  // Post-game exposure, saved by the existing summary/ack checkpoint. This is
  // neither questionnaire completion nor a research measure or game interval.
  studyPairEvent("recap_presentation_shown",{gameLabel:owner.gameLabel,presentationVersion:"lab-paired-recap-ui-v1",recapVersion:owner.facts.version,factsHash,stageCardCount:owner.facts.stages.length});
}

function studyPairPrepareGame() {
  if (!studyPairRequested()) return;
  const now = performance.now();
  studyPairResetCheckpointRuntime();
  studyPairRuntime.dialogue = [];
  studyPairRuntime.retrieval = [];
  studyPairRuntime.sessionId = state.sessionId;
  studyPairRuntime.terminalRecord = null;
  studyPairRuntime.lastCheckpointSignature = "";
  studyPairRuntime.lastCheckpointAt = 0;
  studyPairRuntime.telemetry = {
    schemaVersion: "study-pair-timing-v1", sessionId: state.sessionId,
    startedAt: state.sessionStartedAt, monotonicStartedAt: now, lastTick: now, endedAt: "",
    wallClockMs: 0, visibleMs: 0, backgroundMs: 0, interactiveMs: 0, blockedMs: 0, readingMs: 0, setupMs: 0,
    summaryVisibleMs: 0, stages: {}, transitions: [], events: [], current: null,
    observedElapsedMs: 0, offlineMs: 0, offlineIntervals: [],
    method: "Mutually exclusive UI activity intervals sampled every 250 ms, at visibility/screen boundaries and research export. Concurrent requests are never summed. Interactive denotes available play, not proof of attention; reading denotes awaiting dialogue continuation."
  };
  studyPairTick();
}

function studyPairArchiveDialogue(entry) {
  if (!studyPairRequested() || !studyPairRuntime.telemetry || studyPairRuntime.sessionId !== state.sessionId) return;
  studyPairRuntime.dialogue.push({...studyPairClone(entry), archiveSequence: studyPairRuntime.dialogue.length + 1});
  // This archive hook runs after the line is presented, not when an NPC reply
  // is merely generated. Capture mid-scene progress without resending requests.
  studyPairMarkCheckpointDirty('dialogue',{saveSoon:true,delayMs:750});
}

function studyPairArchiveRetrieval(trace) {
  if (!studyPairRequested() || !studyPairRuntime.telemetry || studyPairRuntime.sessionId !== state.sessionId) return;
  studyPairRuntime.retrieval.push({...studyPairClone(trace), archiveSequence: studyPairRuntime.retrieval.length + 1});
  studyPairMarkCheckpointDirty('retrieval');
}

function studyPairResearchExport() {
  if (!studyPairRequested() || !state.researchProfile?.pairId) return {};
  studyPairTick();
  const telemetry = studyPairRuntime.telemetry;
  const timing = telemetry ? studyPairClone(telemetry) : null;
  if (timing) {delete timing.monotonicStartedAt;delete timing.lastTick;delete timing.current;}
  return {pairId: state.researchProfile.pairId, gameLabel: state.researchProfile.gameLabel, timing,
    audioSettings: studyPairAudioSettings()};
}

function studyPairArchiveExport() {
  if (!studyPairRequested() || !state.researchProfile?.pairId) return null;
  return {
    schemaVersion: "study-pair-readonly-archive-v1", sessionId: state.sessionId,
    dialogueHistory: studyPairClone(studyPairRuntime.dialogue),
    retrievalTraces: studyPairClone(studyPairRuntime.retrieval),
    dialogueCount: studyPairRuntime.dialogue.length, retrievalCount: studyPairRuntime.retrieval.length,
    modelContextUnchanged: true
  };
}

function studyPairResetCheckpointRuntime() {
  studyPairRuntime.checkpointGeneration++;
  studyPairRuntime.initialSaveResolve?.(false);studyPairRuntime.initialSaveResolve=null;studyPairRuntime.initialSavePending=false;
  for(const request of studyPairRuntime.checkpointQueue)request.resolve(false);
  studyPairRuntime.checkpointQueue=[];studyPairRuntime.checkpointJob=null;studyPairRuntime.checkpointPromise=null;
  studyPairRuntime.checkpointDirty=true;studyPairRuntime.dirtyRevision=0;studyPairRuntime.savedRevision=-1;studyPairRuntime.checkpointSequence=-1;
  studyPairRuntime.checkpointConflict=false;studyPairRuntime.failedCheckpoint=null;studyPairRuntime.checkpointError='';
  studyPairRuntime.terminalGate=null;studyPairRuntime.terminalPendingRecord=null;studyPairRuntime.acknowledgedCheckpointSequence=-1;
  if(studyPairRuntime.scheduledCheckpoint)clearTimeout(studyPairRuntime.scheduledCheckpoint);
  studyPairRuntime.scheduledCheckpoint=0;studyPairRuntime.scheduledCheckpointAt=0;studyPairRuntime.lastCheckpointAttemptAt=0;
  if(typeof cloudSaveReset==='function')cloudSaveReset();
}

function studyPairMarkCheckpointDirty(reason='state_changed',options={}) {
  if(!studyPairRequested() || !studyPairRuntime.telemetry || studyPairRuntime.sessionId!==state.sessionId)return;
  studyPairRuntime.checkpointDirty=true;studyPairRuntime.dirtyRevision++;
  if(options.saveSoon)studyPairScheduleCheckpoint(reason,options.delayMs??500);
  if(typeof cloudSaveChanged==='function')cloudSaveChanged();
}

function studyPairScheduleCheckpoint(reason='stable_action',delayMs=500) {
  const now=Date.now(),due=Math.max(now+Math.max(0,Number(delayMs)||0),studyPairRuntime.lastCheckpointAttemptAt+1500);
  // Keep the earliest deadline. Repeated draft keystrokes must not postpone a
  // displayed reply or event boundary indefinitely. One owner has one timer.
  if(studyPairRuntime.scheduledCheckpoint && studyPairRuntime.scheduledCheckpointAt<=due)return;
  if(studyPairRuntime.scheduledCheckpoint)clearTimeout(studyPairRuntime.scheduledCheckpoint);
  const generation=studyPairRuntime.checkpointGeneration,sessionId=state.sessionId;
  studyPairRuntime.scheduledCheckpointAt=due;
  studyPairRuntime.scheduledCheckpoint=setTimeout(()=>{
    studyPairRuntime.scheduledCheckpoint=0;studyPairRuntime.scheduledCheckpointAt=0;
    if(generation!==studyPairRuntime.checkpointGeneration || sessionId!==state.sessionId)return;
    // A manual save may have started since scheduling. Coalesce behind it, and
    // leave offline progress dirty for the existing reconnection save path.
    if(Date.now()<studyPairRuntime.lastCheckpointAttemptAt+1500){studyPairScheduleCheckpoint(reason,0);return;}
    if(navigator.onLine!==false)void studyPairSaveCheckpoint(reason);
  },Math.max(0,due-now));
}

function studyPairCheckpointKey() {
  const last=state.eventLedger?.at(-1),task=state.activeArtifactTask;
  // This small revision key is evaluated before the full export, NPC cloning or
  // evidence hashing. Elapsed wall time by itself does not dirty an idle game.
  return JSON.stringify([state.sessionId,studyPairRuntime.dirtyRevision,state.stageStatus,state.stageIndex,state.roundIndex,
    state.eventLedger?.length,last?.eventId,last?.status,studyPairRuntime.dialogue.length,studyPairRuntime.retrieval.length,
    state.storyBeatLedger?.length,state.stagePacing?.completed?.length,state.stagePacing?.status,state.stagePacing?.materialEvidence?.length,
    state.entryEpisode?.scopeReviewed,state.openWorkspaceDocumentIds,state.labCalendar?.elapsedMinutes,
    state.submittedArtifacts?.length,state.artifactScoreReports?.length,task?.taskId,task?.status,state.selectedArtifactOption,
    state.artifactDraft,state.selectedOption,state.selectedOptionIndex,state.userFeedback,
    document.getElementById('free-response')?.value,document.getElementById('side-talk-input')?.value,
    document.getElementById('artifact-draft-input')?.value]);
}

function studyPairCheckpointAutomatic(reason) {
  return ['periodic','visibility_hidden','pagehide','beforeunload','stage_boundary','stable_action','input_draft','session_recovered','connection_restored','dialogue','event_boundary','opening_line','opening_complete'].includes(reason);
}
function studyPairCheckpointCanSkip(reason){return studyPairCheckpointAutomatic(reason) && !['visibility_hidden','pagehide','beforeunload'].includes(reason);}
function studyPairSetCheckpointError(message){
  const previous=studyPairRuntime.checkpointError;studyPairRuntime.checkpointError=message;
  if(!studyPairRuntime.error || studyPairRuntime.error===previous){const changed=studyPairRuntime.error!==message;studyPairRuntime.error=message;return changed;}
  return false;
}

function studyPairRestoreCollection(exportPayload,recovery={}) {
  const appendix=recovery.latestCheckpoint?.export;
  const source=appendix?.session?.sessionId===exportPayload.session?.sessionId?appendix:exportPayload;
  const archive=source.researchArchive || {},raw=source.researchStudy?.timing || {};
  const pair=studyPairRuntime.pair,profile=state.researchProfile,activeGame=pair?.games?.[pair.currentGame];
  const resumeActive=Boolean(pair?.pairId===profile?.pairId&&pair?.currentGame===profile?.gameLabel&&activeGame?.completed===false&&activeGame?.saved===false&&activeGame.sessionId===exportPayload.session?.sessionId&&exportPayload.session?.sessionId===state.sessionId);
  studyPairResetCheckpointRuntime();
  studyPairRuntime.busy=false;studyPairRuntime.busyAction=null;
  studyPairRuntime.sessionId=exportPayload.session.sessionId;
  studyPairRuntime.dialogue=studyPairClone(archive.dialogueHistory || []);
  studyPairRuntime.retrieval=studyPairClone(archive.retrievalTraces || []);
  const now=performance.now(),values=[raw.observedElapsedMs,raw.wallClockMs+Number(raw.summaryVisibleMs||0),...(raw.events||[]).map(event=>event.elapsedMs),...(raw.transitions||[]).map(event=>event.elapsedMs)];
  const elapsed=Math.max(0,...values.filter(value=>Number.isFinite(value)));
  const reference=recovery.latestCheckpoint?.reference || recovery.reference || {};
  const savedAt=Date.parse(reference.receivedAt || ''),offlineMs=Number.isFinite(savedAt)?Math.max(0,Date.now()-savedAt):null;
  studyPairRuntime.telemetry={
    schemaVersion:'study-pair-timing-v1',sessionId:exportPayload.session.sessionId,startedAt:exportPayload.session.startedAt,
    wallClockMs:0,visibleMs:0,backgroundMs:0,interactiveMs:0,blockedMs:0,readingMs:0,setupMs:0,summaryVisibleMs:0,
    stages:{},transitions:[],events:[],endedAt:'',...studyPairClone(raw),
    endedAt:resumeActive?'':raw.endedAt||'',
    observedElapsedMs:elapsed,monotonicStartedAt:now-elapsed,lastTick:now,current:null,
    offlineMs:Number(raw.offlineMs||0)+(offlineMs??0),offlineIntervals:[...(raw.offlineIntervals||[]),{
      lastSavedAt:reference.receivedAt || null,restoredAt:new Date().toISOString(),gapMs:offlineMs,
      excludedFromActiveTime:true,method:'Unobserved interval from server save receipt to client restore; may include network time.'
    }]
  };
  studyPairRuntime.checkpointSequence=Math.max(-1,...[recovery.highestAcceptedSequence,reference.saveSequence,source.checkpoint?.saveSequence,exportPayload.checkpoint?.saveSequence].filter(Number.isInteger));
  studyPairRuntime.acknowledgedCheckpointSequence=studyPairRuntime.checkpointSequence;
  studyPairRuntime.initialSavePending=false;studyPairRuntime.initialSaveResolve=null;
  studyPairRuntime.lastCheckpointAt=Number.isFinite(savedAt)?savedAt:0;studyPairRuntime.lastCheckpointSignature='';
  studyPairRuntime.terminalRecord=recovery.source==='terminal'?{sessionId:exportPayload.session.sessionId,reason:exportPayload.terminal?.reason || 'summary',capturedAt:exportPayload.terminal?.capturedAt || exportPayload.session.endedAt,payload:exportPayload,persistence:{status:'persisted',persisted:true,completed:true,acknowledgedAt:recovery.reference?.receivedAt || ''}}:null;
  if(typeof cloudSaveAcceptRestored==='function')cloudSaveAcceptRestored(recovery.reference);
  if(resumeActive&&raw.endedAt)studyPairEvent('technical_timing_resumed',{gameLabel:state.researchProfile?.gameLabel,previousEndedAt:raw.endedAt,source:recovery.source||'checkpoint',originalRecordPreserved:true});
  studyPairEvent('session_restored',{gameLabel:state.researchProfile?.gameLabel,source:recovery.source || 'checkpoint',offlineGapMs:offlineMs});
}

function studyPairSaveCheckpoint(reason='periodic') {
  if(typeof cloudSaveLeavingForRestore==='function'&&cloudSaveLeavingForRestore()||typeof studyAccountAuthenticationPaused==='function'&&studyAccountAuthenticationPaused())return Promise.resolve(false);
  if(!studyPairRequested() || !state.researchProfile?.pairId || !studyPairRuntime.telemetry || studyPairRuntime.recoveryPending || studyPairRuntime.checkpointConflict || studyPairRuntime.terminalGate || studyPairRuntime.terminalPendingRecord || state.researchProfile.gameLabel!==studyPairRuntime.pair?.currentGame)return Promise.resolve(false);
  const automatic=studyPairCheckpointAutomatic(reason);
  if(studyPairRuntime.pair?.status==='completed' && automatic)return Promise.resolve(false);
  if(automatic && (studyPairRuntime.busy || studyPairRuntime.initialSavePending || document.visibilityState==='hidden' && reason==='periodic'))return Promise.resolve(false);
  const key=studyPairCheckpointKey();
  if(studyPairCheckpointCanSkip(reason) && !studyPairRuntime.checkpointDirty && key===studyPairRuntime.lastCheckpointSignature)return Promise.resolve(true);
  if(['visibility_hidden','pagehide','beforeunload'].includes(reason) && key===studyPairRuntime.lastCheckpointSignature && Date.now()-studyPairRuntime.lastCheckpointAt<500)return Promise.resolve(true);
  if(['visibility_hidden','pagehide','beforeunload'].includes(reason) && studyPairRuntime.checkpointJob?.key===key)return studyPairRuntime.checkpointJob.promise;
  if(reason==='periodic' && studyPairRuntime.checkpointJob)return studyPairRuntime.checkpointJob.promise;
  const generation=studyPairRuntime.checkpointGeneration,sessionId=state.sessionId;
  const promise=new Promise(resolve=>studyPairRuntime.checkpointQueue.push({reason,generation,sessionId,resolve}));
  studyPairFlushCheckpointQueue();return promise;
}

function studyPairFlushCheckpointQueue() {
  if(typeof cloudSaveLeavingForRestore==='function'&&cloudSaveLeavingForRestore()||typeof studyAccountAuthenticationPaused==='function'&&studyAccountAuthenticationPaused()){for(const request of studyPairRuntime.checkpointQueue)request.resolve(false);studyPairRuntime.checkpointQueue=[];return;}
  if(studyPairRuntime.terminalGate || studyPairRuntime.terminalPendingRecord || studyPairRuntime.checkpointConflict){for(const request of studyPairRuntime.checkpointQueue)request.resolve(false);studyPairRuntime.checkpointQueue=[];return;}
  if(studyPairRuntime.checkpointJob || !studyPairRuntime.checkpointQueue.length)return;
  const requests=studyPairRuntime.checkpointQueue.splice(0),generation=studyPairRuntime.checkpointGeneration,sessionId=state.sessionId;
  const current=requests.filter(request=>request.generation===generation && request.sessionId===sessionId);
  for(const request of requests)if(!current.includes(request))request.resolve(false);
  if(!current.length)return;
  const reason=current.at(-1).reason,key=studyPairCheckpointKey(),revision=studyPairRuntime.dirtyRevision;
  if(current.every(request=>studyPairCheckpointCanSkip(request.reason)) && !studyPairRuntime.checkpointDirty && key===studyPairRuntime.lastCheckpointSignature){for(const request of current)request.resolve(true);return;}
  let payload;
  const failed=studyPairRuntime.failedCheckpoint;
  const retry=failed?.generation===generation && failed.sessionId===sessionId && failed.key===key;
  try {payload=retry?failed.payload:sessionExportPayload();}
  catch(error){const changed=studyPairSetCheckpointError(studyPairText('尚未确认保存：','Saving is not confirmed: ')+error.message);for(const request of current)request.resolve(false);if(changed)renderStudyPairUi();return;}
  if(!retry)payload.checkpoint={reason,capturedAt:new Date().toISOString(),saveSequence:++studyPairRuntime.checkpointSequence};
  let bodyJson;
  try {bodyJson=retry?failed.bodyJson:JSON.stringify(payload);}
  catch(error){const changed=studyPairSetCheckpointError(studyPairText('尚未确认保存：','Saving is not confirmed: ')+error.message);for(const request of current)request.resolve(false);if(changed)renderStudyPairUi();return;}
  const token=state.researchProfile.sessionToken,job={generation,sessionId,key,promise:null};
  studyPairRuntime.checkpointJob=job;studyPairRuntime.lastCheckpointAttemptAt=Date.now();
  if(typeof cloudSaveChanged==='function')cloudSaveChanged();
  job.promise=(async()=>{
    let saved=false,shouldRender=false;
    try {
      const result=await studyPairRequest('/api/study/pair/checkpoint',payload,{token,bodyJson});
      if(result.persisted!==true)throw Error(studyPairText('服务器尚未确认保存，请重试。','The server has not confirmed saving. Please retry.'));
      if(generation!==studyPairRuntime.checkpointGeneration || sessionId!==state.sessionId)return false;
      studyPairRuntime.lastCheckpointSignature=key;studyPairRuntime.lastCheckpointAt=Date.now();studyPairRuntime.savedRevision=revision;
      if(typeof cloudSaveAcceptCheckpoint==='function')cloudSaveAcceptCheckpoint(result,payload);
      studyPairRuntime.checkpointDirty=studyPairRuntime.dirtyRevision!==revision;
      studyPairRuntime.failedCheckpoint=null;
      studyPairRuntime.acknowledgedCheckpointSequence=Math.max(studyPairRuntime.acknowledgedCheckpointSequence,payload.checkpoint.saveSequence);
      shouldRender=Boolean(studyPairRuntime.checkpointError && studyPairRuntime.error===studyPairRuntime.checkpointError);
      if(shouldRender)studyPairRuntime.error='';studyPairRuntime.checkpointError='';
      const label=state.researchProfile.gameLabel,localGame=studyPairRuntime.pair?.games?.[label],remoteGame=result.pair?.games?.[label];
      if(localGame && result.pair?.pairId===studyPairRuntime.pair?.pairId && !localGame.sessionId && remoteGame?.sessionId===sessionId)localGame.sessionId=sessionId;
      // Checkpoint receipts do not change assignment/order/game gates. Updating
      // the owner record is unnecessary for ordinary background acknowledgements.
      // Any confirmed save can release the original initial-save wait. This
      // also covers reconnection retries, not only a particular UI button.
      if(studyPairRuntime.initialSavePending&&studyPairRuntime.initialSaveResolve){const resolve=studyPairRuntime.initialSaveResolve;studyPairRuntime.initialSaveResolve=null;resolve();}
      saved=true;return true;
    } catch(error) {
      if(generation!==studyPairRuntime.checkpointGeneration || sessionId!==state.sessionId)return false;
      if(studyPairConflictCode(error.code)){
        studyPairFlagConflict(error.code);shouldRender=true;
        for(const request of studyPairRuntime.checkpointQueue)request.resolve(false);studyPairRuntime.checkpointQueue=[];
        return false;
      }
      studyPairRuntime.failedCheckpoint={generation,sessionId,key,payload,bodyJson};
      const message=studyPairText('尚未确认保存：','Saving is not confirmed: ')+error.message;
      shouldRender=studyPairSetCheckpointError(message);return false;
    } finally {
      for(const request of current)request.resolve(saved);
      if(studyPairRuntime.checkpointJob===job){
        studyPairRuntime.checkpointJob=null;studyPairRuntime.checkpointPromise=null;
        if(shouldRender)renderStudyPairUi();
        if(typeof cloudSaveChanged==='function')cloudSaveChanged();
        if(studyPairRuntime.checkpointQueue.length)queueMicrotask(studyPairFlushCheckpointQueue);
      }
    }
  })();studyPairRuntime.checkpointPromise=job.promise;
}

async function studyPairAwaitInitialSave() {
  if (!studyPairRequested()) return true;
  const sessionId=state.sessionId,generation=studyPairRuntime.checkpointGeneration;
  studyPairRuntime.initialSavePending = true;
  studyPairEvent("game_entered", {gameLabel: state.researchProfile.gameLabel});
  studyPairRecordAudioSettings("game_started");
  renderStudyPairUi();
  const saved = await studyPairSaveCheckpoint("game_started");
  if(sessionId!==state.sessionId || generation!==studyPairRuntime.checkpointGeneration)return false;
  if (!saved) await new Promise(resolve => {studyPairRuntime.initialSaveResolve = resolve;renderStudyPairUi();});
  if(sessionId!==state.sessionId || generation!==studyPairRuntime.checkpointGeneration)return false;
  studyPairRuntime.initialSavePending = false;
  studyPairTick();renderStudyPairUi();
  return true;
}

function studyPairOnSummary() {
  if (typeof studyQuestionnaireOnSummary === "function") studyQuestionnaireOnSummary();
  if (!studyPairRequested() || !studyPairRuntime.telemetry) return;
  const telemetry = studyPairRuntime.telemetry;
  studyPairTick();
  if (!telemetry.endedAt) {
    telemetry.endedAt = new Date().toISOString();
    studyPairEvent("summary_shown", {gameLabel: state.researchProfile.gameLabel});
  }
}

async function studyPairPersistTerminal(record) {
  if(record.uploadPromise)return record.uploadPromise;
  const upload=studyPairUploadTerminal(record);record.uploadPromise=upload;
  try{return await upload;}
  finally{if(record.uploadPromise===upload)record.uploadPromise=null;}
}

async function studyPairUploadTerminal(record) {
  if(typeof cloudSaveLeavingForRestore==='function'&&cloudSaveLeavingForRestore()||typeof studyAccountAuthenticationPaused==='function'&&studyAccountAuthenticationPaused())return false;
  const token=state.researchProfile.sessionToken,sessionId=state.sessionId,generation=studyPairRuntime.checkpointGeneration;
  if(record.payload?.session?.sessionId!==sessionId || record.payload?.researchStudy?.gameLabel!==state.researchProfile.gameLabel)return false;
  if(studyPairRuntime.terminalPendingRecord && studyPairRuntime.terminalPendingRecord!==record)return false;
  const owner={};studyPairRuntime.terminalGate=owner;studyPairRuntime.terminalPendingRecord=record;studyPairRuntime.terminalRecord=record;
  record.persistence={status:'pending',attemptedAt:new Date().toISOString(),persisted:false};renderStudyPairUi();
  const current=()=>sessionId===state.sessionId && generation===studyPairRuntime.checkpointGeneration && studyPairRuntime.terminalGate===owner;
  try {
    if(studyPairRuntime.checkpointConflict)throw Object.assign(Error(studyPairRuntime.recoveryError || 'Newer saved progress requires recovery.'),{code:'terminal_checkpoint_conflict'});
    // Seal the facts at the actual ending; later async UI work cannot mutate
    // references inside the cached terminal while an earlier upload settles.
    if(!record.payloadFrozen){record.payload=studyPairClone(record.payload);record.payloadFrozen=true;}
    if(studyPairRuntime.scheduledCheckpoint)clearTimeout(studyPairRuntime.scheduledCheckpoint);studyPairRuntime.scheduledCheckpoint=0;
    for(const request of studyPairRuntime.checkpointQueue)request.resolve(false);studyPairRuntime.checkpointQueue=[];
    const inFlight=studyPairRuntime.checkpointJob;
    const progressSaved=inFlight?await inFlight.promise:true;
    if(!current())return false;
    if(studyPairRuntime.checkpointConflict)throw Object.assign(Error(studyPairRuntime.recoveryError),{code:'terminal_checkpoint_conflict'});
    if(!progressSaved)throw Error(studyPairText('最近一份进度尚未确认保存，请重试保存；不会重发角色回复。','The latest progress save is not confirmed. Retry saving; NPC replies will not be requested again.'));
    const failed=studyPairRuntime.failedCheckpoint;
    if(failed){
      // This is an explicit retry of a previously failed terminal attempt. The
      // pending checkpoint uses its original bytes/sequence, never a fresh ending.
      if(!record.hadSaveFailure)throw Error(studyPairText('上一份进度尚未确认保存，请重试保存。','The previous progress save is not confirmed. Retry saving.'));
      const confirmed=await studyPairRequest('/api/study/pair/checkpoint',failed.payload,{token,bodyJson:failed.bodyJson});
      if(!current())return false;
      if(confirmed.persisted!==true)throw Error(studyPairText('服务器尚未确认保存进度。','The server has not confirmed saving progress.'));
      studyPairRuntime.acknowledgedCheckpointSequence=Math.max(studyPairRuntime.acknowledgedCheckpointSequence,failed.payload.checkpoint.saveSequence);
      studyPairRuntime.failedCheckpoint=null;
    }
    if(!current())return false;
    if(studyPairRuntime.checkpointConflict)throw Object.assign(Error(studyPairRuntime.recoveryError),{code:'terminal_checkpoint_conflict'});
    if(!record.bodyJson){
      if(record.payload.terminal.baseCheckpointSequence===undefined && studyPairRuntime.acknowledgedCheckpointSequence>=0)record.payload.terminal.baseCheckpointSequence=studyPairRuntime.acknowledgedCheckpointSequence;
      record.bodyJson=JSON.stringify(record.payload);
    }
    const payload=await studyPairRequest('/api/session-terminal',record.payload,{token,bodyJson:record.bodyJson});
    if(!current())return false;
    if(payload.persisted!==true)throw Error(studyPairText('服务器尚未确认完整记录已保存。','The server has not confirmed saving the complete record.'));
    record.persistence={...record.persistence,status:'persisted',persisted:true,completed:payload.completed===true,acknowledgedAt:new Date().toISOString()};
    studyPairRuntime.error='';studyPairRuntime.checkpointError='';studyPairRuntime.terminalPendingRecord=null;studyPairRuntime.terminalGate=null;
    if(payload.pair)studyPairAccept({...payload,profile:payload.profile || studyPairRuntime.profile});
    else await studyPairLoadCurrent({recover:false});
    if(sessionId!==state.sessionId || generation!==studyPairRuntime.checkpointGeneration)return false;
    studyPairEvent('terminal_upload_ack',{gameLabel:record.payload.researchStudy?.gameLabel,persisted:true,completed:payload.completed===true});
    await studyPairSaveCheckpoint('terminal_upload_ack');
    if(sessionId!==state.sessionId || generation!==studyPairRuntime.checkpointGeneration)return false;
    if(typeof studyQuestionnaireAfterTerminal==='function'){
      try{await studyQuestionnaireAfterTerminal();}
      catch(error){studyPairRuntime.error=studyPairText('问卷尚未确认读取：','Questionnaire loading is not confirmed: ')+error.message;renderStudyPairUi();}
    }
    return true;
  } catch(error) {
    if(sessionId!==state.sessionId || generation!==studyPairRuntime.checkpointGeneration)return false;
    record.hadSaveFailure=true;record.persistence={...record.persistence,status:'error',persisted:false,error:error.message,errorCode:error.code || ''};
    if(studyPairConflictCode(error.code)){
      studyPairFlagConflict(error.code);
    } else studyPairRuntime.error=studyPairText('完整游戏记录尚未确认保存：','Saving the complete game record is not confirmed: ')+error.message;
    return false;
  } finally {
    if(studyPairRuntime.terminalGate===owner)studyPairRuntime.terminalGate=null;
    if(sessionId===state.sessionId && generation===studyPairRuntime.checkpointGeneration)renderStudyPairUi();
  }
}

function studyPairCurrentSaved() {
  const pair = studyPairRuntime.pair;
  return Boolean(pair && pair.games?.[pair.currentGame]?.saved && pair.games[pair.currentGame].completed);
}

async function studyPairContinue() {
  if (studyPairRuntime.busy || !studyPairCurrentSaved()) return;
  // The A→B click must activate audio before checkpoint/advance requests yield.
  // beginGame reuses these contexts rather than creating blocked ones later.
  const audioPrepared = studyPairRuntime.pair?.currentGame === "A" && typeof prepareGameAudioGesture === "function";
  if (audioPrepared) prepareGameAudioGesture();
  const busyAction={};studyPairRuntime.busyAction=busyAction;
  studyPairRuntime.busy = true;studyPairRuntime.error = "";renderStudyPairUi();
  try {
    const pair = studyPairRuntime.pair;
    if (typeof studyQuestionnaireBeforeContinue === "function" && !await studyQuestionnaireBeforeContinue()) return;
    if (studyPairRuntime.telemetry && studyPairRuntime.sessionId === state.sessionId) {
      studyPairEvent("summary_continue", {gameLabel: pair.currentGame});
      if (!await studyPairSaveCheckpoint("summary_continue")) return;
    }
    const next = await studyPairRequest(pair.currentGame === "A" ? "/api/study/pair/advance" : "/api/study/pair/complete", {});
    studyPairAccept(next);
    if (pair.currentGame === "B") {showStudyPairComplete();return;}
    document.getElementById("participant-id").value = next.pair.participantId;
    showScreen("config");
    await beginGame({audioPrepared});
  } catch (error) {
    if(studyPairConflictCode(error.code)){studyPairFlagConflict(error.code);return;}
    // A transition can commit while its response is lost. Reconcile from the
    // durable owner record before offering a retry with a now-obsolete token.
    try {
      const current = await studyPairRequest("/api/study/pair");
      studyPairAccept(current, true);
      if (current.pair?.status === "completed") {showStudyPairComplete();return;}
      if (current.pair?.currentGame === "B" && !current.pair.games.B.sessionId && state.researchProfile?.gameLabel === "A") {
        showScreen("config");await beginGame({audioPrepared});return;
      }
    } catch (_) { /* Preserve the original failure and keep the existing record. */ }
    studyPairRuntime.error = error.message;
  }
  finally {if(studyPairRuntime.busyAction===busyAction){studyPairRuntime.busyAction=null;studyPairRuntime.busy = false;renderStudyPairUi();}}
}

async function studyPairRetrySave() {
  if (studyPairRuntime.busy) return;
  const busyAction={};studyPairRuntime.busyAction=busyAction;studyPairRuntime.busy = true;renderStudyPairUi();
  try {
    if(studyPairRuntime.recoveryError || studyPairRuntime.pair?.games?.[studyPairRuntime.pair.currentGame]?.sessionId && studyPairRuntime.sessionId!==studyPairRuntime.pair.games[studyPairRuntime.pair.currentGame].sessionId) {
      await studyPairRetryRecovery();
    } else if (studyPairRuntime.initialSavePending) {
      if (await studyPairSaveCheckpoint("game_started_retry")) {
        const resolve = studyPairRuntime.initialSaveResolve;studyPairRuntime.initialSaveResolve = null;resolve?.();
      }
    } else if (studyPairRuntime.terminalRecord && !studyPairRuntime.terminalRecord.persistence?.persisted) {
      await studyPairPersistTerminal(studyPairRuntime.terminalRecord);
    } else if (typeof studyQuestionnaireRuntime !== "undefined" && studyQuestionnaireRuntime.enabled && studyPairCurrentSaved()) {
      studyPairRuntime.error="";await studyQuestionnaireAfterTerminal();
    } else if (studyPairRuntime.telemetry) await studyPairSaveCheckpoint("manual_retry");
    else await studyPairLoadCurrent();
  } catch (error) {studyPairRuntime.error = error.message;}
  finally {if(studyPairRuntime.busyAction===busyAction){studyPairRuntime.busyAction=null;studyPairRuntime.busy = false;renderStudyPairUi();}}
}

function studyPairResumeFromSetup() {
  const game=studyPairRuntime.pair?.games?.[studyPairRuntime.pair.currentGame];
  if(game?.sessionId && (studyPairRuntime.recoveryError || studyPairRuntime.sessionId!==game.sessionId || state.sessionId!==game.sessionId))return studyPairRetryRecovery();
  return studyPairContinue();
}

function showStudyPairComplete() {
  if (typeof studyQuestionnaireComparisonComplete === "function" && !studyQuestionnaireComparisonComplete()) {
    void studyQuestionnaireLoad().then(payload=>studyQuestionnairePresent(payload,()=>void studyPairContinue(),['comparison'])).catch(error=>{studyPairRuntime.error=error.message;renderStudyPairUi();});
    return;
  }
  showScreen("studyComplete");renderStudyPairUi();
  void studyPairLoadKeepsakes();
}

async function studyPairLoadKeepsakes() {
  const pair=studyPairRuntime.pair;
  if(pair?.status!=="completed" || studyPairRuntime.keepsakeLoading)return;
  const request=++studyPairRuntime.keepsakeRequest;
  studyPairRuntime.keepsakeLoading=true;studyPairRuntime.keepsakeError="";renderStudyPairKeepsakeUi();
  try {
    const data=await studyPairRequest("/api/study/pair/keepsakes");
    if(request!==studyPairRuntime.keepsakeRequest || pair.pairId!==studyPairRuntime.pair?.pairId)return;
    if(data.pairId!==pair.pairId || data.ready!==true || !data.games?.A?.recap || !data.games?.B?.recap)throw Error(studyPairText("两局回顾尚未就绪，请稍后重试。","The two saved recaps are not ready. Please retry later."));
    studyPairRuntime.keepsakes=data;
    renderStudyPairSelectedKeepsake();
  }catch(error) {studyPairRuntime.keepsakeError=error.message;}
  finally {if(request===studyPairRuntime.keepsakeRequest){studyPairRuntime.keepsakeLoading=false;renderStudyPairKeepsakeUi();}}
}

function renderStudyPairSelectedKeepsake() {
  const data=studyPairRuntime.keepsakes;
  if(state.screen!=="studyComplete" || studyPairRuntime.pair?.status!=="completed" || data?.pairId!==studyPairRuntime.pair.pairId)return;
  renderLabRecapKeepsake(studyPairRuntime.keepsakeLabel,data.games[studyPairRuntime.keepsakeLabel],data.pairId);
}

function renderStudyPairKeepsakeUi() {
  const section=document.getElementById("study-pair-keepsakes");if(!section)return;
  section.hidden=studyPairRuntime.pair?.status!=="completed";
  document.getElementById("study-keepsake-title").textContent=studyPairText("两局经历，各留一份回忆","A keepsake for each game");
  document.getElementById("study-keepsake-message").textContent=studyPairText("两局记录均已保存。可以切换查看各局的称号与四阶段回顾，并选择是否绘制结局插画。绘制使用项目已配置的图像 API，参与者无需支付。绘制不会改动游戏或评分。","Both game records are saved. Switch between each title and four-stage recap, and choose whether to generate an ending illustration using the project’s configured image API, at no cost to participants. Illustration changes neither game nor scores.");
  document.getElementById("study-keepsake-status").textContent=studyPairRuntime.keepsakeError || (studyPairRuntime.keepsakeLoading?studyPairText("正在读取各局已保存的回顾…","Loading each saved recap…"):"");
  const reload=document.getElementById("study-keepsake-reload");reload.disabled=studyPairRuntime.keepsakeLoading;reload.textContent=studyPairText("重新读取已保存回顾／插画","Reload saved recaps / illustrations");
  for(const label of ["A","B"]){const button=document.getElementById(`study-keepsake-${label.toLowerCase()}`);button.textContent=studyPairLabel(label);button.disabled=studyPairRuntime.keepsakeLoading||!studyPairRuntime.keepsakes;button.setAttribute("aria-pressed",String(studyPairRuntime.keepsakeLabel===label));}
}

function renderStudyPairUi() {
  if (!studyPairRequested()) return;
  document.body.classList.add("paired-study");
  const pair = studyPairRuntime.pair, game = pair?.games?.[pair.currentGame], saved = studyPairCurrentSaved();
  const input = document.getElementById("participant-id");
  if (input) {input.pattern = "P([1-9]|[1-4][0-9]|50)";input.maxLength = 3;input.placeholder = "P1–P50";input.readOnly = Boolean(pair)&&!(typeof studyAccountAuthenticationPaused==='function'&&studyAccountAuthenticationPaused());input.disabled = input.readOnly;}
  const begin=document.getElementById('begin-game-btn');if(begin && (game?.sessionId || studyPairRuntime.recoveryPending)&&!(typeof studyAccountAuthenticationPaused==='function'&&studyAccountAuthenticationPaused()))begin.disabled=true;
  const hint = document.getElementById("participant-id-hint");
  if (hint) hint.textContent = studyPairText("请输入研究者分配给你的 P1–P50 编号。编号首次使用后将保留，请勿输入姓名。", "Enter the P1–P50 code assigned by the researcher. A code is reserved after its first use; do not enter a name.");
  const briefNote = document.getElementById("study-pair-brief-note");
  if (briefNote) {
    briefNote.hidden = false;
    briefNote.textContent = studyPairText("本次参与包含依次进行的 A、B 两局。你的编号、两局的完整对话、选择、任务提交、操作与时长记录会自动保存并传给研究者。请不要输入姓名、联系方式或其他个人资料。刷新或重新打开此浏览器时会尝试恢复最近已确认保存的进度；未完成的请求不会自动重发。若未能恢复，请使用重试恢复或联系研究者。", "Participation includes games A and B in sequence. Your code, complete dialogue, choices, task submissions, activity and timing records are automatically saved for the researcher. Do not enter personal information. Reloading or reopening this browser attempts to restore the latest confirmed save; unfinished requests are never automatically resent. Retry recovery or contact the researcher if restoration fails.");
  }
  const status = document.getElementById("study-pair-status");
  if (status) {
    status.hidden = false;
    const heading = document.getElementById("study-pair-heading"), description = document.getElementById("study-pair-description");
    heading.textContent = pair ? `${pair.participantId} · ${studyPairLabel()}` : studyPairText("两局游戏", "Two game sessions");
    description.textContent = studyPairRuntime.recoveryPending ? studyPairText('正在恢复本局已保存的进度，请稍候…','Restoring this game’s saved progress. Please wait…') : studyPairRuntime.error || (saved ? studyPairText("本局完整游戏记录已由服务器确认保存，可以继续。", "The server has confirmed saving this game's complete record. You can continue.") : game?.sessionId && studyPairRuntime.restored ? studyPairText("本局进度已保存；重新打开页面会恢复同一局，不会自动重开或重新发送未完成的请求。", "This game has a saved record. Reopening the page restores the same game without restarting or resending unfinished requests.") : studyPairText("你将依次完成 A、B 两局。每局结束后可以查看本局回顾，记录确认保存后再继续。", "You will play games A and B in sequence. Each game has its own recap; continue once saving is confirmed."));
    const continueButton = document.getElementById("study-pair-resume-btn");
    continueButton.hidden = !saved && !studyPairRuntime.recoveryError;continueButton.disabled = studyPairRuntime.busy || studyPairRuntime.recoveryPending;
    continueButton.textContent = studyPairRuntime.recoveryError ? studyPairText('重试恢复本局','Retry restoring this game') : pair?.currentGame === "A" ? studyPairText("继续第二局", "Continue to the second game") : studyPairText("完成两局", "Finish both games");
  }
  const summary = document.getElementById("study-pair-summary-controls");
  if (summary) {
    summary.hidden = false;
    document.getElementById("study-pair-summary-title").textContent = `${studyPairLabel(state.researchProfile?.gameLabel)} · ${studyPairText("本局回顾", "Game recap")}`;
    const text = document.getElementById("study-pair-save-status");
    text.textContent = studyPairRuntime.error || (saved ? studyPairText("本局完整游戏记录已确认保存。", "The complete game record has been saved.") : studyPairRuntime.terminalRecord?.persistence?.persisted ? studyPairText("本次停止前的记录已确认保存。两局流程尚未完成，请联系研究者处理。", "The record up to this stop has been saved. The two-game sequence is incomplete; contact the researcher.") : studyPairRuntime.terminalRecord?.persistence?.status === "pending" ? studyPairText("正在上传完整游戏记录，请保持页面打开…", "Uploading the complete game record. Keep this page open…") : studyPairText("完整游戏记录尚未确认保存，请重试或联系研究者。", "Saving the complete game record has not been confirmed. Retry or contact the researcher."));
    const continueButton = document.getElementById("study-pair-continue-btn");
    continueButton.disabled = !saved || studyPairRuntime.busy || Boolean(studyPairRuntime.error);
    continueButton.textContent = pair?.currentGame === "A" ? studyPairText("查看完毕，继续第二局", "Continue to the second game") : studyPairText("查看完毕，完成两局", "Finish both games");
    const retry = document.getElementById("study-pair-retry-btn");
    retry.hidden = !studyPairRuntime.error;retry.disabled = studyPairRuntime.busy;retry.textContent = studyPairRuntime.recoveryError?studyPairText('重试恢复','Retry recovery'):studyPairText("重试保存", "Retry saving");
  }
  const loadRetry = document.getElementById("study-pair-load-retry-btn");
  if (loadRetry) {loadRetry.hidden = !studyPairRuntime.error;loadRetry.disabled = studyPairRuntime.busy || studyPairRuntime.recoveryPending;loadRetry.textContent = studyPairRuntime.recoveryError ? studyPairText('重试恢复','Retry recovery') : studyPairText("重试读取 / 保存", "Retry loading / saving");}
  const banner = document.getElementById("study-pair-save-banner");
  if (banner) {
    banner.hidden = !(state.screen === "game" && (studyPairRuntime.initialSavePending || studyPairRuntime.error));
    document.getElementById("study-pair-save-banner-text").textContent = studyPairRuntime.error || studyPairText("正在确认本局记录，请稍候…", "Confirming this game's record. Please wait…");
    const retry=document.getElementById("study-pair-game-retry-btn");retry.hidden = !studyPairRuntime.error;retry.textContent=studyPairRuntime.recoveryError?studyPairText('重试恢复','Retry recovery'):studyPairText('重试保存','Retry saving');
  }
  const feedbackHeading = document.getElementById("summary-feedback-heading");
  if(feedbackHeading?.closest('section'))feedbackHeading.closest('section').hidden=Boolean(typeof studyQuestionnaireRuntime!=="undefined" && studyQuestionnaireRuntime.enabled);
  if (feedbackHeading) feedbackHeading.textContent = studyPairText("本局简短反馈（选填）", "Brief game feedback (optional)");
  for (const id of ["summary-rating", "summary-feedback", "submit-feedback-btn"]) {
    const field = document.getElementById(id);
    if (field) field.disabled = studyPairRuntime.busy;
  }
  const completeTitle = document.getElementById("study-complete-title"), completeMessage = document.getElementById("study-complete-message");
  if (completeTitle) completeTitle.textContent = studyPairText("两局游戏已完成", "Both games are complete");
  if (completeMessage) completeMessage.textContent = studyPairText(`${pair?.participantId || ""}，感谢参与。A、B 两局完整游戏记录均已确认保存。`, `${pair?.participantId || ""}, thank you. The complete records for both games A and B have been saved.`);
  const questionnaireTitle = document.getElementById("study-questionnaire-title"), questionnaireMessage = document.getElementById("study-questionnaire-placeholder");
  if (questionnaireTitle) questionnaireTitle.textContent = studyPairText("结束后问卷", "Post-game questionnaire");
  if (questionnaireMessage) questionnaireMessage.textContent = typeof studyQuestionnaireRuntime !== "undefined" && studyQuestionnaireRuntime.enabled
    ? studyPairText("本次安排的问卷回答或跳过选择已由服务器确认保存。感谢你的反馈。", "The server has confirmed saving your questionnaire answers or choices to skip. Thank you for your feedback.")
    : studyPairText("问卷尚未开放，请按研究者的说明进行下一步。", "The questionnaire is not available yet. Follow the researcher's instructions for the next step.");
  const questionnaireWait=document.getElementById('study-questionnaire-summary-wait-text'),questionnaireRetry=document.getElementById('study-questionnaire-summary-retry');
  if(questionnaireWait)questionnaireWait.textContent=studyPairRuntime.error || studyPairText('正在确认本局记录；之后请先填写本局体验简表，再查看完整回顾。','Confirming this game’s record. A brief questionnaire comes before the full recap.');
  if(questionnaireRetry){questionnaireRetry.hidden=!studyPairRuntime.error;questionnaireRetry.disabled=studyPairRuntime.busy;questionnaireRetry.textContent=studyPairRuntime.recoveryError?studyPairText('重试恢复','Retry recovery'):studyPairText('重试读取／保存','Retry loading / saving');questionnaireRetry.onclick=studyPairRetrySave;}
  if(typeof renderStudyAccountUi==='function')renderStudyAccountUi();
  if(typeof cloudSaveChanged==='function')cloudSaveChanged();
  renderStudyPairKeepsakeUi();
  if(state.screen==="studyComplete" && labRecapPairedRuntime?.language!==state.language)renderStudyPairSelectedKeepsake();
}

function initializeStudyPair() {
  if (!studyPairRequested()) return;
  document.getElementById("study-pair-continue-btn").addEventListener("click", studyPairContinue);
  document.getElementById("study-keepsake-reload").addEventListener("click",studyPairLoadKeepsakes);
  for(const label of ["A","B"])document.getElementById(`study-keepsake-${label.toLowerCase()}`).addEventListener("click",()=>{studyPairRuntime.keepsakeLabel=label;renderStudyPairSelectedKeepsake();renderStudyPairKeepsakeUi();});
  document.getElementById("study-pair-resume-btn").addEventListener("click", studyPairResumeFromSetup);
  for (const id of ["study-pair-retry-btn", "study-pair-game-retry-btn", "study-pair-load-retry-btn"]) document.getElementById(id).addEventListener("click", studyPairRetrySave);
  document.addEventListener("visibilitychange", () => {
    studyPairTick();
    if (document.visibilityState === "hidden") void studyPairSaveCheckpoint("visibility_hidden");
  });
  window.setInterval(studyPairTick, 250);
  document.addEventListener('input',event=>{if(event.target?.closest?.('#game-screen'))studyPairMarkCheckpointDirty('input_draft',{saveSoon:true,delayMs:1500});});
  document.addEventListener('change',event=>{if(event.target?.closest?.('#game-screen'))studyPairMarkCheckpointDirty('input_draft',{saveSoon:true,delayMs:500});});
  window.setInterval(() => {if (state.screen === "game" && document.visibilityState!=='hidden' && !studyPairRuntime.initialSavePending) void studyPairSaveCheckpoint("periodic");}, 30000);
  studyPairRuntime.initialization = studyPairLoadCurrent().catch(error => {studyPairRuntime.error = error.message;renderStudyPairUi();});
  renderStudyPairUi();
}
