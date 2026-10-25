// Shared, DOM-free reliability and evaluation core for browser and Node runtimes.
(function socialEvoCoreFactory(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SocialEvoCore = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function buildSocialEvoCore() {
  "use strict";

  const SCHEMA_VERSION = "2.0";
  const EVENT_STATUSES = Object.freeze(["pending", "validated", "committed", "failed"]);
  const KNOWLEDGE_TYPES = Object.freeze([
    "observed_fact", "player_claim", "npc_interpretation", "uncertain"
  ]);
  const VISIBILITIES = Object.freeze(["public", "group", "private", "owner"]);
  const INTERACTION_SOURCES = Object.freeze([
    "player_to_npc_public", "player_to_npc_private", "npc_to_npc_public",
    "observable_cue", "artifact", "system_transition"
  ]);
  const NO_CHANGE_REASONS = Object.freeze([
    "insufficient_evidence", "persona_continuity", "condition_disabled",
    "privacy_unavailable", "semantically_irrelevant"
  ]);
  const EXPRESSION_CUES = Object.freeze([
    "neutral", "joy", "sorrow", "anger", "surprise", "mixed", "unclear"
  ]);
  const RELATIONSHIP_NEUTRAL_POINT = 50;
  const RELATIONSHIP_DIMENSIONS = Object.freeze([
    "competence", "care", "reliability", "disruption"
  ]);
  const VALUE_TRADEOFF_DIMENSIONS = Object.freeze([
    "task", "inclusion", "fairness", "psychologicalSafety"
  ]);
  const ACTION_TAXONOMY = deepFreeze({
    evidence_clarification: "Identify observable evidence or ask a bounded clarifying question.",
    bounded_collaboration: "Offer collaboration with an explicit and realistic boundary.",
    passive_avoidance: "Avoid taking a position or defer responsibility without a next step.",
    overcommitment: "Accept unrealistic responsibility or availability to reduce social pressure.",
    blame_externalization: "Move responsibility onto another person without shared evidence.",
    public_escalation: "Challenge power publicly in a way that raises interpersonal conflict.",
    responsibility_visibility: "Make ownership, evidence, and the next review point visible.",
    credit_self_erasure: "Give up legitimate contribution visibility to avoid tension.",
    credit_overclaim: "Claim disproportionate central credit for a shared outcome.",
    transparent_credit: "Request evidence-based credit while acknowledging others' work.",
    other_social_action: "A meaningful social action that does not fit the listed categories."
  });
  const APPRAISAL_CONSTRUCTS = deepFreeze({
    emotion: {
      target: "self",
      timescale: "short_term_persistent_until_new_evidence",
      legalEvidence: ["direct_interaction", "public_dialogue", "artifact_evaluation"],
      deltaRange: "categorical_label_plus_intensity",
      forbiddenInterpretation: ["diagnosis", "true_emotion", "health_state"]
    },
    trust: {
      target: "player",
      timescale: "cross_event_appraisal",
      legalEvidence: ["player_action", "public_or_owned_memory", "artifact_evaluation"],
      deltaRange: [-10, 10],
      forbiddenInterpretation: ["honesty_detection", "personality_trait"]
    },
    belonging: {
      target: "lab_group",
      timescale: "cross_event_group_membership_appraisal",
      legalEvidence: ["inclusion_action", "collaboration", "credit_process"],
      deltaRange: [-10, 10],
      forbiddenInterpretation: ["player_felt_belonging", "clinical_loneliness"]
    },
    relationship: {
      target: "player",
      timescale: "cross_event_dimension_appraisal",
      legalEvidence: ["direct_interaction", "public_dialogue", "artifact_evaluation"],
      deltaRange: [-10, 10],
      dimensions: RELATIONSHIP_DIMENSIONS,
      forbiddenInterpretation: ["objective_player_trait", "private_unobserved_content"]
    },
    situationalPriority: {
      target: "current_lab_situation",
      timescale: "stage_sensitive_priority",
      legalEvidence: ["current_event", "public_project_state"],
      deltaRange: [-8, 8],
      dimensions: VALUE_TRADEOFF_DIMENSIONS,
      forbiddenInterpretation: ["stable_personality", "moral_worth"]
    },
    strategy: {
      target: "future_social_interaction",
      timescale: "cross_event_bounded_policy",
      legalEvidence: ["importance_at_least_0_6", "relationship_change"],
      deltaRange: "controlled_taxonomy_plus_short_explanation",
      forbiddenInterpretation: ["covert_manipulation", "sensitive_trait_targeting"]
    },
    memory: {
      target: "observable_event",
      timescale: "session_local_append_only_history",
      legalEvidence: ["observable_event", "player_claim", "artifact_action"],
      deltaRange: "not_applicable",
      forbiddenInterpretation: ["appraisal", "relationship_conclusion", "future_strategy"]
    }
  });
  const TRANSPARENT_AGENT_ENVELOPE_KEYS = Object.freeze([
    "repairedJson", "fixedJson", "json", "output", "result", "response", "data", "payload",
    "safetyReview", "review", "scoreReport", "artifactScore", "taskScore",
    "artifactEvaluation", "npcEvaluation", "evaluation"
  ]);

  const CONDITIONS = deepFreeze({
    static: capabilities("static", false, false, false, false, false, false, false, false, false, false),
    "memory-only": capabilities("memory-only", true, true, true, false, false, false, false, false, false, false),
    "self-evolving": capabilities("self-evolving", true, true, true, false, true, true, true, true, true, true),
    "self-evolving-no-rag": capabilities("self-evolving-no-rag", true, true, false, true, true, true, true, true, true, true),
    "self-evolving-no-relationship-strategy": capabilities(
      "self-evolving-no-relationship-strategy",
      true, true, true, false, true, true, true, false, true, false
    )
  });

  const STAGE_TRANSITIONS = deepFreeze([
    {
      stageIndex: 0, stageId: "stage_1_entry", requiredArtifactId: "",
      requiresComprehension: false, requiredSocialInteractions: 0
    },
    {
      stageIndex: 1, stageId: "stage_2_first_failure", requiredArtifactId: "brief_review",
      requiresComprehension: false, requiredSocialInteractions: 0
    },
    {
      stageIndex: 2, stageId: "stage_3_revision_conflict", requiredArtifactId: "revision_plan",
      requiresComprehension: false, requiredSocialInteractions: 0
    },
    {
      stageIndex: 3, stageId: "stage_4_credit", requiredArtifactId: "contribution_statement",
      requiresComprehension: false, requiredSocialInteractions: 0
    }
  ]);
  const STORY_BEAT_TYPES = Object.freeze([
    "stage_context", "shared_material", "artifact_action", "private_consultation",
    "group_exchange", "player_followup", "director_cue", "key_decision", "story_anchor"
  ]);
  const STORY_BEAT_LIMITS = deepFreeze({
    minPerStage: 0,
    maxPerStage: null,
    minBeforeDecision: 0,
    maxBeforeDecision: null,
    attentionInterval: 5
  });
  const LEGACY_STUDY_EXPOSURE_PLAN = deepFreeze([
    {
      stageIndex: 0,
      responderIds: ["riley", "mina"],
      autonomousSpeakerIds: ["leo", "nora"],
      requiredConsultationCount: 1,
      targetStageBeatCount: 6,
      followUpOpportunityCount: 0
    },
    {
      stageIndex: 1,
      responderIds: ["sam", "riley"],
      autonomousSpeakerIds: ["mina", "leo"],
      requiredConsultationCount: 1,
      targetStageBeatCount: 6,
      followUpOpportunityCount: 0
    },
    {
      stageIndex: 2,
      responderIds: ["sam", "mina", "nora"],
      autonomousSpeakerIds: ["riley", "leo"],
      requiredConsultationCount: 1,
      targetStageBeatCount: 6,
      followUpOpportunityCount: 0
    },
    {
      stageIndex: 3,
      responderIds: ["riley", "mina", "leo"],
      autonomousSpeakerIds: ["sam", "nora"],
      requiredConsultationCount: 1,
      targetStageBeatCount: 6,
      followUpOpportunityCount: 0
    }
  ]);

  const STAGE_PACING_VERSION = "stage-milestones-v4-presentation";
  const STUDY_PROTOCOL_VERSION = "lab-entry-rq3-v22-paired-ab";
  const STAGE_MILESTONE_RULES = deepFreeze([
    {stageIndex:0,stageId:"stage_1_entry",requiredArtifactId:"",requiresMaterial:false,
      requiresOpeningResponse:true,requiresEntryScope:true,semanticMilestones:["core_issue_visible","decision_context_visible"]},
    {stageIndex:1,stageId:"stage_2_first_failure",requiredArtifactId:"brief_review",requiresMaterial:true,
      requiresOpeningResponse:false,semanticMilestones:["core_issue_visible","decision_context_visible"]},
    {stageIndex:2,stageId:"stage_3_revision_conflict",requiredArtifactId:"revision_plan",requiresMaterial:false,
      requiresOpeningResponse:false,semanticMilestones:["core_issue_visible","decision_context_visible"]},
    {stageIndex:3,stageId:"stage_4_credit",requiredArtifactId:"contribution_statement",requiresMaterial:false,
      requiresOpeningResponse:false,semanticMilestones:["core_issue_visible","decision_context_visible"]}
  ]);
  const STUDY_EXPOSURE_PLAN = deepFreeze(STAGE_MILESTONE_RULES.map(rule=>({
    ...rule,decisionTrigger:"milestone_readiness",requiredConsultationCount:0,
    targetStageBeatCount:null,followUpOpportunityCount:null,responderIds:null,autonomousSpeakerIds:null
  })));

  function capabilities(id, store, retrieve, rag, recent, emotion, surface, trust, relationship, values, strategy) {
    return {
      id,
      storeMemory: store,
      retrieveMemory: retrieve,
      useRag: rag,
      useRecentWindow: recent,
      updateEmotion: emotion,
      updateSurfaceLine: surface,
      updateTrustBelonging: trust,
      updateRelationship: relationship,
      updateValueTradeoffs: values,
      updateStrategy: strategy
    };
  }

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
    return value;
  }

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function clamp(value, min, max) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : min;
  }

  function round3(value) {
    return Math.round(Number(value || 0) * 1000) / 1000;
  }

  function nowIso(clock) {
    const value = typeof clock === "function" ? clock() : new Date();
    return (value instanceof Date ? value : new Date(value)).toISOString();
  }

  function uniqueStrings(values) {
    const input = Array.isArray(values) ? values : values ? [values] : [];
    return [...new Set(input.map(String).filter(Boolean))];
  }

  function compactText(value, maxLength) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 3))}...` : text;
  }

  // A delivery record is bounded independently of the submitted player input.
  // Reuse this exact projection when binding an existing record to its source.
  const GM_BRIDGE_RECORD_MAX_LENGTH = 1200;
  function dialogueRecordText(value, delivery = {}) {
    const controllerRecord = delivery.channel === 'gm_bridge_record' &&
      delivery.speaker === 'Game Master' && !delivery.npcId;
    return compactText(value, controllerRecord ? GM_BRIDGE_RECORD_MAX_LENGTH : 1000);
  }

  function normalizeText(value) {
    return String(value || "").normalize("NFKC").toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  }

  function normalizeEnumToken(value) {
    return String(value ?? "").normalize("NFKC").trim().toLowerCase()
      .replace(/[\s-]+/g, "_");
  }

  function stableHash(value) {
    const text = typeof value === "string" ? value : stableJson(value);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `fnv1a32-${(hash >>> 0).toString(16).padStart(8, "0")}`;
  }

  function bindDesignedDecisionOptions(candidate = {}, generatedOptions = [], options = {}) {
    const labels = Array.isArray(candidate.options) ? candidate.options : [];
    const metadata = Array.isArray(candidate.optionMeta) ? candidate.optionMeta : [];
    if (labels.length !== 4 || metadata.length !== labels.length) {
      throw new Error("Designed decision window must contain four aligned labels and metadata records.");
    }
    const designed = metadata.map((meta, index) => ({
      designedOptionId: String(meta?.id || ""),
      label: String(labels[index] || "").trim(),
      meta: clone(meta)
    }));
    const designedIds = designed.map((item) => item.designedOptionId);
    if (designedIds.some((id) => !id) || new Set(designedIds).size !== designedIds.length) {
      throw new Error("Designed decision option IDs must be non-empty and unique.");
    }
    if (!Array.isArray(generatedOptions) || generatedOptions.length !== designed.length) {
      throw new Error("Generated decision window must contain exactly four option objects.");
    }
    const generatedById = new Map();
    generatedOptions.forEach((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        throw new Error("Generated decision options must be objects with designedOptionId and label.");
      }
      const unexpected = Object.keys(item).find((key) => !["designedOptionId", "label"].includes(key));
      if (unexpected) throw new Error(`Generated decision option contains unsupported field: ${unexpected}.`);
      const designedOptionId = String(item.designedOptionId || "");
      const label = String(item.label || "").trim();
      if (!designedIds.includes(designedOptionId)) {
        throw new Error(`Unknown designed decision option ID: ${designedOptionId || "missing"}.`);
      }
      if (generatedById.has(designedOptionId)) {
        throw new Error(`Duplicate designed decision option ID: ${designedOptionId}.`);
      }
      if (!label) throw new Error(`Generated decision option ${designedOptionId} has no label.`);
      generatedById.set(designedOptionId, label);
    });
    if (generatedById.size !== designed.length) {
      throw new Error("Generated decision window omitted a designed decision option ID.");
    }
    const freezeLabels = Boolean(options.freezeLabels);
    return {
      designedOptionIds: designedIds,
      options: designed.map((item) => freezeLabels
        ? item.label
        : generatedById.get(item.designedOptionId)),
      optionMeta: designed.map((item) => item.meta)
    };
  }

  function makeId(prefix, parts) {
    const suffix = (parts || []).filter((part) => part !== undefined && part !== null && String(part))
      .map((part) => {
        const normalized = normalizeText(part).replace(/\s+/g, "-");
        if (normalized.length <= 40) return normalized;
        return `${normalized.slice(0, 31)}-${stableHash(normalized).slice(-8)}`;
      })
      .filter(Boolean).join("-");
    return `${prefix}-${suffix || Math.random().toString(36).slice(2, 10)}`;
  }

  function conditionCapabilities(conditionId) {
    return clone(CONDITIONS[conditionId] || CONDITIONS["self-evolving"]);
  }

  function conditionIds() {
    return Object.keys(CONDITIONS);
  }

  function studyExposureForStage(stageIndex, options = {}) {
    const plan = STUDY_EXPOSURE_PLAN.find((item) =>
      item.stageIndex === Number(stageIndex)
    );
    if (!plan) throw new Error(`Unknown study exposure stage: ${stageIndex}.`);
    return {
      ...clone(plan),
      earlySuccessAllowed: false
    };
  }

  function actionCodes() {
    return Object.keys(ACTION_TAXONOMY);
  }

  function normalizeActionClassification(input = {}) {
    const actionCode = normalizeEnumToken(input.actionCode);
    if (!Object.prototype.hasOwnProperty.call(ACTION_TAXONOMY, actionCode)) {
      throw new Error(`Unknown canonical action code: ${actionCode || "missing"}.`);
    }
    const evidenceSpan = compactText(input.evidenceSpan || "", 180);
    if (!evidenceSpan) throw new Error("Canonical action classification requires an evidenceSpan.");
    const confidence = Number(input.confidence);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      throw new Error("Canonical action classification requires confidence from 0 to 1.");
    }
    return {
      actionCode,
      confidence,
      evidenceSpan,
      source: String(input.source || "condition_blind_classifier")
    };
  }

  function evaluateInteractionNovelty(history = [], input = {}) {
    const npcId = String(input.npcId || "");
    const stageId = String(input.stageId || "");
    const actionCode = String(input.actionCode || "");
    const evidenceSpan = compactText(input.evidenceSpan || "", 500);
    if (!npcId || !stageId || !Object.prototype.hasOwnProperty.call(ACTION_TAXONOMY, actionCode)) {
      throw new Error("Interaction novelty requires npcId, stageId, and a canonical actionCode.");
    }
    if (!evidenceSpan) throw new Error("Interaction novelty requires an evidenceSpan.");
    const candidates = (Array.isArray(history) ? history : []).filter((item) =>
      String(item.npcId || "") === npcId &&
      String(item.stageId || "") === stageId &&
      String(item.actionCode || "") === actionCode
    );
    const scored = candidates.map((item) => ({
      item,
      similarity: normalizedSimilarity(item.evidenceSpan || "", evidenceSpan)
    })).sort((left, right) => right.similarity - left.similarity);
    const duplicate = scored.find((entry) => entry.similarity >= 0.82) || null;
    return {
      isNovel: !duplicate,
      similarity: duplicate ? duplicate.similarity : (scored[0]?.similarity || 0),
      matchedRootEventId: duplicate ? String(duplicate.item.rootEventId || "") : "",
      record: {
        rootEventId: String(input.rootEventId || ""),
        npcId,
        stageId,
        actionCode,
        evidenceSpan,
        contentHash: stableHash({ npcId, stageId, actionCode, evidenceSpan })
      }
    };
  }

  function validateParticipantVisibleOutput(value, options = {}) {
    const text = compactText(value || "", Number(options.maxLength || 2000));
    const violations = [];
    const rules = [
      ["prompt_leak", /\b(system prompt|developer message|hidden instruction|chain[- ]of[- ]thought|ignore (all |the )?previous instructions?)\b|系统提示(?:词)?|开发者消息|隐藏指令|思维链|忽略(?:以上|之前|先前)指令/iu],
      ["research_leak", /\b(hidden motive|hidden score|hidden metric|answer key|grading rubric|research log|debug panel|condition assignment|participant id)\b|隐藏动机|隐藏分数|隐藏指标|答案键|评分量表|研究日志|调试面板|条件分配|参与者编号/iu],
      ["condition_leak", /\b(memory[- ]only|self[- ]evolving(?:[- ]no[- ]rag)?|no[- ]relationship|capability vector|experiment condition|research condition)\b|记忆条件|自进化条件|实验条件|研究条件|能力向量/iu],
      ["backend_leak", /\b(deepseek|openai|chatgpt|gpt[- ]?\d*|model backend|model id|api call|json repair)\b|模型后端|模型编号|接口调用|JSON\s*修复/iu],
      ["evidence_id_leak", /\b(?:event|memory|evidence|call|change|retrieval)[-_][a-z0-9][a-z0-9_-]{2,}\b/iu],
      ["numeric_state_leak", /\b(?:trust|belonging|relationship|group climate|group progress)(?:\s+(?:score|value))?\s*(?:=|:|is)?\s*\d+(?:\.\d+)?\b|(?:信任|归属|关系|小组氛围|小组进度)(?:分数|数值|值)?\s*(?:为|是|=|：|:)\s*\d+(?:\.\d+)?/iu],
      ["mental_state_inference", /\byou (?:look|seem|sound|appear)\s+(?:very\s+)?(?:anxious|nervous|depressed|sad|angry|upset|afraid|dishonest)|你(?:看起来|显得|听起来)(?:很|非常)?(?:焦虑|紧张|抑郁|悲伤|生气|愤怒|害怕|不诚实)/iu],
      ["sensitive_inference", /\b(?:your personality|your health condition|your identity|you are lying)\b|你的性格|你的健康状况|你的身份|你在说谎/iu]
    ];
    rules.forEach(([code, pattern]) => {
      if (pattern.test(text)) violations.push(code);
    });
    const normalizedOutput = normalizeText(text);
    (Array.isArray(options.forbiddenFragments) ? options.forbiddenFragments : [])
      .map((fragment) => normalizeText(fragment))
      .filter((fragment) => fragment.length >= 18)
      .forEach((fragment) => {
        if (normalizedOutput.includes(fragment)) violations.push("private_content_leak");
      });
    return { ok: violations.length === 0, violations: uniqueStrings(violations), text };
  }

  function sameCapabilities(left, right) {
    // Durable JSON storage may reorder object keys. Capability identity is
    // defined by the keys and their exact values, rather than insertion order.
    return stableJson(left || {}) === stableJson(right || {});
  }

  function normalizeVisibility(value) {
    const normalized = String(value || "group").toLowerCase();
    return VISIBILITIES.includes(normalized) ? normalized : "group";
  }

  function normalizeAudience(audience) {
    if (!audience) return { visibility: "group", npcIds: [] };
    if (typeof audience === "string") {
      return { visibility: normalizeVisibility(audience), npcIds: [] };
    }
    return {
      visibility: normalizeVisibility(audience.visibility),
      npcIds: uniqueStrings(audience.npcIds)
    };
  }

  function createSessionEvent(input = {}, clock) {
    const timestamp = nowIso(clock);
    const eventId = String(input.eventId || makeId("event", [
      input.sessionId, input.sessionEpoch, input.type, Date.now()
    ]));
    const parentEventId = String(input.parentEventId || "");
    const event = {
      schemaVersion: SCHEMA_VERSION,
      eventId,
      rootEventId: String(input.rootEventId || eventId),
      parentEventId,
      causalDepth: Math.max(0, Number(input.causalDepth ?? (parentEventId ? 1 : 0))),
      interactionSource: INTERACTION_SOURCES.includes(input.interactionSource)
        ? input.interactionSource : "system_transition",
      turnId: String(input.turnId || `${input.sessionEpoch || 0}:${input.type || "interaction"}`),
      sourceSpanId: String(input.sourceSpanId || ""),
      sessionId: String(input.sessionId || ""),
      sessionEpoch: Number(input.sessionEpoch || 0),
      type: String(input.type || "interaction"),
      status: "pending",
      actors: uniqueStrings(input.actors),
      audience: normalizeAudience(input.audience),
      callIds: uniqueStrings(input.callIds),
      evidenceIds: uniqueStrings(input.evidenceIds),
      proposals: Array.isArray(input.proposals) ? clone(input.proposals) : [],
      stateChanges: Array.isArray(input.stateChanges) ? clone(input.stateChanges) : [],
      noChangeEvaluations: Array.isArray(input.noChangeEvaluations)
        ? clone(input.noChangeEvaluations) : [],
      dialogueDeliveries: Array.isArray(input.dialogueDeliveries)
        ? clone(input.dialogueDeliveries) : [],
      commit: null,
      error: null,
      metadata: input.metadata && typeof input.metadata === "object" ? clone(input.metadata) : {},
      timestamps: {
        createdAt: timestamp,
        dialogueGeneratedAt: "",
        dialogueDeliveredAt: "",
        validatedAt: "",
        committedAt: "",
        persistentCommitAt: "",
        failedAt: ""
      }
    };
    const validation = validateSessionEvent(event);
    if (!validation.ok) throw new Error(`Invalid SessionEventV2: ${validation.errors.join("; ")}`);
    return event;
  }

  function validateSessionEvent(event) {
    const errors = [];
    if (!event || typeof event !== "object") return { ok: false, errors: ["event must be an object"] };
    if (!event.eventId) errors.push("eventId is required");
    if (!event.rootEventId) errors.push("rootEventId is required");
    if (event.parentEventId && event.rootEventId === event.eventId) {
      errors.push("derived event must inherit its parent's rootEventId");
    }
    if (!INTERACTION_SOURCES.includes(event.interactionSource)) {
      errors.push("interactionSource is invalid");
    }
    if (!event.turnId) errors.push("turnId is required");
    if (!event.sessionId) errors.push("sessionId is required");
    if (!Number.isInteger(Number(event.sessionEpoch)) || Number(event.sessionEpoch) < 0) {
      errors.push("sessionEpoch must be non-negative");
    }
    if (!event.type) errors.push("type is required");
    if (!EVENT_STATUSES.includes(event.status)) errors.push(`invalid status: ${event.status}`);
    if (!event.audience || !VISIBILITIES.includes(event.audience.visibility)) {
      errors.push("audience visibility is invalid");
    }
    if (!Array.isArray(event.callIds) || !Array.isArray(event.evidenceIds) ||
        !Array.isArray(event.proposals) || !Array.isArray(event.dialogueDeliveries) ||
        !Array.isArray(event.stateChanges) || !Array.isArray(event.noChangeEvaluations)) {
      errors.push("event collection fields must be arrays");
    }
    return { ok: errors.length === 0, errors };
  }

  function normalizeError(error) {
    if (!error) return { code: "unknown", message: "Unknown event failure" };
    if (typeof error === "string") return { code: "event_failed", message: error };
    return {
      code: String(error.code || error.name || "event_failed"),
      message: String(error.message || "Event failed"),
      retryable: Boolean(error.retryable)
    };
  }

  // Optional lifecycle instrumentation, DOM-free and outside transaction logic.
  const sessionEventObservers = new Set();
  function observeSessionEvents(listener) {
    if(typeof listener !== "function") throw new TypeError("Event observer must be a function.");
    sessionEventObservers.add(listener);
    return () => sessionEventObservers.delete(listener);
  }
  function notifySessionEvent(event, change) {
    for(const listener of sessionEventObservers) {
      try { listener(event, change); } catch (_) { /* Instrumentation cannot roll back a valid commit. */ }
    }
  }

  function transitionEvent(event, nextStatus, details = {}, clock) {
    const transitions = {
      pending: ["validated", "failed"],
      validated: ["committed", "failed"],
      committed: [],
      failed: []
    };
    if (!event || !transitions[event.status]?.includes(nextStatus)) {
      throw new Error(`Invalid event transition ${event?.status || "missing"} -> ${nextStatus}`);
    }
    const timestamp = nowIso(clock);
    if (nextStatus === "validated") {
      if (details.proposals) event.proposals = clone(details.proposals);
      event.callIds = uniqueStrings(event.callIds.concat(details.callIds || []));
      event.evidenceIds = uniqueStrings(event.evidenceIds.concat(details.evidenceIds || []));
      event.timestamps.validatedAt = timestamp;
    } else if (nextStatus === "committed") {
      event.commit = clone(details);
      event.timestamps.committedAt = timestamp;
      event.timestamps.persistentCommitAt = timestamp;
    } else {
      event.error = normalizeError(details);
      event.timestamps.failedAt = timestamp;
    }
    event.status = nextStatus;
    notifySessionEvent(event, nextStatus);
    return event;
  }

  function failEvent(event, error, clock) {
    if (!event || ["committed", "failed"].includes(event.status)) return event;
    return transitionEvent(event, "failed", error, clock);
  }

  function recordDialogueGenerated(event, deliveries, clock) {
    if (!event || !Array.isArray(event.dialogueDeliveries)) {
      throw new Error("SessionEventV2 is required for dialogue generation records.");
    }
    const timestamp = nowIso(clock);
    const input = Array.isArray(deliveries) ? deliveries : [deliveries];
    input.filter(Boolean).forEach((delivery, index) => {
      const text = dialogueRecordText(delivery.text || delivery.dialogue || "", delivery);
      if (!text) return;
      const deliveryId = String(delivery.deliveryId || makeId("delivery", [
        event.eventId, delivery.npcId || delivery.speaker || "system",
        event.dialogueDeliveries.length + index, text.slice(0, 24)
      ]));
      if (event.dialogueDeliveries.some((item) => item.deliveryId === deliveryId)) return;
      event.dialogueDeliveries.push({
        deliveryId,
        npcId: String(delivery.npcId || ""),
        speaker: String(delivery.speaker || ""),
        text,
        channel: String(delivery.channel || "dialogue"),
        generatedAt: timestamp,
        deliveredAt: "",
        status: "generated"
      });
    });
    if (event.dialogueDeliveries.length && !event.timestamps.dialogueGeneratedAt) {
      event.timestamps.dialogueGeneratedAt = timestamp;
    }
    return event.dialogueDeliveries;
  }

  function markDialogueDelivered(event, selector = {}, clock) {
    if (!event || !Array.isArray(event.dialogueDeliveries)) {
      throw new Error("SessionEventV2 is required for dialogue delivery records.");
    }
    const timestamp = nowIso(clock);
    const deliveryId = String(selector.deliveryId || "");
    const npcId = String(selector.npcId || "");
    const rawText = selector.text || selector.dialogue || "";
    const text = dialogueRecordText(rawText);
    const match = event.dialogueDeliveries.find((item) =>
      !item.deliveredAt &&
      (!deliveryId || item.deliveryId === deliveryId) &&
      (!Object.prototype.hasOwnProperty.call(selector, 'npcId') || item.npcId === npcId) &&
      (!Object.prototype.hasOwnProperty.call(selector, 'speaker') || item.speaker === String(selector.speaker || '')) &&
      (!Object.prototype.hasOwnProperty.call(selector, 'channel') || item.channel === String(selector.channel || '')) &&
      (!text || item.text === dialogueRecordText(rawText, item))
    );
    if (!match) throw new Error("No generated dialogue delivery matches the delivered line.");
    match.deliveredAt = timestamp;
    match.status = "delivered";
    event.timestamps.dialogueDeliveredAt = timestamp;
    notifySessionEvent(event, "dialogue_delivered");
    return match;
  }

  function stableJson(value) {
    if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
    if (value && typeof value === "object") {
      return `{${Object.keys(value).sort().map((key) =>
        `${JSON.stringify(key)}:${stableJson(value[key])}`
      ).join(",")}}`;
    }
    return JSON.stringify(value);
  }

  function repairComparisonJsonSource(value) {
    let source = String(value || "").trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const firstObject = source.indexOf("{");
    const lastObject = source.lastIndexOf("}");
    if (firstObject >= 0 && lastObject > firstObject) {
      source = source.slice(firstObject, lastObject + 1);
    }
    return source;
  }

  function parseJsonForRepairComparison(value) {
    const source = repairComparisonJsonSource(value);
    let index = 0;
    const fail = (message) => {
      throw new Error(`${message} at position ${index}.`);
    };
    const skipWhitespace = () => {
      while (/\s/.test(source[index] || "")) index += 1;
    };
    const parseString = () => {
      if (source[index] !== '"') fail("Expected JSON string");
      const start = index;
      index += 1;
      let escaped = false;
      while (index < source.length) {
        const character = source[index];
        if (!escaped && character === '"') {
          index += 1;
          const raw = source.slice(start, index).replace(/[\u0000-\u001f]/g, (control) => {
            const escapes = { "\b": "\\b", "\f": "\\f", "\n": "\\n", "\r": "\\r", "\t": "\\t" };
            return escapes[control] || `\\u${control.charCodeAt(0).toString(16).padStart(4, "0")}`;
          });
          return JSON.parse(raw);
        }
        if (!escaped && character === "\\") escaped = true;
        else escaped = false;
        index += 1;
      }
      fail("Unterminated JSON string");
    };
    const valueStartsHere = () => /["{[\-0-9tfn]/.test(source[index] || "");
    const parseValue = () => {
      skipWhitespace();
      const character = source[index];
      if (character === '"') return parseString();
      if (character === "{") return parseObject();
      if (character === "[") return parseArray();
      for (const [token, parsed] of [["true", true], ["false", false], ["null", null]]) {
        if (source.slice(index, index + token.length) === token) {
          index += token.length;
          return parsed;
        }
      }
      const numberMatch = source.slice(index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
      if (numberMatch) {
        index += numberMatch[0].length;
        return Number(numberMatch[0]);
      }
      fail("Expected JSON value");
    };
    const parseObject = () => {
      const result = {};
      const seenKeys = new Set();
      index += 1;
      skipWhitespace();
      if (source[index] === "}") {
        index += 1;
        return result;
      }
      while (index < source.length) {
        skipWhitespace();
        const key = parseString();
        if (seenKeys.has(key)) fail(`Duplicate JSON key ${key}`);
        seenKeys.add(key);
        skipWhitespace();
        if (source[index] !== ":") fail("Expected colon after JSON key");
        index += 1;
        result[key] = parseValue();
        skipWhitespace();
        if (source[index] === "}") {
          index += 1;
          return result;
        }
        if (source[index] === ",") {
          index += 1;
          skipWhitespace();
          if (source[index] === "}") {
            index += 1;
            return result;
          }
          continue;
        }
        if (source[index] === '"') continue;
        fail("Expected comma or object end");
      }
      fail("Unterminated JSON object");
    };
    const parseArray = () => {
      const result = [];
      index += 1;
      skipWhitespace();
      if (source[index] === "]") {
        index += 1;
        return result;
      }
      while (index < source.length) {
        result.push(parseValue());
        skipWhitespace();
        if (source[index] === "]") {
          index += 1;
          return result;
        }
        if (source[index] === ",") {
          index += 1;
          skipWhitespace();
          if (source[index] === "]") {
            index += 1;
            return result;
          }
          continue;
        }
        if (valueStartsHere()) continue;
        fail("Expected comma or array end");
      }
      fail("Unterminated JSON array");
    };
    const parsed = parseValue();
    skipWhitespace();
    if (index !== source.length) fail("Unexpected trailing JSON content");
    return parsed;
  }

  function unwrapTransparentAgentEnvelope(value) {
    let current = value;
    const seen = new Set();
    while (current && typeof current === "object" && !Array.isArray(current) && !seen.has(current)) {
      seen.add(current);
      const keys = Object.keys(current);
      if (keys.length !== 1 || !TRANSPARENT_AGENT_ENVELOPE_KEYS.includes(keys[0])) break;
      const candidate = current[keys[0]];
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) break;
      current = candidate;
    }
    return current;
  }

  function repairSemanticEntries(value, path = "$", entries = []) {
    if (Array.isArray(value)) {
      if (!value.length) entries.push(`${path}:[]`);
      value.forEach((item, index) => repairSemanticEntries(item, `${path}[${index}]`, entries));
      return entries;
    }
    if (value && typeof value === "object") {
      const keys = Object.keys(value).sort();
      if (!keys.length) entries.push(`${path}:{}`);
      keys.forEach((key) => repairSemanticEntries(value[key], `${path}.${key}`, entries));
      return entries;
    }
    entries.push(`${path}:${stableJson(value)}`);
    return entries;
  }

  function canonicalizeRepairComparisonStructure(value, parentKey = "") {
    if (Array.isArray(value)) {
      const normalized = value.map((item) => canonicalizeRepairComparisonStructure(item));
      if (parentKey === "npcUpdates" && normalized.every((item) =>
        item && typeof item === "object" && !Array.isArray(item) && String(item.npcId || "")
      )) {
        return normalized.sort((left, right) => String(left.npcId).localeCompare(String(right.npcId)));
      }
      return normalized;
    }
    if (!value || typeof value !== "object") return value;
    if (parentKey === "npcUpdates") {
      const entries = Object.entries(value);
      const identityMap = entries.length > 0 && entries.every(([npcId, update]) =>
        update && typeof update === "object" && !Array.isArray(update) && String(update.npcId || "") === npcId
      );
      if (identityMap) {
        return entries
          .map(([, update]) => canonicalizeRepairComparisonStructure(update))
          .sort((left, right) => String(left.npcId).localeCompare(String(right.npcId)));
      }
    }
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [
      key,
      canonicalizeRepairComparisonStructure(child, key)
    ]));
  }

  function validateRepairSemantics(original, repaired) {
    let comparableOriginal = original;
    let comparableRepaired = repaired;
    try {
      if (typeof original === "string") comparableOriginal = parseJsonForRepairComparison(original);
      if (typeof repaired === "string") comparableRepaired = parseJsonForRepairComparison(repaired);
    } catch (error) {
      return {
        ok: false,
        errors: [`JSON repair source could not be compared without inventing semantics: ${error.message}`],
        before: [],
        after: []
      };
    }
    comparableOriginal = unwrapTransparentAgentEnvelope(comparableOriginal);
    comparableRepaired = unwrapTransparentAgentEnvelope(comparableRepaired);
    comparableOriginal = canonicalizeRepairComparisonStructure(comparableOriginal);
    comparableRepaired = canonicalizeRepairComparisonStructure(comparableRepaired);
    const before = repairSemanticEntries(comparableOriginal);
    const after = repairSemanticEntries(comparableRepaired);
    const ok = before.length === after.length && before.every((item, index) => item === after[index]);
    return {
      ok,
      errors: ok ? [] : [
        "JSON repair changed, removed, reordered, or introduced agent-output semantics."
      ],
      before,
      after
    };
  }

  function canonicalizeEvolutionDeltaNamespaces(patch = {}) {
    const normalized = clone(patch);
    const adjustments = [];
    const errors = [];
    if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) {
      return {
        patch: normalized,
        adjustments,
        errors: ["Evolution state patch must be an object."]
      };
    }

    const relocate = (sourceKey, sourceDimensions, targetKey, targetDimensions) => {
      const source = normalized[sourceKey];
      if (!source || typeof source !== "object" || Array.isArray(source)) return;
      Object.keys(source).forEach((field) => {
        if (sourceDimensions.includes(field) || !targetDimensions.includes(field)) return;
        const currentTarget = normalized[targetKey];
        if (currentTarget !== undefined &&
            (!currentTarget || typeof currentTarget !== "object" || Array.isArray(currentTarget))) {
          errors.push(`Cannot relocate ${field}: ${targetKey} is not an object.`);
          return;
        }
        const target = currentTarget || {};
        if (!currentTarget) normalized[targetKey] = target;
        if (Object.prototype.hasOwnProperty.call(target, field)) {
          const sourceNumber = Number(source[field]);
          const targetNumber = Number(target[field]);
          if (!Number.isFinite(sourceNumber) || !Number.isFinite(targetNumber) || sourceNumber !== targetNumber) {
            errors.push(`Cannot relocate ${field}: conflicting values across delta namespaces.`);
            return;
          }
          delete source[field];
          adjustments.push({
            code: "duplicate_delta_namespace_removed",
            field,
            from: sourceKey,
            to: targetKey,
            value: target[field]
          });
          return;
        }
        target[field] = source[field];
        delete source[field];
        adjustments.push({
          code: "delta_namespace_relocated",
          field,
          from: sourceKey,
          to: targetKey,
          value: target[field]
        });
      });
    };

    relocate(
      "relationshipDeltas",
      RELATIONSHIP_DIMENSIONS,
      "valueTradeoffDeltas",
      VALUE_TRADEOFF_DIMENSIONS
    );
    relocate(
      "valueTradeoffDeltas",
      VALUE_TRADEOFF_DIMENSIONS,
      "relationshipDeltas",
      RELATIONSHIP_DIMENSIONS
    );
    const misplacedAppraisalFields = new Set([
      "trust", "trustDelta", "belonging", "belongingDelta",
      "progress", "climate", "taskProgress"
    ]);
    ["relationshipDeltas", "valueTradeoffDeltas"].forEach((namespace) => {
      const values = normalized[namespace];
      if (!values || typeof values !== "object" || Array.isArray(values)) return;
      Object.keys(values).forEach((field) => {
        if (!misplacedAppraisalFields.has(field)) return;
        adjustments.push({
          code: "misplaced_appraisal_delta_removed",
          field,
          from: namespace,
          value: values[field]
        });
        delete values[field];
      });
    });
    return { patch: normalized, adjustments, errors };
  }

  function normalizeMemoryAtom(input = {}, clock) {
    const sourceEventId = String(input.sourceEventId || "");
    const ownerNpcId = String(input.ownerNpcId || "");
    const requestedKnowledgeType = KNOWLEDGE_TYPES.includes(input.knowledgeType)
      ? input.knowledgeType : "observed_fact";
    const knowledgeType = requestedKnowledgeType === "npc_interpretation"
      ? "observed_fact" : requestedKnowledgeType;
    const summary = compactText(input.summary || input.interpretation || "", 360);
    const timestamp = String(input.createdAt || nowIso(clock));
    const memoryLayer = "episodic";
    const visibility = normalizeVisibility(input.visibility || (ownerNpcId ? "owner" : "group"));
    const contentHash = stableHash({
      memoryLayer, ownerNpcId, visibility, knowledgeType, summary
    });
    return {
      schemaVersion: SCHEMA_VERSION,
      memoryLayer,
      id: String(input.id || makeId("memory", [
        ownerNpcId || "group", sourceEventId || Date.now(), knowledgeType, summary.slice(0, 30)
      ])),
      sourceEventId,
      rootEventId: String(input.rootEventId || sourceEventId),
      rootEventIds: uniqueStrings(input.rootEventIds || input.rootEventId || sourceEventId),
      ownerNpcId,
      visibility,
      audienceNpcIds: uniqueStrings(input.audienceNpcIds),
      knowledgeType,
      summary,
      interpretation: "",
      contentHash,
      confidence: clamp(input.confidence ?? (knowledgeType === "observed_fact" ? 0.8 : 0.6), 0, 1),
      importance: clamp(input.importance ?? 0.5, 0, 1),
      evidenceIds: uniqueStrings(input.evidenceIds || (sourceEventId ? [sourceEventId] : [])),
      supersedes: uniqueStrings(input.supersedes),
      conflictsWith: uniqueStrings(input.conflictsWith),
      tags: uniqueStrings(input.tags),
      createdAt: timestamp,
      updatedAt: String(input.updatedAt || timestamp),
      lastRetrievedAt: String(input.lastRetrievedAt || ""),
      retrievalCount: Math.max(0, Number(input.retrievalCount || 0))
    };
  }

  function validateMemoryAtom(atom) {
    const errors = [];
    if (!atom?.id) errors.push("memory id is required");
    if (!atom?.sourceEventId) errors.push("sourceEventId is required");
    if (!KNOWLEDGE_TYPES.includes(atom?.knowledgeType)) errors.push("knowledgeType is invalid");
    if (!VISIBILITIES.includes(atom?.visibility)) errors.push("visibility is invalid");
    if (!atom?.summary) errors.push("summary is required");
    if (atom?.memoryLayer !== "episodic") errors.push("memoryLayer must be episodic");
    if (String(atom?.interpretation || "").trim()) {
      errors.push("episodic memory may not contain appraisal interpretation");
    }
    if (!atom?.contentHash) errors.push("contentHash is required");
    if (atom?.visibility === "owner" && !atom?.ownerNpcId) {
      errors.push("owner visibility requires ownerNpcId");
    }
    return { ok: errors.length === 0, errors };
  }

  function memoryIdentityKey(atom) {
    return `${atom.ownerNpcId || "group"}:${atom.sourceEventId}:${atom.knowledgeType}`;
  }

  function mergeMemoryFields(target, source, clock) {
    const existingRoots = new Set(target.rootEventIds || [target.rootEventId]);
    const incomingRoots = uniqueStrings(source.rootEventIds || source.rootEventId);
    const hasIndependentRoot = incomingRoots.some((rootId) => !existingRoots.has(rootId));
    target.evidenceIds = uniqueStrings(target.evidenceIds.concat(source.evidenceIds));
    target.rootEventIds = uniqueStrings((target.rootEventIds || []).concat(incomingRoots));
    target.supersedes = uniqueStrings(target.supersedes.concat(source.supersedes));
    target.conflictsWith = uniqueStrings(target.conflictsWith.concat(source.conflictsWith));
    target.tags = uniqueStrings(target.tags.concat(source.tags));
    if (hasIndependentRoot) {
      target.confidence = Math.max(target.confidence, source.confidence);
      target.importance = clamp(target.importance + source.importance * 0.12, 0, 1);
    }
    target.updatedAt = nowIso(clock);
  }

  function episodicAppraisalLeakTerms(atom) {
    const text = String(atom?.summary || "");
    const patterns = [
      /\b(?:now|more|less) trusts? (?:the )?player\b/i,
      /\b(?:will|should) (?:support|avoid) (?:the )?player\b/i,
      /\bplayer is (?:un)?reliable\b|\bplayer is (?:un)?trustworthy\b/i,
      /\bfuture strategy\b|\brelationship (?:improved|worsened)\b/i,
      /现在更?信任玩家|以后要(?:支持|回避|避开)玩家|玩家(?:更)?(?:可靠|不可靠)|关系(?:改善|恶化)|未来策略/u
    ];
    return patterns.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source);
  }

  function conflictPolarity(text) {
    const value = normalizeText(text);
    if (/\b(no|not|never|cannot|did not)\b|不|没|未|拒绝/u.test(value)) return -1;
    if (/\b(is|did|will|can|accept)\b|是|已|会|接受/u.test(value)) return 1;
    return 0;
  }

  function linkConflicts(store, candidate) {
    const polarity = conflictPolarity(candidate.summary);
    if (!polarity) return;
    store.forEach((item) => {
      if (item.ownerNpcId !== candidate.ownerNpcId ||
          item.knowledgeType !== candidate.knowledgeType ||
          conflictPolarity(item.summary) !== -polarity ||
          tokenOverlap(item.summary, candidate.summary) < 0.35) return;
      candidate.conflictsWith = uniqueStrings(candidate.conflictsWith.concat(item.id));
      item.conflictsWith = uniqueStrings(item.conflictsWith.concat(candidate.id));
    });
  }

  function mergeMemoryAtom(store, candidateInput, options = {}) {
    const settings = { similarityThreshold: 0.82, maxItems: 220, ...options };
    const candidate = normalizeMemoryAtom(candidateInput, settings.clock);
    const validation = validateMemoryAtom(candidate);
    if (!validation.ok) throw new Error(`Invalid MemoryAtomV2: ${validation.errors.join("; ")}`);
    const nextStore = Array.isArray(store)
      ? store.map((item) => normalizeMemoryAtom(item, settings.clock)) : [];
    const idempotent = nextStore.find((item) =>
      memoryIdentityKey(item) === memoryIdentityKey(candidate)
    );
    if (idempotent) {
      mergeMemoryFields(idempotent, candidate, settings.clock);
      return {
        store: consolidateMemoryStore(nextStore, settings),
        atom: idempotent,
        action: "idempotent_merge"
      };
    }
    const candidatePolarity = conflictPolarity(candidate.summary);
    const duplicate = nextStore.find((item) =>
      item.ownerNpcId === candidate.ownerNpcId &&
      item.knowledgeType === candidate.knowledgeType &&
      !(candidatePolarity && conflictPolarity(item.summary) === -candidatePolarity) &&
      normalizedSimilarity(item.summary, candidate.summary) >= settings.similarityThreshold
    );
    if (duplicate) {
      mergeMemoryFields(duplicate, candidate, settings.clock);
      return {
        store: consolidateMemoryStore(nextStore, settings),
        atom: duplicate,
        action: "semantic_merge"
      };
    }
    linkConflicts(nextStore, candidate);
    nextStore.push(candidate);
    return {
      store: consolidateMemoryStore(nextStore, settings),
      atom: candidate,
      action: "inserted"
    };
  }

  function memoryRetentionScore(atom) {
    const parsed = Date.parse(atom.updatedAt || atom.createdAt || "");
    const ageDays = Math.max(0, (Date.now() - (Number.isFinite(parsed) ? parsed : Date.now())) / 86400000);
    const recency = 1 / (1 + ageDays);
    return atom.importance * 0.5 + atom.confidence * 0.25 + recency * 0.2 +
      Math.min(atom.evidenceIds.length / 5, 1) * 0.05;
  }

  function consolidateMemoryStore(store, options = {}) {
    const maxItems = Math.max(1, Number(options.maxItems || 220));
    if (store.length <= maxItems) return store;
    return store.slice()
      .sort((left, right) => memoryRetentionScore(right) - memoryRetentionScore(left))
      .slice(0, maxItems)
      .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
  }

  function canAccessMemory(atom, access = {}) {
    const viewerNpcId = String(access.viewerNpcId || "");
    if (["controller", "researcher"].includes(String(access.role || "npc"))) return true;
    if (["public", "group"].includes(atom.visibility)) return true;
    if (atom.visibility === "owner") return Boolean(viewerNpcId) && atom.ownerNpcId === viewerNpcId;
    return atom.visibility === "private" && Boolean(viewerNpcId) &&
      (atom.ownerNpcId === viewerNpcId || (atom.audienceNpcIds || []).includes(viewerNpcId));
  }

  function visibleMemoryAtoms(store, access) {
    return (store || []).filter((atom) => canAccessMemory(atom, access));
  }

  function tokens(value) {
    const normalized = normalizeText(value);
    const words = normalized.split(/\s+/).filter(Boolean);
    const cjk = [...normalized.replace(/[^\p{Script=Han}]/gu, "")];
    const bigrams = cjk.slice(0, -1).map((character, index) => `${character}${cjk[index + 1]}`);
    return uniqueStrings(words.concat(cjk, bigrams));
  }

  function tokenOverlap(left, right) {
    const leftTokens = new Set(tokens(left));
    const rightTokens = new Set(tokens(right));
    if (!leftTokens.size || !rightTokens.size) return 0;
    let shared = 0;
    leftTokens.forEach((token) => { if (rightTokens.has(token)) shared += 1; });
    return shared / Math.max(1, Math.min(leftTokens.size, rightTokens.size));
  }

  function characterBigrams(value) {
    const compact = normalizeText(value).replace(/\s+/g, "");
    if (compact.length < 2) return compact ? [compact] : [];
    return Array.from({ length: compact.length - 1 }, (_, index) =>
      compact.slice(index, index + 2)
    );
  }

  function diceSimilarity(left, right) {
    if (!left.length || !right.length) return 0;
    const counts = new Map();
    left.forEach((item) => counts.set(item, (counts.get(item) || 0) + 1));
    let overlap = 0;
    right.forEach((item) => {
      const count = counts.get(item) || 0;
      if (!count) return;
      overlap += 1;
      counts.set(item, count - 1);
    });
    return (2 * overlap) / (left.length + right.length);
  }

  function normalizedSimilarity(left, right) {
    const a = normalizeText(left);
    const b = normalizeText(right);
    if (!a || !b) return 0;
    if (a === b) return 1;
    return round3(
      tokenOverlap(a, b) * 0.55 +
      diceSimilarity(characterBigrams(a), characterBigrams(b)) * 0.45
    );
  }

  function scoreMemory(atom, request) {
    const query = [request.queryText, ...(request.tags || [])].filter(Boolean).join(" ");
    const lexical = tokenOverlap(`${atom.summary} ${atom.tags.join(" ")}`, query);
    const parsed = Date.parse(atom.updatedAt || atom.createdAt || "");
    const referenceTime = Date.parse(nowIso(request.clock));
    const ageHours = Math.max(0, (
      referenceTime - (Number.isFinite(parsed) ? parsed : referenceTime)
    ) / 3600000);
    const recency = 1 / (1 + ageHours / 6);
    return lexical * 0.58 + atom.importance * 0.2 + atom.confidence * 0.12 + recency * 0.1;
  }

  function retrievalTrace(request, items, mode) {
    return {
      traceId: String(request.traceId || makeId("retrieval", [
        request.sourceEventId, request.viewerNpcId, Date.now()
      ])),
      sourceEventId: String(request.sourceEventId || ""),
      viewerNpcId: String(request.viewerNpcId || ""),
      purpose: String(request.purpose || "context"),
      conditionId: String(request.conditionId || "self-evolving"),
      mode,
      queryText: compactText(request.queryText || "", 500),
      memoryIds: items.map((item) => item.id),
      createdAt: nowIso(request.clock)
    };
  }

  function retrieveMemory(store, request = {}) {
    const capabilities = conditionCapabilities(request.conditionId);
    if (!capabilities.retrieveMemory) {
      return { items: [], trace: retrievalTrace(request, [], "disabled") };
    }
    const visible = visibleMemoryAtoms(store, request);
    const limit = Math.max(1, Number(request.limit || 8));
    let selected;
    let mode;
    if (capabilities.useRecentWindow) {
      selected = visible.slice().sort((left, right) =>
        Date.parse(right.updatedAt || right.createdAt) -
        Date.parse(left.updatedAt || left.createdAt)
      ).slice(0, Math.max(limit, Number(request.recentWindow || 12)));
      mode = "recent_window";
    } else {
      selected = visible.map((atom) => ({ atom, score: scoreMemory(atom, request) }))
        .filter((item) =>
          item.score > 0 ||
          item.atom.sourceEventId === request.sourceEventId ||
          item.atom.evidenceIds.includes(request.sourceEventId)
        )
        .sort((left, right) => right.score - left.score)
        .slice(0, limit)
        .map((item) => ({ ...item.atom, retrievalScore: round3(item.score) }));
      mode = "lexical_rag";
    }
    return { items: clone(selected), trace: retrievalTrace(request, selected, mode) };
  }

  function evaluateConditionParity(left = {}, right = {}) {
    const memoryHashes = (value) => (value.memoryStore || value.episodicMemories || [])
      .map((item) => item.contentHash).filter(Boolean).sort();
    const retrievals = (value) => (value.retrievalTraces || []).map((trace) => ({
      purpose: trace.purpose,
      viewerNpcId: trace.viewerNpcId || trace.targetNpcId || "",
      memoryIds: [...(trace.memoryIds || [])]
    }));
    const memoryContentEqual = stableJson(memoryHashes(left)) === stableJson(memoryHashes(right));
    const retrievalInputsEqual = stableJson(retrievals(left)) === stableJson(retrievals(right));
    return {
      status: memoryContentEqual && retrievalInputsEqual ? "pass" : "needs_review",
      memoryContentEqual,
      retrievalInputsEqual,
      allowedDifference: "appraisal_state_only"
    };
  }

  function nonZeroObject(value) {
    return Object.fromEntries(Object.entries(
      value && typeof value === "object" ? value : {}
    ).filter(([, item]) => Number(item || 0) !== 0));
  }

  function normalizedRelationshipState(value = {}) {
    return Object.fromEntries(RELATIONSHIP_DIMENSIONS.map((field) => [
      field,
      clamp(value?.[field] ?? RELATIONSHIP_NEUTRAL_POINT, 0, 100)
    ]));
  }

  function independentEvidenceRootIds(proposal = {}, context = {}) {
    const evidenceIds = new Set(uniqueStrings(proposal.evidenceIds));
    return uniqueStrings((Array.isArray(context.evidence) ? context.evidence : [])
      .filter((item) => evidenceIds.has(String(item?.id || "")))
      .flatMap((item) => item.rootEventIds || item.rootEventId || item.sourceEventId || item.id));
  }

  function relationshipReversalDetails(proposal = {}, context = {}) {
    const current = normalizedRelationshipState(context.currentRelationship);
    const deltas = proposal.relationshipDeltas && typeof proposal.relationshipDeltas === "object"
      ? proposal.relationshipDeltas : {};
    return RELATIONSHIP_DIMENSIONS.flatMap((field) => {
      const requestedDelta = Number(deltas[field] || 0);
      if (!Number.isFinite(requestedDelta) || requestedDelta === 0) return [];
      const before = current[field];
      const after = clamp(before + requestedDelta, 0, 100);
      const beforeDirection = Math.sign(before - RELATIONSHIP_NEUTRAL_POINT);
      const afterDirection = Math.sign(after - RELATIONSHIP_NEUTRAL_POINT);
      if (!beforeDirection || !afterDirection || beforeDirection === afterDirection) return [];
      return [{ field, before, after, requestedDelta }];
    });
  }

  function constrainEvolutionProposal(proposal = {}, context = {}) {
    const constrained = clone(proposal) || {};
    const adjustments = [];
    const importance = clamp(constrained.importance || 0, 0, 1);
    const currentRelationship = normalizedRelationshipState(context.currentRelationship);
    const relationshipDeltas = constrained.relationshipDeltas &&
      typeof constrained.relationshipDeltas === "object"
      ? { ...constrained.relationshipDeltas } : {};

    RELATIONSHIP_DIMENSIONS.forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(relationshipDeltas, field)) return;
      const requestedDelta = Number(relationshipDeltas[field] || 0);
      if (!Number.isFinite(requestedDelta)) return;
      const boundedDelta = clamp(requestedDelta, -6, 6);
      if (requestedDelta !== boundedDelta) {
        adjustments.push({
          code: "relationship_delta_bounded",
          field,
          requestedDelta,
          appliedDelta: boundedDelta
        });
      }
      relationshipDeltas[field] = boundedDelta;
    });
    constrained.relationshipDeltas = relationshipDeltas;

    const independentRoots = independentEvidenceRootIds(constrained, context);
    const crossingAllowed = importance >= 0.85 || independentRoots.length >= 2;
    if (!crossingAllowed) {
      relationshipReversalDetails(constrained, {
        ...context,
        currentRelationship
      }).forEach((reversal) => {
        const appliedDelta = round3(
          RELATIONSHIP_NEUTRAL_POINT - reversal.before
        );
        relationshipDeltas[reversal.field] = appliedDelta;
        adjustments.push({
          code: "relationship_reversal_bounded_at_neutral",
          field: reversal.field,
          neutralPoint: RELATIONSHIP_NEUTRAL_POINT,
          before: reversal.before,
          requestedDelta: reversal.requestedDelta,
          requestedAfter: reversal.after,
          appliedDelta,
          appliedAfter: RELATIONSHIP_NEUTRAL_POINT,
          importance,
          independentRootCount: independentRoots.length
        });
      });
    }

    if (constrained.valueTradeoffDeltas &&
        typeof constrained.valueTradeoffDeltas === "object") {
      constrained.valueTradeoffDeltas = Object.fromEntries(
        Object.entries(constrained.valueTradeoffDeltas).map(([field, value]) => {
          const requestedDelta = Number(value || 0);
          if (!Number.isFinite(requestedDelta)) return [field, value];
          const appliedDelta = clamp(requestedDelta, -5, 5);
          if (requestedDelta !== appliedDelta) {
            adjustments.push({
              code: "value_tradeoff_delta_bounded",
              field,
              requestedDelta,
              appliedDelta
            });
          }
          return [field, appliedDelta];
        })
      );
    }

    const relationshipChanged = Object.keys(
      nonZeroObject(constrained.relationshipDeltas)
    ).length > 0;
    if (String(constrained.strategy || "").trim() &&
        importance < 0.6 && !relationshipChanged) {
      delete constrained.strategy;
      adjustments.push({
        code: "low_importance_strategy_removed",
        importance,
        reason: "strategy_requires_importance_or_relationship_change"
      });
    }

    return {
      proposal: constrained,
      adjustments,
      independentRootIds: independentRoots,
      crossingAllowed
    };
  }

  function validateEvolutionProposal(proposal = {}, context = {}) {
    const errors = [];
    const capabilities = conditionCapabilities(context.conditionId);
    const evidence = Array.isArray(context.evidence) ? context.evidence : [];
    const evidenceIds = uniqueStrings(proposal.evidenceIds);
    const hasCurrentEvent = Boolean(
      context.currentEventId && evidenceIds.includes(String(context.currentEventId))
    );
    const hasConfidentMemory = evidence.some((item) =>
      evidenceIds.includes(item.id) && Number(item.confidence || 0) >= 0.6
    );
    const unresolvedEvidenceIds = evidenceIds.filter((id) =>
      id !== String(context.currentEventId || "") &&
      !evidence.some((item) => item.id === id)
    );
    const relationshipDeltas = nonZeroObject(proposal.relationshipDeltas);
    const invalidRelationshipFields = Object.entries(
      proposal.relationshipDeltas && typeof proposal.relationshipDeltas === "object"
        ? proposal.relationshipDeltas : {}
    ).filter(([field, value]) =>
      !RELATIONSHIP_DIMENSIONS.includes(field) || !Number.isFinite(Number(value))
    ).map(([field]) => field);
    if (invalidRelationshipFields.length) {
      errors.push(`invalid relationship delta fields: ${invalidRelationshipFields.join(", ")}`);
    }
    const relationshipChanged = Object.keys(relationshipDeltas).length > 0;
    const strategyChanged = Boolean(String(proposal.strategy || "").trim());
    const importance = clamp(proposal.importance || 0, 0, 1);
    if ((relationshipChanged || strategyChanged) && !hasCurrentEvent && !hasConfidentMemory) {
      errors.push("relationship/strategy change lacks current-event or confidence>=0.6 evidence");
    }
    if (unresolvedEvidenceIds.length) {
      errors.push(`unresolved evidence ids: ${unresolvedEvidenceIds.join(", ")}`);
    }
    if (strategyChanged && importance < 0.6 && !relationshipChanged) {
      errors.push("strategy update requires importance>=0.6 or a relationship change");
    }
    const reversalFields = relationshipReversalDetails(proposal, context)
      .map((item) => item.field);
    if (reversalFields.length && importance < 0.85 &&
        independentEvidenceRootIds(proposal, context).length < 2) {
      errors.push(
        `attitude reversal across neutral point ${RELATIONSHIP_NEUTRAL_POINT} requires two independent events or importance>=0.85: ${reversalFields.join(", ")}`
      );
    }
    if (!capabilities.updateRelationship && relationshipChanged) {
      errors.push("condition forbids relationship updates");
    }
    if (!capabilities.updateStrategy && strategyChanged) {
      errors.push("condition forbids strategy updates");
    }
    return { ok: errors.length === 0, errors, reversalFields };
  }

  function gateEvolutionPatch(patch = {}, conditionId) {
    const capability = conditionCapabilities(conditionId);
    return {
      memory: capability.storeMemory ? patch.memory : undefined,
      structuredMemory: capability.storeMemory ? patch.structuredMemory : undefined,
      emotion: capability.updateEmotion ? patch.emotion : undefined,
      surfaceLine: capability.updateSurfaceLine ? patch.surfaceLine : undefined,
      trustDelta: capability.updateTrustBelonging ? Number(patch.trustDelta || 0) : 0,
      belongingDelta: capability.updateTrustBelonging ? Number(patch.belongingDelta || 0) : 0,
      relationshipDeltas: capability.updateRelationship
        ? clone(patch.relationshipDeltas || {}) : {},
      valueTradeoffDeltas: capability.updateValueTradeoffs
        ? clone(patch.valueTradeoffDeltas || {}) : {},
      strategy: capability.updateStrategy ? patch.strategy : undefined
    };
  }

  function appraisalFieldValues(snapshot = {}) {
    const values = {
      emotion: snapshot.emotion,
      surfaceLine: snapshot.surfaceLine,
      trust: snapshot.trust,
      belonging: snapshot.belonging,
      strategy: snapshot.strategy
    };
    Object.entries(snapshot.relationship || {}).forEach(([key, value]) => {
      values[`relationship.${key}`] = value;
    });
    Object.entries(snapshot.valueTradeoffs || snapshot.situationalPriority || {}).forEach(([key, value]) => {
      values[`situationalPriority.${key}`] = value;
    });
    return values;
  }

  function targetEntityForField(field) {
    if (field === "emotion" || field === "surfaceLine") return "self";
    if (field === "belonging") return "lab_group";
    if (field.startsWith("situationalPriority.")) return "current_lab_situation";
    if (field === "strategy") return "future_social_interaction";
    return "player";
  }

  function deriveStateChanges(input = {}) {
    const event = input.event || {};
    const before = appraisalFieldValues(input.before);
    const after = appraisalFieldValues(input.after);
    const evidenceIds = uniqueStrings(input.evidenceIds || event.evidenceIds || event.eventId);
    const fields = uniqueStrings(Object.keys(before).concat(Object.keys(after)));
    return fields.filter((field) => stableJson(before[field]) !== stableJson(after[field])).map((field) => {
      const beforeValue = before[field];
      const afterValue = after[field];
      const numeric = Number.isFinite(Number(beforeValue)) && Number.isFinite(Number(afterValue));
      return {
        schemaVersion: SCHEMA_VERSION,
        changeId: makeId("change", [event.eventId, input.npcId, field]),
        npcId: String(input.npcId || ""),
        targetEntityId: targetEntityForField(field),
        field,
        before: clone(beforeValue),
        after: clone(afterValue),
        delta: numeric ? Number(afterValue) - Number(beforeValue) : null,
        interactionSource: event.interactionSource || "system_transition",
        rootEventId: event.rootEventId || event.eventId || "",
        triggerEventId: event.eventId || "",
        evidenceLinks: evidenceIds.map((evidenceId) => ({
          evidenceId,
          role: evidenceId === event.eventId ? "trigger" : "supporting",
          sourceTurnId: event.turnId || "",
          visibilityAtTime: event.audience?.visibility || "group"
        })),
        gatingDecision: String(input.gatingDecision || "allowed")
      };
    });
  }

  function createNoChangeEvaluation(input = {}) {
    const reason = String(input.noChangeReason || "");
    if (!NO_CHANGE_REASONS.includes(reason)) {
      throw new Error(`Invalid noChangeReason: ${reason || "missing"}.`);
    }
    const event = input.event || {};
    const consideredEvidenceIds = uniqueStrings(input.consideredEvidenceIds);
    const evaluatedFields = uniqueStrings(input.evaluatedFields);
    if (!consideredEvidenceIds.length) {
      throw new Error("No-change evaluation requires consideredEvidenceIds.");
    }
    if (!evaluatedFields.length) {
      throw new Error("No-change evaluation requires evaluatedFields.");
    }
    return {
      npcId: String(input.npcId || ""),
      rootEventId: event.rootEventId || event.eventId || "",
      triggerEventId: event.eventId || "",
      consideredEvidenceIds,
      evaluatedFields,
      noChangeReason: reason
    };
  }

  function forbiddenEvolutionFields(original, gated) {
    const fields = [];
    if (original.memory && gated.memory === undefined) fields.push("memory");
    if (original.emotion && gated.emotion === undefined) fields.push("emotion");
    if (original.surfaceLine && gated.surfaceLine === undefined) fields.push("surfaceLine");
    if (Number(original.trustDelta || 0) && !gated.trustDelta) fields.push("trustDelta");
    if (Number(original.belongingDelta || 0) && !gated.belongingDelta) fields.push("belongingDelta");
    if (Object.keys(nonZeroObject(original.relationshipDeltas)).length &&
        !Object.keys(nonZeroObject(gated.relationshipDeltas)).length) {
      fields.push("relationshipDeltas");
    }
    if (Object.keys(nonZeroObject(original.valueTradeoffDeltas)).length &&
        !Object.keys(nonZeroObject(gated.valueTradeoffDeltas)).length) {
      fields.push("valueTradeoffDeltas");
    }
    if (original.strategy && gated.strategy === undefined) fields.push("strategy");
    return fields;
  }

  function conditionAllowsStateField(capability, field) {
    if (field === "emotion") return capability.updateEmotion;
    if (field === "surfaceLine") return capability.updateSurfaceLine;
    if (field === "trust" || field === "belonging") return capability.updateTrustBelonging;
    if (field.startsWith("relationship.")) return capability.updateRelationship;
    if (field.startsWith("situationalPriority.")) return capability.updateValueTradeoffs;
    if (field === "strategy") return capability.updateStrategy;
    return false;
  }

  function trajectoryFieldValue(npc, field) {
    if (field.startsWith("relationship.")) return npc.relationship?.[field.slice("relationship.".length)];
    if (field.startsWith("situationalPriority.")) {
      return npc.valueTradeoffs?.[field.slice("situationalPriority.".length)];
    }
    return npc[field];
  }

  function setTrajectoryFieldValue(npc, field, value) {
    if (field.startsWith("relationship.")) {
      npc.relationship = npc.relationship || {};
      npc.relationship[field.slice("relationship.".length)] = clone(value);
    } else if (field.startsWith("situationalPriority.")) {
      npc.valueTradeoffs = npc.valueTradeoffs || {};
      npc.valueTradeoffs[field.slice("situationalPriority.".length)] = clone(value);
    } else {
      npc[field] = clone(value);
    }
  }

  function trajectoryLedgerViolations(input) {
    const baselineNpcs = Array.isArray(input.trajectoryBaseline?.npcs)
      ? input.trajectoryBaseline.npcs : [];
    if (!baselineNpcs.length) return [];
    const expectedByNpc = new Map(baselineNpcs.map((npc) => [
      String(npc.npcId || npc.id || ""), clone(npc)
    ]));
    const checkpoints = (Array.isArray(input.stageSnapshots) ? input.stageSnapshots : [])
      .map((snapshot) => ({
        label: `stage-${Number(snapshot.stageIndex || 0) + 1}`,
        stageIndex: Number(snapshot.stageIndex || 0),
        npcs: snapshot.npcs || []
      })).sort((left, right) => left.stageIndex - right.stageIndex);
    if (Array.isArray(input.finalNpcStates) && input.finalNpcStates.length) {
      checkpoints.push({ label: "final", stageIndex: Number.POSITIVE_INFINITY, npcs: input.finalNpcStates });
    }
    const violations = [];
    const reported = new Set();
    const report = (code, npcId, field, checkpoint, message) => {
      const key = `${code}:${npcId}:${field}`;
      if (reported.has(key)) return;
      reported.add(key);
      violations.push({
        code,
        npcId,
        field,
        stageIndex: Number.isFinite(checkpoint.stageIndex) ? checkpoint.stageIndex : null,
        checkpoint: checkpoint.label,
        message
      });
    };
    const committedEvents = (Array.isArray(input.events) ? input.events : [])
      .filter((event) => event.status === "committed");
    const appliedEventIds = new Set();
    const applyEventsThrough = (stageIndex, checkpoint) => {
      committedEvents.forEach((event) => {
        if (appliedEventIds.has(event.eventId)) return;
        const eventStageIndex = Number(event.metadata?.stageIndex ?? 0);
        if (eventStageIndex > stageIndex) return;
        (event.stateChanges || []).forEach((change) => {
          const npcId = String(change.npcId || "");
          const expected = expectedByNpc.get(npcId);
          if (!expected) return;
          const expectedBefore = trajectoryFieldValue(expected, change.field);
          if (stableJson(expectedBefore) !== stableJson(change.before)) {
            report(
              "state_change_chain_mismatch", npcId, change.field, checkpoint,
              `${checkpoint.label}: StateChangeV2.before does not match the trajectory reconstructed from the baseline and prior changes: ${change.field}.`
            );
          }
          setTrajectoryFieldValue(expected, change.field, change.after);
        });
        appliedEventIds.add(event.eventId);
      });
    };
    const scalarFields = ["emotion", "surfaceLine", "trust", "belonging", "strategy"];
    const compareCheckpoint = (checkpoint) => {
      (checkpoint.npcs || []).forEach((npc) => {
        const npcId = String(npc.npcId || npc.id || "");
        const expected = expectedByNpc.get(npcId);
        if (!expected) return;
        scalarFields.forEach((field) => {
          if (!Object.prototype.hasOwnProperty.call(npc, field)) return;
          if (stableJson(trajectoryFieldValue(expected, field)) !== stableJson(trajectoryFieldValue(npc, field))) {
            report(
              "untracked_state_drift", npcId, field, checkpoint,
              `${checkpoint.label}: persistent state differs from the baseline plus canonical StateChangeV2 history: ${field}.`
            );
          }
        });
        RELATIONSHIP_DIMENSIONS.forEach((field) => {
          if (!Object.prototype.hasOwnProperty.call(npc.relationship || {}, field)) return;
          const path = `relationship.${field}`;
          if (stableJson(trajectoryFieldValue(expected, path)) !== stableJson(trajectoryFieldValue(npc, path))) {
            report(
              "untracked_state_drift", npcId, path, checkpoint,
              `${checkpoint.label}: persistent state differs from the baseline plus canonical StateChangeV2 history: ${path}.`
            );
          }
        });
        VALUE_TRADEOFF_DIMENSIONS.forEach((field) => {
          if (!Object.prototype.hasOwnProperty.call(npc.valueTradeoffs || {}, field)) return;
          const path = `situationalPriority.${field}`;
          if (stableJson(trajectoryFieldValue(expected, path)) !== stableJson(trajectoryFieldValue(npc, path))) {
            report(
              "untracked_state_drift", npcId, path, checkpoint,
              `${checkpoint.label}: persistent state differs from the baseline plus canonical StateChangeV2 history: ${path}.`
            );
          }
        });
      });
    };
    checkpoints.forEach((checkpoint) => {
      applyEventsThrough(checkpoint.stageIndex, checkpoint);
      compareCheckpoint(checkpoint);
    });
    return violations;
  }

  function initialRelationshipForIntegrity(input, npcId, event) {
    const explicit = input.initialRelationshipsByNpc?.[npcId] ||
      (input.npcs || []).find((npc) => String(npc?.id || "") === String(npcId))
        ?.initialRelationship;
    const relationship = normalizedRelationshipState(explicit || {});
    if (!explicit) {
      (event?.stateChanges || []).forEach((change) => {
        if (change.npcId !== npcId || !change.field?.startsWith("relationship.")) return;
        const field = change.field.slice("relationship.".length);
        if (RELATIONSHIP_DIMENSIONS.includes(field) && Number.isFinite(Number(change.before))) {
          relationship[field] = clamp(change.before, 0, 100);
        }
      });
    }
    return relationship;
  }

  function evaluateIntegrity(input = {}) {
    const events = Array.isArray(input.events) ? input.events : [];
    const conditionId = String(input.conditionId || "self-evolving");
    const violations = [];
    if (!sameCapabilities(input.capabilities, conditionCapabilities(conditionId))) {
      violations.push({
        code: "condition_changed",
        message: "Capability vector does not match the declared condition."
      });
    }
    const committedKeys = new Set();
    const changeIds = new Set();
    const eventIds = new Set();
    const relationshipStateByNpc = new Map();
    (input.memoryStore || input.episodicMemories || []).forEach((atom) => {
      if (episodicAppraisalLeakTerms(atom).length) {
        violations.push({
          code: "episodic_appraisal_leak",
          memoryId: atom.id,
          message: "Episodic memory contains a persistent appraisal conclusion."
        });
      }
    });
    events.forEach((event) => {
      const eventConditionId = String(event?.metadata?.conditionId || "");
      if (eventConditionId && eventConditionId !== conditionId) {
        violations.push({
          code: "condition_changed", eventId: event?.eventId,
          message: `Event condition ${eventConditionId} differs from ${conditionId}.`
        });
      }
      if (event?.metadata?.capabilities &&
          !sameCapabilities(event.metadata.capabilities, conditionCapabilities(conditionId))) {
        violations.push({
          code: "condition_changed", eventId: event?.eventId,
          message: "Event capability snapshot differs from the declared condition."
        });
      }
      if (eventIds.has(event?.eventId)) {
        violations.push({
          code: "duplicate_event", eventId: event?.eventId,
          message: "Event ledger contains the same eventId more than once."
        });
      }
      eventIds.add(event?.eventId);
      validateSessionEvent(event).errors.forEach((message) => {
        violations.push({ code: "event_schema", eventId: event?.eventId, message });
      });
      if (["pending", "validated"].includes(event.status)) {
        violations.push({
          code: "nonterminal_event", eventId: event.eventId,
          message: "Completed ledger contains a non-terminal event."
        });
      }
      if (event.status === "failed" &&
          (event.commit || (event.stateChanges || []).length ||
           (event.noChangeEvaluations || []).length)) {
        violations.push({
          code: "failed_half_commit",
          eventId: event.eventId,
          message: "Failed event contains commit-time state data."
        });
      }
      if (event.status === "committed") {
        const proposalNpcIds = event.proposals.map((proposal) => proposal.npcId)
          .filter(Boolean).map(String);
        const localProposalNpcIds = new Set();
        proposalNpcIds.forEach((npcId) => {
          if (localProposalNpcIds.has(npcId)) {
            violations.push({
              code: "duplicate_commit", eventId: event.eventId, npcId,
              message: "Event contains more than one proposal for the same NPC."
            });
          }
          localProposalNpcIds.add(npcId);
        });
        const rawNpcIds = (event.commit?.npcIds ||
          proposalNpcIds).filter(Boolean).map(String);
        const localNpcIds = new Set();
        rawNpcIds.forEach((npcId) => {
          if (localNpcIds.has(npcId)) {
            violations.push({
              code: "duplicate_commit", eventId: event.eventId, npcId,
              message: "Commit lists the same NPC more than once."
            });
          }
          localNpcIds.add(npcId);
        });
        const npcIds = uniqueStrings(rawNpcIds);
        npcIds.forEach((npcId) => {
          const key = `${npcId}:${event.eventId}`;
          if (committedKeys.has(key)) {
            violations.push({
              code: "duplicate_commit", eventId: event.eventId, npcId,
              message: "NPC/event was committed more than once."
            });
          }
          committedKeys.add(key);
        });
        event.proposals.forEach((proposal) => {
          const currentRelationship = relationshipStateByNpc.get(proposal.npcId) ||
            initialRelationshipForIntegrity(input, proposal.npcId, event);
          const fields = forbiddenEvolutionFields(
            proposal, gateEvolutionPatch(proposal, conditionId)
          );
          if (fields.length) {
            violations.push({
              code: "condition_leakage", eventId: event.eventId,
              npcId: proposal.npcId, fields,
              message: `Condition forbids: ${fields.join(", ")}`
            });
          }
          const proposalValidation = validateEvolutionProposal(proposal, {
            conditionId,
            currentEventId: event.eventId,
            evidence: proposal.evidence || [],
            currentRelationship
          });
          proposalValidation.errors.forEach((message) => {
            violations.push({
              code: "invalid_proposal", eventId: event.eventId,
              npcId: proposal.npcId, message
            });
          });
          const nextRelationship = { ...currentRelationship };
          (event.stateChanges || []).forEach((change) => {
            if (change.npcId !== proposal.npcId ||
                !change.field?.startsWith("relationship.")) return;
            const field = change.field.slice("relationship.".length);
            if (RELATIONSHIP_DIMENSIONS.includes(field) && Number.isFinite(Number(change.after))) {
              nextRelationship[field] = clamp(change.after, 0, 100);
            }
          });
          relationshipStateByNpc.set(proposal.npcId, nextRelationship);
        });
        const changedNpcIds = new Set();
        (event.stateChanges || []).forEach((change) => {
          if (!change.changeId || changeIds.has(change.changeId)) {
            violations.push({
              code: "duplicate_state_change", eventId: event.eventId,
              npcId: change.npcId,
              message: "StateChangeV2 changeId is missing or duplicated."
            });
          }
          changeIds.add(change.changeId);
          changedNpcIds.add(change.npcId);
          if (change.triggerEventId !== event.eventId ||
              change.rootEventId !== event.rootEventId) {
            violations.push({
              code: "state_change_graph_mismatch", eventId: event.eventId,
              npcId: change.npcId,
              message: "StateChangeV2 does not match its trigger/root event."
            });
          }
          if (stableJson(change.before) === stableJson(change.after)) {
            violations.push({
              code: "empty_state_change", eventId: event.eventId,
              npcId: change.npcId, field: change.field,
              message: "StateChangeV2 before and after are identical."
            });
          }
          if (!(change.evidenceLinks || []).length) {
            violations.push({
              code: "ungrounded_state_change", eventId: event.eventId,
              npcId: change.npcId, field: change.field,
              message: "StateChangeV2 has no field-level evidence link."
            });
          }
          if (!conditionAllowsStateField(conditionCapabilities(conditionId), change.field)) {
            violations.push({
              code: "condition_leakage", eventId: event.eventId,
              npcId: change.npcId, fields: [change.field],
              message: `Condition forbids StateChangeV2 field: ${change.field}`
            });
          }
        });
        (event.noChangeEvaluations || []).forEach((evaluation) => {
          if (evaluation.triggerEventId !== event.eventId ||
              evaluation.rootEventId !== event.rootEventId ||
              !(evaluation.consideredEvidenceIds || []).length ||
              !(evaluation.evaluatedFields || []).length ||
              !NO_CHANGE_REASONS.includes(evaluation.noChangeReason)) {
            violations.push({
              code: "invalid_no_change", eventId: event.eventId,
              npcId: evaluation.npcId,
              message: "No-change evaluation is incomplete or attached to the wrong event."
            });
          }
          if (changedNpcIds.has(evaluation.npcId)) {
            violations.push({
              code: "change_no_change_conflict", eventId: event.eventId,
              npcId: evaluation.npcId,
              message: "NPC is recorded as both changed and unchanged for one event."
            });
          }
        });
      }
      event.proposals.forEach((proposal) => {
        (proposal.evidence || []).forEach((evidence) => {
          if (evidence.visibility === "private" &&
              proposal.npcId !== evidence.ownerNpcId &&
              !(evidence.audienceNpcIds || []).includes(proposal.npcId)) {
            violations.push({
              code: "private_evidence_leak", eventId: event.eventId,
              npcId: proposal.npcId, evidenceId: evidence.id,
              message: "Proposal used inaccessible private evidence."
            });
          }
        });
      });
    });
    violations.push(...trajectoryLedgerViolations(input));
    return {
      schemaVersion: SCHEMA_VERSION,
      conditionId,
      status: violations.length ? "needs_review" : "pass",
      eventCount: events.length,
      committedEventCount: events.filter((event) => event.status === "committed").length,
      failedEventCount: events.filter((event) => event.status === "failed").length,
      violationCount: violations.length,
      violations
    };
  }

  function evaluatedArtifactForTask(submittedArtifacts, taskId) {
    const requiredTaskId = String(taskId || "");
    if (!requiredTaskId) return null;
    return Array.from(submittedArtifacts || []).reverse().find((artifact) =>
      (artifact?.sourceTaskId === requiredTaskId || artifact?.id === requiredTaskId) &&
      ["accepted", "needs_revision", "rejected"].includes(artifact?.status) &&
      Boolean(artifact?.timestamp || artifact?.evaluatedAt)
    ) || null;
  }

  function normalizeAttentionFact(value = {}) {
    const question = compactText(value.question || "", 240);
    const correctAnswer = compactText(value.correctAnswer || "", 180);
    const distractors = uniqueStrings((Array.isArray(value.distractors) ? value.distractors : [])
      .map((item) => compactText(item || "", 180))
      .filter((item) => item && normalizeText(item) !== normalizeText(correctAnswer)));
    if (!question || !correctAnswer || distractors.length < 3) {
      throw new Error("Story beat attentionFact requires a question, answer, and three distractors.");
    }
    return { question, correctAnswer, distractors: distractors.slice(0, 3) };
  }

  function createStoryBeat(input = {}) {
    const type = String(input.type || "");
    if (!STORY_BEAT_TYPES.includes(type)) throw new Error(`Unknown story beat type: ${type}.`);
    const beatId = String(input.beatId || "");
    const stageId = String(input.stageId || "");
    const globalOrdinal = Number(input.globalOrdinal || 0);
    const stageOrdinal = Number(input.stageOrdinal || 0);
    const publicSummary = compactText(input.publicSummary || "", 800);
    if (!beatId || !stageId || !Number.isInteger(globalOrdinal) || globalOrdinal < 1 ||
        !Number.isInteger(stageOrdinal) || stageOrdinal < 1 || !publicSummary) {
      throw new Error("Story beat requires ids, positive ordinals, and a visible summary.");
    }
    return {
      schemaVersion: "1.0",
      beatId,
      sessionId: String(input.sessionId || ""),
      sessionEpoch: Number(input.sessionEpoch || 0),
      stageIndex: Number(input.stageIndex || 0),
      stageId,
      globalOrdinal,
      stageOrdinal,
      type,
      status: "committed",
      sourceEventId: String(input.sourceEventId || ""),
      visibility: normalizeVisibility(input.visibility || "group"),
      actors: uniqueStrings(input.actors || []),
      publicSummary,
      focusTags: uniqueStrings(input.focusTags || []),
      attentionFact: normalizeAttentionFact(input.attentionFact),
      countsTowardStage: input.countsTowardStage !== false,
      timestamp: input.timestamp || nowIso(input.clock)
    };
  }

  function storyBeatProgress(beats = [], stageIndex = 0) {
    const counted = (Array.isArray(beats) ? beats : []).filter((beat) =>
      beat?.status === "committed" && beat.countsTowardStage !== false &&
      Number(beat.stageIndex) === Number(stageIndex)
    );
    const count = counted.length;
    return {
      stageIndex: Number(stageIndex),
      count,
      minPerStage: STORY_BEAT_LIMITS.minPerStage,
      maxPerStage: STORY_BEAT_LIMITS.maxPerStage,
      minBeforeDecision: STORY_BEAT_LIMITS.minBeforeDecision,
      maxBeforeDecision: STORY_BEAT_LIMITS.maxBeforeDecision,
      pacingVersion: STAGE_PACING_VERSION,
      canOpenDecision: false, // Counts are descriptive, never readiness evidence.
      mustOpenDecision: false,
      remainingBeforeDecision: null
    };
  }

  function nextAttentionCheckpoint(beats = [], checks = []) {
    const committedCount = (Array.isArray(beats) ? beats : []).filter((beat) =>
      beat?.status === "committed" && beat.countsTowardStage !== false
    ).length;
    const resolved = new Set((Array.isArray(checks) ? checks : [])
      .filter((check) => check?.resolved)
      .map((check) => Number(check.checkpoint || 0)));
    for (let checkpoint = STORY_BEAT_LIMITS.attentionInterval;
      checkpoint <= committedCount;
      checkpoint += STORY_BEAT_LIMITS.attentionInterval) {
      if (!resolved.has(checkpoint)) return checkpoint;
    }
    return 0;
  }

  function recentStoryBeatsForCheckpoint(beats = [], checkpoint = 0) {
    const end = Number(checkpoint || 0);
    const start = Math.max(1, end - STORY_BEAT_LIMITS.attentionInterval + 1);
    return (Array.isArray(beats) ? beats : []).filter((beat) =>
      beat?.status === "committed" && beat.countsTowardStage !== false &&
      Number(beat.globalOrdinal) >= start && Number(beat.globalOrdinal) <= end
    );
  }

  function validateStageTransition(input = {}) {
    const rule = STAGE_TRANSITIONS.find((item) =>
      item.stageIndex === Number(input.nextStageIndex || 0)
    );
    if (!rule) return { ok: false, reason: "unknown_stage", rule: null };
    if (input.sessionEnded) return { ok: false, reason: "session_ended", rule };
    if (rule.requiresComprehension && !input.comprehensionCompleted) {
      return { ok: false, reason: "comprehension_required", rule };
    }
    if (rule.requiredArtifactId) {
      const evaluated = Boolean(evaluatedArtifactForTask(
        input.submittedArtifacts,
        rule.requiredArtifactId
      ));
      if (!evaluated) {
        return {
          ok: false, reason: "artifact_evaluation_required",
          requiredArtifactId: rule.requiredArtifactId, rule
        };
      }
    }
    const completedSocialInteractions = Math.max(0, Number(input.completedSocialInteractions || 0));
    if (completedSocialInteractions < Number(rule.requiredSocialInteractions || 0)) {
      return {
        ok: false,
        reason: "social_interaction_required",
        requiredSocialInteractions: Number(rule.requiredSocialInteractions || 0),
        completedSocialInteractions,
        rule
      };
    }
    return { ok: true, reason: "ready", rule };
  }

  function expressionCueForSample(sample) {
    const ranked = ["joy", "sorrow", "anger", "surprise"].map((label) => ({
      label, value: Number(sample.expression?.[label] || 0)
    })).sort((left, right) => right.value - left.value);
    if (ranked[0].value < 0.78) return "neutral";
    if (ranked[1].value >= 0.78 && ranked[0].value - ranked[1].value < 0.15) {
      return "mixed";
    }
    return ranked[0].label;
  }

  function average(values) {
    return values.length
      ? values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length
      : 0;
  }

  function deriveVisibleExpressionCue(samples) {
    const faceSamples = (Array.isArray(samples) ? samples : [])
      .filter((sample) => sample?.facePresent).slice(-5);
    const confident = faceSamples.filter((sample) => Number(sample.confidence || 0) >= 0.5);
    if (confident.length < 2) {
      return {
        visibleExpressionCue: "unclear", confidence: 0,
        stability: "unclear"
      };
    }
    const perFrame = confident.map(expressionCueForSample);
    const averaged = ["joy", "sorrow", "anger", "surprise"].map((label) => ({
      label,
      value: average(confident.map((sample) => Number(sample.expression?.[label] || 0)))
    })).sort((left, right) => right.value - left.value);
    let cue = "neutral";
    if (averaged[0].value >= 0.78) {
      cue = averaged[1].value >= 0.78 && averaged[0].value - averaged[1].value < 0.15
        ? "mixed" : averaged[0].label;
    }
    const matchingFrames = perFrame.filter((item) => item === cue).length;
    return {
      visibleExpressionCue: cue,
      confidence: round3(clamp(
        cue === "neutral" ? 1 - averaged[0].value : averaged[0].value, 0, 1
      )),
      stability: confident.length >= 5 && matchingFrames >= 4 ? "stable" : "brief"
    };
  }

  return Object.freeze({
    GM_BRIDGE_RECORD_MAX_LENGTH,
    dialogueRecordText,
    SCHEMA_VERSION,
    EVENT_STATUSES,
    KNOWLEDGE_TYPES,
    VISIBILITIES,
    INTERACTION_SOURCES,
    NO_CHANGE_REASONS,
    EXPRESSION_CUES,
    RELATIONSHIP_NEUTRAL_POINT,
    RELATIONSHIP_DIMENSIONS,
    VALUE_TRADEOFF_DIMENSIONS,
    TRANSPARENT_AGENT_ENVELOPE_KEYS,
    ACTION_TAXONOMY,
    APPRAISAL_CONSTRUCTS,
    CONDITIONS,
    STAGE_TRANSITIONS,
    STORY_BEAT_TYPES,
    STORY_BEAT_LIMITS,
    STAGE_PACING_VERSION,
    STUDY_PROTOCOL_VERSION,
    STAGE_MILESTONE_RULES,
    LEGACY_STUDY_EXPOSURE_PLAN,
    STUDY_EXPOSURE_PLAN,
    conditionIds,
    studyExposureForStage,
    actionCodes,
    normalizeEnumToken,
    normalizeActionClassification,
    evaluateInteractionNovelty,
    validateParticipantVisibleOutput,
    conditionCapabilities,
    sameCapabilities,
    createSessionEvent,
    validateSessionEvent,
    transitionEvent,
    observeSessionEvents,
    failEvent,
    recordDialogueGenerated,
    markDialogueDelivered,
    unwrapTransparentAgentEnvelope,
    validateRepairSemantics,
    canonicalizeEvolutionDeltaNamespaces,
    normalizeMemoryAtom,
    validateMemoryAtom,
    mergeMemoryAtom,
    consolidateMemoryStore,
    canAccessMemory,
    visibleMemoryAtoms,
    retrieveMemory,
    relationshipReversalDetails,
    independentEvidenceRootIds,
    constrainEvolutionProposal,
    validateEvolutionProposal,
    gateEvolutionPatch,
    deriveStateChanges,
    createNoChangeEvaluation,
    evaluateIntegrity,
    evaluatedArtifactForTask,
    createStoryBeat,
    storyBeatProgress,
    nextAttentionCheckpoint,
    recentStoryBeatsForCheckpoint,
    validateStageTransition,
    bindDesignedDecisionOptions,
    deriveVisibleExpressionCue,
    normalizedSimilarity,
    tokenOverlap,
    stableHash,
    episodicAppraisalLeakTerms,
    evaluateConditionParity
  });
}));
