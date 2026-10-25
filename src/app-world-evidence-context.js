// Pure context collection. The caller must honor schemaGaps before model I/O.
const LAB_WORLD_EVIDENCE_CONTEXT_VERSION='lab-world-evidence-context-v1';
function labWorldEvidenceAvailability(materialCount,submissionCount,materials=[],projectDelivery=null,creditRecord=null){
 if(!Number.isInteger(materialCount)||materialCount<0||!Number.isInteger(submissionCount)||submissionCount<0)throw new TypeError('Evidence availability requires actual material/submission counts.');
 if(typeof labProjectEvidenceEnabled==='function'&&labProjectEvidenceEnabled()){
  const project=currentScenario().projectWorkflow,dataPresent=materials.some(d=>d.documentId===project.dataDocumentId),editable=[1,2].includes(state.stageIndex)&&!state.projectWorkflow?.formalSubmission;
  const readResult=projectDelivery?.competitionResult&&typeof projectOutcomeReceipt==='function'?projectOutcomeReceipt():null;
  const creditReady=state.stageIndex>=3&&Boolean(projectDelivery?.formalSubmission&&projectDelivery.competitionResult&&readResult?.sourceEventId===projectDelivery.competitionResult.eventId);
  const creditEditable=creditReady&&!creditRecord?.closed;
  // Public capability context must not disclose whether an unsent private
  // draft happens to match the accepted version. The real submit button owns
  // that exact-version check; an NPC can point to the published requirements.
  return {available:['actual supplied project material text, participant rows, columns and descriptive calculations exactly where present','exact complete submitted report versions and their actual review statuses','actual accessible delivered statements; a personal commitment is not collective agreement','actual shared-computer file identities and tabs; no unprovided folders'],
   notProvided:['additional unprovided participant data, external files, tests or measurements','causal intervention evidence, control-group or test-equivalence evidence unless actually supplied','another person\'s consent, an unrecorded report edit or an undelivered competition result'],
   tools:[{id:'read_supplied_shared_material',available:materialCount>0},{id:'read_supplied_paired_data',available:dataPresent},{id:'read_current_submitted_records',available:submissionCount>0},{id:'edit_current_project_report',available:editable},{id:'save_project_report_draft',available:editable},{id:'send_project_report_for_review',available:editable},{id:'read_project_submission_requirements',available:[1,2].includes(state.stageIndex)},{id:'read_published_credit_record',available:Boolean(creditRecord?.published)},{id:'edit_current_credit_record',available:creditEditable},{id:'save_credit_record_draft',available:creditEditable},{id:'publish_credit_record_proposal',available:creditEditable},{id:'automatic_document_write_from_spoken_agreement',available:false}]};
 }
 return {available:['supplied fixed original text and shared-computer material identities','exact current accessible submitted notes and their recorded statuses','actual accessible delivered statements; an individual promise establishes only that individual commitment','shared computer tabs Current/Materials/My notes/Submissions; B opens the computer; no folders supplied'],
  notProvided:['raw intake/analysis rows and IDs','complete analysis headers, verified missing-record counts and site breakdown','Figure2 plot values and verified mapping to current analysis rows'],
  tools:[{id:'read_supplied_shared_material',available:materialCount>0},{id:'read_current_submitted_records',available:submissionCount>0},{id:'raw_row_or_figure_mapping_lookup',available:false},{id:'automatic_document_write_from_spoken_agreement',available:false}]};
}
function labWorldEvidenceProjectResults(events,accessible){
 if(typeof labProjectEvidenceEnabled!=='function'||!labProjectEvidenceEnabled())return [];
 const project=currentScenario().projectWorkflow,results=[];
 for(const [index,event] of events.entries()){
  const m=event.metadata,notices=(event.dialogueDeliveries||[]).filter(d=>d.status==='delivered'&&d.channel==='competition_result'&&d.speaker==='Game Master'&&!d.npcId&&typeof d.text==='string'&&d.text.trim());
  if(event.type!=='competition_result'||event.status!=='committed'||event.sessionEpoch!==state.sessionEpoch||event.sessionId!==state.sessionId||!accessible(event)||m?.projectId!==project.id||m.simulationAuthored!==true||m.narrativeDaysLater!==7||!['award','showcase'].includes(m.resultType)||typeof m.resultId!=='string'||!m.resultId||typeof m.reportVersionId!=='string'||!m.reportVersionId||notices.length!==1)continue;
  const submission=events.slice(0,index).find(e=>e.eventId===m.submissionEventId&&e.type==='project_submission'&&e.status==='committed'&&e.sessionId===event.sessionId&&e.sessionEpoch===event.sessionEpoch&&accessible(e)&&e.metadata?.projectId===m.projectId&&e.metadata.reportVersionId===m.reportVersionId);
  if(!submission)continue;
  results.push({eventId:event.eventId,projectId:m.projectId,submissionEventId:submission.eventId,reportVersionId:m.reportVersionId,resultId:m.resultId,resultType:m.resultType,narrativeDaysLater:m.narrativeDaysLater,simulationAuthored:true,text:notices[0].text});
 }
 return results;
}
// Controller-owned public delivery facts, not a player's private editor state.
// A receipt after the current owner is future evidence and is never projected.
function labCurrentProjectDeliveryContext({eventId=state.activeEventLock?.eventId||'',npcId='controller',epoch=state.sessionEpoch}={}){
 if(epoch!==state.sessionEpoch)throw new StaleSessionError();
 if(typeof labProjectEvidenceEnabled!=='function'||!labProjectEvidenceEnabled()||!state.projectWorkflow?.formalSubmission||
  npcId!=='controller'&&!state.npcs.some(n=>n.id===npcId))return null;
 const ledger=state.eventLedger||[],owners=eventId?ledger.filter(e=>e.eventId===eventId):[];
 if(eventId&&(owners.length!==1||owners[0].sessionEpoch!==epoch||owners[0].sessionId!==state.sessionId))return null;
 const prefix=ledger.slice(0,eventId?ledger.indexOf(owners[0]):ledger.length).filter(e=>e.sessionEpoch===epoch&&e.sessionId===state.sessionId&&e.status==='committed');
 const accessible=e=>e.audience?.visibility==='public'||e.audience?.visibility==='group'&&(npcId==='controller'||e.audience.npcIds?.includes(npcId));
 const formal=typeof projectFormalSubmission==='function'?projectFormalSubmission():null;
 const matches=formal?prefix.filter(e=>e.eventId===formal.sourceEventId&&e.type==='project_submission'&&accessible(e)):[];
 if(matches.length!==1)return null;
 const f={eventId:formal.sourceEventId,sourceEventId:formal.sourceEventId,projectId:formal.projectId,reportVersionId:formal.reportVersionId,
  sourceReviewEventId:formal.sourceReviewEventId,artifactId:formal.artifactId,bodyHash:formal.bodyHash,submittedAtMinutes:formal.submittedAtMinutes,
  submittedAtDay:formal.submittedAtDay,submittedOnTime:formal.submittedOnTime,status:formal.status};
 const result=labWorldEvidenceProjectResults(prefix,accessible).filter(r=>r.submissionEventId===f.eventId&&r.projectId===f.projectId&&r.reportVersionId===f.reportVersionId).at(-1);
 if(result&&result.resultType!==(f.submittedOnTime?'award':'showcase'))throw new TypeError('Competition result differs from the authored submission-time policy.');
 const value={version:'lab-project-delivery-context-v1',projectId:f.projectId,formalSubmission:f,competitionResult:result?{...result,sourceEventId:result.eventId}:null};
 const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};return freeze(value);
}
function labWorldEvidenceCreditRecord(projectDelivery,events,accessible){
 if(!projectDelivery?.competitionResult||!state.creditWorkflow)return null;
 const sources={...creditWorkflowSources(),events},context=LabCreditWorkflowCore.context(state.creditWorkflow,sources),p=context.published;
 if(p){const event=events.find(e=>e.eventId===p.proposalId&&accessible(e));
  if(!event||JSON.stringify(event.metadata?.proposal)!==JSON.stringify(p)||LabCreditWorkflowCore.hash(p.entries)!==p.bodyHash)throw new TypeError('Published credit record differs from its actual public proposal.');}
 if(state.creditWorkflow.closed&&events.some(e=>e.eventId===state.creditWorkflow.closed.eventId)&&!context.closed)throw new TypeError('Credit close is not bound to the actual public record.');
 return {projectId:projectDelivery.projectId,published:p?{proposalId:p.proposalId,revision:p.revision,bodyHash:p.bodyHash,entries:JSON.parse(JSON.stringify(p.entries))}:null,
  closed:context.closed?{eventId:context.closed.eventId,proposalId:context.closed.proposalId}:null};
}
// This separate speech catalog never supplies task criteria or note/action contents.
// The artifact owner's creation time and ledger position freeze its causal prefix.
function labArtifactPublicDeliveredContext({beforeEventId,recipientId,epoch=state.sessionEpoch}={}){
 const gap=()=>{const error=Error('The prior public delivery source remains unconfirmed.');error.code='artifact_feedback_scope_uncertain';throw error;};
 if(epoch!==state.sessionEpoch)throw new StaleSessionError();
 const ledger=state.eventLedger,roster=state.npcs;
 if(!Array.isArray(ledger)||!Array.isArray(roster)||typeof state.sessionId!=='string'||!state.sessionId||!Number.isInteger(epoch))return gap();
 const recipients=roster.filter(n=>n.id===recipientId),owners=ledger.filter(e=>e.eventId===beforeEventId);
 if(recipients.length!==1||owners.length!==1)return gap();
 const owner=owners[0],cutoff=Date.parse(owner.timestamps?.createdAt);
 if(owner.sessionId!==state.sessionId||owner.sessionEpoch!==epoch||owner.type!=='artifact_submission'||!['pending','validated','committed'].includes(owner.status)||!owner.actors?.includes(recipientId)||!['public','group'].includes(owner.audience?.visibility)||!owner.audience.npcIds?.includes(recipientId)||!Number.isFinite(cutoff))return gap();
 const records=[],seen=new Set();
 for(const event of ledger.slice(0,ledger.indexOf(owner))){
  if(event.sessionId!==state.sessionId||event.sessionEpoch!==epoch||event.status!=='committed'||!['public','group'].includes(event.audience?.visibility))continue;
  const audience=event.audience.npcIds;
  if(!Array.isArray(audience)||new Set(audience).size!==audience.length||audience.some(id=>!roster.some(n=>n.id===id)))return gap();
  if(!audience.includes(recipientId))continue;
  const committedAt=Date.parse(event.timestamps?.committedAt);
  if(!Number.isFinite(committedAt))return gap();
  if(committedAt>cutoff)continue;
  if(typeof event.eventId!=='string'||!event.eventId||ledger.filter(e=>e.eventId===event.eventId).length!==1||!Array.isArray(event.dialogueDeliveries))return gap();
  for(const delivery of event.dialogueDeliveries){
   if(!delivery||!['generated','delivered'].includes(delivery.status))return gap();
   if(delivery.status!=='delivered')continue;
   if(delivery.speaker==='Game Master'&&!delivery.npcId)continue;
   const npc=roster.find(n=>n.id===delivery.npcId),player=!delivery.npcId&&delivery.speaker==='You';
   if(!player&&(!npc||delivery.speaker!==npc.name))return gap();
   const deliveredAt=Date.parse(delivery.deliveredAt);
   if(!Number.isFinite(deliveredAt))return gap();
   if(deliveredAt>cutoff)continue;
   const key=JSON.stringify([event.eventId,delivery.deliveryId]);
   if(typeof delivery.deliveryId!=='string'||!delivery.deliveryId||seen.has(key)||typeof delivery.text!=='string'||!delivery.text.trim())return gap();
   seen.add(key);
   records.push({sourceId:'public-speech-'+(records.length+1),eventId:event.eventId,deliveryId:delivery.deliveryId,speakerId:player?'player':npc.id,speakerName:delivery.speaker,text:delivery.text,deliveredAt:delivery.deliveredAt,visibility:event.audience.visibility,audienceNpcIds:[...audience]});
  }
 }
 const snapshot={version:'lab-artifact-public-delivered-context-v1',sessionId:state.sessionId,sessionEpoch:epoch,beforeEventId,recipientId,complete:true,scope:'committed_delivered_public_statements_before_artifact_submission',records};
 const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
 return freeze(snapshot);
}
function labMaterialAuthoredOverview(document){
 const brief=scenarioText(document.brief);
 return typeof brief==='string'&&brief.trim()?{sourceKind:'authored_material_overview',title:scenarioText(document.title),brief}:undefined;
}
function labWorldEvidenceAuthoredWorldFacts(){
 const scenario=currentScenario(),world=scenario.storyWorld?.[state.language]||scenario.storyWorld?.en;
 const operations=LabSocialWorldCore.IDS.map(npcId=>{
  const role=LabSocialWorldCore.forNpc(npcId,{language:state.language}),member=scenario.npcs?.find(n=>n.id===npcId);
  return role&&member?{npcId,name:member.name,...(role.publicIdentity?{publicIdentity:role.publicIdentity}:{}),responsibilities:role.ownResponsibilities,authorityBoundary:role.authorityBoundary}:null;
 });
 if(typeof world?.setting!=='string'||typeof scenarioText(scenario.playerRole)!=='string'||!operations.every(Boolean))throw new TypeError('Authored operational world source unavailable.');
 return {sourceKind:'authored_world_definition',setting:world.setting,playerRole:scenarioText(scenario.playerRole),npcOperations:operations,materialEvidenceLimits:labMaterialEvidenceLimits()};
}
function labWorldEvidenceMaterialNavigation(){
 return {sourceKind:'authored_material_navigation',scope:'current_shared_computer_original_materials',complete:true,
  openKey:'B',tabs:state.language==='zh'?['当前事项','材料包','我的笔记','提交记录']:['Current','Work pack','My notes','Submissions'],foldersProvided:false,
  documents:labMaterialNavigationCatalog().map(d=>({id:d.id,title:d.title,fileName:d.fileName,aliases:[...d.aliases],headings:[...d.headings]}))};
}
function labWorldEvidenceNarrativeAudit(){
 const clone=value=>JSON.parse(JSON.stringify(value));
 return {version:'lab-world-evidence-narrative-audit-v1',sessionId:state.sessionId,sessionEpoch:state.sessionEpoch,
  sourceCatalog:{materials:scenarioWorkspaceDocuments().map(d=>({documentId:d.id,title:scenarioText(d.title),knownByNpcIds:[...(d.knownByNpcIds||[])],sections:(d.sections||[]).map(s=>({heading:scenarioText(s.heading),body:scenarioText(s.body)})),...(labMaterialAuthoredOverview(d)?{overview:labMaterialAuthoredOverview(d)}:{})})),
   submissions:(state.submittedArtifacts||[]).map(a=>({sourceEventId:a.sourceEventId,id:a.id,sourceTaskId:a.sourceTaskId,title:a.title,status:a.status,note:a.note,selectedOption:a.selectedOption,optionAction:a.optionAction})),authoredWorldFacts:clone(labWorldEvidenceAuthoredWorldFacts()),materialNavigation:clone(labWorldEvidenceMaterialNavigation()),
   taskSourceDocuments:cloneScenarioWorkspaceDocuments().filter(document=>document.immutable).map(document=>({id:document.id,version:document.version||'',fileName:document.fileName||'',contentHash:document.contentHash||'',title:document.title,documentType:document.documentType,brief:document.brief,sections:clone(document.sections),linkedTaskIds:[...(document.linkedTaskIds||[])]})),
   taskDefinitions:(currentScenario().workspaceTaskTemplates||[]).map(template=>{
    const task=designedWorkspaceTaskPlan(template.id);
    if(!task)throw new TypeError('Authored task definition unavailable for audit.');
    return {taskId:template.sourceTaskId||template.id,title:task.title,criteria:[...task.criteria],brief:task.brief,answerKey:task.answerKey,rubric:task.rubric,targetNpcId:task.targetNpcId,sourceDocumentIds:[...task.sourceDocumentIds],options:task.options.map(option=>({id:option.id,action:option.action}))};
   })},
  gmTransitions:(state.log||[]).filter(l=>l.type==='World evidence controller transition delivered'&&l.sessionEpoch===state.sessionEpoch).map(l=>clone(l.transition)),
  checks:(state.log||[]).filter(l=>l.type==='World evidence scope checked without event'&&l.sessionEpoch===state.sessionEpoch).map(clone)};
}
function collectLabWorldEvidenceContext(candidate,npc,{eventId=state.activeEventLock?.eventId||'',epoch=state.sessionEpoch,context={},pendingSubmission=null,groupThreadEventId='',currentPlayerDelivery=null}={}){
 if(epoch!==state.sessionEpoch)throw new StaleSessionError();
 const speakerId=typeof npc==='string'?npc:npc?.id||'controller',actor=state.npcs.find(n=>n.id===speakerId);
 if(speakerId!=='controller'&&!actor)throw new TypeError('Unknown world-evidence speaker.');
 const audience=context.audience==='private'?'private':'public',speakerName=actor?.name||'Game Master';
 const ledger=state.eventLedger||[],current=eventId?ledger.find(e=>e.eventId===eventId&&e.sessionEpoch===epoch):null;
 if(eventId&&(!current||['failed','committed'].includes(current.status)))throw new TypeError('Current evidence owner must be a live event in this epoch.');
 const earlier=ledger.slice(0,current?ledger.indexOf(current):ledger.length).filter(e=>e.sessionEpoch===epoch&&e.status==='committed');
 const access=e=>({visibility:e.audience?.visibility,npcIds:[...(e.audience?.npcIds||[])]});
 const publicAccess=e=>e.audience?.visibility==='public'||e.audience?.visibility==='group'&&(speakerId==='controller'||e.audience.npcIds?.includes(speakerId));
 const privateAccess=e=>audience==='private'&&speakerId!=='controller'&&e.audience?.visibility==='private'&&e.audience.npcIds?.includes(speakerId);
 const usable=e=>publicAccess(e)||privateAccess(e);
 const schemaGaps=[];
 if(current&&!usable(current))throw new TypeError('Speaker has no access to the current evidence event.');
 const materialDefs=scenarioWorkspaceDocuments().filter(d=>speakerId==='controller'||d.knownByNpcIds?.includes(speakerId));
 const materials=materialDefs.map(d=>({documentId:d.id,title:scenarioText(d.title),sections:(d.sections||[]).map(s=>({heading:scenarioText(s.heading),body:scenarioText(s.body)})),...(labMaterialAuthoredOverview(d)?{overview:labMaterialAuthoredOverview(d)}:{})}));
 // Reuse the existing exact submission projection, restricted to the current
 // epoch, actual event prefix and this actor's public access. No draft reads.
 const latest=new Map(),publicEvents=earlier.filter(publicAccess);
 for(const r of LabReviewEpisodeCore.submissions({epoch,events:publicEvents,artifacts:state.submittedArtifacts||[]}))latest.set(r.taskId,{eventId:r.eventId,documentId:r.id,taskId:r.taskId,title:r.title,status:r.status,actualSubmittedNote:r.note,selectedApproach:r.action});
 if(pendingSubmission){
  const p=pendingSubmission,m=current?.metadata;
  const bound=typeof m?.playerNote==='string'&&typeof m.selectedOptionId==='string'&&m.selectedOptionId.length>0&&typeof m.selectedOptionAction==='string'&&typeof m.selectedOptionLabel==='string';
  const approach=bound?(m.selectedOptionAction||m.selectedOptionLabel):null;
  if(!current||current.type!=='artifact_submission'||p.eventId!==current.eventId||p.documentId!==m?.artifactId||p.taskId!==m?.sourceTaskId||p.status!=='pending_evaluation'||!bound||typeof p.actualSubmittedNote!=='string'||p.actualSubmittedNote!==m.playerNote||typeof p.selectedApproach!=='string'||p.selectedApproach!==approach)throw new TypeError('Pending override must match the current event exact submitted note and selected approach.');
  latest.set(p.taskId,{eventId:p.eventId,documentId:p.documentId,taskId:p.taskId,title:p.title,status:p.status,actualSubmittedNote:p.actualSubmittedNote,selectedApproach:p.selectedApproach});
 }
 const submissions=[...latest.values()],docIds=new Set([...materials.map(d=>d.documentId),...submissions.map(s=>s.documentId)]);
 const allWrites=earlier.filter(e=>e.type==='npc_workspace_write'&&docIds.has(e.metadata?.documentId));
 const writes={completeForDocumentIds:[...docIds].filter(id=>allWrites.filter(e=>e.metadata.documentId===id).every(usable)),
  receipts:allWrites.filter(usable).map(e=>({eventId:e.eventId,documentId:e.metadata.documentId,writerId:e.metadata.writerId,writtenFields:[...(e.metadata.writtenFields||[])],status:e.status,access:access(e)}))};
 // These are controller audit metadata, not NPC knowledge of reading. Preserve
 // private access exactly and never turn navigation into observable_reading.
 const reads=earlier.filter(e=>['shared_artifact_review','observable_reading'].includes(e.type)&&docIds.has(e.metadata?.documentId)).map(e=>({eventId:e.eventId,documentId:e.metadata.documentId,actorId:e.metadata.actorId||e.actors?.[0],kind:e.type==='shared_artifact_review'?'material_presented':'observable_reading',access:access(e)}));
 const statement=(e,d)=>({eventId:e.eventId,speakerId:d.npcId||d.actorId||(d.speaker==='You'?'player':d.speaker==='Game Master'?'controller':null),speakerName:d.speaker,text:d.text,visibility:e.audience.visibility,status:d.status,eventStatus:e.status});
 const publicClaims=earlier.filter(e=>publicAccess(e)&&e.type!=='story_anchor').flatMap(e=>(e.dialogueDeliveries||[]).filter(d=>d.status==='delivered').map(d=>statement(e,d)));
 const ownerPrivateClaims=earlier.filter(e=>privateAccess(e)&&e.type==='private_chat').flatMap(e=>(e.dialogueDeliveries||[]).filter(d=>d.status==='delivered'&&(!d.npcId||d.npcId===speakerId)).map(d=>({...statement(e,d),ownerNpcId:speakerId,npcIds:[...e.audience.npcIds]})));
 const currentWorkPresentation=[];
 if(current?.type==='artifact_submission'&&pendingSubmission){
  const target=current.actors?.includes(speakerId)&&state.npcs.some(n=>n.id===speakerId);
  if(target)currentWorkPresentation.push({sourceEventId:current.eventId,documentId:pendingSubmission.documentId,recipientId:speakerId,kind:'task_submission'});
 }
 if(current?.type==='story_anchor_step'){
  const spec=LabNarrativeCore.ANCHORS[current.metadata?.anchorId],resolved=typeof labAnchorSteps==='function'?labAnchorSteps(current.metadata?.anchorId,current):spec?.steps,
   step=resolved?.[current.metadata?.stepIndex];
  if(step?.npcId===speakerId&&current.actors?.includes(speakerId))for(const s of submissions){
   const presented=current.metadata.anchorId==='final_check'||spec.taskId===s.taskId&&current.metadata.artifactId===s.documentId;
   if(presented)currentWorkPresentation.push({sourceEventId:current.eventId,documentId:s.documentId,recipientId:speakerId,kind:'required_work_receipt'});
  }
 }
 let currentPlayerMessage=null;
 if(typeof context.currentPlayerMessage==='string'&&context.currentPlayerMessage.trim()){
  const text=context.currentPlayerMessage,heard=e=>(e?.dialogueDeliveries||[]).some(d=>d.status==='delivered'&&!d.npcId&&d.speaker==='You'&&d.text===text);
  const incoming=current?.metadata?.submittedPlayerInput;
  const submitted=Boolean(current?.status==='pending'&&current.actors?.includes('player')&&incoming&&
   Object.keys(incoming).sort().join(',')==='recipientIds,sourceEventId,sourceKind,speakerId,text,visibility'&&
   incoming.sourceEventId===current.eventId&&incoming.speakerId==='player'&&incoming.text===text&&
   ['opening_response','key_decision','npc_followup','private_chat'].includes(current.type)&&
   incoming.sourceKind===(current.type==='private_chat'?'side_talk_submit':'decision_submit')&&
   incoming.visibility===current.audience?.visibility&&Array.isArray(incoming.recipientIds)&&
   JSON.stringify(incoming.recipientIds)===JSON.stringify(current.audience?.npcIds||[])&&
   (current.type==='private_chat'?incoming.visibility==='private'&&incoming.recipientIds.length===1&&
    incoming.recipientIds[0]===speakerId&&current.metadata.targetNpcId===speakerId:incoming.visibility!=='private'));
  const named=currentPlayerDelivery&&earlier.find(e=>e.eventId===currentPlayerDelivery.eventId&&usable(e)),explicit=named?.dialogueDeliveries?.some(d=>d.deliveryId===currentPlayerDelivery.deliveryId&&d.status==='delivered'&&!d.npcId&&d.speaker==='You'&&d.text===text);
  const ref=current?.metadata?.sourcePlayerDelivery,prior=ref&&ledger.find(e=>e.eventId===ref.eventId&&e.sessionEpoch===epoch);
  const retained=prior&&ledger.indexOf(prior)<ledger.indexOf(current)&&prior.sessionId===current.sessionId&&prior.status==='failed'&&prior.type==='npc_followup'&&current?.type==='npc_followup'&&prior.rootEventId===current.rootEventId&&prior.parentEventId===current.parentEventId&&prior.metadata?.followupNpcId===speakerId&&current.metadata?.followupNpcId===speakerId&&prior.metadata?.followupQuestion===current.metadata?.followupQuestion&&!prior.metadata?.sourcePlayerDelivery&&usable(prior)&&prior.dialogueDeliveries?.some(d=>d.deliveryId===ref.deliveryId&&d.channel==='npc_followup_player'&&d.status==='delivered'&&!d.npcId&&d.speaker==='You'&&d.text===text);
  if(incoming&&!submitted)schemaGaps.push('current_submitted_player_input_receipt_does_not_match_event');
  else if(submitted||heard(current)||retained||explicit)currentPlayerMessage=text;
  else schemaGaps.push('current_player_message_not_bound_to_actual_submit_or_delivery');
 }
 const projectDelivery=labCurrentProjectDeliveryContext({eventId,npcId:speakerId,epoch});
 const creditRecord=labWorldEvidenceCreditRecord(projectDelivery,earlier,publicAccess);
 const availability=labWorldEvidenceAvailability(materials.length,submissions.length,materials,projectDelivery,creditRecord);
 const rawInput={candidate,speakerId,speakerName,audience,evidence:{materials,availability,submissions,currentWorkPresentation,writes,reads,publicClaims,ownerPrivateClaims,currentPlayerMessage,materialNavigation:labWorldEvidenceMaterialNavigation()}};
 if(projectDelivery)rawInput.evidence.projectDelivery=projectDelivery;
 if(creditRecord)rawInput.evidence.creditRecord=creditRecord;
 const projectResults=labWorldEvidenceProjectResults(earlier,publicAccess);
 if(projectResults.length)rawInput.evidence.projectResults=projectResults;
 // Authored operational scope is a distinct source, never a file or evidence
 // that somebody has already performed work. Avoid storyWorldContext(), whose
 // calendar/modality helpers may initialize state during a read-only call.
 try{rawInput.evidence.authoredWorldFacts=labWorldEvidenceAuthoredWorldFacts();}catch{schemaGaps.push('authored_operational_world_source_unavailable');}
 if(context.incident){
  const ref=current?.metadata?.sourceCueDelivery,source=ref?ledger.find(e=>e.eventId===ref.eventId&&e.sessionEpoch===epoch):current;
  const retained=Boolean(!ref||source&&ledger.indexOf(source)<ledger.indexOf(current)&&source.sessionId===current.sessionId&&source.type==='relationship_transfer_probe'&&source.rootEventId===current.rootEventId&&source.parentEventId===current.parentEventId&&source.metadata?.probeId===current.metadata?.probeId&&!source.metadata?.sourceCueDelivery);
  const delivered=source?.dialogueDeliveries?.find(d=>(!ref||d.deliveryId===ref.deliveryId)&&d.status==='delivered'&&d.channel==='relationship_transfer_cue'&&d.speaker==='Game Master'&&!d.npcId&&d.text===context.incident);
  const inHistory=delivered&&state.dialogueHistory.some(d=>d.eventId===source.eventId&&d.channel==='relationship_transfer_cue'&&d.text===delivered.text);
  if(current?.type==='relationship_transfer_probe'&&source&&usable(source)&&retained&&delivered&&inHistory){
   const incident=LabIncidentQaCore.input({candidate,speakerId,speakerName,incident:delivered.text,incidentRoleFacts:context.incidentRoleFacts,independentFirstReaction:context.independentFirstReaction===true}),a=context.incidentEvidenceAvailability;
   if(!a||!Array.isArray(a.availableNow)||!Array.isArray(a.notProvided)||typeof a.currentRecordRetrievalTool!=='boolean'||typeof a.currentSideBySideDisplayTool!=='boolean')throw new TypeError('An actual incident requires explicit evidence availability.');
   rawInput.evidence.currentIncident={sourceEventId:source.eventId,deliveryId:delivered.deliveryId,cue:incident.incident,roleFacts:incident.incidentRoleFacts,independentFirstReaction:incident.independentFirstReaction,evidenceAvailability:{availableNow:[...a.availableNow],notProvided:[...a.notProvided],currentRecordRetrievalTool:a.currentRecordRetrievalTool,currentSideBySideDisplayTool:a.currentSideBySideDisplayTool}};
   availability.available.push(...a.availableNow);availability.notProvided.push(...a.notProvided);
   availability.tools.push({id:'incident_record_retrieval',available:a.currentRecordRetrievalTool},{id:'incident_side_by_side_display',available:a.currentSideBySideDisplayTool});
  }else schemaGaps.push('incident_cue_not_bound_to_actual_accessible_delivery');
 }
 if(context.currentPublicCue){
  const cue=current?.metadata?.observableCue,sourceNpc=state.npcs.find(n=>n.id===current?.metadata?.sourceNpcId),expected=sourceNpc?observablePrivateInteractionCue(sourceNpc,null):null;
  const parent=ledger.find(e=>e.eventId===current?.parentEventId&&e.sessionEpoch===epoch);
  const occurred=parent&&ledger.indexOf(parent)<ledger.indexOf(current)&&parent.sessionId===current.sessionId&&parent.status==='committed'&&parent.type==='private_chat'&&parent.audience?.visibility==='private'&&parent.audience.npcIds?.includes(sourceNpc?.id)&&parent.actors?.includes('player')&&parent.actors?.includes(sourceNpc?.id)&&parent.rootEventId===current.rootEventId;
  const exactCue=value=>expected&&value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===Object.keys(expected).sort().join(',')&&Object.keys(expected).every(k=>value[k]===expected[k]);
  if(current?.type==='autonomous_exchange'&&occurred&&publicAccess(current)&&exactCue(cue)&&exactCue(context.currentPublicCue)){
   const {sourceNpcId,sourceNpcName,interactionOccurred,observableCue,limitation}=cue;
   rawInput.evidence.currentPublicCue={sourceEventId:current.eventId,kind:'observable_interaction',text:JSON.stringify({sourceNpcId,sourceNpcName,interactionOccurred,observableCue,limitation})};
  }else schemaGaps.push('observable_public_cue_not_bound_to_current_autonomous_event');
 }
 let conditionalPreparedSources=null;
 const thread=context.groupThread;
 if(thread?.priorTurns?.length){
  const boundId=groupThreadEventId||thread.sourceEventId||thread.eventId;
  const turns=thread.priorTurns;
  const lock=state.activeEventLock,owned=!lock||lock.epoch===epoch&&(lock.eventId===current?.eventId||current?.type==='autonomous_exchange'&&current.parentEventId===lock.eventId);
  const valid=Boolean(current&&['key_decision','autonomous_exchange'].includes(current.type)&&owned&&publicAccess(current)&&thread.version===LabGroupThreadCore.VERSION&&thread.visibility==='group'&&thread.status==='prepared_not_delivered'&&boundId===current.eventId&&Array.isArray(turns)&&thread.turnIndex===turns.length&&turns.every(t=>state.npcs.some(n=>n.id===t.speakerId&&n.name===t.speaker)&&current.audience.npcIds?.includes(t.speakerId)&&typeof t.dialogue==='string'&&t.dialogue.trim())&&thread.latestTurn?.speakerId===turns.at(-1).speakerId&&thread.latestTurn?.speaker===turns.at(-1).speaker&&thread.latestTurn?.dialogue===turns.at(-1).dialogue);
  if(!valid)schemaGaps.push('prepared_group_prefix_not_bound_to_current_accessible_ordered_event');
  else{
   conditionalPreparedSources={sourceEventId:current.eventId,version:thread.version,status:thread.status,visibility:'group',turnIndex:turns.length,priorTurns:turns.map(t=>({speakerId:t.speakerId,speakerName:t.speaker,text:t.dialogue}))};
   const trial=LabWorldEvidenceQaCore.input({...rawInput,evidence:{...rawInput.evidence,conditionalSceneClaims:conditionalPreparedSources}});
   if(trial.evidence.conditionalSceneClaims)rawInput.evidence.conditionalSceneClaims=conditionalPreparedSources;
   else schemaGaps.push('current_world_core_cannot_represent_conditional_prepared_scene_claims');
  }
 }
 const projectedInput=LabWorldEvidenceQaCore.input(rawInput);
 for(const key of ['authoredWorldFacts','currentIncident','currentPublicCue','materialNavigation','projectResults'])if(rawInput.evidence[key]&&!projectedInput.evidence[key])schemaGaps.push('current_world_core_cannot_represent_'+key);
 for(const key of ['projectDelivery','creditRecord'])if(rawInput.evidence[key]&&(!projectedInput.evidence[key]||SocialEvoCore.stableHash(rawInput.evidence[key])!==SocialEvoCore.stableHash(projectedInput.evidence[key])))schemaGaps.push('current_world_core_cannot_represent_'+key);
 if(rawInput.evidence.authoredWorldFacts?.materialEvidenceLimits!==projectedInput.evidence.authoredWorldFacts?.materialEvidenceLimits)schemaGaps.push('current_world_core_cannot_represent_authored_material_evidence_limits');
 if(materials.some((d,i)=>JSON.stringify(d.overview)!==JSON.stringify(projectedInput.evidence.materials[i]?.overview)))schemaGaps.push('current_world_core_cannot_represent_authored_material_overview');
 return {version:LAB_WORLD_EVIDENCE_CONTEXT_VERSION,rawInput,projectedInput,conditionalPreparedSources,schemaGaps,integrationReady:schemaGaps.length===0};
}
