// Optional source-only semantic UI worker. No gameplay transaction or agent fallback.
const REPLY_OPTIONS_TIMEOUT_MS=10000;
const replyOptionsCache=new Map();
function replyOptionsSource(eventId,npcId,text){
 const e=state.eventLedger.find(e=>e.eventId===eventId),visibility=e?.audience?.visibility;
 if(!e||e.status!=='committed'||e.sessionEpoch!==state.sessionEpoch||e.metadata?.stageId!==currentStage()?.id||!['group','public','private'].includes(visibility)||!e.audience.npcIds?.includes(npcId)||!e.dialogueDeliveries?.some(d=>d.npcId===npcId&&d.status==='delivered'&&d.text===text)||state.sessionClosed||state.apiFatalError)return null;
 return {eventId,npcId,text,visibility,epoch:state.sessionEpoch,stageId:currentStage().id,language:state.language,key:JSON.stringify([state.sessionEpoch,currentStage().id,state.language,eventId,npcId,visibility,text])};
}
function replyOptionsSourceCurrent(s){return Boolean(s&&s.language===state.language&&s.epoch===state.sessionEpoch&&replyOptionsSource(s.eventId,s.npcId,s.text)?.key===s.key);}
function replyOptionsUiActive(s){
 if(!replyOptionsSourceCurrent(s)||state.activeEventLock&&state.activeEventLock.eventId!==s.eventId||state.dialogueAdvancePending)return false;
 const p=openingQuestionPending;
 if(!state.isScenePlaying&&p&&p.eventId===s.eventId&&p.npcId===s.npcId&&p.dialogue===s.text&&!p.deferred&&state.decisionPanelVisible&&(state.pendingDecision?.openingContinuation||state.pendingDecision?.publicContinuation))return true;
 if(privateConversationPendingIsCurrent()&&privateContinuationVisible&&privateConversationPending.event.eventId===s.eventId&&privateConversationPending.npcId===s.npcId)return true;
 const c=state.sideTalkContinuityContext;
 return Boolean(!state.isScenePlaying&&isSideTalkOpen()&&state.activeSideTalkNpcId===s.npcId&&c?.previousExchange?.eventId===s.eventId&&c.previousExchange.text===s.text&&!['new_topic','stage_bridge'].includes(c.mode));
}
function replyOptionsEntry(s){return s&&replyOptionsSourceCurrent(s)?replyOptionsCache.get(s.key):null;}
function replyOptionsRows(s){return replyOptionsEntry(s)?.result?.rows||[];}
function cancelInactiveReplyOptionsRequests(){window.setTimeout(()=>{for(const e of replyOptionsCache.values())if(e.status==='pending'&&!replyOptionsUiActive(e.source)){e.controller.abort('reply_view_closed');e.status='cancelled';}},0);}
function resetReplyOptionsRuntime(){for(const e of replyOptionsCache.values())e.controller?.abort('reply_session_reset');replyOptionsCache.clear();}
async function callReplyOptionsAgent(source,controller,deadlineAt){
 for(let attempt=0;attempt<2;attempt++){
  const remaining=deadlineAt-Date.now();if(remaining<=0||controller.signal.aborted)throw Error('Reply options cancelled or timed out.');
  const response=await fetchWithTimeout('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify(ReplyOptionsAgentCore.request(source.text,source.language))},remaining,{agentPurpose:'ui_reply_options',eventId:source.eventId,timeoutBudgetMs:remaining});
  if(!response.ok)throw Error(`Optional reply options HTTP ${response.status}`);
  const data=await response.json();
  try{return ReplyOptionsAgentCore.validate(JSON.parse(data.choices?.[0]?.message?.content||''),source.text,source.language);}
  catch(error){if(attempt||controller.signal.aborted)throw error;}
 }
}
function requestReplyOptions(s,{retry=false}={}){
 if(typeof gameRecoveryNetworkPaused==='function'&&gameRecoveryNetworkPaused('/api/chat'))return replyOptionsCache.get(s?.key);
 if(typeof gameRecoverySuppressAutomaticReplyOptions==='function'&&gameRecoverySuppressAutomaticReplyOptions(s,retry))return replyOptionsCache.get(s?.key);
 if(!replyOptionsUiActive(s))return;
 let entry=replyOptionsCache.get(s.key);
 if(entry&&entry.status!=='cancelled'&&!(retry&&entry.status==='error'))return entry;
 entry={source:s,status:'pending',result:null,controller:new AbortController(),deadlineAt:Date.now()+REPLY_OPTIONS_TIMEOUT_MS};replyOptionsCache.set(s.key,entry);
 while(replyOptionsCache.size>100){const key=[...replyOptionsCache].find(([k,e])=>k!==s.key&&e.status!=='pending')?.[0];if(!key)break;replyOptionsCache.delete(key);}
 let timer;
 const expiry=new Promise((_,reject)=>{timer=window.setTimeout(()=>{entry.controller.abort('reply_options_timeout');reject(Error('Reply options timeout.'));},REPLY_OPTIONS_TIMEOUT_MS);});
 Promise.race([Promise.resolve().then(()=>callReplyOptionsAgent(s,entry.controller,entry.deadlineAt)),expiry]).then(result=>{
  if(replyOptionsCache.get(s.key)!==entry||entry.controller.signal.aborted||!replyOptionsSourceCurrent(s))return;
  // Validate again at the shared UI boundary, even when a QA transport is replaced.
  entry.result=ReplyOptionsAgentCore.validate({kind:result.kind,questionQuote:result.questionQuote,options:result.rows.map(r=>({sourceQuote:r.sourceQuote,actionQuote:r.actionQuote,actor:r.actor}))},s.text,s.language);entry.status='ready';
 }).catch(()=>{if(replyOptionsCache.get(s.key)===entry&&entry.status==='pending')entry.status='error';}).finally(()=>{
  window.clearTimeout(timer);if(replyOptionsCache.get(s.key)===entry&&replyOptionsUiActive(s))refreshReplyOptionsUi(s);
 });
 return entry;
}
function replyOptionsStatus(node,s){
 if(!node)return;node.replaceChildren();node.setAttribute('role','status');const e=replyOptionsEntry(s),zh=state.language==='zh';
 node.hidden=!e||e.status==='ready';if(node.hidden)return;
 node.textContent=e.status==='pending'?(zh?'正在整理对方给出的选项；你也可以直接输入或先离开。':'Preparing the offered replies; you can type or leave now.'):(zh?'选项暂时不可用，你仍可以直接回答。':'Reply options are unavailable; you can still answer directly.');
 if(e.status==='error'){const b=document.createElement('button');b.type='button';b.textContent=zh?'重试选项':'Retry options';b.dataset.retryReplyOptions='true';b.onclick=()=>{requestReplyOptions(s,{retry:true});refreshReplyOptionsUi(s);};node.append(b);}
}
function refreshReplyOptionsUi(s){
 if(!replyOptionsUiActive(s))return;
 if(openingQuestionPending?.eventId===s.eventId&&state.decisionPanelVisible){installOpeningReplyOptions(s);return;}
 if(isSideTalkOpen()&&state.activeSideTalkNpcId===s.npcId){renderSideTalkBranchReplies(state.npcs.find(n=>n.id===s.npcId));return;}
 if(privateContinuationVisible)renderPrivateConversationControls();
}
function installOpeningReplyOptions(s){
 const p=openingQuestionPending,w=state.pendingDecision;
 if(!p||p.eventId!==s.eventId||p.npcId!==s.npcId||!replyOptionsUiActive(s)||!w)return;
 const rows=replyOptionsRows(s),entry=replyOptionsEntry(s);
 if(entry?.status==='ready'&&w.replyOptionsCacheKey!==s.key){
  const free=document.getElementById('free-response'),editor=document.getElementById('ui-response-editor');
  const custom=Boolean(free.value||playerOwnDraft||p.customEditor||p.replyEditorTouched);
  p.requiresReply=entry.result.kind!=='none';
  // A statement/aside may have passed the cheap invitation heuristic. Once
  // the source-only worker resolves it as none, retain it as OPTIONAL context,
  // not a compulsory new question. Never erase a draft already being written.
  if(!p.requiresReply&&!custom){p.reminderDismissed=true;if(deferOpeningQuestion()){p.reminderDismissed=true;return;}}
  w.options=rows.map(r=>r.label);w.optionMeta=rows.map((r,i)=>({id:`reply-branch-${i}`,utterance:r.utterance,sourceQuote:r.sourceQuote}));w.replyOptionsCacheKey=s.key;
  renderOptions(w.options);
  if(rows.length&&!custom){editor.hidden=true;document.getElementById('decision-options').hidden=false;document.getElementById('ui-own-reply').hidden=false;document.querySelector('#decision-options .option-btn')?.focus({preventScroll:true});}
  renderOpeningQuestionControls();syncDecisionSubmitButton();
 }
  replyOptionsStatus(document.getElementById('ui-reply-options-status'),s);
}
