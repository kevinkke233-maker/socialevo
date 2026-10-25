// Session-local Social Memory RAG for self-evolving NPCs.
// This is intentionally internal-only: no web retrieval and no external knowledge base.
const SOCIAL_MEMORY_MAX_ITEMS = 220;
const SOCIAL_MEMORY_TRACE_MAX_ITEMS = 160;
const SOCIAL_MEMORY_CONTEXT_BUDGET_CHARS = 5600;

function isSocialMemoryRagEnabled() {
  const capability = SocialEvoCore.conditionCapabilities(state.evolutionMode);
  return Boolean(state.socialMemoryRag?.enabled) && capability.retrieveMemory;
}

function isSocialMemoryStoreEnabled() {
  const capability = SocialEvoCore.conditionCapabilities(state.evolutionMode);
  return Boolean(state.socialMemoryRag?.enabled) && capability.storeMemory;
}

function resetSocialMemoryRag() {
  state.socialMemoryRag = {
    enabled: true,
    memoryStore: [],
    memoryOperations: [],
    retrievalTraces: [],
    lastRetrieval: null
  };
}

function seedInitialSocialMemoryRag() {
  if (!isSocialMemoryStoreEnabled()) return;
  state.npcs.forEach((npc) => {
    recordSocialMemoryEvent({
      type: "npc_initial_state",
      sourceEventId: `initial-${npc.id}`,
      visibility: "owner",
      ownerNpcId: npc.id,
      actorIds: [npc.id],
      actorNames: [npc.name],
      summary: `${npc.name} begins the session as ${npc.role || "an existing lab member"}.`,
      knowledgeType: "observed_fact",
      confidence: 1,
      text: `${npc.name} ${npc.role || ""}`,
      importance: 0.58,
      tags: ["initial", "npc-profile", npc.id]
    });
  });
  recordSocialMemoryEvent({
    type: "scenario_setup",
    sourceEventId: "scenario-setup",
    visibility: "group",
    actorIds: ["gm"],
    actorNames: ["Game Master"],
    summary: scenarioFinalGoalForAgent(),
    knowledgeType: "observed_fact",
    confidence: 1,
    text: `${scenarioAgentLabel()} ${scenarioPlayerLabel()} ${scenarioGroupLabel()} ${scenarioFinalGoalForAgent()} ${scenarioSuccessCriterionForAgent()} ${scenarioFailureCriterionForAgent()}`,
    importance: 0.7,
    tags: ["scenario", "goal", currentScenario().id]
  });
}

function recordDialogueSocialMemory(name, text, emotion, tone) {
  if (!isSocialMemoryStoreEnabled()) return;
  const npc = state.npcs.find((item) => item.name === name);
  const actorId = name === "You" ? "player" : npc?.id || "gm";
  if (actorId !== "player") return;
  const privateNpcId = state.currentPrivateConversationNpcId || state.activeSideTalkNpcId || null;
  const isPrivate = Boolean(privateNpcId) && (actorId === "player" || actorId === privateNpcId);
  recordSocialMemoryEvent({
    type: "dialogue",
    sourceEventId: state.activeEventLock?.eventId || `dialogue-${state.dialogueHistory.length}`,
    visibility: isPrivate ? "private" : "group",
    ownerNpcId: isPrivate ? privateNpcId : npc?.id || "",
    audienceNpcIds: isPrivate ? [privateNpcId] : state.npcs.map((item) => item.id),
    actorIds: isPrivate ? ["player", privateNpcId] : [actorId],
    actorNames: [name],
    summary: `${speakerDisplayName(name)}: ${shorten(text, 140)}`,
    knowledgeType: "player_claim",
    confidence: 0.72,
    text,
    importance: memoryImportanceForDialogue(name, text, emotion, tone),
    tags: ["dialogue", actorId, currentWindow()?.type || "opening"]
  });
}

function recordNpcEvolutionSocialMemory(npc, update, event, trace) {
  if (!isSocialMemoryStoreEnabled()) return;
  const summary = neutralEpisodicSummary(event);
  if (!summary) return;
  recordSocialMemoryEvent({
    type: "episodic_event",
    sourceEventId: event?.eventId || trace?.eventId || trace?.timestamp || "",
    visibility: "owner",
    ownerNpcId: npc.id,
    actorIds: ["player"],
    actorNames: ["You"],
    summary,
    knowledgeType: "observed_fact",
    confidence: 0.9,
    evidenceIds: event?.evidenceIds || update?.evidenceIds || [],
    text: summary,
    importance: 0.74,
    tags: ["evolution", npc.id, event?.type || "event"],
    sourceTraceId: trace?.timestamp || ""
  });
}

function recordWorkspaceSocialMemory(artifact, detail = {}) {
  if (!isSocialMemoryStoreEnabled()) return;
  recordSocialMemoryEvent({
    type: detail.type || "workspace",
    sourceEventId: detail.sourceEventId || state.activeEventLock?.eventId || artifact?.id || `workspace-${Date.now()}`,
    visibility: "group",
    actorIds: ["player", detail.targetNpcId || artifact?.targetNpcId || ""].filter(Boolean),
    actorNames: ["You", detail.targetNpcName || artifact?.targetNpcName || ""].filter(Boolean),
    summary: detail.summary || `${artifact?.title || scenarioText(scenarioWorkspace().title)}: ${artifact?.brief || ""}`,
    knowledgeType: "observed_fact",
    confidence: Number(detail.confidence ?? 0.9),
    text: [
      artifact?.title || "",
      artifact?.brief || "",
      artifact?.visualDescription || "",
      (artifact?.criteria || []).join(" "),
      detail.note || "",
      detail.result || "",
      detail.scoreSummary || ""
    ].join(" "),
    importance: detail.importance ?? 0.78,
    tags: ["workspace", artifact?.sourceTaskId || artifact?.relatedTaskId || "", detail.type || ""].filter(Boolean)
  });
}

function recordSafetySocialMemory(action, text, reason) {
  if (!isSocialMemoryStoreEnabled()) return;
  recordSocialMemoryEvent({
    type: "safety_review",
    sourceEventId: state.activeEventLock?.eventId || `safety-${Date.now()}`,
    visibility: "private",
    actorIds: ["player", "gm"],
    actorNames: ["You", "Game Master"],
    summary: `${action}: ${shorten(reason || "", 160)}`,
    knowledgeType: "uncertain",
    confidence: 0.9,
    text: `${action} ${text || ""} ${reason || ""}`,
    importance: action === "allow" ? 0.36 : 0.9,
    tags: ["safety", action]
  });
}

function recordSocialMemoryEvent(event) {
  if (!isSocialMemoryStoreEnabled()) return null;
  const summary = sanitizeMemoryText(event.summary || event.text || "");
  if (!summary) return null;
  const sourceEventId = String(
    event.sourceEventId || event.eventId || state.activeEventLock?.eventId ||
    `memory-source-${Date.now()}-${state.socialMemoryRag.memoryStore.length}`
  );
  const sourceLedgerEvent = state.eventLedger.find((item) => item.eventId === sourceEventId);
  const rootEventId = String(event.rootEventId || sourceLedgerEvent?.rootEventId || sourceEventId);
  const beforeStore = state.socialMemoryRag.memoryStore || [];
  const beforeIds = new Set(beforeStore.map((item) => item.id));
  const result = SocialEvoCore.mergeMemoryAtom(
    beforeStore,
    {
      id: event.id,
      sourceEventId,
      rootEventId,
      ownerNpcId: event.ownerNpcId || "",
      visibility: event.visibility === "gm" ? "private" : event.visibility || "group",
      audienceNpcIds: event.audienceNpcIds || [],
      knowledgeType: event.knowledgeType || "observed_fact",
      summary,
      confidence: Number(event.confidence ?? 0.65),
      importance: clamp(Number(event.importance ?? 0.5), 0, 1),
      evidenceIds: event.evidenceIds || [sourceEventId],
      supersedes: event.supersedes || [],
      conflictsWith: event.conflictsWith || [],
      tags: [event.type || "event", ...(event.tags || [])].filter(Boolean).slice(0, 12),
      createdAt: event.timestamp
    },
    { similarityThreshold: 0.82, maxItems: SOCIAL_MEMORY_MAX_ITEMS }
  );
  state.socialMemoryRag.memoryStore = result.store;
  appendMemoryOperation({
    operation: result.action === "inserted" ? "atom_created" : result.action,
    sourceEventId,
    memoryId: result.atom.id,
    contentHash: result.atom.contentHash
  });
  (result.atom.conflictsWith || []).forEach((conflictMemoryId) => {
    appendMemoryOperation({
      operation: "conflict_link",
      sourceEventId,
      memoryId: result.atom.id,
      relatedMemoryId: conflictMemoryId,
      contentHash: result.atom.contentHash
    });
  });
  (result.atom.supersedes || []).forEach((supersededMemoryId) => {
    appendMemoryOperation({
      operation: "supersedes",
      sourceEventId,
      memoryId: result.atom.id,
      relatedMemoryId: supersededMemoryId,
      contentHash: result.atom.contentHash
    });
  });
  const afterIds = new Set(result.store.map((item) => item.id));
  const candidateIds = new Set([...beforeIds, result.atom.id]);
  const evictedIds = [...candidateIds].filter((id) => !afterIds.has(id));
  if (evictedIds.length) {
    appendMemoryOperation({
      operation: "consolidation",
      sourceEventId,
      memoryId: result.atom.id,
      inputCount: candidateIds.size,
      outputCount: result.store.length
    });
    evictedIds.forEach((memoryId) => {
      appendMemoryOperation({
        operation: "eviction",
        sourceEventId,
        memoryId,
        reason: "bounded_store_retention"
      });
    });
  }
  return { ...result.atom, mergeAction: result.action };
}

function appendMemoryOperation(operation) {
  state.socialMemoryRag.memoryOperations = state.socialMemoryRag.memoryOperations || [];
  const record = {
    operationId: `memory-op-${state.sessionId || "session"}-${state.socialMemoryRag.memoryOperations.length + 1}`,
    timestamp: new Date().toISOString(),
    ...operation
  };
  state.socialMemoryRag.memoryOperations.push(record);
  return record;
}

function neutralEpisodicSummary(event = {}) {
  const playerAction = sanitizeMemoryText(
    event.playerAction || event.playerMessage || event.selectedOptionAction || ""
  );
  if (!playerAction) return "";
  const phase = sanitizeMemoryText(event.phase || event.type || "interaction");
  return `${phase}: the player acted or said, "${playerAction}"`;
}

function retrieveSocialMemoryForAgent(context = {}, options = {}) {
  const purpose = context.purpose || "agent_context";
  const queryText = buildSocialMemoryQueryText(context);
  if (!isSocialMemoryRagEnabled()) {
    return emptySocialMemoryRetrieval(purpose, queryText, "disabled");
  }
  const store = state.socialMemoryRag.memoryStore || [];
  if (!store.length) {
    return emptySocialMemoryRetrieval(purpose, queryText, "empty_store");
  }
  const limit = Number(options.limit || context.limit || 6);
  const controllerAccess = Boolean(context.allowPrivate || isGmMemoryPurpose(purpose));
  const retrieval = SocialEvoCore.retrieveMemory(store, {
    sourceEventId: context.sourceEventId || state.activeEventLock?.eventId || "",
    purpose,
    conditionId: state.evolutionMode,
    viewerNpcId: context.targetNpcId || "",
    role: controllerAccess ? "controller" : "npc",
    queryText,
    tags: context.tags || [],
    limit,
    recentWindow: 12
  });
  const retrievedMemories = retrieval.items.map((item) => ({
    id: item.id,
    sourceEventId: item.sourceEventId,
    type: item.tags?.[0] || "memory",
    visibility: item.visibility,
    ownerNpcId: item.ownerNpcId,
    summary: item.summary,
    contentHash: item.contentHash,
    knowledgeType: item.knowledgeType,
    confidence: item.confidence,
    evidenceIds: item.evidenceIds,
    importance: Number(item.importance.toFixed(2)),
    score: Number(item.retrievalScore || 0),
    timestamp: item.createdAt,
    tags: item.tags
  }));
  const budgeted = fitSocialMemoryContext(retrievedMemories, options.contextBudgetChars);
  const memories = budgeted.memories;
  const trace = {
    id: retrieval.trace.traceId,
    timestamp: retrieval.trace.createdAt,
    sourceEventId: retrieval.trace.sourceEventId,
    purpose: retrieval.trace.purpose,
    targetNpcId: context.targetNpcId || "",
    mode: retrieval.trace.mode,
    queryPreview: shorten(queryText, 220),
    retrievedCount: memories.length,
    memoryIds: memories.map((item) => item.id),
    topSummaries: memories.slice(0, 4).map((item) => item.summary),
    contextBudget: budgeted.contextBudget
  };
  state.socialMemoryRag.lastRetrieval = { ...trace, memories };
  state.socialMemoryRag.retrievalTraces.push(trace);
  if (typeof studyPairArchiveRetrieval === "function") studyPairArchiveRetrieval({ ...trace, memories });
  appendMemoryOperation({
    operation: "retrieval",
    sourceEventId: trace.sourceEventId,
    retrievalTraceId: trace.id,
    targetNpcId: trace.targetNpcId,
    memoryIds: trace.memoryIds,
    purpose: trace.purpose,
    mode: trace.mode
  });
  if (state.socialMemoryRag.retrievalTraces.length > SOCIAL_MEMORY_TRACE_MAX_ITEMS) {
    state.socialMemoryRag.retrievalTraces.splice(0, state.socialMemoryRag.retrievalTraces.length - SOCIAL_MEMORY_TRACE_MAX_ITEMS);
  }
  return {
    enabled: true,
    strategy: retrieval.trace.mode,
    purpose,
    query: shorten(queryText, 260),
    retrievedCount: memories.length,
    memories,
    traceId: trace.id,
    contextBudget: budgeted.contextBudget,
    instruction: "Use these retrieved social memories only as continuity evidence. Do not quote memory IDs, expose retrieval mechanics, or reveal private memories to players/NPCs who could not know them."
  };
}

function fitSocialMemoryContext(memories, requestedBudget) {
  const maximum = clamp(
    Number(requestedBudget || SOCIAL_MEMORY_CONTEXT_BUDGET_CHARS),
    1200,
    12000
  );
  const selected = [];
  let usedChars = 0;
  for (const memory of memories) {
    const compact = {
      ...memory,
      summary: shorten(memory.summary || "", 360),
      evidenceIds: (memory.evidenceIds || []).slice(0, 8),
      tags: (memory.tags || []).slice(0, 10)
    };
    const itemChars = JSON.stringify(compact).length;
    if (selected.length && usedChars + itemChars > maximum) break;
    selected.push(compact);
    usedChars += itemChars;
  }
  return {
    memories: selected,
    contextBudget: {
      maxChars: maximum,
      usedChars,
      selectedCount: selected.length,
      truncatedCount: Math.max(0, memories.length - selected.length)
    }
  };
}

function emptySocialMemoryRetrieval(purpose, query, reason) {
  return {
    enabled: false,
    strategy: "disabled",
    purpose,
    query: shorten(query || "", 260),
    retrievedCount: 0,
    memories: [],
    traceId: "",
    disabledReason: reason,
    instruction: "No Social Memory RAG evidence is available."
  };
}

function buildSocialMemoryQueryText(context = {}) {
  const npc = context.targetNpcId ? state.npcs.find((item) => item.id === context.targetNpcId) : null;
  return [
    context.purpose || "",
    context.queryText || "",
    context.playerText || "",
    context.playerDecision || "",
    context.source || "",
    context.phase || "",
    context.taskTitle || "",
    context.workspaceTitle || "",
    context.goal || scenarioFinalGoalForAgent(),
    npc ? `${npc.name} ${npc.role} ${(npc.values || []).join(" ")}` : "",
    (context.tags || []).join(" ")
  ].filter(Boolean).join(" ");
}

function isGmMemoryPurpose(purpose = "") {
  return /(gm|trigger|decision_window|end_state|task_scoring|summary|safety)/i.test(String(purpose));
}

function memoryImportanceForDialogue(name, text, emotion, tone) {
  const value = String(text || "");
  let importance = name === "You" ? 0.7 : 0.58;
  if (/(决定|选择|任务|提交|材料|分工|计划|decision|choose|task|submit|material|role|plan)/i.test(value)) importance += 0.16;
  if (/(担心|冲突|不同意|不舒服|worry|concern|conflict|disagree|uncomfortable)/i.test(value)) importance += 0.14;
  if (/(谢谢|支持|欢迎|thanks|support|welcome)/i.test(value)) importance += 0.08;
  if (emotion && /(angry|dismissive|guarded|tense|skeptical|焦虑|怀疑|防备|紧张)/i.test(String(emotion))) importance += 0.08;
  if (tone && /(direct|critical|hesitant|直接|犹豫|尖锐)/i.test(String(tone))) importance += 0.04;
  return clamp(importance, 0.2, 0.95);
}

function sanitizeMemoryText(value) {
  return shorten(String(value || "").replace(/\s+/g, " ").trim(), 420);
}

function socialMemoryExportPayload() {
  const rag = state.socialMemoryRag || {};
  const exportedMemories = state.researchProfile?.pairId
    ? [...(rag.memoryStore || [])]
    : (rag.memoryStore || []).slice(-120);
  return {
    enabled: Boolean(rag.enabled),
    modeApplied: SocialEvoCore.conditionCapabilities(state.evolutionMode).retrieveMemory,
    strategy: SocialEvoCore.conditionCapabilities(state.evolutionMode).useRecentWindow
      ? "recent_window"
      : SocialEvoCore.conditionCapabilities(state.evolutionMode).useRag
        ? "session-local lexical-rerank"
        : "disabled",
    memoryCount: rag.memoryStore?.length || 0,
    memoryOperationCount: rag.memoryOperations?.length || 0,
    retrievalTraceCount: rag.retrievalTraces?.length || 0,
    episodicMemories: exportedMemories,
    memoryOperations: rag.memoryOperations || [],
    memories: exportedMemories,
    retrievalTraces: rag.retrievalTraces || []
  };
}
