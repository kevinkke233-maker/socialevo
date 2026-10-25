// Resume already validated probe presentation; this path never generates a reply.
const savedProbePresentationOwners = new WeakSet();
async function resumeSavedRelationshipProbe(owner, pending, spec, source, responders) {
  const unavailable = message => {
    const error = new Error('Saved responsibility discussion cannot resume: ' + message);
    error.code = 'probe_recovery_unavailable';
    return error;
  };
  if (!owner || typeof owner !== 'object') throw unavailable('the original owner is missing.');
  if (savedProbePresentationOwners.has(owner)) throw new StaleSessionError('Saved probe presentation is already resuming.');
  savedProbePresentationOwners.add(owner);
  const epoch = state.sessionEpoch, sessionId = state.sessionId, token = stagePacingToken();
  let event = null;
  const current = () => relationshipProbeRecovery === owner && state.sessionEpoch === epoch && state.sessionId === sessionId &&
    owner.epoch === epoch && owner.token === token && stagePacingToken() === token &&
    !state.sessionClosed && !state.apiFatalError && !state.finalOutcome;
  const check = () => {
    currentEpochOrThrow(epoch);
    if (!current()) throw new StaleSessionError('The saved probe no longer belongs to the current game.');
    if (!event || state.eventLedger.find(e => e.eventId === event.eventId) !== event ||
        event.status !== 'validated' || event.metadata?.probePhase !== 'presentation') {
      throw unavailable('the original validated presentation is no longer available.');
    }
  };
  try {
    owner.busy = true;
    event = owner.event;
    check();
    if (!source || state.eventLedger.find(e => e.eventId === source.eventId) !== source || source.type !== 'key_decision' ||
        source.status !== 'committed' || source.sessionEpoch !== epoch || source.sessionId !== sessionId ||
        pending?.sourceEventId !== source.eventId || owner.sourceEventId !== source.eventId ||
        !spec || owner.probeId !== spec.id || event.type !== 'relationship_transfer_probe' || event.sessionEpoch !== epoch ||
        event.sessionId !== sessionId || event.rootEventId !== source.eventId || event.parentEventId !== source.eventId ||
        event.metadata.probeId !== spec.id || event.metadata.schemaVersion !== spec.schemaVersion ||
        event.metadata.fixedResponderSchedule !== true || event.commit ||
        state.relationshipTransferProbe?.eventId !== event.eventId || state.relationshipTransferProbe?.sourceEventId !== source.eventId) {
      throw unavailable('the source event, fixed schedule or measurement binding is inconsistent.');
    }
    const ids = spec.responderIds;
    if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length || !Array.isArray(responders) ||
        responders.length !== ids.length || responders.some((npc, i) => npc?.id !== ids[i] || !state.npcs.includes(npc)) ||
        !(owner.ready instanceof Map) || owner.ready.size !== ids.length || [...owner.ready.keys()].some(id => !ids.includes(id))) {
      throw unavailable('the complete original candidate schedule is missing.');
    }
    const deliveries = (event.dialogueDeliveries || []).filter(d => d.npcId);
    if (deliveries.length !== ids.length || deliveries.some(d => d.channel !== 'relationship_transfer_response' || !ids.includes(d.npcId))) {
      throw unavailable('the validated event does not contain exactly its original responses.');
    }
    const plan = responders.map(npc => {
      const cached = owner.ready.get(npc.id), update = cached?.update;
      const delivery = deliveries.filter(d => d.npcId === npc.id);
      const origin = state.eventLedger.find(e => e.eventId === cached?.eventId);
      const originRows = origin?.dialogueDeliveries?.filter(d => d.npcId === npc.id && d.channel === 'relationship_transfer_response' &&
        ['generated', 'delivered'].includes(d.status) && d.speaker === npc.name && d.text === update?.dialogue) || [];
      if (!update || typeof update.dialogue !== 'string' || !update.dialogue.trim() || typeof update.emotion !== 'string' || !update.emotion.trim() ||
          typeof update.tone !== 'string' || !update.tone.trim() || !Array.isArray(update.behavioralMoves) || !update.behavioralMoves.length ||
          update.behavioralMoves.length > 2 || new Set(update.behavioralMoves).size !== update.behavioralMoves.length ||
          update.behavioralMoves.some(move => typeof move !== 'string' || !move || !spec.behavioralMoves?.includes(move)) ||
          delivery.length !== 1 || !['generated', 'delivered'].includes(delivery[0].status) ||
          delivery[0].speaker !== npc.name || delivery[0].text !== update.dialogue ||
          !origin || origin.type !== 'relationship_transfer_probe' || origin.sessionId !== sessionId || origin.sessionEpoch !== epoch ||
          origin.rootEventId !== source.eventId || origin.parentEventId !== source.eventId || origin.metadata?.probeId !== spec.id || originRows.length !== 1 ||
          state.eventLedger.indexOf(origin) > state.eventLedger.indexOf(event) || (origin !== event &&
            (origin.status !== 'failed' || origin.metadata?.probePhase !== 'generation' || origin.dialogueDeliveries.some(d => d.npcId && d.status === 'delivered')))) {
        throw unavailable('a retained response has no matching original generated or delivered source.');
      }
      return {npc, update, delivery: delivery[0]};
    });
    const recordedRead = event.metadata.probeReadNpcIds;
    if (recordedRead !== undefined && (!Array.isArray(recordedRead) || new Set(recordedRead).size !== recordedRead.length ||
        recordedRead.some(id => !ids.includes(id)))) throw unavailable('the read receipts are invalid.');
    const read = new Set(recordedRead || []);
    for (const row of state.log) if (row.type === 'Relationship transfer response' && row.eventId === event.eventId && ids.includes(row.npcId)) read.add(row.npcId);
    let generatedSeen = false, unreadSeen = false;
    for (const {npc, delivery} of plan) {
      if (delivery.status === 'generated') generatedSeen = true;
      else if (generatedSeen) throw unavailable('delivered responses are not an original schedule prefix.');
      if (read.has(npc.id) && delivery.status !== 'delivered') throw unavailable('a read receipt names an unspoken response.');
      if (!read.has(npc.id)) unreadSeen = true;
      else if (unreadSeen) throw unavailable('read receipts are not an original presentation prefix.');
    }
    state.isScenePlaying = true;
    updateWorldActivityClasses();
    event.metadata.probeReadNpcIds = ids.filter(id => read.has(id));
    for (const {npc, update, delivery} of plan) {
      check();
      if (read.has(npc.id)) continue;
      if (delivery.status === 'delivered') {
        // The line was already heard. Re-display only; never re-record it or request voice.
        showGalgameDialogue(npc.name, update.dialogue, update.emotion, update.tone);
      } else {
        addDialogue(npc.name, npc.color, update.dialogue, update.emotion, update.tone, {
          round: pending.endingRound, eventId: event.eventId, channel: 'relationship_transfer_response', recoveryTextOnly: true
        });
        SocialEvoCore.markDialogueDelivered(event, {deliveryId: delivery.deliveryId});
      }
      await waitForDialogueAdvance(update.dialogue, 'npcResponse');
      check();
      read.add(npc.id);
      event.metadata.probeReadNpcIds = ids.filter(id => read.has(id));
      if (!state.log.some(row => row.type === 'Relationship transfer response' && row.eventId === event.eventId && row.npcId === npc.id)) {
        state.log.push({type: 'Relationship transfer response', eventId: event.eventId, round: pending.endingRound,
          summary: `${npc.name}: ${update.dialogue}`, npcId: npc.id, behavioralMoves: update.behavioralMoves,
          resumedPresentation: true, timestamp: new Date().toISOString()});
      }
    }
    check();
    const responses = plan.map(({npc, update}) => ({npcId: npc.id, npcName: npc.name, model: npc.model, dialogue: update.dialogue,
      emotion: update.emotion, tone: update.tone, behavioralMoves: [...update.behavioralMoves]}));
    SocialEvoCore.transitionEvent(event, 'committed', {npcIds: ids, result: {probeId: spec.id, responseCount: responses.length}});
    state.relationshipTransferProbe = {...state.relationshipTransferProbe, status: 'complete', completedAt: new Date().toISOString(), responses};
    if (labStoryState().pendingBridge?.kind === 'probe' && labStoryState().pendingBridge.sourceEventId === source.eventId) labStoryState().pendingBridge = null;
    relationshipProbeRecovery = null;
    renderNpcRail();renderPixelWorld();renderSessionState();renderResearchLog();renderLabBridgeRecovery();
    return state.relationshipTransferProbe;
  } finally {
    savedProbePresentationOwners.delete(owner);
    owner.busy = false;
    if (state.sessionEpoch === epoch && state.sessionId === sessionId) {
      state.isScenePlaying = false;
      updateWorldActivityClasses();
    }
  }
}
