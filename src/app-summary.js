// End-state summary, export payloads, and feedback collection.
function showSummary(options = {}) {
  if (options.restored !== true) {
    if (typeof studyPairOnSummary === "function") studyPairOnSummary();
    endSessionRuntime("summary");
  }
  showScreen("summary");
  const zh=state.language==='zh';
  for(const [id,text] of Object.entries({'summary-ended-label':zh?'本局已结束':'Session ended','summary-page-heading':zh?'实验室 · 本局回顾':'Your Lab Entry outcome','summary-outcome-heading':zh?'实际结局记录':'Outcome Summary','summary-feedback-heading':zh?'这局体验怎么样？':'How was this session?'})){const el=document.getElementById(id);if(el)el.textContent=text;}
  const menu=document.getElementById('summary-menu-btn');if(menu){menu.textContent=zh?'返回主菜单':'Menu';menu.setAttribute('aria-label',zh?'返回主菜单':'Back to menu');}
  const node = document.getElementById("outcome-summary");
  node.innerHTML = "";
  const outcome = state.finalOutcome || state.latestGoalAssessment || {
    endType: state.apiFatalError ? "backend_failure" : "incomplete",
    publicSummary: state.apiFatalError || (state.language === "zh" ? "本次经历暂时没有可用的回顾。" : "A recap of this session is unavailable."),
    goalStatus: state.language === "zh" ? "未完成" : "Incomplete",
    finalResult: state.language === "zh" ? "未形成可分析的最终结果。" : "No analyzable final result was produced."
  };
  const outcomeCard = document.createElement("article");
  outcomeCard.className = `summary-card outcome-card outcome-${escapeHtml(outcome.endType || "continue")}`;
  outcomeCard.innerHTML = `
    <h4>${escapeHtml(summaryText("finalResult"))}: ${escapeHtml(resultLabel(outcome.endType))}</h4>
    <p><strong>${escapeHtml(summaryText("gmSummary"))}:</strong> ${escapeHtml(outcome.publicSummary || outcome.finalResult || "")}</p>
    <p><strong>${escapeHtml(summaryText("goalStatus"))}:</strong> ${escapeHtml(outcome.goalStatus || "")}</p>
  `;
  if(outcome.delivery){
    const line=document.createElement("p"),d=outcome.delivery,zh=state.language==="zh";
    line.textContent=zh?`交付：Day ${d.submittedAtDay} · ${d.submittedOnTime?"按时":"逾期"}（截止 Day 7 结束前）。`:
      `Delivery: Day ${d.submittedAtDay} · ${d.submittedOnTime?"On time":"Late"} (due before the end of Day 7). `;
    outcomeCard.append(line);
  }
  const taskRecord=typeof labEndVerifiedTaskEvaluationRecord==='function'?labEndVerifiedTaskEvaluationRecord(outcome):null;
  if(taskRecord){
    const section=document.createElement('section'),heading=document.createElement('h5'),text=document.createElement('pre');
    section.className='task-evaluation-source-record';section.dataset.sourceHash=taskRecord.sourceHash;section.dataset.renderedHash=taskRecord.renderedHash;
    heading.textContent=taskRecord.recordLanguage==='zh'?'任务评价记录（原文）':'Task evaluation records (verbatim)';
    text.textContent=taskRecord.text;text.style.whiteSpace='pre-wrap';text.style.overflowWrap='anywhere';
    section.append(heading,text);outcomeCard.append(section);
  }
  node.appendChild(outcomeCard);
  if (typeof renderLabRecap === "function" && !(typeof studyQuestionnaireGamePending === "function" && studyQuestionnaireGamePending())) renderLabRecap();
  const status = document.getElementById("feedback-status");
  if (status) status.textContent = "";
  const feedbackInput = document.getElementById("summary-feedback");
  if (feedbackInput) feedbackInput.value = state.userFeedback?.text || "";
  const ratingInput = document.getElementById("summary-rating");
  if (ratingInput) ratingInput.value = state.userFeedback?.rating || "";
  if (typeof renderStudyPairUi === "function") renderStudyPairUi();
}

function captureTerminalExport(reason = "session_ended") {
  if (typeof studyPairRequested !== "function" || !studyPairRequested()) return null;
  if (!state.sessionId || !state.sessionStartedAt) return null;
  const key = state.sessionId;
  const existing = state.terminalExports.find((item) => item.sessionId === key);
  if (existing) return existing;
  const capturedAt = new Date().toISOString();
  const payload = sessionExportPayload();
  payload.terminal = {
    reason: String(reason || "session_ended"),
    capturedAt,
    idempotencyKey: SocialEvoCore.stableHash({ sessionId: key, reason })
  };
  const record = { sessionId: key, reason, capturedAt, payload };
  state.terminalExports.push(record);
  state.terminalExports = state.terminalExports.slice(-5);
  if (!state.terminalExportKeys.includes(key)) state.terminalExportKeys.push(key);
  try {
    sessionStorage.setItem(`socialevo-terminal-${key}`, JSON.stringify(payload));
  } catch (error) {
    // Export remains available in memory when tab storage is unavailable or full.
  }
  persistTerminalExport(record);
  return record;
}

function persistTerminalExport(record) {
  if (!state.researchProfile?.active || !record?.payload) return;
  if (typeof studyPairRequested === "function" && studyPairRequested() && record?.payload) {
    return studyPairPersistTerminal(record);
  }
}

function summaryText(key) {
  const values = {
    en: {
      finalResult: "Final result",
      gmSummary: "Session recap",
      goalStatus: "Goal status",
      metrics: "Session metrics",
      role: "Role",
      finalEmotion: "Final emotion",
      trust: "Trust",
      belonging: "Belonging",
      recentMemory: "Recent memory",
      futureStrategy: "Future strategy",
      relationshipState: "Relationship model",
      valueTradeoffs: "Value tradeoffs",
      evolutionTrace: "Evolution trace",
      evolutionSafety: "Evolution safety",
      conditionIntegrity: "Condition integrity",
      evolutionMetrics: "Evolution metrics",
      dualScores: "Interpersonal / outcome lines",
      noEvolutionTrace: "No evolution events recorded",
      success: "Success: accepted contribution and workable lab outcome",
      unhealthyFailure: "Ended: healthy lab participation no longer supported",
      attentionFailure: "Game Over: failed understanding check",
      continue: "Incomplete / still needs exploration",
      feedbackSaved: "Feedback saved only in this browser.",
      feedbackLocalOnly: "Feedback kept only for this open session; browser storage was unavailable."
    },
    zh: {
      finalResult: "最终结果",
      gmSummary: "本次回顾",
      goalStatus: "目标状态",
      metrics: "本局指标",
      role: "角色",
      finalEmotion: "最终情绪",
      trust: "信任",
      belonging: "融入感",
      recentMemory: "近期记忆",
      futureStrategy: "后续策略",
      relationshipState: "关系模型",
      valueTradeoffs: "价值权衡",
      evolutionTrace: "演化轨迹",
      evolutionSafety: "演化安全",
      conditionIntegrity: "实验条件完整性",
      evolutionMetrics: "演化指标",
      dualScores: "人际线 / 成果线",
      noEvolutionTrace: "暂无演化事件记录",
      success: "成功：贡献被合理接纳且形成可执行实验室成果",
      unhealthyFailure: "结束：当前状态已无法支持健康实验室参与",
      attentionFailure: "Game Over：回答与前面情节不一致",
      continue: "未完成 / 仍需继续探索",
      feedbackSaved: "反馈仅保存在本浏览器中。",
      feedbackLocalOnly: "浏览器存储不可用；反馈仅保留在当前打开的页面中。"
    }
  };
  return values[state.language][key] || values.en[key] || key;
}

function resultLabel(endType) {
  if (endType === "success") return summaryText("success");
  if (endType === "partial_outcome") return state.language === "zh" ? "结束：仍有问题待解决" : "Ended with unresolved issues";
  if (endType === "unhealthy_failure") return summaryText("unhealthyFailure");
  if (endType === "attention_failure") return summaryText("attentionFailure");
  if (endType === "backend_failure") return state.language === "zh" ? "本局无法继续" : "Session could not continue";
  if (endType === "incomplete") return state.language === "zh" ? "未完成 / 无最终判断" : "Incomplete / no final assessment";
  return summaryText("continue");
}

function metricSummary() {
  return `progress=${state.sessionMetrics.groupProgress}, climate=${state.sessionMetrics.groupClimate}, actions=${state.sessionMetrics.actionCount}`;
}

function dualScoreSummary() {
  return state.language === "zh"
    ? `人际=${state.interpersonalScore}, 成果=${state.outcomeScore}`
    : `interpersonal=${state.interpersonalScore}, outcome=${state.outcomeScore}`;
}

function relationshipSummary(npc) {
  const relationship = npc.relationship || {};
  return relationshipKeys
    .map((key) => `${key}=${Math.round(relationship[key] ?? 0)}`)
    .join(", ");
}

function valueTradeoffSummary(npc) {
  const tradeoffs = npc.valueTradeoffs || {};
  return valueTradeoffKeys
    .map((key) => `${key}=${Math.round(tradeoffs[key] ?? 0)}`)
    .join(", ");
}

function relationshipDeltaSummary(deltas) {
  return relationshipKeys.map(key=>{const value=Number(deltas?.[key]);return `${key}=${Number.isFinite(value)?(value>0?'+':'')+value:'n/a'}`;}).join(', ');
}

function evolutionTraceSummary(npc) {
  const traces = (npc.evolutionHistory || []).slice(-3);
  if (!traces.length) return summaryText("noEvolutionTrace");
  return traces.map((trace) => {
    const deltas = trace.applied?.relationshipDeltas
      ? relationshipDeltaSummary(trace.applied.relationshipDeltas)
      : "";
    return `${trace.trigger}: ${shorten(trace.memory || trace.researchReason || trace.applied?.note || "", 80)} (${deltas})`;
  }).join(" / ");
}

function evolutionSafetySummary(npc) {
  const traces = (npc.evolutionHistory || []).filter((trace) => trace.applied?.safety?.reasons?.length);
  if (!traces.length) return state.language === "zh" ? "未触发安全裁剪" : "No safety clipping triggered";
  return traces.slice(-2).map((trace) => trace.applied.safety.reasons.join("; ")).join(" / ");
}

function conditionIntegritySummary() {
  const integrity = evolutionConditionIntegrity();
  if (integrity.status === "pass") {
    return state.language === "zh"
      ? `通过：${integrity.eventCount} 个事件符合 ${evolutionModeLabel(integrity.conditionId)} 条件。`
      : `Pass: ${integrity.eventCount} ledger events match the ${evolutionModeLabel(integrity.conditionId)} condition.`;
  }
  return state.language === "zh"
    ? `需要检查：发现 ${integrity.violationCount} 个实验条件异常。`
    : `Needs review: ${integrity.violationCount} condition-integrity issue(s) detected.`;
}

function evolutionMetricSummary() {
  const metrics = evolutionEvaluationMetrics();
  return state.language === "zh"
    ? `记忆 ${metrics.total.memoryStored}，情绪变化 ${metrics.total.emotionChanges}，关系变化 ${metrics.total.relationshipChanges}，策略变化 ${metrics.total.strategyChanges}，安全裁剪 ${metrics.total.safetyClips}`
    : `memory ${metrics.total.memoryStored}, emotion changes ${metrics.total.emotionChanges}, relationship changes ${metrics.total.relationshipChanges}, strategy changes ${metrics.total.strategyChanges}, safety clips ${metrics.total.safetyClips}`;
}

function evolutionEvaluationMetrics() {
  const perNpc = state.npcs.map(npcEvolutionMetrics);
  const total = perNpc.reduce((accumulator, item) => ({
    traceCount: accumulator.traceCount + item.traceCount,
    memoryStored: accumulator.memoryStored + item.memoryStored,
    emotionChanges: accumulator.emotionChanges + item.emotionChanges,
    surfaceLineChanges: accumulator.surfaceLineChanges + item.surfaceLineChanges,
    trustDeltaAbs: accumulator.trustDeltaAbs + item.trustDeltaAbs,
    belongingDeltaAbs: accumulator.belongingDeltaAbs + item.belongingDeltaAbs,
    relationshipChanges: accumulator.relationshipChanges + item.relationshipChanges,
    valueTradeoffChanges: accumulator.valueTradeoffChanges + item.valueTradeoffChanges,
    strategyChanges: accumulator.strategyChanges + item.strategyChanges,
    safetyClips: accumulator.safetyClips + item.safetyClips
  }), {
    traceCount: 0,
    memoryStored: 0,
    emotionChanges: 0,
    surfaceLineChanges: 0,
    trustDeltaAbs: 0,
    belongingDeltaAbs: 0,
    relationshipChanges: 0,
    valueTradeoffChanges: 0,
    strategyChanges: 0,
    safetyClips: 0
  });
  return {
    mode: state.evolutionMode || "self-evolving",
    total,
    perNpc
  };
}

function npcEvolutionMetrics(npc) {
  const traces = npc.evolutionHistory || [];
  return traces.reduce((metrics, trace) => {
    const applied = trace.applied || {};
    metrics.traceCount += 1;
    if (applied.memoryStored) metrics.memoryStored += 1;
    if (applied.emotionChanged) metrics.emotionChanges += 1;
    if (applied.surfaceLineChanged) metrics.surfaceLineChanges += 1;
    if (applied.strategyChanged) metrics.strategyChanges += 1;
    metrics.trustDeltaAbs += Math.abs(Number(applied.trustDelta || 0));
    metrics.belongingDeltaAbs += Math.abs(Number(applied.belongingDelta || 0));
    metrics.relationshipChanges += countNonZeroObjectValues(applied.relationshipDeltas, relationshipKeys);
    metrics.valueTradeoffChanges += countNonZeroObjectValues(applied.valueTradeoffDeltas, valueTradeoffKeys);
    metrics.safetyClips += applied.safety?.reasons?.length || 0;
    return metrics;
  }, {
    npcId: npc.id,
    npcName: npc.name,
    model: npc.model,
    traceCount: 0,
    memoryStored: 0,
    emotionChanges: 0,
    surfaceLineChanges: 0,
    trustDeltaAbs: 0,
    belongingDeltaAbs: 0,
    relationshipChanges: 0,
    valueTradeoffChanges: 0,
    strategyChanges: 0,
    safetyClips: 0
  });
}

function countNonZeroObjectValues(value = {}, keys = []) {
  return keys.filter((key) => Number(value?.[key] || 0) !== 0).length;
}

function evolutionConditionIntegrity() {
  return SocialEvoCore.evaluateIntegrity({
    conditionId: state.evolutionMode || "self-evolving",
    capabilities: state.capabilities,
    events: state.eventLedger,
    memoryStore: state.socialMemoryRag?.memoryStore || [],
    trajectoryBaseline: state.trajectoryBaseline,
    stageSnapshots: state.stageTrajectorySnapshots,
    finalNpcStates: state.npcs,
    initialRelationshipsByNpc: Object.fromEntries(state.npcs.map((npc) => [
      npc.id,
      { ...(npc.initialRelationship || {}) }
    ]))
  });
}

function evolutionTraceViolations(trace, expectedMode, label) {
  const violations = [];
  const before = trace.before || {};
  const after = trace.after || {};
  if (trace.mode !== expectedMode) {
    violations.push(`${label}: trace mode ${trace.mode || "unknown"} does not match session mode ${expectedMode}`);
  }
  if (expectedMode === "static") {
    if (after.memoryCount !== before.memoryCount) violations.push(`${label}: static memory count changed`);
    if (after.emotion !== before.emotion) violations.push(`${label}: static emotion changed`);
    if ((after.surfaceLine || "") !== (before.surfaceLine || "")) violations.push(`${label}: static surface line changed`);
    if (after.trust !== before.trust) violations.push(`${label}: static trust changed`);
    if (after.belonging !== before.belonging) violations.push(`${label}: static belonging changed`);
    if (after.strategy !== before.strategy) violations.push(`${label}: static strategy changed`);
    violations.push(...objectDriftViolations(before.relationship, after.relationship, relationshipKeys, `${label}: static relationship`));
    violations.push(...objectDriftViolations(before.valueTradeoffs, after.valueTradeoffs, valueTradeoffKeys, `${label}: static value tradeoff`));
  }
  if (expectedMode === "memory-only") {
    if (after.emotion !== before.emotion) violations.push(`${label}: memory-only emotion changed`);
    if (after.trust !== before.trust) violations.push(`${label}: memory-only trust changed`);
    if (after.belonging !== before.belonging) violations.push(`${label}: memory-only belonging changed`);
    if (after.strategy !== before.strategy) violations.push(`${label}: memory-only strategy changed`);
    violations.push(...objectDriftViolations(before.relationship, after.relationship, relationshipKeys, `${label}: memory-only relationship`));
    violations.push(...objectDriftViolations(before.valueTradeoffs, after.valueTradeoffs, valueTradeoffKeys, `${label}: memory-only value tradeoff`));
  }
  return violations;
}

function objectDriftViolations(before = {}, after = {}, keys = [], label = "object") {
  return keys
    .filter((key) => Number(before?.[key] ?? 0) !== Number(after?.[key] ?? 0))
    .map((key) => `${label} ${key} changed`);
}

function npcSummaryState() {
  return state.npcs.map((npc) => ({
    id: npc.id,
    name: npc.name,
    role: npc.role,
    model: npc.model,
    emotion: npc.emotion,
    trust: npc.trust,
    belonging: npc.belonging,
    relationship: npc.relationship,
    valueTradeoffs: npc.valueTradeoffs,
    recentMemory: npc.memory.slice(-3),
    structuredMemory: (npc.structuredMemory || []).slice(-3),
    strategy: npc.strategy,
    evolutionHistory: (npc.evolutionHistory || []).slice(-6)
  }));
}

function sessionExportPayload() {
  const conditionIntegrity = evolutionConditionIntegrity();
  const evolutionEvaluation = evolutionEvaluationMetrics();
  const video = state.videoModality || {};
  const apiCalls = (state.apiCalls || []).map((call) => ({
    callId: call.callId,
    sessionEpoch: call.sessionEpoch,
    endpoint: call.endpoint,
    agentPurpose: call.agentPurpose,
    eventId: call.eventId,
    provider: call.provider,
    resolvedProvider: call.resolvedProvider || "",
    requestedModel: call.model,
    resolvedModel: call.resolvedModel,
    reasoningEffort: call.reasoningEffort || "",
    resolvedReasoningEffort: call.resolvedReasoningEffort || "",
    maxCompletionTokens: Number(call.maxCompletionTokens || 0),
    resolvedMaxCompletionTokens: Number(call.resolvedMaxCompletionTokens || 0),
    requestBodyChars: call.requestBodyChars,
    messageChars: call.messageChars,
    promptHash: call.promptHash || "",
    promptComponentHash: call.promptComponentHash || "",
    requestConfigHash: call.requestConfigHash || "",
    temperature: call.provider === "openai" ? null : Number(call.temperature ?? 0.7),
    maxTokens: Number(call.maxTokens || 0),
    responseFormat: call.responseFormat || "text",
    status: call.status,
    httpStatus: call.httpStatus,
    latencyMs: call.latencyMs,
    upstreamLatencyMs: call.upstreamLatencyMs,
    usage: {
      promptTokens: Number(call.usage?.promptTokens || 0),
      completionTokens: Number(call.usage?.completionTokens || 0),
      totalTokens: Number(call.usage?.totalTokens || 0),
      promptCacheHitTokens: Number(call.usage?.promptCacheHitTokens || 0),
      promptCacheMissTokens: Number(call.usage?.promptCacheMissTokens || 0),
      ...(call.provider === "openai" ? {reasoningTokens: Number(call.usage?.reasoningTokens || 0)} : {})
    },
    repairOfCallId: call.repairOfCallId,
    timeoutMs: call.timeoutMs,
    excludedFromPrimaryModelQuality: Boolean(call.excludedFromPrimaryModelQuality),
    repairPolicy: call.repairPolicy || "",
    semanticValidation: call.semanticValidation || "",
    schemaAdjustments: Array.isArray(call.schemaAdjustments) ? call.schemaAdjustments : [],
    studyAssignmentId: call.studyAssignmentId || "",
    errorCode: call.errorCode,
    retryable: Boolean(call.retryable),
    upstreamStatus: Number(call.upstreamStatus || 0),
    upstreamErrorCode: call.upstreamErrorCode || "",
    startedAt: call.startedAt,
    endedAt: call.endedAt
  }));
  const proposalEvidenceLinks = state.eventLedger.flatMap((event) =>
    (event.proposals || []).flatMap((proposal) =>
      (proposal.evidenceIds || []).map((evidenceId) => ({
        eventId: event.eventId,
        npcId: proposal.npcId || "",
        evidenceId,
        linkType: "proposal"
      }))
    )
  );
  const stateChanges = state.eventLedger.flatMap((event) => event.stateChanges || []);
  const noChangeEvaluations = state.eventLedger.flatMap((event) => event.noChangeEvaluations || []);
  const stateChangeEvidenceLinks = stateChanges.flatMap((change) =>
    (change.evidenceLinks || []).map((link) => ({
      eventId: change.triggerEventId,
      rootEventId: change.rootEventId,
      changeId: change.changeId,
      npcId: change.npcId,
      evidenceId: link.evidenceId,
      role: link.role,
      linkType: "field_change"
    }))
  );
  const evidenceLinks = proposalEvidenceLinks.concat(stateChangeEvidenceLinks);
  const stageConsultations = scenarioStages().map((stage, stageIndex) => {
    const records = (state.sideTalkSemanticHistory || []).filter((item) =>
      String(item.stageId || "") === String(stage.id || "")
    );
    const rule = SocialEvoCore.STAGE_TRANSITIONS.find((item) =>
      Number(item.stageIndex) === Number(stageIndex)
    );
    return {
      stageIndex,
      stageId: stage.id,
      required: Number(rule?.requiredSocialInteractions || 0),
      completed: new Set(records.map((item) => item.rootEventId).filter(Boolean)).size,
      rootEventIds: [...new Set(records.map((item) => item.rootEventId).filter(Boolean))],
      npcIds: [...new Set(records.map((item) => item.npcId).filter(Boolean))]
    };
  });
  const stageBeatProgress = scenarioStages().map((stage, stageIndex) => ({
    stageId: stage.id,
    ...SocialEvoCore.storyBeatProgress(state.storyBeatLedger || [], stageIndex)
  }));
  const promptComponents = [...new Map(apiCalls
    .filter((call) => call.agentPurpose && call.promptComponentHash)
    .map((call) => [`${call.agentPurpose}:${call.promptComponentHash}`, {
      componentName: call.agentPurpose,
      version: "feedback1-remediation-v4",
      hash: call.promptComponentHash,
      requestConfigHash: call.requestConfigHash,
      requestedModel: call.requestedModel,
      resolvedModel: call.resolvedModel,
      temperature: call.temperature,
      maxTokens: call.maxTokens,
      reasoningEffort: call.reasoningEffort,
      maxCompletionTokens: call.maxCompletionTokens,
      responseFormat: call.responseFormat
    }])).values()];
  const runtimeManifest = state.runtimeManifest || {};
  const v2 = {
    schemaVersion: "2.0",
    exportType: "SocialEvoNPC.SessionExport",
    buildVersion: runtimeManifest.buildVersion || BUILD_VERSION,
    scenarioVersion: runtimeManifest.scenarioVersion || "lab-entry-v1",
    apiContractVersion: runtimeManifest.apiContractVersion || API_CONTRACT_VERSION,
    ...(runtimeManifest.textAgent ? {textAgentConfiguration:{...runtimeManifest.textAgent}} : {}),
    promptVersion: "stage-evolution-sparse-v1",
    reproducibility: {
      codeCommit: runtimeManifest.codeCommit || "unavailable-browser-build",
      dirtyOrUnknown: /unavailable|dirty/i.test(runtimeManifest.codeCommit || ""),
      scenarioHash: SocialEvoCore.stableHash(currentScenario()),
      configHash: SocialEvoCore.stableHash({
        scenarioId: currentScenario().id,
        scenarioVersion: runtimeManifest.scenarioVersion || "lab-entry-v1",
        conditionId: state.evolutionMode,
        capabilities: state.capabilities,
        language: state.language
      }),
      promptComponents
    },
    session: {
      sessionId: state.sessionId,
      presentation: typeof playerPresentationMetadata === "function" ? playerPresentationMetadata() : null,
      sessionEpoch: state.sessionEpoch,
      participantId: state.participantId,
      language: state.language,
      adminMode: state.sessionAdminModeAtStart,
      exportAuthorizedByAdmin: state.adminMode,
      startedAt: state.sessionStartedAt,
      endedAt: state.sessionEndedAt || new Date().toISOString(),
      completionType: state.finalOutcome?.endType ||
        (state.apiFatalError ? "backend_failure" : "incomplete"),
      fatalCode: state.apiFatalError ? (state.apiFatalCode || "agent_service_failure") : "",
      fatalContext: state.apiFatalError ? { ...(state.apiFatalContext || {}) } : null
    },
    researchStudy: {
      active: Boolean(state.researchProfile?.active),
      assignmentId: state.researchProfile?.assignmentId || "",
      protocolVersion: state.researchProfile?.protocolVersion || "",
      expiresAt: Number(state.researchProfile?.expiresAt || 0),
      serverValidated: Boolean(state.researchProfile?.serverValidated),
      sessionTokenExported: false,
      videoForcedOff: Boolean(state.researchProfile?.active),
      ...(typeof studyPairResearchExport === "function" ? studyPairResearchExport() : {})
    },
    ...(typeof studyPairRequested === "function" && studyPairRequested()
      ? {researchArchive: studyPairArchiveExport()} : {}),
    scenarioMeta: {
      id: currentScenario().id,
      title: scenarioText(currentScenario().title),
      stageIndex: state.stageIndex,
      stageStatus: state.stageStatus
    },
    condition: {
      id: state.evolutionMode,
      capabilities: state.capabilities,
      integrity: conditionIntegrity
    },
    models: {
      requestedByNpc: Object.fromEntries(state.npcs.map((npc) => [npc.id, npc.model])),
      resolved: [...new Set(apiCalls.map((call) => call.resolvedModel).filter(Boolean))]
    },
    api: {
      callCount: apiCalls.length,
      statusCounts: apiCalls.reduce((counts, call) => {
        counts[call.status] = (counts[call.status] || 0) + 1;
        return counts;
      }, {}),
      totalLatencyMs: apiCalls.reduce((sum, call) => sum + Number(call.latencyMs || 0), 0),
      totalPromptTokens: apiCalls.reduce((sum, call) => sum + call.usage.promptTokens, 0),
      totalCompletionTokens: apiCalls.reduce((sum, call) => sum + call.usage.completionTokens, 0),
      totalCacheHitTokens: apiCalls.reduce((sum, call) => sum + call.usage.promptCacheHitTokens, 0),
      totalCacheMissTokens: apiCalls.reduce((sum, call) => sum + call.usage.promptCacheMissTokens, 0),
      repairCount: apiCalls.filter((call) => call.agentPurpose === "json_repair").length,
      calls: apiCalls
    },
    eventLedger: state.eventLedger,
    story: {
      limits: SocialEvoCore.STORY_BEAT_LIMITS,
      beats: state.storyBeatLedger,
      stageProgress: stageBeatProgress,
      directorReports: state.stageDirectorReports,
      pacing: state.stagePacing,
      entryEpisode: state.entryEpisode,
      narrativeClock:state.labCalendar,narrativeStory:state.labStory,projectWorkflow:state.projectWorkflow,creditWorkflow:state.creditWorkflow,creditRecord:typeof creditWorkflowReceipt==='function'?creditWorkflowReceipt():null,competitionResult:typeof projectOutcomeReceipt==='function'?projectOutcomeReceipt():null,
      attentionChecks: state.globalAttentionChecks
    },
    evaluation: {
      trajectoryBaseline: state.trajectoryBaseline,
      stageSnapshots: state.stageTrajectorySnapshots,
      offline: state.offlineEvaluation,
      relationshipTransferProbe: state.relationshipTransferProbe
    },
    causalGraph: state.eventLedger.map((event) => ({
      eventId: event.eventId,
      rootEventId: event.rootEventId,
      parentEventId: event.parentEventId,
      causalDepth: event.causalDepth,
      interactionSource: event.interactionSource,
      turnId: event.turnId,
      sourceSpanId: event.sourceSpanId
    })),
    stateChanges,
    noChangeEvaluations,
    evidenceLinks,
    outcome: {
      finalOutcome: state.finalOutcome,
      latestGoalAssessment: state.latestGoalAssessment,
      metrics: state.sessionMetrics,
      interpersonalScore: state.interpersonalScore,
      outcomeScore: state.outcomeScore,
      stageConsultations
    },
    memory: {
      socialMemoryRag: typeof socialMemoryExportPayload === "function"
        ? socialMemoryExportPayload()
        : null,
      evolutionEvaluation,
      appraisalState: state.npcs.map((npc) => ({
        npcId: npc.id,
        emotion: npc.emotion,
        surfaceLine: npc.surfaceLine || "",
        trust: npc.trust,
        belonging: npc.belonging,
        relationship: npc.relationship,
        situationalPriorities: npc.valueTradeoffs,
        strategy: npc.strategy,
        evolutionHistory: npc.evolutionHistory
      }))
    },
    workspace: {
      projectTasks: state.projectTasks,
      submittedArtifacts: state.submittedArtifacts,
      sharedComputerArtifacts: state.sharedComputerArtifacts,
      artifactScoreReports: state.artifactScoreReports
    },
    video: {
      optedIn: Boolean(video.requested),
      enabledAtEnd: Boolean(video.enabled),
      sampleMs: video.sampleMs,
      status: video.status,
      visibleExpressionCue: video.visibleExpressionCue || null,
      rawFramesStored: false,
      rawFramesExported: false,
      sentToDialogueModel: false
    },
    interface: {
      dialoguePacing: {
        autoAdvanceAtEnd: Boolean(state.autoAdvanceDialogue),
        changes: state.dialoguePacingChanges
      },
      voice: {
        requested: Boolean(state.voiceModality?.requested),
        enabledAtEnd: Boolean(state.voiceModality?.enabled),
        provider: state.voiceModality?.provider || "openai",
        status: state.voiceModality?.status || "off",
        requestCount: (state.apiCalls || []).filter((call) => call.endpoint === "/api/tts").length,
        audioStored: false,
        audioExported: false
      }
    },
    npcs: state.npcs,
    stageEvolutionReports: state.stageEvolutionReports,
    stageConsultations,
    storyBeatLedger: state.storyBeatLedger,
    stageDirectorReports: state.stageDirectorReports,
    stagePacing: state.stagePacing,
    entryEpisode: state.entryEpisode,
    narrativeClock:state.labCalendar,narrativeStory:state.labStory,projectWorkflow:state.projectWorkflow,creditWorkflow:state.creditWorkflow,creditRecord:typeof creditWorkflowReceipt==='function'?creditWorkflowReceipt():null,competitionResult:typeof projectOutcomeReceipt==='function'?projectOutcomeReceipt():null,
    stageTrajectorySnapshots: state.stageTrajectorySnapshots,
    offlineEvaluation: state.offlineEvaluation,
    relationshipTransferProbe: state.relationshipTransferProbe,
    globalAttentionChecks: state.globalAttentionChecks,
    attentionCheck: state.attentionCheck,
    userFeedback: state.userFeedback,
    log: state.log
  };
  return {
    ...v2,
    ...(typeof captureGameRuntimeCheckpoint === "function" && typeof studyPairRequested === "function" && studyPairRequested() ? {runtimeCheckpoint:captureGameRuntimeCheckpoint()} : {}),
    // V1 compatibility aliases. New consumers should use the nested V2 fields.
    scenario: currentScenario().id,
    scenarioTitle: scenarioText(currentScenario().title),
    participantId: state.participantId,
    generatedAt: new Date().toISOString(),
    finalOutcome: state.finalOutcome,
    latestGoalAssessment: state.latestGoalAssessment,
    userFeedback: state.userFeedback,
    evolutionMode: state.evolutionMode,
    stageIndex: state.stageIndex,
    stageStatus: state.stageStatus,
    attentionCheck: state.attentionCheck,
    interpersonalScore: state.interpersonalScore,
    outcomeScore: state.outcomeScore,
    stageEvolutionReports: state.stageEvolutionReports,
    stageTrajectorySnapshots: state.stageTrajectorySnapshots,
    offlineEvaluation: state.offlineEvaluation,
    relationshipTransferProbe: state.relationshipTransferProbe,
    dualScoreEndingEvidence: state.dualScoreEndingEvidence,
    conditionIntegrity,
    evolutionEvaluation,
    metrics: state.sessionMetrics,
    projectTasks: state.projectTasks,
    submittedArtifacts: state.submittedArtifacts,
    sharedComputerArtifacts: state.sharedComputerArtifacts,
    hiddenArtifactScoreReports: state.artifactScoreReports,
    multimodalVideo: {
      enabled: Boolean(video.requested),
      status: video.status,
      cue: video.visibleExpressionCue || null,
      rawFramesStored: false
    },
    socialMemoryRag: typeof socialMemoryExportPayload === "function" ? socialMemoryExportPayload() : null,
    npcs: state.npcs,
    log: state.log
  };
}

async function submitSummaryFeedback() {
  const text = document.getElementById("summary-feedback").value.trim();
  const rating = document.getElementById("summary-rating").value;
  const status = document.getElementById("feedback-status");
  const feedback = {
    scenario: currentScenario().id,
    participantId: state.participantId,
    evolutionMode: state.evolutionMode,
    rating,
    text,
    submittedAt: new Date().toISOString()
  };
  state.userFeedback = feedback;
  state.log.push({
    type: "User feedback",
    round: "Summary",
    summary: `Rating=${rating || "not provided"}; ${shorten(text || "No written feedback", 180)}`,
    timestamp: feedback.submittedAt
  });
  if (typeof studyPairRequested === "function" && studyPairRequested()) {
    studyPairEvent("brief_feedback_submitted", {ratingProvided: Boolean(rating), textProvided: Boolean(text)});
    const saved = await studyPairSaveCheckpoint("summary_feedback");
    if (status) status.textContent = saved
      ? studyPairText("反馈已确认保存。", "Your feedback has been saved.")
      : studyPairText("反馈尚未确认保存，请重试；不要关闭页面。", "Saving your feedback has not been confirmed. Retry and keep this page open.");
    return;
  }
  const record = {
    schemaVersion: "2.0-feedback",
    sessionId: state.sessionId,
    scenario: currentScenario().id,
    scenarioTitle: scenarioText(currentScenario().title),
    participantId: state.participantId,
    feedback,
    completionType: state.finalOutcome?.endType ||
      (state.apiFatalError ? "session_unavailable" : "incomplete")
  };
  let savedLocally = false;
  try {
    window.localStorage.setItem(
      `${currentScenario().slug || currentScenario().id}-feedback-${state.participantId || "unknown"}-${Date.now()}`,
      JSON.stringify(record)
    );
    savedLocally = true;
  } catch (_) {
    // Feedback remains in memory; it is never uploaded in ordinary single play.
  }
  if (status) status.textContent = summaryText(savedLocally ? "feedbackSaved" : "feedbackLocalOnly");
}
