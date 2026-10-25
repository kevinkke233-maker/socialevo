// Player-only navigation. Never submit social actions while travelling or read
// appraisal/condition state. One RAF clock owns keyboard and pointer movement.
const PLAYER_NAVIGATION_SPEED = 220; // CSS pixels / second, equal in both axes.
const playerNavigationKeys = new Set();
let playerNavigationFrame = 0, playerNavigationTime = 0, playerNavigationRoute = null;
let playerNavigationWalkDistance = 0, playerNavigationStopReason = "idle";
const PLAYER_NAVIGATION_VECTORS = {w:[0,-1],a:[-1,0],s:[0,1],d:[1,0],ArrowUp:[0,-1],ArrowLeft:[-1,0],ArrowDown:[0,1],ArrowRight:[1,0]};

function navigationKey(key) { return key.startsWith("Arrow") ? key : key.toLowerCase(); }
function playerNavigationSnapshot() {
  return {version:"player-navigation-v1",heldKeys:[...playerNavigationKeys],route:playerNavigationRoute?.kind || "",
    targetNpcId:playerNavigationRoute?.npcId || "",replans:playerNavigationRoute?.replans || 0,lastStopReason:playerNavigationStopReason};
}
function navigationPixelDelta(vector, seconds, width, height) {
  const length = Math.hypot(vector.x,vector.y) || 1;
  return {x:vector.x/length*PLAYER_NAVIGATION_SPEED*seconds/width*100,y:vector.y/length*PLAYER_NAVIGATION_SPEED*seconds/height*100};
}
function navigationLineClear(a,b) {
  const steps=Math.ceil(Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y))/.75);
  for(let i=1;i<=steps;i++) if(!isWalkablePoint({x:a.x+(b.x-a.x)*i/steps,y:a.y+(b.y-a.y)*i/steps})) return false;
  return true;
}
function navigationTalkLineClear(a,b,npcId) {
  // Talk across this person's low desk, without letting a walking path pass
  // through it. Other furniture/boards and room bounds remain blocking.
  const bounds=activeWalkableBounds(),steps=Math.ceil(Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y))/.75);
  for(let i=1;i<=steps;i++){
    const p={x:a.x+(b.x-a.x)*i/steps,y:a.y+(b.y-a.y)*i/steps};
    if(p.x<bounds.minX||p.x>bounds.maxX||p.y<bounds.minY||p.y>bounds.maxY||activeCollisionObstacles().some(o=>o.id!==`desk-${npcId}`&&pointOverlapsObstacle(p,o)))return false;
  }return true;
}
function updateNavigationHighlights() {
  const free=isFreeExplorationActive();
  document.querySelectorAll('#sprite-layer [data-actor-id]').forEach(node=>{
    node.classList.toggle('npc-nearby',free&&node.dataset.actorId===state.nearbyNpcId);
    node.classList.toggle('npc-navigation-target',free&&node.dataset.actorId===playerNavigationRoute?.npcId);
  });
}
function stopPlayerNavigation(reason="interrupted") {
  playerNavigationKeys.clear();
  if(playerNavigationFrame) cancelAnimationFrame(playerNavigationFrame);
  playerNavigationFrame=0;playerNavigationTime=0;playerNavigationStopReason=reason;
  playerNavigationWalkDistance=0;
  const route=playerNavigationRoute;playerNavigationRoute=null;
  document.getElementById('ui-walk-target').hidden=true;
  state.playerWalkFrame=0;
  document.getElementById('pixel-world').classList.remove('ui-player-moving');
  if(typeof renderWorldActors==='function') renderWorldActors();
  updateNavigationHighlights();route?.resolve({arrived:false,reason});
}
function syncPlayerNavigationLock() {
  if((playerNavigationKeys.size||playerNavigationRoute)&&!isFreeExplorationActive()) stopPlayerNavigation('interaction_lock');
  updateNavigationHighlights();
}
function renderNavigationMotion() {
  updateProximityInteraction();
  if(typeof renderWorldActors==='function') renderWorldActors();else renderPixelWorld();
  updateNavigationHighlights();
}
function advanceNavigationPosition(delta) {
  const box=document.getElementById('pixel-world').getBoundingClientRect();
  const slices=Math.max(1,Math.ceil(Math.max(Math.abs(delta.x),Math.abs(delta.y))/.75));
  let moved=0;
  for(let i=0;i<slices;i++) {
    const before=state.playerPosition,next=movePointWithCollision(before,delta.x/slices,delta.y/slices);
    if(next.x===before.x&&next.y===before.y) break;
    state.playerPosition=next;state.playerDirection=directionFromDelta(next.x-before.x,next.y-before.y,state.playerDirection);
    playerNavigationWalkDistance+=Math.hypot((next.x-before.x)*box.width/100,(next.y-before.y)*box.height/100);
    moved+=Math.hypot(next.x-before.x,next.y-before.y);
  }
  if(moved) {
    state.playerWalkFrame=1+Math.floor(playerNavigationWalkDistance/36)%2;
    document.getElementById('pixel-world').classList.add('ui-player-moving');renderNavigationMotion();
  }
  return moved;
}
function handlePlayerNavigationKey(event) {
  const key=navigationKey(event.key),vector=PLAYER_NAVIGATION_VECTORS[key];
  if(!vector) return false;
  event.preventDefault();
  if(!isFreeExplorationActive()) {setInteractionLockMessage();return true;}
  if(playerNavigationKeys.has(key)||event.repeat) return true;
  if(playerNavigationRoute) stopPlayerNavigation('keyboard_override');
  playerNavigationKeys.add(key);
  // A very short physical tap still moves; OS repeated keydown events do not.
  const box=document.getElementById('pixel-world').getBoundingClientRect();
  advanceNavigationPosition(navigationPixelDelta({x:vector[0],y:vector[1]},1/60,box.width,box.height));
  ensurePlayerNavigationFrame();return true;
}
function ensurePlayerNavigationFrame() {
  if(playerNavigationFrame) return;
  playerNavigationTime=performance.now();playerNavigationFrame=requestAnimationFrame(tickPlayerNavigation);
}
function navigationPathLength(path,box) {
  return path.slice(1).reduce((sum,p,i)=>sum+Math.hypot((p.x-path[i].x)*box.width/100,(p.y-path[i].y)*box.height/100),0);
}
function navigationApproachPlan(npc) {
  const box=document.getElementById('pixel-world').getBoundingClientRect(),candidates=[];
  // Stay outside the character collision envelope and inside the talk range.
  for(const x of [-5,0,5]) for(const y of [-10,-8,0,8,10]) {
    const point={x:npc.position.x+x,y:npc.position.y+y};
    if(!isWalkableForActor(point,{includePlayer:false})||!positionsWithin(point,npc.position,interactionRange)||!navigationTalkLineClear(point,npc.position,npc.id)) continue;
    const path=findWalkPath(state.playerPosition,point,{includePlayer:false});
    if(path.length>1) candidates.push({point,path,length:navigationPathLength(path,box)});
  }
  return candidates.sort((a,b)=>a.length-b.length)[0] || null;
}
function replanPlayerRoute(route,now) {
  const npc=route.kind==='npc' ? state.npcs.find(item=>item.id===route.npcId) : null;
  const plan=npc ? navigationApproachPlan(npc) : route.kind==='floor'
    ? {point:route.target,path:findWalkPath(state.playerPosition,route.target,{includePlayer:false})} : null;
  route.replans++;route.lastPlanAt=now;
  if(!plan||plan.path.length<2) {route.blockedSince ||= now;route.path=[];return false;}
  route.target=plan.point;route.path=plan.path.slice(1);route.blockedSince=0;
  route.npcPosition=npc ? {...npc.position} : null;
  const marker=document.getElementById('ui-walk-target');marker.style.left=`${route.target.x}%`;marker.style.top=`${route.target.y}%`;marker.hidden=false;
  marker.dataset.targetName=npc?.name || '';updateNavigationHighlights();return true;
}
function completePlayerRoute(route,npc=null) {
  if(playerNavigationRoute!==route)return;
  if(route.conversation?.isCurrent&&!route.conversation.isCurrent()){stopPlayerNavigation('stale_conversation');return;}
  playerNavigationRoute=null;route.resolve({arrived:true,npcId:npc?.id || ''});
  stopPlayerNavigation('arrived');
  if(npc&&isFreeExplorationActive()) {
    state.playerDirection=directionFromDelta(npc.position.x-state.playerPosition.x,npc.position.y-state.playerPosition.y,state.playerDirection);
    renderWorldActors();openSideTalk(npc,route.conversation?.sideTalkOptions||{});
  }
}
function tickPlayerNavigation(now) {
  playerNavigationFrame=0;
  if(!isFreeExplorationActive()||document.hidden) {stopPlayerNavigation('interaction_lock');return;}
  const seconds=Math.min(.05,Math.max(0,(now-playerNavigationTime)/1000));playerNavigationTime=now;
  const box=document.getElementById('pixel-world').getBoundingClientRect();
  if(playerNavigationKeys.size) {
    const vector=[...playerNavigationKeys].reduce((sum,key)=>({x:sum.x+PLAYER_NAVIGATION_VECTORS[key][0],y:sum.y+PLAYER_NAVIGATION_VECTORS[key][1]}),{x:0,y:0});
    advanceNavigationPosition(navigationPixelDelta(vector,seconds,box.width,box.height));
  } else if(playerNavigationRoute) {
    const route=playerNavigationRoute;
    if(route.epoch!==state.sessionEpoch||route.stageId!==currentStage()?.id) {stopPlayerNavigation('stale_session');return;}
    if(route.conversation?.isCurrent&&!route.conversation.isCurrent()){stopPlayerNavigation('stale_conversation');return;}
    const npc=route.kind==='npc' ? state.npcs.find(item=>item.id===route.npcId) : null;
    if(npc&&positionsWithin(state.playerPosition,npc.position,interactionRange)&&navigationTalkLineClear(state.playerPosition,npc.position,npc.id)) {completePlayerRoute(route,npc);return;}
    if(now-route.startedAt>25000) {stopPlayerNavigation('route_timeout');setWorldHelp(playerUiText('noRoute'));return;}
    const movedTarget=npc&&route.npcPosition&&positionDistance(npc.position,route.npcPosition)>2;
    if((movedTarget||!route.path.length)&&now-route.lastPlanAt>=160) replanPlayerRoute(route,now);
    if(now-route.progressAt>1800) {stopPlayerNavigation('blocked');setWorldHelp(playerUiText('noRoute'));return;}
    const next=route.path[0];
    if(next) {
      if(!isWalkableForActor(next,{includePlayer:false})) {route.path=[];route.blockedSince ||= now;}
      else {
        const dx=(next.x-state.playerPosition.x)*box.width/100,dy=(next.y-state.playerPosition.y)*box.height/100,distance=Math.hypot(dx,dy);
        const ratio=distance ? Math.min(1,PLAYER_NAVIGATION_SPEED*seconds/distance) : 1;
        const moved=advanceNavigationPosition({x:dx*ratio/box.width*100,y:dy*ratio/box.height*100});
        if(moved) route.progressAt=now;
        if(positionDistance(state.playerPosition,next)<.08) route.path.shift();
        else if(!moved) {route.path=[];route.blockedSince ||= now;}
        if(!route.path.length&&positionDistance(state.playerPosition,route.target)<.15&&route.kind==='floor') {completePlayerRoute(route);return;}
      }
    }
  }
  if(playerNavigationKeys.size||playerNavigationRoute) playerNavigationFrame=requestAnimationFrame(tickPlayerNavigation);
  else stopPlayerNavigation('released');
}
function startPlayerRoute(kind,target,npcId='',conversation=null) {
  if(conversation?.isCurrent&&!conversation.isCurrent())return Promise.resolve({arrived:false,reason:'stale_conversation'});
  if(!isFreeExplorationActive()) {setInteractionLockMessage();return Promise.resolve({arrived:false,reason:'locked'});}
  stopPlayerNavigation('new_destination');
  return new Promise(resolve=>{
    const now=performance.now();
    playerNavigationRoute={kind,target,npcId,conversation,epoch:state.sessionEpoch,stageId:currentStage()?.id,path:[],replans:0,lastPlanAt:0,blockedSince:0,startedAt:now,progressAt:now,resolve};
    replanPlayerRoute(playerNavigationRoute,now);ensurePlayerNavigationFrame();
  });
}
function navigatePlayerTo(point) {return startPlayerRoute('floor',nearestUnoccupiedWalkablePoint(point,{includePlayer:false}));}
function approachNpcForConversation(npc,conversation=null) {
  if(conversation?.isCurrent&&!conversation.isCurrent())return Promise.resolve({arrived:false,reason:'stale_conversation'});
  if(!npc||!isFreeExplorationActive()) {setInteractionLockMessage();return Promise.resolve({arrived:false,reason:'locked'});}
  if(typeof privateConversationBudgetReached==='function'&&privateConversationBudgetReached()) {
    stopPlayerNavigation('private_budget_complete');openSideTalk(npc,conversation?.sideTalkOptions||{});return Promise.resolve({arrived:false,reason:'private_budget_complete'});
  }
  if(typeof yieldLabRoutineActor==="function")yieldLabRoutineActor(npc);
  if(playerNavigationRoute?.npcId===npc.id&&playerNavigationRoute.epoch===state.sessionEpoch){
    if(!conversation)return Promise.resolve({arrived:false,reason:'already_approaching'});
    // A later explicit Continue owns the arrival context of the same physical
    // walk. Keep its path and original completion promise, and settle the new
    // caller only when that route actually arrives or is cancelled.
    const route=playerNavigationRoute,resolvePrevious=route.resolve;route.conversation=conversation;
    return new Promise(resolve=>{route.resolve=result=>{resolvePrevious(result);resolve(result);};});
  }
  if(positionsWithin(state.playerPosition,npc.position,interactionRange)&&navigationTalkLineClear(state.playerPosition,npc.position,npc.id)) {stopPlayerNavigation('nearby_talk');openSideTalk(npc,conversation?.sideTalkOptions||{});return Promise.resolve({arrived:true,npcId:npc.id});}
  return startPlayerRoute('npc',null,npc.id,conversation);
}
document.addEventListener('keyup',event=>{
  playerNavigationKeys.delete(navigationKey(event.key));
  if(!playerNavigationKeys.size&&!playerNavigationRoute) stopPlayerNavigation('released');
});
window.addEventListener('blur',()=>stopPlayerNavigation('window_blur'));
document.addEventListener('visibilitychange',()=>{if(document.hidden) stopPlayerNavigation('tab_hidden');});
document.addEventListener('focusin',event=>{if(event.target.matches?.('input,textarea,select,[contenteditable]')) stopPlayerNavigation('text_input');});
