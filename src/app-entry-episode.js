// Stage ONE only: optional orientation, actual scope material, a grounded
// public choice/response record and explicit handoff. No conversational quota,
// success/grade/trust threshold, fabricated NPC speech or treatment branching.
const ENTRY_EPISODE_VERSION = "entry-episode-v1";
const ENTRY_SCOPE_DOCUMENT_ID = "entry-scope-note-v1";
const NPC_READABILITY_VERSION="npc-readable-interaction-v1";
function npcReadableInteractionRule(){return "For ordinary player-addressed conversation, acknowledge their actual words, explain at most one unfamiliar issue unless they asked for a wider review, and invite an answerable clarification/preference or bounded next step. Do not test a newcomer on unexplained statistics or pile counts, figure labels, claims and ownership into one question. Preserve each NPC persona, actual conflict and original evidence; clarity is not forced friendliness or success.";}
const ENTRY_CONVERSATION_VERSION = "entry-progressive-context-v2-readable";
let entryEpisodeAdvance = null;
// Presentation preference only; does not change readiness or saved game facts.
let mainlineHudExpanded = false;

// The NPC's access to a file is not evidence that a newly arrived player has
// seen it. These are speech-context projections, not changes to shared files,
// the neutral memory store/retrieval algorithm or stage prerequisites.
function entryPresentedDocumentIds() {
  return new Set(state.eventLedger.filter(e=>e.sessionEpoch===state.sessionEpoch&&e.status==="committed"&&e.type==="shared_artifact_review")
    .map(e=>e.metadata?.documentId).filter(Boolean));
}
function entryConversationDocuments({detailQuery=""}={}) {
  const presented=entryPresentedDocumentIds();
  const reportProject=Boolean(currentScenario().projectWorkflow);
  const specific=(reportProject?/(样本|记录|纳入|排除|口径|图|标签|数字|结论|成绩|分数|均值|平均|对照|因果|提醒|局限|P\d{2}|18|percent|sample|record|criteria|figure|label|claim|problem|score|mean|control|caus|reminder|limitation|问题|风险)/i:/(样本|记录|纳入|排除|口径|图|标签|数字|结论|18|126|79|percent|sample|record|criteria|figure|label|claim|problem|问题|风险)/i).test(detailQuery);
  return sharedComputerContext().map(doc=>{
    const identity={id:doc.id,title:doc.title,documentType:doc.documentType,brief:doc.brief,presentedToPlayer:presented.has(doc.id),comprehensionAssumed:false};
    if(doc.id===ENTRY_SCOPE_DOCUMENT_ID&&presented.has(doc.id))return {...identity,sections:doc.sections};
    if(!presented.has(doc.id)||!specific)return {...identity,detailAvailability:'Use plain-language orientation. Opening a file does not mean the player understands its figures. Do not turn this into an audit quiz or dump multiple numeric issues. Explain what the material is before one relevant next question.'};
    if(reportProject){
      const figure=/(图|figure|chart|label)/i.test(detailQuery),limits=/(局限|因果|证明|对照|control|caus|limitation|prove)/i.test(detailQuery);
      const summary=/(均值|平均|提高|18|纳入|排除|几人|多少人|percent|mean|average|inclusion|exclusion|improv)/i.test(detailQuery),row=/(P\d{2}|每行|记录|成绩|分数|row|record|score|table)/i.test(detailQuery);
      const sectionId=doc.id===currentScenario().projectWorkflow.dataDocumentId?(figure?'figure':limits?'limits':summary?'summary':row?'paired_scores':'study_design'):(figure?'figure_origin':limits||summary?'outcome_claim':row?'data_coverage':'handoff_status');
      return {...identity,sections:(doc.sections||[]).filter(s=>s.id===sectionId),detailAvailability:'This is the named original source section for the requested topic, not an edited report or proof of comprehension. Explain only the relevant point; do not invent other sources or completed work.'};
    }
    let index=/(图|标签|figure|label|chart)/i.test(detailQuery)?2:/(18|结论|提升|claim|percent|result)/i.test(detailQuery)?0:1;
    return {...identity,sections:(doc.sections||[]).slice(index,index+1),detailAvailability:'One relevant original section is supplied. Explain this point plainly and offer clarification; do not demand the newcomer solve several unexplained technical issues.'};
  });
}

function entryConversationWorld() {
  const world=storyWorldContext();
  return {scenarioId:world.scenarioId,scenarioTitle:world.scenarioTitle,playerRole:world.playerRole,setting:world.setting,
    multimodalInteraction:world.multimodalInteraction,narrativeDay:world.narrativeDay,currentSituation:"The newcomer is still establishing a starting role and the lab is under project pressure. Participation and responsibilities are discussed from actual delivered replies; a proposal or willingness alone does not establish agreement.",
    allowedCommitments:["explain your own role and the current lab situation","invite questions or offer a look at the shared computer","discuss bounded participation without assuming acceptance"],
    disallowedCommitments:world.disallowedCommitments};
}
function entryConversationAgentBrief() {
  return [`Current scenario: ${scenarioAgentLabel()}.`,`Player role: ${scenarioPlayerLabel()}.`,`Group: ${scenarioGroupLabel()}.`,
    `Current moment: first-stage arrival/orientation and starting-role discussion. Describe only commitments actually established in visible conversation.`,requestedLanguageInstruction(),
    typeof playerVisibleNarrativeBoundaryInstruction==="function"?playerVisibleNarrativeBoundaryInstruction():"",
    typeof multimodalInstructionForAgent==="function"?multimodalInstructionForAgent():"No video modality is active."].join(" ");
}
function entryConversationOrientation(npc,{opening=false,publicOnly=false}={}) {
  const documents=opening?[]:entryConversationDocuments();
  const hasPriorExchange=Boolean(npc&&typeof latestNpcPlayerExchange==='function'&&latestNpcPlayerExchange(npc));
  return {version:ENTRY_CONVERSATION_VERSION,moment:opening?"first_arrival_reply":hasPriorExchange?"continuing_conversation":"starting_conversation",comprehensionAssumed:false,readingActsArePrivate:true,
    presentedDocuments:documents.filter(d=>d.presentedToPlayer).map(d=>({id:d.id,title:d.title})),
    instruction:`Respond to what the player actually asked. Listening, asking what is happening, or expressing willingness is NOT a task choice or acceptance of responsibility. Keep the NPC's own persona, reservations and authority boundaries. ${hasPriorExchange?"Continue the actual prior conversation rather than starting introductions again. Only explain your role again if the player asks.":"First explain who you are and the current project situation in everyday language."} Do not invent a project title, specialty or accepted role. If the player has not encountered a material, first introduce what it is and why it matters. Do not dump row counts, percentages, results, chart defects or evaluation criteria from unpresented files. Even after a file is opened, explain at most one new technical issue unless the player explicitly asks for a wider review. A reading act does not make the newcomer an expert. Invite an answerable preference, clarification or bounded next step, not an unexplained technical examination. After a file is actually presented or relevant facts are explicitly raised in this player's visible conversation, explain the relevant point when asked; presentation does not prove understanding. presentedDocuments is an interface continuity aid, not evidence the NPC saw a private reading action; do not claim to have seen the player read unless that was actually publicly observable or the player told you. Answer a question about materials by explaining them, not by assigning a check or asking the player to choose a task. Do not claim work is completed or turn a greeting/listening response into a review commitment.`,
    openingInstruction:opening?"This is the first reply to a new arrival, not the participation decision. Briefly acknowledge their words and introduce yourself or one plain-language fact about the situation. No file contents, data discrepancy, audit plan, task assignment or request to choose a review responsibility. Let the player orient before proposing work.":null,
    recentVisibleConversation:recentDialogueContext(10,npc?.id&&!publicOnly?{viewerNpcId:npc.id}:{role:"group"})};
}

function isEntryEpisodeStage() {return currentScenario().id==="newcomer-circle"&&state.stageIndex===0&&state.roundIndex===0;}
function emptyEntryEpisode() {return {version:ENTRY_EPISODE_VERSION,guide:"offered",guideAction:"",scopeReviewed:false,choiceEventId:"",receipt:null,receiptViewedAt:"",handoffRequestedAt:"",advancedAt:""};}
function entryEpisodeState() {return state.entryEpisode||(state.entryEpisode=emptyEntryEpisode());}
function resetEntryEpisodeRuntime() {entryEpisodeAdvance=null;}
function entryEpisodeChoicePending() {return isEntryEpisodeStage()&&Boolean(entryEpisodeState().choiceEventId);}
function entryEpisodeSafeBoundary() {
  const voice=state.voiceModality;
  return state.screen==="game"&&!state.sessionClosed&&!state.apiFatalError&&!state.finalOutcome&&
    !state.isIntroPlaying&&!state.isScenePlaying&&!state.isGmThinking&&!state.activeEventLock&&!state.dialogueAdvancePending&&
    !(voice?.enabled&&["loading","buffering","speaking"].includes(voice.status))&&
    !state.decisionPanelVisible&&!isSideTalkOpen()&&!isBackpackOpen()&&!isTaskBoardOpen()&&!isPlayerToolOpen();
}

function entryEpisodeNextAction() {
  const p=entryEpisodeState(),zh=state.language==="zh";
  if(p.choiceEventId) return p.receiptViewedAt
    ?(zh?"起步选择与公开回应已记录。你可以继续澄清，准备好后再进入首次核查。":"Your proposal and the public replies are recorded. Clarify further, or begin the first review when ready.")
    :(zh?"可以在电脑中回看你的提议和组员的回应，再决定接下来怎么做。":"Review your proposal and the team’s replies on the computer, then decide what to do next.");
  if(!p.scopeReviewed) return zh
    ?"先在共享电脑查看“起步说明”，了解眼前材料与待明确的责任；也可以先问成员。"
    :"Read the Starting scope note on the shared computer to see the materials and unresolved responsibilities. You can also ask members first.";
  const report=stagePacingState().report;
  if(stagePacingReportIsCurrent(report)&&!report.shouldTrigger&&report.publicCue)return report.publicCue;
  return zh?"已有起步背景。你可以继续与成员交流，或参加讨论，提出自己愿意承担的范围。":"You have the starting context. Keep talking, or join the discussion to propose your participation boundaries.";
}

async function openEntryEpisodeWorkspace(receipt=false) {
  const token=stagePacingToken();
  if(!isEntryEpisodeStage()||!entryEpisodeSafeBoundary()) return false;
  entryEpisodeState().guide="dismissed";entryEpisodeState().guideAction=receipt?"review_actual_replies":"review_scope";
  await openBackpack();
  if(token!==stagePacingToken()||state.sessionClosed||!isBackpackOpen()) return false;
  setWorkspaceTab(receipt?'records':'materials');
  const details=receipt?document.getElementById("entry-workspace-receipt"):
    document.querySelector(`[data-workspace-document-id="${ENTRY_SCOPE_DOCUMENT_ID}"]`);
  if(details) {
    details.open=true;
    if(!receipt)markVisibleWorkspaceDocuments();
    if(receipt) document.getElementById("backpack-panel").scrollTop=0;
    else details.querySelector("summary").scrollIntoView({block:"nearest"});
  }
  renderEntryEpisodeControls();return Boolean(details);
}

function chooseEntryEpisodeGuide(action) {
  if(!isEntryEpisodeStage()||!entryEpisodeSafeBoundary()) return;
  const p=entryEpisodeState();p.guide="dismissed";p.guideAction=action;
  if(action==='skip'&&openingQuestionIsCurrent())openingQuestionPending.reminderDismissed=true;
  state.log.push({type:"Entry orientation action",action,stageId:currentStage().id,timestamp:new Date().toISOString()});
  if(action==="scope") {void openEntryEpisodeWorkspace();return;}
  if(action==="members") {openPlayerTool("journal","people");return;}
  setWorldHelp(entryEpisodeNextAction());renderEntryEpisodeControls();
}

function stageOnePublicChoiceRecord(event) {
  if(event?.sessionEpoch!==state.sessionEpoch||event.type!=="key_decision"||event.status!=="committed"||event.metadata?.stageId!=="stage_1_entry"||event.audience?.visibility!=="group") throw new Error("Entry record requires the current committed public core choice.");
  const delivered=(event.dialogueDeliveries||[]).filter(d=>d.status==="delivered"&&["player_decision","npc_response"].includes(d.channel));
  const player=delivered.find(d=>d.channel==="player_decision");
  if(!player?.text) throw new Error("Entry record lacks the actual delivered proposal.");
  return {id:`entry-record-${event.eventId}`,sourceEventId:event.eventId,stageId:"stage_1_entry",visibility:"group",
    knownByNpcIds:state.npcs.map(n=>n.id),createdAt:new Date().toISOString(),proposal:player.text,proposalDeliveryId:player.deliveryId,
    replies:delivered.filter(d=>d.channel==="npc_response").map(d=>({deliveryId:d.deliveryId,npcId:d.npcId,speaker:d.speaker,text:d.text})),
    agreementInferred:false,workCompletedInferred:false};
}

async function offerEntryEpisodeOutcome(event,decision,window) {
  const p=entryEpisodeState();
  if(!isEntryEpisodeStage()||p.choiceEventId) throw new Error("Entry choice already recorded or stage is stale.");
  p.receipt=stageOnePublicChoiceRecord(event);p.choiceEventId=event.eventId;p.guide="dismissed";
  p.pendingContinuation={decision,window};
  event.metadata.entryEpisode={version:ENTRY_EPISODE_VERSION,status:"choice_delivered_pending_review",recordId:p.receipt.id};
  stagePacingState().status="entry_review";stagePacingState().report=null;
  state.pendingDecision=null;state.selectedOption="";state.selectedOptionIndex=-1;state.decisionPanelVisible=false;
  state.isScenePlaying=false;setDecisionPanelVisible(false);updateWorldActivityClasses();refreshGameHud();
  setWorldHelp(entryEpisodeNextAction());renderEntryEpisodeControls();
  if(typeof offerLatestPublicInvitation==='function'&&offerLatestPublicInvitation(event))refreshGameHud();
}

function recordEntryReceiptViewed() {
  const p=entryEpisodeState();if(!entryEpisodeChoicePending()||!p.receipt||p.receiptViewedAt||state.sessionClosed||state.apiFatalError) return;
  // Public facts are copied verbatim from delivered speech; the act of reading
  // remains private and does not update anyone's appraisal or award progress.
  const event=createRuntimeEvent("entry_record_review",{rootEventId:p.choiceEventId,parentEventId:p.choiceEventId,
    actors:["player"],audience:{visibility:"private",npcIds:[]},evidenceIds:[p.choiceEventId],metadata:{recordId:p.receipt.id,readonly:true}});
  SocialEvoCore.transitionEvent(event,"validated",{});SocialEvoCore.transitionEvent(event,"committed",{npcIds:[]});
  p.receiptViewedAt=new Date().toISOString();p.receiptReviewEventId=event.eventId;
  setWorldHelp(entryEpisodeNextAction());renderCurrentObjective();renderPlayerExperience();
}

function renderEntryWorkspaceReceipt(node) {
  if(!node||!isEntryEpisodeStage()||!entryEpisodeState().receipt) return;
  const p=entryEpisodeState(),r=p.receipt,zh=state.language==="zh";
  node.hidden=false;const details=document.createElement("details");details.id="entry-workspace-receipt";details.className="workspace-document entry-record";
  const summary=document.createElement("summary"),icon=document.createElement("span"),name=document.createElement("span"),title=document.createElement("strong");
  icon.className="workspace-document-icon";icon.setAttribute("aria-hidden","true");name.className="workspace-document-name";
  title.textContent=zh?"起步记录：你的选择与当时的公开回应":"Entry record: your proposal and the public replies";
  name.append(title);summary.append(icon,name);
  const body=document.createElement("div");body.className="entry-record-body";
  const append=(title,text)=>{const section=document.createElement("section"),heading=document.createElement("strong"),paragraph=document.createElement("p");heading.textContent=title;paragraph.textContent=text;section.append(heading,paragraph);body.append(section);};
  append(zh?"你提出的范围（不等于小组已同意）":"Your proposed scope (not assumed agreement)",r.proposal);
  for(const reply of r.replies) append(reply.speaker,reply.text);
  if(!r.replies.length) append(zh?"尚无公开回应":"No public reply",zh?"你的提议暂时还没有收到公开回应。":"Your proposal has not received a public reply yet.");
  append(zh?"接下来可以做什么":"What you can do next",zh?"还有不清楚的地方，可以继续询问成员，也可以到电脑上查看项目材料。":"Ask members about anything unclear, or look through the project materials on the computer.");
  details.append(summary,body);details.addEventListener("toggle",()=>{if(details.open&&isBackpackOpen()&&workspaceTab==='records'&&details.isConnected&&workspaceElementPresented(details))recordEntryReceiptViewed();});
  node.insertBefore(details,node.querySelector(".workspace-document-list"));
}

async function advanceEntryEpisode() {
  const p=entryEpisodeState(),token=stagePacingToken();
  if(entryEpisodeAdvance||!entryEpisodeChoicePending()||!p.receiptViewedAt||!entryEpisodeSafeBoundary()) return false;
  const coreEvent=state.eventLedger.find(e=>e.eventId===p.choiceEventId);
  if(coreEvent?.status!=="committed"||!p.pendingContinuation) return false;
  const event=acquireEventLock("entry_stage_handoff",{rootEventId:coreEvent.rootEventId,parentEventId:coreEvent.eventId,
    actors:["player"],audience:{visibility:"group",npcIds:state.npcs.map(n=>n.id)},evidenceIds:[coreEvent.eventId,p.receiptReviewEventId],metadata:{entryEpisodeVersion:ENTRY_EPISODE_VERSION}});
  if(!event) return false;entryEpisodeAdvance={token,eventId:event.eventId};state.isScenePlaying=true;updateWorldActivityClasses();
  try {
    coreEvent.metadata.entryEpisode.status="player_accepted_handoff";p.handoffRequestedAt=new Date().toISOString();
    const completed=await completeCommittedCoreDecision(coreEvent,p.pendingContinuation.decision,p.pendingContinuation.window);
    if(completed===false){SocialEvoCore.transitionEvent(event,"validated",{});SocialEvoCore.transitionEvent(event,"committed",{npcIds:[]});return false;}
    if(event.sessionEpoch!==state.sessionEpoch||state.sessionClosed||state.apiFatalError) return false;
    SocialEvoCore.transitionEvent(event,"validated",{});SocialEvoCore.transitionEvent(event,"committed",{npcIds:[]});p.advancedAt=new Date().toISOString();return true;
  } catch(error) {failRuntimeEvent(event,error);if(!isStaleRequestError(error))stopForAgentFailure(error,"entry episode handoff");return false;}
  finally {releaseEventLock(event);if(entryEpisodeAdvance?.eventId===event.eventId)entryEpisodeAdvance=null;renderEntryEpisodeControls();}
}

function renderEntryEpisodeControls() {
  const panel=document.getElementById("ui-entry-episode");if(!panel) return;
  const p=entryEpisodeState(),zh=state.language==="zh",pending=entryEpisodeChoicePending();
  const hasOpeningQuestion=typeof openingQuestionIsCurrent==="function"&&openingQuestionIsCurrent()&&openingQuestionPending.deferred;
  const resuming=hasOpeningQuestion&&p.guide!=='offered'&&!pending;
  const offered=state.openingResponseAnswered&&((hasOpeningQuestion&&!openingQuestionPending.reminderDismissed)||(p.guide==="offered"&&!p.scopeReviewed)||pending);
  panel.hidden=!isEntryEpisodeStage()||!offered||!entryEpisodeSafeBoundary();
  document.getElementById("ui-entry-title").textContent=pending?(zh?"先把这次起步安排看清楚":"Review the starting arrangement"):resuming?(zh?'接着刚才的话题':'Pick up the conversation'):(zh?"第一次来，可以这样开始":"A place to start");
  document.getElementById("ui-entry-note").textContent=pending?entryEpisodeNextAction():resuming?(openingQuestionPending.requiresReply===false?(zh?'此前的交流保留在笔记里。你可以继续聊，也可以先探索；这不是必须回答的新问句。':'The earlier exchange is retained in Notes. Continue it or explore; this is not a required new answer.'):(zh?'刚才的问句还在。你可以接着回答，也可以先探索，稍后从笔记中接回。':'The earlier question is retained. Reply now, or explore and resume from Notes later.')):(zh?"这只是操作引导，可跳过。小组讨论前需看起步说明，但不要求聊够次数。":"You can skip this guide. Read the Starting scope note before the core discussion; no conversation count is required.");
  const scope=document.getElementById("ui-entry-scope");scope.textContent=pending?(zh?"查看起步记录":"Read the entry record"):(zh?"先看起步说明":"Read the Starting scope note");
  scope.hidden=resuming;document.getElementById('ui-entry-members').hidden=resuming;
  const answerOpening=document.getElementById("ui-entry-answer-opening");answerOpening.hidden=!hasOpeningQuestion;answerOpening.textContent=zh?`接着回答 ${openingQuestionPending?.npcName||""}`:`Continue replying to ${openingQuestionPending?.npcName||""}`;
  document.getElementById("ui-entry-members").textContent=zh?"找成员继续聊":"Talk with a member";
  const skip=document.getElementById("ui-entry-skip");skip.hidden=pending;skip.textContent=zh?"跳过引导，自由探索":"Skip guide and explore";
  const next=document.getElementById("ui-entry-next");next.hidden=!pending;next.disabled=!p.receiptViewedAt||Boolean(entryEpisodeAdvance);next.textContent=zh?"进入首次核查":"Begin the first review";
  syncMainlineActionRail();
}
function syncMainlineActionRail(){
 const rail=document.getElementById('ui-mainline-actions');if(!rail)return;
 const visible=[...rail.children].filter(n=>!n.hidden),story=visible.filter(n=>n.dataset.mainlinePersistent!=='true');
 rail.hidden=!visible.length;rail.setAttribute('aria-label',state.language==='zh'?'游戏行动与云端保存':'Game actions and cloud saving');
 const hud=document.getElementById('ui-mainline-hud'),toggle=document.getElementById('ui-mainline-toggle');if(!hud||!toggle)return;
 hud.classList.toggle('has-mainline-actions',Boolean(story.length));
 hud.dataset.actionsExpanded=String(mainlineHudExpanded);
 toggle.hidden=!story.length;toggle.setAttribute('aria-expanded',String(mainlineHudExpanded));
 const buttons=story.flatMap(n=>[...n.querySelectorAll('button')]).filter(n=>!n.hidden);
 const preferred=['ui-stage-key','ui-entry-next','ui-lab-bridge-retry','ui-stage-retry'];
 const next=preferred.map(id=>buttons.find(n=>n.id===id&&!n.disabled)).find(Boolean)||buttons.find(n=>!n.disabled)||buttons[0];
 const label=mainlineHudExpanded?(state.language==='zh'?'收起行动提示':'Hide next actions'):
   (state.language==='zh'?'下一步：':'Next: ')+(next?.textContent||(state.language==='zh'?'查看行动提示':'View actions'));
 if(toggle.textContent!==label)toggle.textContent=label;
}

function initializeEntryEpisodeControls() {
  const panel=document.createElement("section");panel.id="ui-entry-episode";panel.hidden=true;
  panel.innerHTML='<strong id="ui-entry-title"></strong><p id="ui-entry-note"></p><div><button id="ui-entry-answer-opening" type="button" hidden></button><button id="ui-entry-scope" type="button"></button><button id="ui-entry-members" type="button"></button><button id="ui-entry-skip" type="button"></button><button id="ui-entry-next" type="button" hidden></button></div>';
  document.getElementById("pixel-world").append(panel);
  document.getElementById("ui-entry-answer-opening").onclick=()=>resumeOpeningQuestion();
  document.getElementById("ui-entry-scope").onclick=()=>openEntryEpisodeWorkspace(entryEpisodeChoicePending());
  document.getElementById("ui-entry-members").onclick=()=>chooseEntryEpisodeGuide("members");
  document.getElementById("ui-entry-skip").onclick=()=>chooseEntryEpisodeGuide("skip");
  document.getElementById("ui-entry-next").onclick=advanceEntryEpisode;
  // Keep the original cards/handlers together inside the room. Normal flow
  // follows the goal's actual text height without measuring on movement frames.
  const world=document.getElementById('pixel-world'),hud=document.createElement('div');hud.id='ui-mainline-hud';
  const objective=document.getElementById('ui-objective');if(objective)hud.append(objective);
  const toggle=document.createElement('button');toggle.id='ui-mainline-toggle';toggle.type='button';toggle.hidden=true;
  toggle.setAttribute('aria-controls','ui-mainline-actions');toggle.setAttribute('aria-expanded','false');
  toggle.onclick=()=>{mainlineHudExpanded=!mainlineHudExpanded;syncMainlineActionRail();};hud.append(toggle);
  const rail=document.createElement('aside');rail.id='ui-mainline-actions';rail.hidden=true;hud.append(rail);world.append(hud);
  rail.append(panel);const stage=document.getElementById('ui-stage-entry');if(stage)rail.append(stage);
}
initializeEntryEpisodeControls();
