// A first approach is an opportunity for a real greeting, not an invented
// player utterance or an appraisal-bearing consultation. One owner per request.
const NPC_CONTACT_VERSION = "npc-first-contact-v1";
let npcContactRuntime = null;
let npcContactFailure = null;
function npcContactFailureCurrent(){return Boolean(npcContactFailure&&npcContactFailure.epoch===state.sessionEpoch&&npcContactFailure.stageId===currentStage()?.id&&!state.sessionClosed&&!state.apiFatalError);}
function needsNpcFirstContact(npc) {
  if (!state.openingResponseAnswered) return false;
  if(typeof latestNpcPlayerExchange==='function'&&latestNpcPlayerExchange(npc))return false;
  return !state.eventLedger.some(e=>e.sessionEpoch===state.sessionEpoch&&e.status==="committed"&&
    ((e.type==="npc_first_contact"&&e.metadata?.npcId===npc.id) ||
     (e.type==="story_anchor"&&e.dialogueDeliveries?.some(d=>d.npcId===npc.id&&d.status==="delivered")) ||
     (e.type==="private_chat"&&e.audience?.npcIds?.includes(npc.id)) ||
     (e.type==="opening_response"&&e.dialogueDeliveries?.some(d=>d.npcId===npc.id&&d.status==="delivered"))));
}
function renderNpcContactControls() {
  const panel=document.getElementById("ui-npc-contact");if(!panel)return;
  panel.hidden=!npcContactRuntime&&!npcContactFailureCurrent();
  const npc=state.npcs.find(n=>n.id===(npcContactRuntime?.npcId||npcContactFailure?.npcId));
  document.getElementById("ui-npc-contact-note").textContent=state.language==="zh"
    ? npcContactFailureCurrent()?`${npc?.name||""} 的回应暂时未能接续。你的进度已保留，可以重试或按 Esc 离开。`:`正在与 ${npc?.name||""} 打招呼；你可以按 Esc 离开。`
    : npcContactFailureCurrent()?`${npc?.name||""}'s reply could not be used. Progress is preserved; retry or press Esc to leave.`:`Meeting ${npc?.name||""}; press Esc to leave.`;
  document.getElementById('ui-npc-contact-retry').hidden=!npcContactFailureCurrent();
  document.getElementById('ui-npc-contact-retry').textContent=state.language==='zh'?'重试问候':'Retry greeting';
  document.getElementById("ui-npc-contact-close").textContent=state.language==="zh"?"离开交谈":"Leave conversation";
}
function cancelNpcFirstContact(reason="player_left") {
  const owner=npcContactRuntime;
  if(!owner){const had=Boolean(npcContactFailure);npcContactFailure=null;renderNpcContactControls();return had;}
  npcContactFailure=null;
  npcContactRuntime=null;owner.controller.abort(reason);
  if(owner.event.status==="committed")owner.event.metadata.presentationInterruptedAt=new Date().toISOString();
  else failRuntimeEvent(owner.event,{message:reason});
  cancelDialogueAdvanceWait();releaseEventLock(owner.event);
  if(owner.epoch===state.sessionEpoch) {state.isScenePlaying=false;hideGalgameDialogue();updateWorldActivityClasses();}
  renderNpcContactControls();return true;
}
async function startNpcFirstContact(npc,composerOptions={}) {
  if(npcContactRuntime||!isFreeExplorationActive())return false;
  npcContactFailure=null;
  const event=acquireEventLock("npc_first_contact",{actors:["player",npc.id],audience:{visibility:"private",npcIds:[npc.id]},
    metadata:{npcId:npc.id,initiatedBy:"player",presentationOnly:true,version:NPC_CONTACT_VERSION,playerSpokenMessage:null}});
  if(!event)return false;
  if(typeof yieldLabRoutineActor==="function")yieldLabRoutineActor(npc);
  faceActorToward(npc,state.playerPosition);
  const draftOptions={...(typeof composerOptions.selectedReply==='string'?{selectedReply:composerOptions.selectedReply}:{}),...(composerOptions.newTopic?{newTopic:true}:{}),...(typeof composerOptions.lastReply==='string'?{lastReply:composerOptions.lastReply}:{})};
  const owner={npcId:npc.id,event,epoch:state.sessionEpoch,controller:new AbortController(),composerOptions:draftOptions};npcContactRuntime=owner;
  state.isScenePlaying=true;updateWorldActivityClasses();renderNpcContactControls();
  const current=()=>npcContactRuntime===owner&&owner.epoch===state.sessionEpoch&&!state.sessionClosed&&!state.apiFatalError;
  try {
    const result=await callNpcApi(npc,"","First private contact",{openingPresentation:true,firstContactPresentation:true,controller:owner.controller});
    if(!current())return false;
    const deliveryId=`${event.eventId}-greeting`;
    SocialEvoCore.recordDialogueGenerated(event,{deliveryId,npcId:npc.id,speaker:npc.name,text:result.dialogue,channel:"npc_first_contact"});
    state.currentPrivateConversationNpcId=npc.id;
    try{addDialogue(npc.name,npc.color,result.dialogue,result.emotion,result.tone,{eventId:event.eventId,channel:"npc_first_contact"});}
    finally{state.currentPrivateConversationNpcId=null;}
    SocialEvoCore.markDialogueDelivered(event,{deliveryId});
    commitRuntimeEvent(event,[],()=>({presentationOnly:true,npcId:npc.id}));
    await waitForDialogueAdvance(result.dialogue,"npcResponse");
    if(!current())return false;
    event.metadata.replyBoundaryAt=new Date().toISOString();
    npcContactRuntime=null;releaseEventLock(event);state.isScenePlaying=false;renderNpcContactControls();updateWorldActivityClasses();
    openSideTalk(npc,{...owner.composerOptions,skipFirstContact:true,lastGreeting:result.dialogue});return true;
  }catch(error){
    if(!current()||isStaleRequestError(error))return false;
    // This greeting is presentation-only and has not committed any NPC change.
    // Reject the invalid output, but do not turn a recoverable surface request
    // into a terminal session. Retrying is a NEW real generation, never a
    // fabricated line, field stripping or semantic JSON repair.
    failRuntimeEvent(event,error);npcContactRuntime=null;state.isScenePlaying=false;
    npcContactFailure={npcId:npc.id,epoch:owner.epoch,stageId:currentStage()?.id,composerOptions:owner.composerOptions};
    releaseEventLock(event);hideGalgameDialogue();updateWorldActivityClasses();renderNpcContactControls();
    state.log.push({type:'First contact unavailable',npcId:npc.id,eventId:event.eventId,summary:'Greeting rejected before delivery; progress retained, explicit retry available.',timestamp:new Date().toISOString()});
    return false;
  }finally{releaseEventLock(event);}
}
const npcContactPanel=document.createElement("section");npcContactPanel.id="ui-npc-contact";npcContactPanel.hidden=true;
npcContactPanel.innerHTML='<p id="ui-npc-contact-note" role="status"></p><button type="button" id="ui-npc-contact-retry" hidden></button><button type="button" id="ui-npc-contact-close"></button>';
document.getElementById("pixel-world").append(npcContactPanel);
document.getElementById("ui-npc-contact-close").onclick=()=>cancelNpcFirstContact();
document.getElementById('ui-npc-contact-retry').onclick=()=>{if(!npcContactFailureCurrent())return;const npc=state.npcs.find(n=>n.id===npcContactFailure.npcId);if(!npc)return;
 const options=npcContactFailure.composerOptions||{};
 if(positionsWithin(state.playerPosition,npc.position,interactionRange))void startNpcFirstContact(npc,options);else approachNpcForConversation(npc,{sideTalkOptions:options});};
