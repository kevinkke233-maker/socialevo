// The narrative week is presentation time; it never changes the work clock.
let projectOutcomeTransition=null;
function projectOutcomeEvent(){
 if(typeof projectWorkflowEnabled!=='function'||!projectWorkflowEnabled())return null;
 const submission=projectFormalSubmission();if(!submission)return null;
 return state.eventLedger.find(e=>e.type==='competition_result'&&e.status==='committed'&&e.sessionEpoch===state.sessionEpoch&&e.audience?.visibility==='group'&&e.metadata?.submissionEventId===submission.sourceEventId&&e.metadata?.reportVersionId===submission.reportVersionId&&e.dialogueDeliveries?.some(d=>d.channel==='competition_result'&&d.status==='delivered'&&d.speaker==='Game Master'))||null;
}
function projectOutcomeReceipt(){
 const e=projectOutcomeEvent();if(!e?.metadata.readCompletedAt)return null;
 const d=e.dialogueDeliveries.find(d=>d.channel==='competition_result'&&d.status==='delivered');
 return {sourceEventId:e.eventId,submissionEventId:e.metadata.submissionEventId,reportVersionId:e.metadata.reportVersionId,resultId:e.metadata.resultId,resultType:e.metadata.resultType,narrativeDaysLater:7,text:d.text,readCompletedAt:e.metadata.readCompletedAt};
}
function onProjectFormallySubmitted(){
 if(typeof refreshGameHud==='function')refreshGameHud();
 // A formal receipt has no NPC speech or work-time charge, so the normal
 // timing observer cannot trigger this content-readiness refresh for it.
 if(typeof scheduleStageProgressCheck==='function')void scheduleStageProgressCheck('actual formal project submission');
}
function resetProjectOutcomeRuntime(){
 const owner=projectOutcomeTransition;projectOutcomeTransition=null;document.getElementById('ui-project-outcome')?.setAttribute('hidden','');
 if(owner)owner.resolve(false);
}
function presentProjectOutcomeTransition(){
 if(typeof projectWorkflowEnabled!=='function'||!projectWorkflowEnabled()||currentStage()?.id!=='stage_4_credit')return Promise.resolve(true);
 if(projectOutcomeReceipt())return Promise.resolve(true);
 if(projectOutcomeTransition)return projectOutcomeTransition.promise;
 const submission=projectFormalSubmission();if(!submission)throw Error('The credit stage requires an actual formal report submission.');
 const result=LabProjectOutcomeCore.resultFor(submission,state.language),owner={epoch:state.sessionEpoch,phase:'week',result,promise:null,resolve:null};
 owner.promise=new Promise(resolve=>{owner.resolve=resolve;});projectOutcomeTransition=owner;
 state.isScenePlaying=true;hideGalgameDialogue();updateWorldActivityClasses();
 const panel=document.getElementById('ui-project-outcome'),zh=state.language==='zh';
 panel.hidden=false;panel.dataset.phase='week';document.getElementById('ui-project-outcome-title').textContent=zh?'一周后':'One week later';
 document.getElementById('ui-project-outcome-text').textContent=zh?'竞赛结果公布了。你回到实验室，大家也正准备查看。':'The competition results are out. Back at the lab, the team is about to read them.';
 const button=document.getElementById('ui-project-outcome-continue');button.textContent=zh?'查看竞赛结果':'Read the competition result';button.focus();return owner.promise;
}
function advanceProjectOutcomeTransition(){
 const owner=projectOutcomeTransition;if(!owner||owner.epoch!==state.sessionEpoch||state.sessionClosed||state.apiFatalError)return false;
 const panel=document.getElementById('ui-project-outcome'),button=document.getElementById('ui-project-outcome-continue');
 if(owner.phase==='week'){
  const submission=projectFormalSubmission();if(!submission)return false;
  let event=projectOutcomeEvent();
  if(!event){
   event=createRuntimeEvent('competition_result',{actors:['controller'],audience:{visibility:'group',npcIds:state.npcs.map(n=>n.id)},evidenceIds:[submission.sourceEventId],metadata:{projectId:currentScenario().projectWorkflow.id,...owner.result,simulationAuthored:true}});
   const deliveryId=`${event.eventId}-result`;SocialEvoCore.recordDialogueGenerated(event,{deliveryId,speaker:'Game Master',text:owner.result.text,channel:'competition_result'});SocialEvoCore.markDialogueDelivered(event,{deliveryId});
   SocialEvoCore.transitionEvent(event,'validated',{});SocialEvoCore.transitionEvent(event,'committed',{npcIds:[]});
   addSystemMessage('Game Master',owner.result.text,'project result','notification',{eventId:event.eventId,channel:'competition_result'});
   state.log.push({type:'Competition result presented',sourceEventId:event.eventId,submissionEventId:submission.sourceEventId,resultType:owner.result.resultType,narrativeDaysLater:7,workClockUnchanged:labClock().elapsedMinutes,timestamp:new Date().toISOString()});
  }
  owner.eventId=event.eventId;owner.phase='result';panel.dataset.phase='result';document.getElementById('ui-project-outcome-title').textContent=owner.result.title;document.getElementById('ui-project-outcome-text').textContent=owner.result.text;button.textContent=state.language==='zh'?'回到实验室，讨论贡献':'Return to the lab and discuss credit';button.focus();return true;
 }
 const event=projectOutcomeEvent();if(!event||event.eventId!==owner.eventId)return false;
 event.metadata.readCompletedAt=new Date().toISOString();projectOutcomeTransition=null;panel.hidden=true;owner.resolve(true);return true;
}
(function initializeProjectOutcome(){
 const panel=document.createElement('section');panel.id='ui-project-outcome';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-labelledby','ui-project-outcome-title');
 panel.innerHTML='<div class="project-outcome-card"><h2 id="ui-project-outcome-title"></h2><p id="ui-project-outcome-text"></p><button id="ui-project-outcome-continue" type="button"></button></div>';document.getElementById('pixel-world').append(panel);document.getElementById('ui-project-outcome-continue').onclick=advanceProjectOutcomeTransition;
 document.addEventListener('keydown',e=>{if(typeof gameRecoveryNetworkPaused==='function'&&gameRecoveryNetworkPaused('/api/chat'))return;if(!projectOutcomeTransition)return;if(['Enter',' ','Escape'].includes(e.key)){e.preventDefault();e.stopImmediatePropagation();advanceProjectOutcomeTransition();}else if(e.key==='Tab'){e.preventDefault();e.stopImmediatePropagation();document.getElementById('ui-project-outcome-continue').focus();}else{e.preventDefault();e.stopImmediatePropagation();}},true);
})();
