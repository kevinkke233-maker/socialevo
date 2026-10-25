// Read an already committed, validated submission. Never grade or call an Agent.
let savedArtifactPlaybackOwner=null;
function savedArtifactPlaybackAutomaticWorkPaused(event){return Boolean(savedArtifactPlaybackOwner?.event===event);}
function savedArtifactPlaybackFailure(message){
 const error=Error('Saved submission playback cannot resume: '+message);error.code='artifact_playback_unavailable';return error;
}
function savedArtifactPlaybackProof(event){
 const fail=message=>{throw savedArtifactPlaybackFailure(message);},hash=SocialEvoCore.stableHash;
 if(!event||state.eventLedger.filter(e=>e.eventId===event.eventId).length!==1||state.eventLedger.find(e=>e.eventId===event.eventId)!==event||
  event.type!=='artifact_submission'||event.status!=='committed'||!event.commit||event.sessionId!==state.sessionId||event.sessionEpoch!==state.sessionEpoch||
  event.metadata?.stageId!==currentStage()?.id||event.audience?.visibility!=='group')fail('the committed source belongs to another step.');
 const records=state.submittedArtifacts.filter(a=>a.sourceEventId===event.eventId&&a.id===event.metadata.artifactId);
 if(records.length!==1)fail('the original graded version is missing.');
 const artifact=records[0],m=event.metadata,deliveries=event.dialogueDeliveries;
 if(!['accepted','needs_revision','rejected'].includes(artifact.status)||artifact.sourceTaskId!==m.sourceTaskId||artifact.note!==m.playerNote||
  artifact.selectedOption!==m.selectedOptionLabel||artifact.optionAction!==m.selectedOptionAction||!Array.isArray(deliveries)||deliveries.length!==2)fail('the submitted version or delivery schedule changed.');
 const player=deliveries.find(d=>d.channel==='artifact_player_action'),reply=deliveries.find(d=>d.channel==='artifact_evaluation');
 const npc=reply&&state.npcs.find(n=>n.id===reply.npcId);
 if(!player||!reply||player===reply||player.npcId||player.speaker!=='You'||player.text!==(m.selectedOptionAction||m.selectedOptionLabel)||
  !npc||reply.speaker!==npc.name||reply.text!==artifact.npcDialogue||!reply.text.trim()||artifact.targetNpc!==npc.name||!event.commit.npcIds?.includes(npc.id)||
  !event.actors?.includes(npc.id)||!event.audience.npcIds?.includes(npc.id)||
  player.deliveryId!==event.eventId+'-player-artifact'||reply.deliveryId!==event.eventId+'-npc-'+npc.id||
  !deliveries.every(d=>['generated','delivered'].includes(d.status))||reply.status==='delivered'&&player.status!=='delivered')fail('the cached reply does not match its actual speaker and source.');
 const score=artifact.hiddenScoreReport,scoreRows=state.artifactScoreReports.filter(r=>r.artifactId===artifact.id&&r.sourceTaskId===artifact.sourceTaskId);
 if(!score||scoreRows.length!==1||hash(scoreRows[0].report)!==hash(score)||score.safetyReview?.action!=='allow'||
  !Number.isFinite(score.overallScore)||score.overallScore<0||score.overallScore>100||
  !['taskQuality','reasoningQuality','responsibilityHandling','socialRisk','contributionVisibility'].every(k=>Number.isFinite(score.dimensions?.[k])&&score.dimensions[k]>=0&&score.dimensions[k]<=100))fail('the original score is incomplete.');
 const scope=m.feedbackScopeChecks?.at(-1),input=scope?.input,candidate=input?.candidate;
 if(!scope||scope.version!==LabArtifactScopeQaCore.VERSION||scope.decision!=='supported'||scope.sourceEventId!==event.eventId||scope.sessionEpoch!==state.sessionEpoch||
  scope.speakerId!==npc.id||input?.publicDeliveredContext?.recipientId!==npc.id||scope.candidateStatus!==artifact.status||candidate?.status!==artifact.status||candidate?.dialogue!==reply.text||
  input.task?.id!==artifact.sourceTaskId||input.actualNote!==artifact.note||input.selectedAction!==player.text||
  input.independentCalibration?.summary!==score.summaryForNpc||hash(input.independentCalibration?.riskFlags)!==hash(score.riskFlags))fail('the original feedback-scope approval is missing.');
 const source={...input};delete source.candidate;
 if(Object.hasOwn(input,'currentProjectDelivery')!==(typeof scope.policyText==='string'&&scope.policyText.includes('[LAB_ARTIFACT_PROJECT_DELIVERY_SOURCE_V1]')))fail('the original project-delivery source marker changed.');
 if(Object.hasOwn(input,'currentProjectDelivery')&&hash(input.currentProjectDelivery)!==hash(artifactProjectDeliveryContext(event.eventId,scope.speakerId,event.sessionEpoch)))fail('the original project-delivery source changed.');
 const references=LabArtifactScopeQaCore.input(input),normalized=LabArtifactScopeQaCore.normalize({assessment:scope.assessment,clauses:scope.clauses,violations:scope.violations},{input:scope.scopeReferences});
 if(scope.candidateHash!==hash(candidate)||scope.sourceHash!==hash(source)||scope.inputHash!==hash(input)||
  scope.referencesHash!==hash(input.scopeReferences)||hash(scope.scopeReferences)!==hash(references)||hash(scope.scopeReferences)!==hash(input.scopeReferences)||
  typeof scope.policyText!=='string'||scope.policyHash!==hash(scope.policyText)||normalized.decision!=='supported')fail('feedback-scope sources or approval were changed.');
 const qa=m.narrativeDialogueQaChecks?.filter(r=>r.npcId===npc.id&&r.candidateHash===hash(reply.text)).at(-1);
 if(!qa||qa.version!==LabDialogueRubricCore.VERSION||qa.supported!==true||!qa.sourceHash||qa.violations?.length!==0||
  !Array.isArray(qa.checks)||qa.checks.length!==LabDialogueRubricCore.CHECK_IDS.length||
  new Set(qa.checks.map(r=>r.id)).size!==LabDialogueRubricCore.CHECK_IDS.length||
  !qa.checks.every(r=>LabDialogueRubricCore.CHECK_IDS.includes(r.id)&&r.passed===true&&typeof r.reason==='string'&&r.reason.trim()&&typeof r.quote==='string'&&(!r.quote||reply.text.includes(r.quote))))fail('the original whole-dialogue approval is incomplete.');
 const world=m.worldEvidenceScopeChecks?.filter(r=>r.speakerId===npc.id&&r.candidateHash===hash(reply.text)).at(-1),wi=world?.input;
 if(!world||world.version!==LabWorldEvidenceQaCore.VERSION||world.supported!==true||world.violations?.length!==0||wi?.candidate!==reply.text||
  wi.speaker?.id!==npc.id||wi.speaker?.name!==npc.name||wi.speaker?.audience!=='public'||
  world.sourceHash!==hash(wi.evidence)||world.actorHash!==hash(wi.speaker)||world.inputHash!==hash(wi))fail('the original world-evidence approval is incomplete.');
 LabWorldEvidenceQaCore.normalize({supported:world.supported,violations:world.violations},{candidate:reply.text});
 const written=m.writtenWorkScopeChecks?.filter(r=>r.npcId===npc.id&&r.candidateHash===hash(reply.text)).at(-1);
 if(!written||written.version!==LabWrittenWorkQaCore.VERSION||written.supported!==true||written.violations?.length!==0||
  written.sourceHash!==hash(written.sourceDocuments)||written.contextHash!==hash(written.replyTo||null)||
  !written.sourceDocuments?.some(d=>d.documentId===artifact.id&&d.taskId===artifact.sourceTaskId&&d.note===artifact.note&&d.selectedApproach?.intent===player.text)||
  written.input&&(written.inputHash!==hash(written.input)||written.input.candidate!==reply.text||hash(written.input.sourceDocuments)!==written.sourceHash))fail('the original written-work approval is incomplete.');
 LabWrittenWorkQaCore.normalize({supported:written.supported,violations:written.violations},{candidate:reply.text,sourceDocuments:written.sourceDocuments});
 if(artifact.projectReportVersion){
  const version=state.projectWorkflow?.versions.find(v=>v.versionId===artifact.projectReportVersion);
  if(!version||version.epoch!==state.sessionEpoch||m.projectReportVersion!==version.versionId||version.artifactId!==artifact.id||version.sourceEventId!==event.eventId||version.taskId!==artifact.sourceTaskId||version.body!==artifact.note||version.status!==artifact.status||version.feedbackText!==reply.text||
   !Array.isArray(version.sections)||LabProjectWorkflowCore.body(version.sections)!==version.body||LabProjectWorkflowCore.hash(version.body)!==version.bodyHash||
   artifact.projectReportSections&&hash(artifact.projectReportSections)!==hash(version.sections))fail('the reviewed report version is missing.');
 }
 return {event,artifact,npc,player,reply,proofHash:hash({eventId:event.eventId,artifactId:artifact.id,player:player.text,reply:reply.text,score,
  scopeHash:scope.inputHash,qaHash:hash(qa),worldHash:world.inputHash,writtenHash:hash(written)})};
}
function restoreSavedArtifactPlayback(source,interrupted={}){
 savedArtifactPlaybackOwner=null;
 if(state.finalOutcome||state.sessionClosed)return null;
 const events=state.eventLedger.filter(e=>e.type==='artifact_submission'&&e.status==='committed'&&e.sessionEpoch===state.sessionEpoch&&e.metadata?.stageId===currentStage()?.id);
 const event=events.at(-1);if(!event)return null;
 const replies=(event.dialogueDeliveries||[]).filter(d=>d.channel==='artifact_evaluation');
 const saved=event.metadata.artifactPlayback,last=state.dialogueHistory.at(-1),reply=replies[0];
 if(saved){
  const player=(event.dialogueDeliveries||[]).find(d=>d.channel==='artifact_player_action');
  if(saved.version!=='artifact-playback-v1'||saved.playerDeliveryId!==player?.deliveryId||saved.npcDeliveryId!==reply?.deliveryId||
   !['player','npc','complete'].includes(saved.phase)||Boolean(saved.feedbackReadAt)!==(saved.phase==='complete')||
   saved.feedbackReadAt&&(!saved.playerReadAt||!Number.isFinite(Date.parse(saved.feedbackReadAt))||reply?.status!=='delivered'||player?.status!=='delivered')||
   saved.playerReadAt&&(!Number.isFinite(Date.parse(saved.playerReadAt))||player?.status!=='delivered'))throw savedArtifactPlaybackFailure('the saved read position changed.');
 }
 const oldRead=reply?.status==='delivered'&&!saved?.feedbackReadAt&&interrupted.runtimeFlags?.includes('dialogueAdvancePending')&&
  last?.name===reply.speaker&&last?.text===reply.text&&(!last.eventId||last.eventId===event.eventId)&&
  (!interrupted.activeEventId||interrupted.activeEventId===event.eventId);
 const unfinished=replies.length!==1||reply.status!=='delivered'||saved?.phase==='player'||saved?.phase==='npc'||oldRead;
 if(!unfinished||saved?.feedbackReadAt)return null;
 const proof=savedArtifactPlaybackProof(event);
 const phase=reply.status==='generated'?'player':'npc';
 savedArtifactPlaybackOwner={...proof,phase,sessionId:state.sessionId,epoch:state.sessionEpoch,stageId:currentStage().id,busy:false};
 return {eventId:event.eventId,phase,automaticRetry:false};
}
async function resumeSavedArtifactPlayback(){
 const owner=savedArtifactPlaybackOwner;if(!owner||owner.busy)return false;
 const current=()=>savedArtifactPlaybackOwner===owner&&owner.sessionId===state.sessionId&&owner.epoch===state.sessionEpoch&&owner.stageId===currentStage()?.id&&!state.sessionClosed&&!state.finalOutcome&&!state.apiFatalError;
 const check=()=>{if(!current()||savedArtifactPlaybackProof(owner.event).proofHash!==owner.proofHash)throw savedArtifactPlaybackFailure('the saved source changed while reading.');};
 const save=()=>{if(typeof studyPairMarkCheckpointDirty==='function')studyPairMarkCheckpointDirty('saved_submission_read',{saveSoon:true});};
 const show=async(delivery,phase)=>{
  check();owner.event.metadata.artifactPlayback={version:'artifact-playback-v1',playerDeliveryId:owner.player.deliveryId,npcDeliveryId:owner.reply.deliveryId,
   ...(owner.event.metadata.artifactPlayback||{}),phase,recovered:true};
  if(delivery.status==='delivered')showGalgameDialogue(delivery.speaker,delivery.text,phase==='player'?'decisive':owner.artifact.npcEmotion,phase==='player'?'workspace action':owner.artifact.npcTone);
  else{
   addDialogue(delivery.speaker,phase==='player'?'#222831':owner.npc.color,delivery.text,phase==='player'?'decisive':owner.artifact.npcEmotion,phase==='player'?'workspace action':owner.artifact.npcTone,
    {eventId:owner.event.eventId,channel:delivery.channel,recoveryTextOnly:true});
   SocialEvoCore.markDialogueDelivered(owner.event,{deliveryId:delivery.deliveryId});
  }
  save();await waitForDialogueAdvance(delivery.text,phase==='player'?'playerDecision':'artifactEvaluation');check();
  owner.event.metadata.artifactPlayback[phase==='player'?'playerReadAt':'feedbackReadAt']=new Date().toISOString();save();
 };
 owner.busy=true;
 try{
  check();if(state.activeEventLock||state.dialogueAdvancePending||state.isScenePlaying)throw savedArtifactPlaybackFailure('another interaction is active.');
  closeBackpack();state.decisionPanelVisible=false;setDecisionPanelVisible(false);state.isScenePlaying=true;updateWorldActivityClasses();
  if(owner.phase==='player'&&!owner.event.metadata.artifactPlayback?.playerReadAt)await show(owner.player,'player');
  await show(owner.reply,'npc');
  owner.event.metadata.artifactPlayback.phase='complete';
  if(!labClockHasSource(owner.event.eventId))labClock().errors[owner.event.eventId]=state.language==='zh'?'已恢复并读完原反馈。请手动重试这段工作的耗时判断。':'The saved feedback has been read. Retry this work-time check explicitly.';
  state.isScenePlaying=false;savedArtifactPlaybackOwner=null;
  if(typeof openingReplyInvitesAnswer==='function'&&openingReplyInvitesAnswer(owner.reply.text,owner.npc.id)){
   openingQuestionPending={kind:'public',npcId:owner.npc.id,npcName:owner.npc.name,dialogue:owner.reply.text,eventId:owner.event.eventId,rootEventId:owner.event.rootEventId||owner.event.eventId,epoch:owner.epoch,stageId:owner.stageId,draft:'',deferred:true};
   owner.event.metadata.publicQuestionOfferedAt ||= new Date().toISOString();
   const source=typeof replyOptionsSource==='function'?replyOptionsSource(owner.event.eventId,owner.npc.id,owner.reply.text):null;
   if(source&&typeof gameRecoveryRuntime!=='undefined')gameRecoveryRuntime.suppressedReplyKeys.add(source.key);
  }
  save();renderPlayerExperience();updateWorldActivityClasses();return true;
 }finally{owner.busy=false;if(current()){state.isScenePlaying=false;updateWorldActivityClasses();}}
}
