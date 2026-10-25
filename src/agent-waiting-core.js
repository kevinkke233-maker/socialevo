/* Presentation only: derive an activity label from actual in-flight work. */
(function(root) {
  "use strict";
  const speaking = new Set(["private_side_talk_response", "decision_npc_response", "npc_followup_response", "autonomous_npc_exchange", "relationship_transfer_response", "lab_story_anchor"]);
  const checking = new Set(["narrative_dialogue_qa", "lab_world_evidence_scope", "lab_written_work_scope", "lab_incident_role_scope", "lab_anchor_semantics", "json_repair"]);
  const reviewing = new Set(["artifact_scoring", "artifact_evaluation", "artifact_feedback_scope"]);
  const reading = new Set(["safety_review", "action_classification"]);
  const reflecting = new Set(["stage_evolution"]);
  const preparing = new Set(["global_stage_director", "decision_responder_controller", "npc_dialogue_controller", "gm_decision_window", "gm_end_state", "gm_end_evidence_scope", "gm_bridge_source_selection", "lab_narrative_timing"]);

  function select(input) {
    if (input.screen !== "game" || input.closed || input.fatal) return null;
    const npcs = new Map((input.npcs || []).map(npc => [npc.id, npc]));
    const events = new Map((input.events || []).map(event => [event.eventId, event]));
    const candidates = [];
    for (const call of input.calls || []) {
      if (call.endpoint !== "/api/chat" || call.status !== "pending" || call.sessionEpoch !== input.epoch || call.sessionId !== input.sessionId) continue;
      const event = events.get(call.eventId);
      if (call.eventId && (!event || event.sessionEpoch !== input.epoch || event.sessionId && event.sessionId !== input.sessionId || ["failed", "cancelled", "aborted"].includes(event.status))) continue;
      if (input.activeEventId && call.eventId !== input.activeEventId) continue;
      const purpose = call.agentPurpose;
      let kind, rank;
      if (reviewing.has(purpose)) { kind = "review"; rank = 90; }
      else if (speaking.has(purpose)) { kind = "thinking"; rank = 80; }
      else if (checking.has(purpose)) { kind = "wording"; rank = 70; }
      else if (reading.has(purpose)) { kind = "reading"; rank = 60; }
      else if (reflecting.has(purpose)) { kind = "reflecting"; rank = 50; }
      else if (preparing.has(purpose)) { kind = "preparing"; rank = 40; }
      else continue; // Optional suggestions, media and admin evaluation stay quiet.
      if (event?.type === "artifact_submission") { kind = "review"; rank = 90; }
      const scope = new Set([...(event?.actors || []), ...(event?.audience?.npcIds || [])]);
      const target = input.targets?.[call.callId];
      const soleActor = (event?.actors || []).filter(id => npcs.has(id));
      const requested = target || event?.metadata?.targetNpcId || (soleActor.length === 1 ? soleActor[0] : "");
      const actor = npcs.has(requested) && (!event || scope.has(requested)) ? npcs.get(requested) : null;
      const group = ["reflecting", "preparing"].includes(kind);
      candidates.push({kind, rank, npcId: group ? "" : actor?.id || "", name: group ? "" : actor?.name || "", eventId: call.eventId});
    }
    candidates.sort((a, b) => b.rank - a.rank);
    const selected = candidates[0];
    if (!selected) return null;
    const zh = input.language === "zh", name = selected.name;
    const labels = zh ? {
      review: name ? `${name}正在审阅你的提交` : "正在审阅你的提交",
      thinking: name ? `${name}正在思考` : "组员们正在思考",
      wording: name ? `${name}正在斟酌回复` : "正在整理回复",
      reading: name ? `${name}正在阅读你的消息` : "正在阅读你的消息",
      reflecting: "组员们正在回顾刚才的讨论",
      preparing: "正在准备接下来的讨论"
    } : {
      review: name ? `${name} is reviewing your submission` : "Reviewing your submission",
      thinking: name ? `${name} is thinking` : "The group is thinking",
      wording: name ? `${name} is considering a reply` : "Preparing a reply",
      reading: name ? `${name} is reading your message` : "Reading your message",
      reflecting: "The group is reflecting on the discussion",
      preparing: "Preparing the next discussion"
    };
    return {kind: selected.kind, npcId: selected.npcId, eventId: selected.eventId, text: labels[selected.kind]};
  }
  const api = Object.freeze({select});
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AgentWaitingCore = api;
})(typeof globalThis === "object" ? globalThis : this);
