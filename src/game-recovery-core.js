// A recovery record is data, never a continuation of a network transaction.
(function gameRecoveryCoreFactory(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GameRecoveryCore = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function buildGameRecoveryCore() {
  'use strict';

  const SCHEMA_VERSION = 'socialevonpc-game-resume-v1';
  const PROTOCOL = 'lab-entry-rq3-v22-paired-ab';
  const NORMAL_ENDINGS = ['success', 'partial_outcome', 'unhealthy_failure'];
  const TECHNICAL_ENDINGS = ['backend_failure', 'incomplete', 'session_unavailable'];
  const STAGES = ['stage_1_entry', 'stage_2_first_failure', 'stage_3_revision_conflict', 'stage_4_credit'];
  const POLLUTION = new Set(['__proto__', 'prototype', 'constructor']);
  const FORBIDDEN = new Set([
    'sessionToken', 'apiKey', 'apiKeys', 'api_key', 'ownerSecret', 'authorization', 'Authorization',
    'researchProfile', 'runtimeManifest', 'adminMode', 'sessionAdminModeAtStart',
    'configAdminUnlocked', 'videoModality', 'voiceModality', 'studyPair',
    'controller', 'promise', 'resolve', 'reject', 'timeoutId', 'timerId',
    'rawFrame', 'rawFrames', 'imageDataUrl', 'mediaStream', 'audioContext'
  ]);
  // Canonical V2 data (NPCs, memories, artifacts, events, outcomes) is NOT duplicated here.
  const EXTRA_FIELDS = [
    'screen', 'briefAcknowledged', 'sessionClosed', 'sessionEndedAt', 'roundIndex',
    'selectedOption', 'selectedOptionIndex', 'openingResponseAnswered', 'openingPresentation', 'sideTalkDraftIntent',
    'playerPosition', 'lastSpeaker', 'worldBubbleMode', 'playerDirection', 'playerWalkFrame',
    'activeSideTalkNpcId', 'currentPrivateConversationNpcId', 'activeArtifactTask',
    'artifactDraft', 'selectedArtifactOption', 'artifactSubmissionStatus',
    'openWorkspaceDocumentIds', 'pendingLaptopCue', 'eventSequence', 'committedNpcEvents',
    'apiCallSequence', 'stageDirectorCue', 'globalAttentionScheduleEnabled',
    'pendingTerminalOutcome', 'pendingPostDecisionContinuation', 'pendingDecision',
    'interactionsSinceDecision', 'totalSideTalks', 'sideTalkSemanticHistory',
    'sideTalkOpportunityKeys', 'sideTalkRootRewardKeys', 'sideTalkContinuityContext',
    'sideTalkContextLine', 'sideTalkRecovery', 'artifactRecovery', 'decisionPanelVisible'
  ];
  const CAPABILITY_KEYS = ['storeMemory', 'retrieveMemory', 'useRag', 'useRecentWindow',
    'updateEmotion', 'updateSurfaceLine', 'updateTrustBelonging', 'updateRelationship',
    'updateValueTradeoffs', 'updateStrategy'];

  function extraDefaults() {
    return {briefAcknowledged:true, selectedOption:'', selectedOptionIndex:-1,
      openingResponseAnswered:false, openingPresentation:null, sideTalkDraftIntent:null,
      playerPosition:{x:50,y:84}, lastSpeaker:null, worldBubbleMode:'',
      playerDirection:'down', playerWalkFrame:0, activeSideTalkNpcId:null,
      currentPrivateConversationNpcId:null, activeArtifactTask:null, artifactDraft:'',
      selectedArtifactOption:'', artifactSubmissionStatus:'', openWorkspaceDocumentIds:[],
      pendingLaptopCue:null, stageDirectorCue:'', globalAttentionScheduleEnabled:true,
      pendingTerminalOutcome:null, pendingPostDecisionContinuation:null, pendingDecision:null,
      interactionsSinceDecision:0, totalSideTalks:0, sideTalkSemanticHistory:[],
      sideTalkOpportunityKeys:[], sideTalkRootRewardKeys:[], sideTalkContinuityContext:null,
      sideTalkContextLine:'', sideTalkRecovery:null, artifactRecovery:null, decisionPanelVisible:false};
  }

  function fail(message) { throw new Error('Game recovery: ' + message); }
  function object(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(label + ' must be an object.');
    return value;
  }
  function array(value, label) {
    if (!Array.isArray(value)) fail(label + ' must be a complete array.');
    return value;
  }
  function text(value, label) {
    if (typeof value !== 'string' || !value.trim()) fail(label + ' is missing.');
    return value;
  }
  function integer(value, label, min = 0, max = Number.MAX_SAFE_INTEGER) {
    if (!Number.isSafeInteger(value) || value < min || value > max) fail(label + ' is invalid.');
    return value;
  }
  function equal(actual, expected, label) {
    if (actual !== expected) fail(label + ' does not match the current game.');
  }
  function timestamp(value, label) {
    if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) fail(label + ' is invalid.');
    return value;
  }
  // Reject accessors/custom prototypes/cycles rather than execute or silently reinterpret them.
  // Privileges and live handles are intentionally absent even if present in an old record.
  function json(value, path = 'record', ancestors = new Set(), depth = 0) {
    if (depth > 90) fail(path + ' is too deeply nested.');
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (!value || typeof value !== 'object') fail(path + ' must contain only JSON values.');
    if (ancestors.has(value)) fail(path + ' contains a cycle.');
    const proto = Object.getPrototypeOf(value);
    if (!Array.isArray(value) && proto !== Object.prototype && proto !== null) fail(path + ' has a non-JSON prototype.');
    ancestors.add(value);
    let result;
    if (Array.isArray(value)) {
      result = Array.from({length: value.length}, (_, i) => {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
        if (!descriptor || !Object.hasOwn(descriptor, 'value')) fail(path + ' contains a sparse/accessor array.');
        return json(descriptor.value, path + '[' + i + ']', ancestors, depth + 1);
      });
    } else {
      result = {};
      for (const key of Object.keys(value)) {
        if (POLLUTION.has(key)) fail(path + ' contains a forbidden prototype key.');
        if (FORBIDDEN.has(key)) continue;
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !Object.hasOwn(descriptor, 'value')) fail(path + ' contains an accessor.');
        if (descriptor.value === undefined) continue; // Optional fields in an in-memory export.
        result[key] = json(descriptor.value, path + '.' + key, ancestors, depth + 1);
      }
    }
    ancestors.delete(value);
    return result;
  }
  function capabilities(value, condition, label) {
    object(value, label);
    if (!['self-evolving', 'memory-only'].includes(condition)) fail('unsupported formal condition.');
    equal(value.id, condition, label + '.id');
    for (let i = 0; i < CAPABILITY_KEYS.length; i += 1) {
      const expected = i < 3 || (i > 3 && condition === 'self-evolving');
      equal(value[CAPABILITY_KEYS[i]], expected, label + '.' + CAPABILITY_KEYS[i]);
    }
    if (Object.keys(value).some(k => k !== 'id' && !CAPABILITY_KEYS.includes(k))) fail(label + ' contains unknown capabilities.');
  }
  function uniqueIds(items, key, label) {
    const ids = new Set();
    for (const item of items) {
      object(item, label + ' item');
      const id = text(item[key], label + '.' + key);
      if (ids.has(id)) fail(label + ' contains duplicate identifiers.');
      ids.add(id);
    }
    return ids;
  }
  function stage(index, status) {
    integer(index, 'stageIndex', 0, 3);
    equal(status, STAGES[index], 'stageStatus');
  }
  function suffixSequence(items, key, prefix) {
    let maximum = 0;
    for (const item of items) {
      const id = String(item[key] || '');
      if (id.startsWith(prefix) && /^\d+$/.test(id.slice(prefix.length))) {
        const number = Number(id.slice(prefix.length));
        if (Number.isSafeInteger(number)) maximum = Math.max(maximum, number);
      }
    }
    return maximum;
  }
  function clearBusy(value) {
    if (!value || typeof value !== 'object') return;
    if (Object.hasOwn(value, 'busy')) value.busy = false;
    for (const item of Object.values(value)) clearBusy(item);
  }
  function inspectInterrupted(state, globals) {
    const pendingEvents = (state.eventLedger || []).filter(e => ['pending', 'validated'].includes(e.status));
    const requests = new Map();
    for (const call of [...(state.apiCalls || []).filter(c => ['pending', 'started', 'unknown'].includes(c.status)),
      ...(globals.activeRequests || [])]) {
      if (!call.callId) continue;
      requests.set(call.callId, {callId:call.callId, eventId:call.eventId || '',
        agentPurpose:call.agentPurpose || '', status:'unconfirmed', automaticRetry:false});
    }
    const flags = ['isGmThinking', 'isScenePlaying', 'isIntroPlaying', 'artifactTaskLoading', 'dialogueAdvancePending']
      .filter(k => state[k]);
    const diagnostics = [];
    if (requests.size) diagnostics.push('unconfirmed_network_requests_require_manual_retry');
    if (pendingEvents.length) diagnostics.push('uncommitted_events_preserved_without_replay');
    if (flags.length || state.activeEventLock) diagnostics.push('runtime_locks_cleared');
    return {requiresManualContinuation:Boolean(requests.size || pendingEvents.length || flags.length || state.activeEventLock),
      unknownRequests:[...requests.values()], pendingEventIds:pendingEvents.map(e => e.eventId),
      activeEventId:state.activeEventLock?.eventId || '', runtimeFlags:flags, diagnostics};
  }

  function capture(state, globals = {}) {
    object(state, 'state');
    const profile = object(state.researchProfile, 'research profile');
    const extra = {};
    for (const key of EXTRA_FIELDS) if (state[key] !== undefined) extra[key] = json(state[key], 'state.' + key);
    const safeGlobals = json(object(globals, 'globals'), 'globals');
    return {
      schemaVersion:SCHEMA_VERSION,
      sessionId:text(state.sessionId, 'sessionId'),
      sessionEpoch:integer(state.sessionEpoch, 'sessionEpoch'),
      assignmentId:text(profile.assignmentId, 'assignmentId'),
      gameLabel:text(profile.gameLabel, 'gameLabel'),
      pairId:text(profile.pairId, 'pairId'),
      capturedAt:new Date().toISOString(),
      state:extra, globals:safeGlobals, interrupted:json(inspectInterrupted(state, safeGlobals))
    };
  }

  function validateBinding(source, pair, profile) {
    object(pair, 'current pair'); object(profile, 'current profile');
    const session = object(source.session, 'session');
    const study = object(source.researchStudy, 'researchStudy');
    equal(source.schemaVersion, '2.0', 'export schema');
    equal(source.exportType, 'SocialEvoNPC.SessionExport', 'export type');
    if (!profile.active || !study.active || profile.serverValidated !== true) fail('a fresh server-validated research profile is required.');
    equal(profile.protocolVersion, PROTOCOL, 'profile protocol');
    equal(study.protocolVersion, PROTOCOL, 'export protocol');
    equal(pair.protocolVersion, PROTOCOL, 'pair protocol');
    if (!['in_progress', 'completed'].includes(pair.status)) fail('pair status is invalid.');
    if (!['A', 'B'].includes(pair.currentGame)) fail('current game is invalid.');
    equal(study.gameLabel, pair.currentGame, 'export gameLabel');
    equal(profile.gameLabel, pair.currentGame, 'profile gameLabel');
    equal(text(study.pairId, 'pairId'), text(pair.pairId, 'pair.pairId'), 'pairId');
    equal(profile.pairId, pair.pairId, 'profile pairId');
    equal(text(study.assignmentId, 'assignmentId'), text(profile.assignmentId, 'profile.assignmentId'), 'assignmentId');
    equal(text(session.participantId, 'participantId'), text(pair.participantId, 'pair.participantId'), 'participantId');
    const game = object(pair.games?.[pair.currentGame], 'current game');
    if (Boolean(game.saved) !== Boolean(game.completed)) fail('current game completion flags disagree.');
    equal(game.gameLabel, pair.currentGame, 'game label');
    equal(text(session.sessionId, 'sessionId'), text(game.sessionId, 'current game sessionId'), 'sessionId');
    integer(session.sessionEpoch, 'sessionEpoch');
    timestamp(session.startedAt, 'session.startedAt');
    if (!['en', 'zh'].includes(session.language)) fail('session language is invalid.');
    const condition = object(source.condition, 'condition');
    equal(condition.id, profile.assignedCondition, 'condition');
    capabilities(condition.capabilities, condition.id, 'export capabilities');
    capabilities(profile.capabilities, profile.assignedCondition, 'profile capabilities');
    return {session, study, game, condition};
  }

  function validateArchive(source, sessionId) {
    const archive = object(source.researchArchive, 'complete paired researchArchive');
    equal(archive.schemaVersion, 'study-pair-readonly-archive-v1', 'archive schema');
    equal(archive.sessionId, sessionId, 'archive sessionId');
    equal(archive.modelContextUnchanged, true, 'archive context contract');
    for (const [key, count] of [['dialogueHistory', 'dialogueCount'], ['retrievalTraces', 'retrievalCount']]) {
      const entries = array(archive[key], 'archive.' + key);
      equal(entries.length, integer(archive[count], 'archive.' + count), 'archive.' + count);
      entries.forEach((entry, i) => equal(entry.archiveSequence, i + 1, 'archive sequence'));
    }
    return archive;
  }

  function validateEvents(events, session, condition) {
    const ids = uniqueIds(events, 'eventId', 'eventLedger');
    for (const event of events) {
      equal(event.sessionId, session.sessionId, 'event sessionId');
      equal(event.sessionEpoch, session.sessionEpoch, 'event sessionEpoch');
      if (!['pending', 'validated', 'committed', 'failed'].includes(event.status)) fail('event status is invalid.');
      if (event.metadata?.stageId && !STAGES.includes(event.metadata.stageId)) fail('event stage is invalid.');
      if (event.metadata?.conditionId) equal(event.metadata.conditionId, condition.id, 'event condition');
      if (event.metadata?.capabilities) capabilities(event.metadata.capabilities, condition.id, 'event capabilities');
      for (const key of ['dialogueDeliveries', 'stateChanges', 'noChangeEvaluations', 'proposals', 'callIds', 'evidenceIds']) array(event[key], 'event ' + key);
      if (event.parentEventId && !ids.has(event.parentEventId)) fail('event parent is missing.');
    }
    return ids;
  }

  function mappedState(source, binding) {
    const {session, condition} = binding;
    const meta = object(source.scenarioMeta, 'scenarioMeta');
    equal(meta.id, 'newcomer-circle', 'scenario'); stage(meta.stageIndex, meta.stageStatus);
    const npcs = array(source.npcs, 'npcs');
    if (!npcs.length) fail('NPC state is missing.');
    const npcIds = uniqueIds(npcs, 'id', 'npcs');
    const events = array(source.eventLedger, 'eventLedger');
    const eventIds = validateEvents(events, session, condition);
    const archive = validateArchive(source, session.sessionId);
    const story = object(source.story, 'story');
    const workspace = object(source.workspace, 'workspace');
    const evaluation = object(source.evaluation, 'evaluation');
    const outcome = object(source.outcome, 'outcome');
    const rag = object(source.memory?.socialMemoryRag, 'memory.socialMemoryRag');
    const memories = array(rag.episodicMemories, 'episodicMemories');
    equal(memories.length, integer(rag.memoryCount, 'memoryCount'), 'complete memoryCount');
    if (rag.memories !== undefined && JSON.stringify(rag.memories) !== JSON.stringify(memories)) fail('memory aliases disagree.');
    uniqueIds(memories, 'id', 'memories');
    for (const memory of memories) {
      if (memory.ownerNpcId && !npcIds.has(memory.ownerNpcId)) fail('memory owner is not in this game.');
      // Private GM safety records have no NPC owner and must stay unavailable to NPCs.
      if (memory.visibility === 'owner' && !npcIds.has(memory.ownerNpcId)) fail('owner memory has no current NPC owner.');
    }
    const calls = array(source.api?.calls, 'api.calls');
    uniqueIds(calls, 'callId', 'api.calls');
    for (const call of calls) {
      if (call.sessionId) equal(call.sessionId, session.sessionId, 'API sessionId');
      equal(call.sessionEpoch, session.sessionEpoch, 'API sessionEpoch');
      if (call.eventId && !eventIds.has(call.eventId)) fail('API source event is missing.');
    }
    const pacing = story.pacing == null ? null : object(story.pacing, 'stage pacing');
    const completed = pacing ? array(pacing.completed, 'completed stages') : [];
    completed.forEach((record, i) => {
      equal(record.stageId, STAGES[i], 'completed stage order');
      const event = events.find(e => e.eventId === record.eventId);
      if (!event || event.type !== 'key_decision' || event.status !== 'committed' || event.metadata?.stageId !== record.stageId) fail('stage completion has no committed source core.');
    });
    if (completed.length > 4 || Math.min(completed.length, 3) !== meta.stageIndex) fail('completed stages and current stage disagree.');
    const state = {
      ...extraDefaults(),
      scenarioId:meta.id, language:session.language, participantId:session.participantId,
      sessionId:session.sessionId, sessionEpoch:session.sessionEpoch,
      sessionStartedAt:session.startedAt,
      sessionEndedAt:outcome.finalOutcome ? timestamp(session.endedAt, 'session.endedAt') : '',
      sessionClosed:Boolean(outcome.finalOutcome),
      screen:outcome.finalOutcome ? 'summary' : 'game',
      evolutionMode:condition.id, capabilities:condition.capabilities,
      stageIndex:meta.stageIndex, stageStatus:meta.stageStatus, roundIndex:completed.length,
      npcs, eventLedger:events,
      eventSequence:suffixSequence(events, 'eventId', 'event-' + session.sessionId + '-'),
      committedNpcEvents:events.filter(e => e.status === 'committed').flatMap(e =>
        (e.commit?.npcIds || []).filter(id => npcIds.has(id)).map(id => id + ':' + e.eventId)),
      apiCalls:calls.map(call => ({...call, sessionId:session.sessionId, model:call.requestedModel || call.model || ''})),
      apiCallSequence:suffixSequence(calls, 'callId', 'call-' + session.sessionId + '-'),
      // Runtime model context was bounded to 80 before export; archive stays complete in its owner store.
      dialogueHistory:archive.dialogueHistory.slice(-80).map(({archiveSequence, ...entry}) => entry),
      log:array(source.log, 'log'),
      projectTasks:array(workspace.projectTasks, 'workspace.projectTasks'),
      submittedArtifacts:array(workspace.submittedArtifacts, 'workspace.submittedArtifacts'),
      sharedComputerArtifacts:array(workspace.sharedComputerArtifacts, 'workspace.sharedComputerArtifacts'),
      artifactScoreReports:array(workspace.artifactScoreReports, 'workspace.artifactScoreReports'),
      storyBeatLedger:array(story.beats, 'story.beats'),
      stageDirectorReports:array(story.directorReports, 'story.directorReports'),
      stagePacing:pacing, entryEpisode:story.entryEpisode ?? null,
      labCalendar:story.narrativeClock ?? null, labStory:story.narrativeStory ?? null,
      projectWorkflow:story.projectWorkflow ?? null, creditWorkflow:story.creditWorkflow ?? null,
      globalAttentionChecks:array(story.attentionChecks, 'story.attentionChecks'),
      stageEvolutionReports:array(source.stageEvolutionReports, 'stageEvolutionReports'),
      trajectoryBaseline:evaluation.trajectoryBaseline ?? null,
      stageTrajectorySnapshots:array(evaluation.stageSnapshots, 'evaluation.stageSnapshots'),
      offlineEvaluation:evaluation.offline ?? null,
      relationshipTransferProbe:evaluation.relationshipTransferProbe ?? null,
      finalOutcome:outcome.finalOutcome ?? null,
      latestGoalAssessment:outcome.latestGoalAssessment ?? null,
      sessionMetrics:object(outcome.metrics, 'outcome.metrics'),
      interpersonalScore:outcome.interpersonalScore, outcomeScore:outcome.outcomeScore,
      dualScoreEndingEvidence:source.dualScoreEndingEvidence ?? null,
      attentionCheck:object(source.attentionCheck, 'attentionCheck'), userFeedback:source.userFeedback ?? null,
      socialMemoryRag:{enabled:Boolean(rag.enabled), memoryStore:memories,
        memoryOperations:array(rag.memoryOperations, 'memoryOperations'),
        retrievalTraces:array(rag.retrievalTraces, 'memory retrievalTraces'), lastRetrieval:null},
      autoAdvanceDialogue:source.interface?.dialoguePacing?.autoAdvanceAtEnd !== false,
      dialoguePacingChanges:array(source.interface?.dialoguePacing?.changes, 'dialogue pacing changes'),
      apiFatalError:session.fatalCode ? String(session.fatalCode) : null,
      apiFatalCode:session.fatalCode || '', apiFatalContext:session.fatalContext ?? null
    };
    array(state.attentionCheck.attempts, 'attentionCheck.attempts');
    return state;
  }

  function legacyExtras(state, diagnostics) {
    state.selectedOption = ''; state.selectedOptionIndex = -1;
    state.pendingDecision = null; state.decisionPanelVisible = false;
    state.openingResponseAnswered = state.eventLedger.some(e => e.status === 'committed' && e.type === 'opening_response');
    state.sideTalkSemanticHistory = []; state.sideTalkOpportunityKeys = []; state.sideTalkRootRewardKeys = [];
    const privateEvents = state.eventLedger.filter(e => e.type === 'private_chat' && e.status === 'committed');
    for (const event of privateEvents) {
      const m = event.metadata || {}, action = m.actionClassification, npcId = m.targetNpcId, stageId = m.stageId;
      if (!state.npcs.some(n => n.id === npcId) || !STAGES.includes(stageId) || !action?.actionCode || !action.evidenceSpan || typeof m.interactionNovelty?.isNovel !== 'boolean') fail('legacy private interaction history is incomplete.');
      state.sideTalkOpportunityKeys.push(stageId + '|' + npcId);
      state.sideTalkRootRewardKeys.push(event.rootEventId + '|' + npcId + '|' + stageId + '|' + action.actionCode);
      if (m.interactionNovelty.isNovel) state.sideTalkSemanticHistory.push({
        rootEventId:event.rootEventId, eventId:event.eventId, npcId, stageId,
        actionCode:action.actionCode, evidenceSpan:action.evidenceSpan, timestamp:event.committedAt || event.createdAt || ''
      });
    }
    state.sideTalkOpportunityKeys = [...new Set(state.sideTalkOpportunityKeys)];
    state.sideTalkRootRewardKeys = [...new Set(state.sideTalkRootRewardKeys)];
    state.totalSideTalks = privateEvents.length;
    const lastCompleted = new Set((state.stagePacing?.completed || []).map(r => r.eventId));
    const lastCore = state.eventLedger.reduce((last, e, i) => lastCompleted.has(e.eventId) ? i : last, -1);
    state.interactionsSinceDecision = state.eventLedger.slice(lastCore + 1).filter(e => e.type === 'private_chat' && e.status === 'committed').length;
    diagnostics.push('legacy_unsaved_selection_and_drafts_unavailable');
    const unanswered = state.eventLedger.filter(e => e.status === 'committed' && e.metadata?.openingQuestionOfferedAt && !e.metadata.openingQuestionAnsweredByEventId);
    const latest = unanswered.at(-1), delivery = latest?.dialogueDeliveries.find(d => d.status === 'delivered' && d.npcId && d.channel === 'opening_response_npc');
    const globals = {};
    if (latest && delivery && state.stageIndex === 0) globals.openingQuestion = {
      npcId:delivery.npcId, npcName:delivery.speaker || '', dialogue:delivery.text,
      eventId:latest.eventId, rootEventId:latest.rootEventId, epoch:state.sessionEpoch,
      stageId:STAGES[0], draft:'', deferred:true
    };
    if (state.labStory?.pendingCore || state.labStory?.pendingAssessment || state.labStory?.pendingBridge ||
      state.eventLedger.some(e => e.status === 'committed' && e.type === 'key_decision' && !lastCompleted.has(e.eventId))) {
      diagnostics.push('legacy_pending_core_requires_manual_continuation');
    }
    if (state.relationshipTransferProbe && !['completed', 'complete', 'idle'].includes(state.relationshipTransferProbe.status)) diagnostics.push('legacy_probe_pending_candidates_unavailable');
    return globals;
  }

  function validateGlobals(globals, state) {
    const ids = new Set(state.eventLedger.map(e => e.eventId));
    for (const key of ['openingQuestion', 'privatePending', 'story', 'storyFailure', 'relationshipProbe']) {
      const value = globals[key];
      if (!value) continue;
      object(value, 'globals.' + key);
      if (value.epoch !== undefined) equal(value.epoch, state.sessionEpoch, 'continuation epoch');
      if (value.stageId !== undefined) equal(value.stageId, state.stageStatus, 'continuation stage');
      if (value.npcId && !state.npcs.some(n => n.id === value.npcId)) fail('continuation NPC is missing.');
      for (const id of [value.eventId, value.sourceEventId, value.event?.eventId].filter(Boolean)) if (!ids.has(id)) fail('continuation source event is missing.');
    }
    if (globals.activeRequests !== undefined) array(globals.activeRequests, 'activeRequests');
    clearBusy(globals);
  }

  function resumableProbeEvent(state, globals) {
    const owner = globals.relationshipProbe;
    const event = owner?.event?.eventId && state.eventLedger.find(e => e.eventId === owner.event.eventId);
    if (!event || event.type !== 'relationship_transfer_probe' || event.status !== 'validated' || event.metadata?.probePhase !== 'presentation') return null;
    const source = state.eventLedger.find(e => e.eventId === owner.sourceEventId);
    if (!source || source.status !== 'committed' || source.type !== 'key_decision' ||
      event.parentEventId !== source.eventId || event.rootEventId !== source.rootEventId ||
      !owner.probeId || owner.probeId !== event.metadata.probeId) fail('presentation probe owner or core source is incomplete.');
    if (state.relationshipTransferProbe?.eventId !== event.eventId || state.relationshipTransferProbe.probeId !== owner.probeId) fail('presentation probe record does not match its current event.');
    const rows = array(owner.ready?.recoveryMap, 'presentation probe ready candidates');
    const ready = new Map();
    for (const row of rows) {
      if (!Array.isArray(row) || row.length !== 2 || ready.has(row[0])) fail('presentation probe ready candidates are invalid.');
      ready.set(row[0], object(row[1], 'probe ready candidate'));
    }
    const responderIds = array(event.audience?.npcIds, 'probe responder schedule');
    if (ready.size !== state.npcs.length || responderIds.length !== state.npcs.length ||
      new Set(responderIds).size !== responderIds.length) fail('presentation probe responder schedule is incomplete.');
    for (const npc of state.npcs) {
      if (!responderIds.includes(npc.id)) fail('presentation probe responder is missing.');
      const cached = ready.get(npc.id), update = cached?.update;
      if (!update || typeof update.dialogue !== 'string' || !update.dialogue || typeof update.emotion !== 'string' ||
        typeof update.tone !== 'string' || !Array.isArray(update.behavioralMoves)) fail('presentation probe validated candidate is missing.');
      const origin = state.eventLedger.find(e => e.eventId === cached.eventId);
      if (!origin || origin.type !== event.type || origin.rootEventId !== event.rootEventId ||
        origin.metadata?.probeId !== event.metadata.probeId) fail('presentation probe candidate source is missing.');
      for (const holder of [event, origin]) {
        const lines = holder.dialogueDeliveries.filter(d => d.npcId === npc.id && d.channel === 'relationship_transfer_response');
        if (lines.length !== 1 || !['generated', 'delivered'].includes(lines[0].status) ||
          lines[0].text !== update.dialogue || lines[0].speaker !== npc.name) fail('presentation probe candidate does not match its actual delivery.');
      }
    }
    return event;
  }

  function releaseInterruptedControllers(state, globals, diagnostics) {
    if (state.artifactSubmissionStatus === 'submitting') {
      state.artifactSubmissionStatus = '';
      diagnostics.push('pending_artifact_review_requires_manual_retry');
    }
    if (state.stagePacing?.status === 'checking') {
      state.stagePacing.status = 'error';
      state.stagePacing.report = null;
      state.stagePacing.error = 'The previous readiness check was interrupted. Retry explicitly.';
      diagnostics.push('pending_stage_readiness_requires_manual_retry');
    }
    const probe = resumableProbeEvent(state, globals);
    if (probe) diagnostics.push('pending_probe_presentation_requires_manual_continuation');
    for (const event of state.eventLedger) {
      const partialProbe = event.type === 'relationship_transfer_probe' && event.status !== 'committed' &&
        event.dialogueDeliveries.some(d => d.status === 'delivered' && d.channel === 'relationship_transfer_response');
      const laterComplete = partialProbe && state.eventLedger.some(e => e.type === event.type && e.status === 'committed' &&
        e.rootEventId === event.rootEventId && e.metadata?.probeId === event.metadata?.probeId);
      if (!state.finalOutcome && partialProbe && !laterComplete && event !== probe) fail('partially delivered probe has no complete recoverable presentation candidates; contact the researcher.');
      if (!['pending', 'validated'].includes(event.status)) continue;
      if (event.commit || event.stateChanges.length || event.noChangeEvaluations.length) fail('interrupted local transaction contains persistent state and cannot be safely replayed.');
      if (event === probe) continue;
      // The local transaction is gone. This says nothing about provider success,
      // and its API record remains unconfirmed. The ordinary manual retry path
      // requires a failed local attempt and will create a different event.
      event.metadata ||= {};
      event.metadata.originalStatus = event.status;
      event.metadata.upstreamOutcome = 'unknown';
      event.metadata.recoveryInterruption = {previousStatus:event.status, networkResult:'unconfirmed', automaticRetry:false};
      event.status = 'failed';
      event.error = {code:'recovery_interrupted', message:'The page closed before this local transaction confirmed its result. The upstream result is unknown.', retryable:false};
      event.timestamps ||= {};
      event.timestamps.failedAt = new Date().toISOString();
      diagnostics.push('pending_local_transaction_interrupted');
    }
  }

  function prepare(exportPayload, pair, profile) {
    const source = json(object(exportPayload, 'export'));
    const binding = validateBinding(source, pair, profile);
    const state = mappedState(source, binding);
    const snapshot = source.runtimeCheckpoint;
    const diagnostics = [];
    let globals, interrupted;
    if (snapshot != null) {
      object(snapshot, 'runtimeCheckpoint');
      equal(snapshot.schemaVersion, SCHEMA_VERSION, 'checkpoint schema');
      for (const [key, expected] of Object.entries({sessionId:state.sessionId, sessionEpoch:state.sessionEpoch,
        assignmentId:binding.study.assignmentId, pairId:pair.pairId, gameLabel:pair.currentGame})) equal(snapshot[key], expected, 'checkpoint ' + key);
      timestamp(snapshot.capturedAt, 'checkpoint capturedAt');
      const extra = object(snapshot.state, 'checkpoint state');
      for (const key of Object.keys(extra)) if (!EXTRA_FIELDS.includes(key)) fail('unknown checkpoint state field: ' + key);
      for (const key of EXTRA_FIELDS) if (extra[key] !== undefined) state[key] = extra[key];
      integer(state.roundIndex, 'roundIndex', 0, 4);
      if (state.roundIndex !== (state.stagePacing?.completed?.length || 0)) fail('roundIndex and completed stages disagree.');
      for (const key of ['sideTalkSemanticHistory', 'sideTalkOpportunityKeys', 'sideTalkRootRewardKeys', 'committedNpcEvents', 'openWorkspaceDocumentIds']) array(state[key], key);
      integer(state.eventSequence, 'eventSequence'); integer(state.apiCallSequence, 'apiCallSequence');
      if (state.eventSequence < suffixSequence(state.eventLedger, 'eventId', 'event-' + state.sessionId + '-') ||
        state.apiCallSequence < suffixSequence(state.apiCalls, 'callId', 'call-' + state.sessionId + '-')) fail('checkpoint counter would reuse an existing identifier.');
      if (state.finalOutcome && !TECHNICAL_ENDINGS.includes(state.finalOutcome.endType) && state.sessionClosed !== true) fail('completed outcome cannot be reopened.');
      globals = object(snapshot.globals, 'checkpoint globals');
      interrupted = object(snapshot.interrupted, 'checkpoint interrupted');
      array(interrupted.unknownRequests, 'interrupted unknownRequests');
      array(interrupted.pendingEventIds, 'interrupted pendingEventIds');
      array(interrupted.diagnostics, 'interrupted diagnostics');
    } else {
      globals = legacyExtras(state, diagnostics);
      interrupted = inspectInterrupted(state, globals);
    }
    validateGlobals(globals, state);
    if (!binding.game.completed) {
      if (state.finalOutcome && !TECHNICAL_ENDINGS.includes(state.finalOutcome.endType)) fail('an unfinished current game cannot import a completed outcome.');
      if (state.finalOutcome) diagnostics.push('previous_technical_outcome_preserved_in_source_only');
      state.finalOutcome = null;
      state.sessionClosed = false;
      state.sessionEndedAt = '';
      state.screen = 'game';
      if (state.apiFatalCode || state.apiFatalError) diagnostics.push('previous_technical_stop_preserved_in_source_only');
      state.apiFatalCode = ''; state.apiFatalError = null; state.apiFatalContext = null;
    } else {
      if (!state.finalOutcome || !NORMAL_ENDINGS.includes(state.finalOutcome.endType) ||
        binding.session.completionType !== state.finalOutcome.endType || state.roundIndex !== 4 || state.apiFatalCode) fail('completed game is missing its original normal terminal outcome.');
    }
    clearBusy(state.labStory);
    releaseInterruptedControllers(state, globals, diagnostics);
    // API outcomes remain unconfirmed; only abandoned local transactions failed.
    const observed = inspectInterrupted(state, globals);
    const requestMap = new Map([...interrupted.unknownRequests, ...observed.unknownRequests].map(r => [r.callId, {...r, automaticRetry:false}]));
    interrupted = {...interrupted,
      unknownRequests:[...requestMap.values()],
      pendingEventIds:[...new Set([...interrupted.pendingEventIds, ...observed.pendingEventIds])],
      requiresManualContinuation:Boolean(interrupted.requiresManualContinuation || observed.requiresManualContinuation || diagnostics.some(d => /pending/.test(d))),
      diagnostics:[...new Set([...interrupted.diagnostics, ...observed.diagnostics, ...diagnostics])]};
    Object.assign(state, {activeEventLock:null, delayedDecisionTimerId:null, dialogueBubbleUntil:0,
      dialogueAdvancePending:false, isIntroPlaying:false, isScenePlaying:false, isGmThinking:false,
      artifactTaskLoading:false, nearbyNpcId:null, nearbyProjectObjectId:null});
    // Never return profile, credentials, runtime manifests, media runtimes, or admin capabilities.
    return {state, globals, legacy:snapshot == null, interrupted, sourceBuild:source.buildVersion || ''};
  }

  return Object.freeze({SCHEMA_VERSION, capture, prepare});
}));
