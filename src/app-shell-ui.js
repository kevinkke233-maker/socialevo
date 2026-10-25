// Approved v66 title/setup/HUD presentation. No mock story, model calls,
// condition assignment, score changes or replacement navigation controller.
let shellStartPending = false;
let shellMemberRenderKey = "";
let shellProximityHintSize = null;
let mainlineHudClockObserver = null;

function syncMainlineHudClockOffset() {
  if(state.screen!=='game'||innerWidth>760)return;
  const clock=document.getElementById('ui-lab-time'),world=document.getElementById('pixel-world');
  if(!clock||!world)return;
  const box=clock.getBoundingClientRect();if(!box.height)return;
  const value=`${Math.max(125,box.bottom-world.getBoundingClientRect().top+12)}px`;
  if(world.style.getPropertyValue('--lab-clock-bottom')!==value)world.style.setProperty('--lab-clock-bottom',value);
}

function syncShellBeginButton() {
  const button=document.getElementById("begin-game-btn"),input=document.getElementById("participant-id");
  if (!button || !input || state.screen!=="config") return;
  const accountPaused=typeof studyAccountAuthenticationPaused==='function'&&studyAccountAuthenticationPaused();
  const restoredGame=!accountPaused&&typeof studyPairRuntime!=='undefined' && (studyPairRuntime.recoveryPending ||
    studyPairRuntime.pair?.games?.[studyPairRuntime.pair.currentGame]?.sessionId);
  const disabled=shellStartPending || !input.value.trim() || Boolean(restoredGame) || typeof studyAccountCanBegin==='function'&&!studyAccountCanBegin();
  if(button.disabled!==disabled) button.disabled=disabled;
}

function renderShellUi() {
  document.body.dataset.shellScreen=state.screen;
  for(const input of document.querySelectorAll("[data-shell-preference]")) {
    input.checked=Boolean(playerUiPreferences[input.dataset.shellPreference]);
  }
  const members=document.getElementById("setup-member-peek");
  if(members) {
    const publicMembers=(currentScenario().npcs||baseNpcs).map(npc=>({id:npc.id,name:npc.name}));
    const key=JSON.stringify(publicMembers);
    if(key!==shellMemberRenderKey) {
      shellMemberRenderKey=key;members.replaceChildren();
      for(const npc of publicMembers) {
        const item=document.createElement("figure"),image=document.createElement("img"),name=document.createElement("figcaption");
        image.src=galgamePortraitUrl(npc.id,"neutral");image.alt="";image.loading="lazy";name.textContent=npc.name;
        item.append(image,name);members.append(item);
      }
    }
  }
  const markers=document.getElementById("ui-chapter-markers");
  if(markers) {
    markers.hidden=true;
    markers.removeAttribute("aria-label");
  }
  const workspace=document.getElementById("ui-workspace-button");
  if(workspace) {
    const ready=reusableActiveLaptopTask();
    let status=document.getElementById("ui-workspace-ready");
    if(!status) {status=document.createElement("span");status.id="ui-workspace-ready";workspace.append(status);}
    status.hidden=!ready;status.textContent=state.language==="zh"?"已就绪":"Ready";
    workspace.classList.toggle("workspace-ready",ready);
    workspace.dataset.taskId=ready?activeLaptopTaskId():"";
    workspace.title=ready?String(state.activeArtifactTask.title||t("shellWorkspace")):t("shellWorkspace");
  }
  syncShellBeginButton();positionShellProximityHint();
  if (typeof renderAgentWaiting === "function") renderAgentWaiting();
}

function positionShellProximityHint() {
  const hint=document.getElementById("proximity-hint"),world=document.getElementById("pixel-world");
  if(!hint||!world) return;
  const npc=state.npcs.find(item=>item.id===state.nearbyNpcId);
  const contextual=Boolean(npc&&isFreeExplorationActive());
  if(hint.hasAttribute("data-contextual")!==contextual)hint.toggleAttribute("data-contextual",contextual);
  if(!contextual) {hint.style.removeProperty("--shell-hint-x");hint.style.removeProperty("--shell-hint-y");return;}
  const width=world.clientWidth,height=world.clientHeight;
  // Text/viewport changes need a fresh size; movement alone does not. The
  // observer also catches font loading and reading-preference size changes.
  if(!shellProximityHintSize||shellProximityHintSize.node!==hint){
    shellProximityHintSize?.observer.disconnect();
    const size=shellProximityHintSize={node:hint,key:"",width:0};
    size.observer=new ResizeObserver(entries=>{
      if(size!==shellProximityHintSize)return;
      const entry=entries[0],box=entry?.borderBoxSize?.[0];
      if(box?.inlineSize>0){
        const changed=size.width!==box.inlineSize;size.width=box.inlineSize;
        if(changed&&hint.hasAttribute('data-contextual'))positionShellProximityHint();
      }
      else size.key="";
    });
    size.observer.observe(hint);
  }
  const size=shellProximityHintSize,key=`${hint.textContent}|${hint.className}|${width}`;
  if(size.key!==key){size.width=hint.getBoundingClientRect().width;size.key=key;}
  const half=Math.min(size.width||220,width-32)/2;
  const x=clamp((npc.position.x+state.playerPosition.x)/200*width,half+16,width-half-16);
  const y=Math.min(Math.max(npc.position.y,state.playerPosition.y)/100*height+26,height-170);
  const left=`${x}px`,top=`${Math.max(130,y)}px`;
  if(hint.style.getPropertyValue("--shell-hint-x")!==left)hint.style.setProperty("--shell-hint-x",left);
  if(hint.style.getPropertyValue("--shell-hint-y")!==top)hint.style.setProperty("--shell-hint-y",top);
}

function updateShellPreference(key,value) {
  if(!Object.prototype.hasOwnProperty.call(playerUiPreferences,key)) return;
  playerUiPreferences[key]=Boolean(value);applyPlayerUiPreferences();renderShellUi();
  try {localStorage.setItem("socialevo_player_ui_v1",JSON.stringify(playerUiPreferences));} catch(_error) {}
}

function initializeShellUi() {
  const options=document.getElementById("menu-options-dialog");
  document.getElementById("menu-options-btn").onclick=()=>{renderShellUi();options.showModal();};
  document.getElementById("close-menu-options-btn").onclick=()=>options.close();
  options.addEventListener("click",event=>{if(event.target===options)options.close();});
  document.getElementById("setup-how-to-play-btn").onclick=()=>{
    const guide=document.getElementById("project-info-dialog");if(!guide.open)guide.showModal();
  };
  document.getElementById("setup-review-brief-btn").onclick=()=>{
    const brief=document.getElementById("study-brief-dialog");if(!brief.open)brief.showModal();
  };
  document.querySelectorAll("[data-shell-preference]").forEach(input=>{
    input.onchange=()=>updateShellPreference(input.dataset.shellPreference,input.checked);
  });
  const input=document.getElementById("participant-id"),button=document.getElementById("begin-game-btn");
  input.addEventListener("input",syncShellBeginButton);
  input.addEventListener("keydown",event=>{
    if(event.key==="Enter"&&!event.isComposing&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!button.disabled) {
      event.preventDefault();if(typeof studyAccountIsLoginMode==='function'&&studyAccountIsLoginMode())void studyAccountSubmitFromSetup();else button.click();
    }
  });
  button.addEventListener("click",()=>{
    shellStartPending=true;input.readOnly=true;
    // Local validation can return before the real startup flow disables the
    // button (e.g. an invalid admin password). Do not strand the ID editor.
    queueMicrotask(()=>{if(!button.disabled){shellStartPending=false;input.readOnly=false;}});
  },true);
  new MutationObserver(()=>{
    // Only the existing real startup flow releases this disabled attribute.
    if(!button.disabled) {shellStartPending=false;input.readOnly=false;syncShellBeginButton();}
  }).observe(button,{attributes:true,attributeFilter:["disabled"]});
  document.addEventListener("keydown",event=>{
    if(state.screen!=="menu"||event.defaultPrevented||event.isComposing||event.altKey||event.ctrlKey||event.metaKey||
       document.querySelector("dialog[open]")||event.target.matches("input,textarea,select,[contenteditable='true']")) return;
    if(!["ArrowUp","ArrowDown"].includes(event.key)) return;
    event.preventDefault();const buttons=[...document.querySelectorAll("#menu-screen .title-action")];
    const old=buttons.indexOf(document.activeElement),direction=event.key==="ArrowDown"?1:-1;
    buttons[(old+direction+buttons.length)%buttons.length]?.focus();
  });
  window.addEventListener("resize",positionShellProximityHint);
  // Clock wrapping/font changes and entering the phone layout can happen
  // without another game action. Observe its size, never the animation loop.
  const clock=document.getElementById('ui-lab-time');
  if(clock){mainlineHudClockObserver=new ResizeObserver(syncMainlineHudClockOffset);mainlineHudClockObserver.observe(clock);}
  renderShellUi();
}
initializeShellUi();
