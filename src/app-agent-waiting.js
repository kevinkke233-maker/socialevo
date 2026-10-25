// Ephemeral progress only. Never records speech, evidence or game state.
const agentWaitingTargets = new Map();

function beginAgentWaiting(call, options) {
  if (call.endpoint !== "/api/chat") return;
  try {
    const body = JSON.parse(options.body), message = body.messages?.filter(item => item.role === "user").at(-1);
    const context = JSON.parse(message?.content || "{}");
    const id = context.npc?.id || context.targetNpc?.id || context.speakerId || context.npcId || context.targetNpcId;
    if (state.npcs.some(npc => npc.id === id)) agentWaitingTargets.set(`${call.sessionEpoch}:${call.callId}`, id);
  } catch (_) { /* A missing public actor uses the event's existing audience. */ }
  renderAgentWaiting();
}

function endAgentWaiting(call) {
  agentWaitingTargets.delete(`${call.sessionEpoch}:${call.callId}`);
  renderAgentWaiting();
}

function resetAgentWaiting() {
  agentWaitingTargets.clear();
  const node = document.getElementById("agent-waiting");
  hideAgentWaiting(node,document.getElementById("pixel-world"));
}

function hideAgentWaiting(node,world) {
  if(node){
    if(!node.hidden)node.hidden=true;
    const label=node.querySelector('.agent-waiting-label');
    if(label.textContent)label.textContent='';
  }
  if(world?.classList.contains('agent-waiting-active'))world.classList.remove('agent-waiting-active');
}

function renderAgentWaiting() {
  const node = document.getElementById("agent-waiting"), world = document.getElementById("pixel-world");
  if (!node || !world) return;
  // Status is read afresh: cancellation, restore and body completion may mutate
  // calls in place. Empty/old-session work never requires a full event index.
  const pendingCalls=state.screen==='game'&&!state.sessionClosed&&!state.apiFatalError
    ?state.apiCalls.filter(call=>call.endpoint==='/api/chat'&&call.status==='pending'&&
      call.sessionEpoch===state.sessionEpoch&&call.sessionId===state.sessionId):[];
  if(!pendingCalls.length){hideAgentWaiting(node,world);return;}
  const activity = AgentWaitingCore.select({screen: state.screen, closed: state.sessionClosed, fatal: state.apiFatalError,
    sessionId: state.sessionId, epoch: state.sessionEpoch, language: state.language, npcs: state.npcs,
    calls: pendingCalls, events: state.eventLedger, activeEventId: state.activeEventLock?.eventId,
    targets: Object.fromEntries(pendingCalls.map(call => [call.callId, agentWaitingTargets.get(`${call.sessionEpoch}:${call.callId}`)]))});
  if (!activity) {hideAgentWaiting(node,world);return;}
  const event = activity.eventId?state.eventLedger.find(item => item.eventId === activity.eventId):null;
  const backpack = document.getElementById("backpack-panel"), talk = document.getElementById("side-talk-panel");
  const host = event?.type === "artifact_submission" && isBackpackOpen() ? backpack :
    event?.type === "private_chat" && isSideTalkOpen() ? talk : world;
  if (node.parentNode !== host) {
    if (host === world) host.append(node);
    else host.querySelector(".side-talk-header").after(node);
  }
  const dataset={inline:String(host!==world),kind:activity.kind,
    motion:typeof playerUiPreferences!=='undefined'&&playerUiPreferences.motion===true?'off':'on'};
  for(const [key,value]of Object.entries(dataset))if(node.dataset[key]!==value)node.dataset[key]=value;
  const label = node.querySelector(".agent-waiting-label");
  if (label.textContent !== activity.text) label.textContent = activity.text;
  const portrait = node.querySelector("img");
  if (activity.npcId) {
    const src = galgamePortraitUrl(activity.npcId, "neutral");
    if (portrait.getAttribute("src") !== src) portrait.setAttribute("src", src);
  }
  if(portrait.hidden!==!activity.npcId)portrait.hidden=!activity.npcId;
  if(node.hidden)node.hidden=false;
  if(world.classList.contains('agent-waiting-active')!==(host===world))world.classList.toggle("agent-waiting-active", host === world);
}
