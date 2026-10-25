// Cosmetic, condition-neutral room life. Sitting/reading/water is NOT completed
// research work: no agent call, appraisal, memory, score or StoryBeat is made.
const LAB_ROUTINE_VERSION="lab-routines-v5-return-to-work";
let labRoutineRuntime=null,labRoutineFrame=0;
// Reuse only synchronous presentation facts inside one RAF. No value survives
// the call, and no position, route, timer or business state is cached here.
let labRoutineFrameContext=null;
// Keep the already loaded standing sprite until the new atlas is decoded;
// never flash an empty character while changing to a cosmetic pose.
let labPoseReady=false;
const labPosePreload=new Image();
labPosePreload.onload=()=>{labPoseReady=true;if(state.screen==="game")renderWorldActors();};
labPosePreload.src=window.SocialEvoLabPoses.url;
function resetLabRoutineRuntime(){
  for(const trip of [labRoutineRuntime?.traveler,labRoutineRuntime?.suspendedTraveler]){
    const traveler=state.npcs?.find(n=>n.id===trip?.npcId);
    if(traveler){traveler.movementState="idle";traveler.walkFrame=0;}
  }
  if(labRoutineFrame)cancelAnimationFrame(labRoutineFrame);labRoutineFrame=0;labRoutineRuntime=null;
  document.getElementById('lab-water-cooler')?.removeAttribute('data-filling');
}
function yieldLabRoutineActor(npc){
  if(!npc||!labRoutineRuntime||labRoutineRuntime.epoch!==state.sessionEpoch||!state.npcs.includes(npc))return;
  const old=labPoseFor(npc);
  if(old)labRoutineRuntime.interrupted.set(npc.id,old);
  if(labRoutineRuntime.traveler?.npcId===npc.id){labRoutineRuntime.traveler=null;npc.movementState="idle";npc.walkFrame=0;document.getElementById('lab-water-cooler')?.removeAttribute('data-filling');}
  if(labRoutineRuntime.suspendedTraveler?.npcId===npc.id)labRoutineRuntime.suspendedTraveler=null;
  resumeLabRoutineForNpc(npc);
  labRoutineRuntime.poses.delete(npc.id);
  renderWorldActors();
}
function labLifeAvailable(){return state.screen==="game"&&state.scenarioId==="newcomer-circle"&&state.openingResponseAnswered&&!state.sessionClosed&&!state.apiFatalError&&!state.finalOutcome;}
function syncLabRoutines(){
  if(!labLifeAvailable()){resetLabRoutineRuntime();return;}
  if(!labRoutineRuntime||labRoutineRuntime.epoch!==state.sessionEpoch)labRoutineRuntime={epoch:state.sessionEpoch,last:0,nextTrip:performance.now()+18000,tripNumber:0,traveler:null,suspendedTraveler:null,returnQueue:new Map(),poses:new Map(),interrupted:new Map()};
  if(!labRoutineFrame)labRoutineFrame=requestAnimationFrame(tickLabRoutines);
}
function labRoutineDialogueReading(){
  const context=labRoutineFrameContext;
  if(context&&Object.hasOwn(context,'reading'))return context.reading;
  const reading=Boolean(state.dialogueAdvancePending||state.voiceModality?.enabled&&['loading','buffering','speaking'].includes(state.voiceModality.status));
  if(context)context.reading=reading;
  return reading;
}
function labPublicReplyActorId(){
  const context=labRoutineFrameContext;
  if(context&&Object.hasOwn(context,'publicActorId'))return context.publicActorId;
  const actorId=currentLabPublicReplyActorId();
  if(context)context.publicActorId=actorId;
  return actorId;
}
function currentLabPublicReplyActorId(){
  if(typeof openingQuestionIsCurrent!=='function'||!openingQuestionIsCurrent()||!state.decisionPanelVisible)return null;
  const p=openingQuestionPending;
  return !p.deferred&&p.requiresReply!==false&&(state.pendingDecision?.openingContinuation||state.pendingDecision?.publicContinuation)&&
    state.pendingDecision.sourceNpcId===p.npcId&&openingReplyInvitesAnswer(p.dialogue,p.npcId)?p.npcId:null;
}
function labPrivateContinuationIdle(){
  return privateConversationPendingIsCurrent()&&!npcContactRuntime&&!isSideTalkOpen()&&!state.activeEventLock&&!labRoutineDialogueReading();
}
function labPrivateActorId(){
  const context=labRoutineFrameContext;
  if(context&&Object.hasOwn(context,'privateActorId'))return context.privateActorId;
  const actorId=currentLabPrivateActorId();
  if(context)context.privateActorId=actorId;
  return actorId;
}
function currentLabPrivateActorId(){
  if(npcContactRuntime?.epoch===state.sessionEpoch)return npcContactRuntime.npcId;
  if(isSideTalkOpen())return state.activeSideTalkNpcId;
  if(privateConversationPendingIsCurrent()&&isPrivateContinuationOpen()&&isPlayerDirectedQuestion(privateConversationPending.result.dialogue,privateConversationPending.npcId))return privateConversationPending.npcId;
  const lockId=state.activeEventLock?.eventId;
  const lock=lockId?state.eventLedger.find(e=>e.eventId===lockId):null;
  if(lock?.sessionEpoch===state.sessionEpoch&&(lock.type.startsWith('private_chat')||lock.type==='npc_first_contact'))return lock.audience?.npcIds?.[0];
  const last=state.dialogueHistory.at(-1);
  return labRoutineDialogueReading()&&last?.visibility==="private"?last.audienceNpcIds?.[0]:null;
}
function labRoomAmbientAllowed(){return !state.isIntroPlaying&&!state.isGmThinking&&(!state.decisionPanelVisible||Boolean(labPublicReplyActorId()))&&!labDayHandoff&&(!state.isScenePlaying||Boolean(labPrivateActorId())||labPrivateContinuationIdle());}
function labRoutineActorEngaged(npc){return Boolean(npc)&&((typeof labStoryRuntime!=="undefined"&&labStoryRuntime?.epoch===state.sessionEpoch&&(labStoryRuntime.npcId===npc.id||labStoryRuntime.event?.eventId===state.activeEventLock?.eventId&&labStoryRuntime.event?.actors?.includes(npc.id)))||labPrivateActorId()===npc.id||labPublicReplyActorId()===npc.id||playerNavigationSnapshot().targetNpcId===npc.id||
  labRoutineDialogueReading()&&document.getElementById("pixel-world")?.dataset.dialogueSpeakerId===npc.id);}
function labRoutineActorBusy(npc){return !labRoomAmbientAllowed()||labRoutineActorEngaged(npc);}
function labPoseFor(npc){
  // Pausing room movement is not an instruction for every seated NPC to stand
  // and reveal their old walk-facing frame. Only an actual participant yields.
  if(!labLifeAvailable()||labRoutineActorEngaged(npc)||npc.movementState==="moving")return "";
  const trip=labRoutineRuntime?.traveler;
  if(trip?.npcId===npc.id&&['fill','drink'].includes(trip.phase))return trip.phase;
  const home=npc.homePosition||labStationHome(npc.id);
  return home&&positionDistance(npc.position,home)<1?"seated":"";
}
function labRoutineSprite(npc,standing){
  const pose=labPoseFor(npc),atlas=window.SocialEvoLabPoses,frame=atlas?.characters[npc.id]?.[pose];
  if(!frame||!labPoseReady)return standing;
  return {...standing,url:atlas.url,imageWidth:atlas.imageWidth,imageHeight:atlas.imageHeight,
    frames:[[frame]],frameRow:0,frameColumn:0,artVersion:atlas.version,pose,poseFlip:pose==='fill'};
}
function labObservedActivity(npc){
  if(!npc||!labLifeAvailable())return null;
  const pose=labPoseFor(npc),station=LAB_WORKSTATIONS.find(s=>s.npcId===npc.id);
  const interrupted=labRoutineRuntime?.interrupted.get(npc.id)||null;
  return {current:pose==='seated'?station?.en:pose==='fill'?'Filling a cup at the water cooler':pose==='drink'?'Taking a sip of water':npc.movementState==='moving'?'Walking in the room':'Standing in the room',
    interruptedActivity:interrupted,scope:'Only this NPC’s visible room activity. No private words, player reading actions or completed research work are implied.'};
}
function startLabRoutineTrip(npc,now,r){
  const home=npc.homePosition||labStationHome(npc.id),atHome=positionDistance(npc.position,home)<1;
  const kind=r.tripNumber++%2===0?'water':'board';
  const desired=atHome?(kind==='water'?LAB_WATER_STATION.approach:{x:17,y:64}):home;
  // A occupied dispenser is skipped, never shared/teleported into. Only one
  // ambient traveler owns the route, independent of condition or hidden state.
  if(!isWalkableForActor(desired,{ignoreNpcId:npc.id,includePlayer:true}))return false;
  const path=findWalkPath(npc.position,desired,{ignoreNpcId:npc.id});
  if(path.length<2)return false;
  r.traveler={npcId:npc.id,target:desired,path:path.slice(1),home,kind,phase:'walk',returning:!atHome,blocked:0,lastPlanAt:now,waitingForPath:false};
  r.interrupted.delete(npc.id);return true;
}
// Returning is presentation only. Keep a yielded actor queued while the player
// reads, answers, re-engages, or blocks its desk; never invent a completed task.
function resumeLabRoutineForNpc(npc){
  const r=labRoutineRuntime;
  if(!npc||!r||r.epoch!==state.sessionEpoch||!labLifeAvailable()||!state.npcs.includes(npc))return false;
  r.returnQueue ||= new Map();if(!r.returnQueue.has(npc.id))r.returnQueue.set(npc.id,0);
  return true;
}
function startLabRoutineReturn(npc,now,r){
  const home=npc.homePosition||labStationHome(npc.id);
  if(!home){r.returnQueue.delete(npc.id);return false;}
  if(positionDistance(npc.position,home)<.2){r.returnQueue.delete(npc.id);r.interrupted.delete(npc.id);return false;}
  r.returnQueue.set(npc.id,now+300);
  if(!isWalkableForActor(home,{ignoreNpcId:npc.id,includePlayer:true}))return false;
  const path=findWalkPath(npc.position,home,{ignoreNpcId:npc.id});if(path.length<2)return false;
  r.traveler={npcId:npc.id,target:home,path:path.slice(1),home,kind:'work',phase:'walk',returning:true,returnToWork:true,blocked:0,lastPlanAt:now,waitingForPath:false};
  return true;
}
function tickLabRoutines(now){
  const previous=labRoutineFrameContext;labRoutineFrameContext={};
  try{return tickLabRoutineFrame(now);}
  finally{labRoutineFrameContext=previous;}
}
function tickLabRoutineFrame(now){
  labRoutineFrame=0;if(!labLifeAvailable()){resetLabRoutineRuntime();return;}
  const r=labRoutineRuntime;if(!r||r.epoch!==state.sessionEpoch)return;
  const dt=Math.min(.05,Math.max(0,(now-(r.last||now))/1000));r.last=now;
  const reduced=window.matchMedia("(prefers-reduced-motion: reduce)").matches||document.getElementById("game-screen").classList.contains("ui-motion");
  let changed=false;
  r.returnQueue ||= new Map();
  if(r.traveler&&!state.npcs.some(n=>n.id===r.traveler.npcId))r.traveler=null;
  // A returning actor that is addressed again yields the lane to other actors.
  if(r.traveler?.returnToWork&&labRoutineActorEngaged(state.npcs.find(n=>n.id===r.traveler.npcId))){
    const n=state.npcs.find(n=>n.id===r.traveler.npcId);if(n){n.movementState='idle';n.walkFrame=0;}r.traveler=null;changed=true;
  }
  if(!reduced&&labRoomAmbientAllowed()){
    for(const [id,nextPlanAt] of r.returnQueue){
      const n=state.npcs.find(n=>n.id===id);
      if(!n){r.returnQueue.delete(id);continue;}
      if(now<nextPlanAt||labRoutineActorBusy(n)||n.movementState==='moving')continue;
      if(r.traveler?.returnToWork)break;
      const ambient=r.traveler;
      if(startLabRoutineReturn(n,now,r)){
        if(ambient&&ambient.npcId!==n.id){r.suspendedTraveler={...ambient,suspendedAt:now};const actor=state.npcs.find(n=>n.id===ambient.npcId);if(actor){actor.movementState='idle';actor.walkFrame=0;}}
        changed=true;break;
      }
    }
    if(!r.traveler&&r.suspendedTraveler){
      r.traveler=r.suspendedTraveler;r.suspendedTraveler=null;
      const n=state.npcs.find(n=>n.id===r.traveler.npcId);
      if(n){if(r.traveler.pauseUntil)r.traveler.pauseUntil+=now-r.traveler.suspendedAt;r.traveler.path=findWalkPath(n.position,r.traveler.target,{ignoreNpcId:n.id}).slice(1);r.traveler.lastPlanAt=now;}
      else r.traveler=null;
    }
  }
  if(!r.traveler&&now>=r.nextTrip&&!reduced&&labRoomAmbientAllowed()){
    const candidates=state.npcs.filter(n=>!r.returnQueue.has(n.id)&&!labRoutineActorBusy(n)&&n.movementState!=="moving");
    const npc=candidates[Math.floor(now/18000)%Math.max(1,candidates.length)];
    if(npc)changed=startLabRoutineTrip(npc,now,r)||changed;
    r.nextTrip=now+26000;
  }
  const trip=r.traveler,npc=trip&&state.npcs.find(n=>n.id===trip.npcId);
  if(npc&&!labRoutineActorBusy(npc)&&!reduced){
    const next=trip.path[0],box=document.getElementById("pixel-world").getBoundingClientRect();
    if(next){
      const dx=(next.x-npc.position.x)*box.width/100,dy=(next.y-npc.position.y)*box.height/100,dist=Math.hypot(dx,dy),ratio=dist?Math.min(1,90*dt/dist):1;
      const point=clampWalkablePoint({x:npc.position.x+(next.x-npc.position.x)*ratio,y:npc.position.y+(next.y-npc.position.y)*ratio});
      if(isWalkableForActor(point,{ignoreNpcId:npc.id})&&walkSegmentClear(npc.position,point,{ignoreNpcId:npc.id})){trip.blocked=0;trip.waitingForPath=false;npc.direction=directionFromDelta(dx,dy,npc.direction);npc.position=point;npc.movementState="moving";npc.walkFrame=Math.floor(now/150)%3;changed=true;
        if(positionDistance(point,next)<.1){npc.position={...next};trip.path.shift();}}
      else {npc.movementState="idle";npc.walkFrame=0;trip.waitingForPath=true;changed=true;
        if(now-trip.lastPlanAt>=300){trip.lastPlanAt=now;trip.blocked++;trip.path=findWalkPath(npc.position,trip.target,{ignoreNpcId:npc.id}).slice(1);}
      }
    }else if(trip.phase==='walk'&&positionDistance(npc.position,trip.target)>.2){
      npc.movementState="idle";npc.walkFrame=0;trip.waitingForPath=true;
      if(now-trip.lastPlanAt>=300){trip.lastPlanAt=now;trip.blocked++;trip.path=findWalkPath(npc.position,trip.target,{ignoreNpcId:npc.id}).slice(1);changed=true;}
    }else{
      trip.waitingForPath=false;
      if(npc.movementState!=="idle"){npc.movementState="idle";npc.walkFrame=0;changed=true;}
      if(trip.returning){if(trip.returnToWork){r.returnQueue.delete(npc.id);r.interrupted.delete(npc.id);}r.traveler=null;changed=true;}
      else if(trip.phase==='walk'){
        trip.phase=trip.kind==='water'?'fill':'look';trip.pauseUntil=now+(trip.kind==='water'?2600:4000);npc.direction='left';changed=true;
      }else if(now>=trip.pauseUntil){
        if(trip.phase==='fill'){trip.phase='drink';trip.pauseUntil=now+2400;npc.direction='down';changed=true;}
        else {trip.returning=true;trip.phase='walk';trip.target=trip.home;trip.path=findWalkPath(npc.position,trip.home,{ignoreNpcId:npc.id}).slice(1);changed=true;}
      }
    }
  }else if(npc&&npc.movementState==="moving"){npc.movementState="idle";npc.walkFrame=0;changed=true;}
  // Paused/unavailable characters stand; resume only their remaining visible
  // cosmetic action. No absent work or expired water action is narrated.
  if(trip&&npc&&(labRoutineActorBusy(npc)||reduced)&&trip.pauseUntil)trip.pauseUntil+=dt*1000;
  const filling=Boolean(r.traveler?.phase==='fill'&&npc&&!labRoutineActorBusy(npc)&&!reduced);
  document.getElementById('lab-water-cooler')?.toggleAttribute('data-filling',filling);
  for(const n of state.npcs){const pose=labPoseFor(n);if(r.poses.get(n.id)!==pose){r.poses.set(n.id,pose);changed=true;}}
  if(changed)renderWorldActors();
  if(!labRoutineFrame)labRoutineFrame=requestAnimationFrame(tickLabRoutines);
}
function applyLabRoutinePresentation(node,actor){
  const station=LAB_WORKSTATIONS.find(d=>d.npcId===actor.id),pose=actor.id==='player'?'':labPoseFor(actor);
  const working=pose==='seated';node.dataset.labPose=labPoseReady?pose:"";
  node.dataset.labActivity=labRoutineRuntime?.traveler?.npcId===actor.id&&labRoutineRuntime.traveler.waitingForPath?'waiting_for_path':working?station?.activity||'':pose;
  if(station)node.title=working?`${actor.name} · ${state.language==="zh"?station.zh:station.en}`:actor.name;
  const desk=document.querySelector(`[data-station-npc-id="${actor.id}"]`);
  if(desk)desk.classList.toggle("lab-desk-occupied",Boolean(working));
}
window.addEventListener("resize",()=>{if(state.screen==="game")renderWorldActors();});
