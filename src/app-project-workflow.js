// The shared report is actual editable work. Conversation is never an edit.
let projectReportTaskSequence=0;
function projectWorkflowEnabled(){return Boolean(currentScenario().projectWorkflow?.sections?.length);}
function projectReportTaskId(){return ({stage_2_first_failure:'brief_review',stage_3_revision_conflict:'revision_plan'})[currentStage()?.id]||'';}
function projectIsReportTask(task){return projectWorkflowEnabled()&&['brief_review','revision_plan'].includes(typeof task==='string'?task:task?.sourceTaskId);}
function resetProjectWorkflowRuntime(){document.getElementById('project-workflow-workbench')?.remove();}
function projectWorkflowState(){
 if(!projectWorkflowEnabled())return null;const definition=currentScenario().projectWorkflow;
 if(state.projectWorkflow?.epoch!==state.sessionEpoch||state.projectWorkflow.projectId!==definition.id){
  state.projectWorkflow=LabProjectWorkflowCore.create({epoch:state.sessionEpoch,projectId:definition.id,maxBodyChars:definition.maxBodyChars||4000,
   sections:definition.sections.map(s=>({id:s.id,title:scenarioText(s.title,s.id),text:scenarioText(s.initialText,'')}))});
 }
 return state.projectWorkflow;
}
function projectWorkflowUiSafe(){return state.screen==='game'&&!state.sessionClosed&&!state.apiFatalError&&!state.finalOutcome&&!state.activeEventLock&&!state.isIntroPlaying&&!state.isScenePlaying&&!state.isGmThinking&&!state.decisionPanelVisible&&!state.dialogueAdvancePending&&!state.artifactTaskLoading&&isBackpackOpen()&&workspaceTab==='current';}
// Chronology/interaction completion can change eligibility while this editor
// stays open. Update existing controls without rebuilding or saving the form.
function syncProjectWorkflowAvailability(){
 const host=document.getElementById('project-workflow-workbench');if(!host||host.hidden||!isBackpackOpen())return;
 const p=state.projectWorkflow,current=projectWorkflowEnabled()&&Boolean(projectReportTaskId())&&p?.epoch===state.sessionEpoch&&p.projectId===currentScenario().projectWorkflow.id;
 const safe=current&&projectWorkflowUiSafe()&&!p.formalSubmission;
 for(const input of host.querySelectorAll('[data-project-section]'))input.disabled=!safe;
 for(const id of ['project-save-draft','project-send-review','project-adopt-apply','project-unchanged-review','project-discuss-open']){
  const control=document.getElementById(id);if(control)control.disabled=!safe;
 }
 const send=document.getElementById('project-send-review');if(send){
  send.setAttribute('aria-busy',String(state.artifactSubmissionStatus==='submitting'));
  const recovering=typeof currentArtifactSubmissionRecovery==='function'&&currentArtifactSubmissionRecovery();
  const label=recovering?(state.language==='zh'?'重新送审':'Retry review'):(state.language==='zh'?'将当前正文送审':'Send this report for review');
  if(send.textContent!==label)send.textContent=label;
  if(recovering&&state.artifactSubmissionStatus!=='submitting'){
   const status=document.getElementById('project-workflow-status');if(status)status.textContent=artifactSubmissionRecoveryNotice();
  }
 }
 const formal=document.getElementById('project-formal-submit');if(formal){
  const timed=current&&state.labCalendar?.epoch===state.sessionEpoch&&currentLabTimingReady();
  formal.disabled=!safe||!timed||state.labStory?.epoch!==state.sessionEpoch||!projectCanFormallySubmit();
  formal.setAttribute('aria-busy',String(Boolean(current&&labTimingPending.size)));
 }
}
function saveProjectWorkflowDraft(){
 const p=projectWorkflowState();if(!p||p.formalSubmission||!projectReportTaskId()||state.activeEventLock)return false;
 const host=document.getElementById('project-workflow-workbench');
 const sections=p.draft.sections.map(s=>({...s,text:host?.querySelector(`[data-project-section="${s.id}"]`)?.value??s.text}));
 state.projectWorkflow=LabProjectWorkflowCore.save(p,sections,new Date().toISOString());return true;
}
function focusProjectReportEditor(sectionId=''){
 const host=document.getElementById('project-workflow-workbench');if(!host||host.hidden)return false;
 const input=sectionId?host.querySelector(`[data-project-section="${sectionId}"]`):host.querySelector('[data-project-section]');
 input?.focus();input?.scrollIntoView({block:'center'});return Boolean(input);
}
function applyProjectReportNote(text,sectionId=''){
 if(!projectWorkflowUiSafe()||!projectReportTaskId()||projectWorkflowState().formalSubmission||typeof text!=='string'||!text.trim())return false;
 const target=sectionId||document.getElementById('project-note-section')?.value,p=projectWorkflowState();
 if(!p.draft.sections.some(s=>s.id===target)){document.getElementById('project-workflow-status').textContent=state.language==='zh'?'请选择笔记要采用到的报告段落，然后再次采用。':'Choose the report section for this note, then apply it again.';document.getElementById('project-note-section')?.focus();return false;}
 saveProjectWorkflowDraft();const current=projectWorkflowState();state.projectWorkflow=LabProjectWorkflowCore.save(current,current.draft.sections.map(s=>s.id===target?{...s,text:s.text+(s.text?'\n':'')+text.trim()}:s),new Date().toISOString());
 renderProjectWorkflow();focusProjectReportEditor(target);return true;
}
function projectReportReviewSnapshot(artifact){
 if(!projectIsReportTask(artifact))return null;
 if(artifact.sourceTaskId!==projectReportTaskId())throw Error('This report belongs to another work stage.');
 saveProjectWorkflowDraft();
 return LabProjectWorkflowCore.capture(projectWorkflowState(),{taskId:artifact.sourceTaskId,artifactId:artifact.id,minute:labClock().elapsedMinutes,
  unchangedAcknowledged:Boolean(document.getElementById('project-unchanged-review')?.checked)});
}
function bindProjectReportReview(snapshot,event){return Object.freeze({...snapshot,versionId:'project-'+event.eventId,sourceEventId:event.eventId});}
function commitProjectReportReview(snapshot,record,event,result){
 if(!snapshot)return;
 if(event.sessionEpoch!==state.sessionEpoch||snapshot.body!==record.note||event.metadata.playerNote!==snapshot.body||event.metadata.projectReportVersion!==snapshot.versionId)throw new TypeError('Report review differs from the actual frozen submission.');
 state.projectWorkflow=LabProjectWorkflowCore.reviewed(projectWorkflowState(),snapshot,{sourceEventId:event.eventId,artifactId:record.id,body:record.note,status:record.status,feedbackText:result.dialogue});
}
function projectActualReview(version){
 if(!version||version.epoch!==state.sessionEpoch||LabProjectWorkflowCore.body(version.sections)!==version.body||LabProjectWorkflowCore.hash(version.body)!==version.bodyHash)return null;
 const matches=state.eventLedger.filter(e=>e.eventId===version.sourceEventId),event=matches[0];
 const artifacts=state.submittedArtifacts.filter(a=>a.id===version.artifactId&&a.sourceEventId===version.sourceEventId),artifact=artifacts[0];
 if(matches.length!==1||artifacts.length!==1||event.sessionEpoch!==state.sessionEpoch||event.sessionId!==state.sessionId||event.type!=='artifact_submission'||event.status!=='committed'||!event.commit||
  event.metadata.projectReportVersion!==version.versionId||event.metadata.artifactId!==version.artifactId||event.metadata.sourceTaskId!==version.taskId||event.metadata.playerNote!==version.body||
  artifact.note!==version.body||artifact.status!==version.status||artifact.sourceTaskId!==version.taskId||!event.dialogueDeliveries?.some(d=>d.channel==='artifact_evaluation'&&d.npcId&&d.status==='delivered'&&d.text===version.feedbackText))return null;
 return version;
}
function projectHasReviewedReport(taskId,{accepted=false}={}){
 const rows=projectWorkflowState()?.versions||[];
 const latest=rows.filter(v=>v.taskId===taskId).at(-1),review=projectActualReview(latest);
 return Boolean(review&&(!accepted||review.status==='accepted'));
}
function projectFormalSubmission(){
 const p=projectWorkflowState(),s=p?.formalSubmission;if(!s||s.epoch!==state.sessionEpoch)return null;
 const event=state.eventLedger.find(e=>e.eventId===s.eventId&&e.sessionEpoch===state.sessionEpoch);
 const review=projectActualReview(p.versions.find(v=>v.versionId===s.versionId));
 const at=LabNarrativeCore.clockAt(s.submittedAtMinutes);
 return event?.type==='project_submission'&&event.sessionId===state.sessionId&&event.status==='committed'&&event.commit&&event.metadata.projectId===s.projectId&&event.metadata.reportVersionId===s.versionId&&
  event.metadata.sourceReviewEventId===s.sourceReviewEventId&&event.metadata.artifactId===s.artifactId&&event.metadata.bodyHash===s.bodyHash&&event.metadata.submittedAtMinutes===s.submittedAtMinutes&&
  s.sourceEventId===event.eventId&&s.reportVersionId===s.versionId&&s.submittedAtMinutes===s.submittedAtGameMinute&&s.submittedAtDay===at.day&&s.submittedOnTime===!at.overdue&&s.status===(at.overdue?'late':'on_time')&&review?.status==='accepted'&&review.body===s.body?s:null;
}
// Public Agent context contains actual reviewed work only, never the editor draft.
function projectVerifiedAdoptions(version){
 const reviewIndex=state.eventLedger.findIndex(e=>e.eventId===version.sourceEventId&&e.sessionEpoch===state.sessionEpoch);
 return (version.adoptions||[]).filter(a=>{
  if(typeof a.text!=='string'||!a.text.trim()||!version.sections.some(s=>s.id===a.sectionId&&s.text.includes(a.text)))return false;
  const sourceIndex=state.eventLedger.findIndex(e=>e.eventId===a.eventId&&e.sessionEpoch===state.sessionEpoch),e=state.eventLedger[sourceIndex];
  return sourceIndex>=0&&sourceIndex<reviewIndex&&e.sessionId===state.sessionId&&e.status==='committed'&&['group','public'].includes(e.audience?.visibility)&&
   e.dialogueDeliveries?.some(d=>d.deliveryId===a.deliveryId&&d.npcId===a.npcId&&d.status==='delivered'&&typeof d.text==='string'&&d.text.includes(a.text));
 }).map(a=>({kind:'player_adopted_public_suggestion',sourceEventId:a.eventId,deliveryId:a.deliveryId,npcId:a.npcId,sectionId:a.sectionId,text:a.text,
  rule:'The player explicitly adopted this delivered public suggestion into this report version. This does not assert that the NPC personally edited the report or verified its facts.'}));
}
function projectWorkflowContext(){
 const p=projectWorkflowState();if(!p)return null;
 return {version:LabProjectWorkflowCore.VERSION,projectId:p.projectId,reports:p.versions.filter(v=>projectActualReview(v)).map(v=>{
  const index=p.versions.indexOf(v),previous=index>0?p.versions[index-1]:null;
  const baseline=previous?.sections||currentScenario().projectWorkflow.sections.map(s=>({id:s.id,text:scenarioText(s.initialText,'')}));
  return {reportVersionId:v.versionId,versionNumber:index+1,versionLabel:`V${index+1}`,parentReportVersionId:v.parentVersionId||previous?.versionId||'',
   comparisonBasis:previous?`V${index}`:(state.language==='zh'?'收到的初稿':'Received starting draft'),
   changedSections:v.sections.filter(s=>baseline.find(b=>b.id===s.id)?.text!==s.text).map(s=>({sectionId:s.id,title:s.title})),
   sourceEventId:v.sourceEventId,artifactId:v.artifactId,taskId:v.taskId,body:v.body,status:v.status,unchanged:v.unchanged,feedbackText:v.feedbackText,adoptions:projectVerifiedAdoptions(v)};
 }),formalSubmission:projectFormalSubmission(),
 historyRule:'Every report is an actual sent/reviewed version in chronological order. A task name such as first report may contain several review attempts. Version numbers identify attempts, not stages. changedSections compares exact body sections to the preceding sent version (or the received starting draft), not an LLM summary. Use full original bodies and bound feedback to assess any specific edit or credit claim.'};
}
function projectSubmissionContext(){
 const p=projectWorkflowState(),latest=p?.versions.filter(v=>v.taskId==='revision_plan').at(-1);
 return {stageId:currentStage()?.id,review:projectActualReview(latest),revisionReviewed:Boolean(labAnchorRecord('revision_review')),blamePresented:Boolean(labAnchorRecord('return_blame'))};
}
function projectReviewedHistoryForAgent(){
 if(!projectWorkflowEnabled())return null;
 const history=projectWorkflowContext();
 return history?.reports.length?history:null;
}
function projectCanFormallySubmit(){const p=projectWorkflowState();return Boolean(p&&LabProjectWorkflowCore.canSubmit(p,projectSubmissionContext()).ok);}
function submitProjectFormally(){
 if(!projectWorkflowUiSafe()||!currentLabTimingReady())return false;saveProjectWorkflowDraft();if(!projectCanFormallySubmit()){renderProjectWorkflow();return false;}
 const p=projectWorkflowState(),context=projectSubmissionContext(),minute=labClock().elapsedMinutes,at=LabNarrativeCore.clockAt(minute),v=context.review;
 const event=acquireEventLock('project_submission',{actors:['player'],audience:{visibility:'group',npcIds:state.npcs.map(n=>n.id)},metadata:{projectId:p.projectId,reportVersionId:v.versionId,sourceReviewEventId:v.sourceEventId,artifactId:v.artifactId,bodyHash:v.bodyHash,submittedAtMinutes:minute}});
 if(!event)return false;
 try{
  commitRuntimeEvent(event,[],()=>{
   state.projectWorkflow=LabProjectWorkflowCore.formal(p,context,{eventId:event.eventId,minute,day:at.day,onTime:!at.overdue});
   Object.assign(state.projectWorkflow.formalSubmission,{submissionEventId:event.eventId,reportVersionId:v.versionId});return {projectId:p.projectId,reportVersionId:v.versionId,submittedAtMinutes:minute};
  });
 }catch(error){failRuntimeEvent(event,error);throw error;}finally{releaseEventLock(event);}
 const submission=projectFormalSubmission();if(typeof onProjectFormallySubmitted==='function')onProjectFormallySubmitted(submission,event);
 renderBackpack();refreshGameHud();return submission;
}
function projectPublicTextSources(){
 return state.eventLedger.filter(e=>e.sessionEpoch===state.sessionEpoch&&e.status==='committed'&&['group','public'].includes(e.audience?.visibility))
  .flatMap(e=>(e.dialogueDeliveries||[]).filter(d=>d.npcId&&d.status==='delivered'&&typeof d.text==='string'&&d.text.trim()).map(d=>({key:e.eventId+':'+d.deliveryId,eventId:e.eventId,deliveryId:d.deliveryId,npcId:d.npcId,speaker:d.speaker,text:d.text,anchorId:e.metadata?.anchorId||'',artifactId:e.metadata?.artifactId||''}))).slice(-24);
}
function projectAdoptPublicText(){
 if(!projectWorkflowUiSafe()||projectWorkflowState().formalSubmission)return false;
 const source=projectPublicTextSources().find(s=>s.key===document.getElementById('project-adopt-source').value),sectionId=document.getElementById('project-adopt-section').value;
 const text=document.getElementById('project-adopt-text').value.trim();if(!source||!text||!source.text.includes(text))return false;
 saveProjectWorkflowDraft();const p=projectWorkflowState(),sections=p.draft.sections.map(s=>s.id===sectionId?{...s,text:s.text+(s.text?'\n':'')+text}:s);
 if(!sections.some(s=>s.id===sectionId))return false;
 state.projectWorkflow=LabProjectWorkflowCore.save(p,sections,new Date().toISOString());
 state.projectWorkflow.adoptions.push({eventId:source.eventId,deliveryId:source.deliveryId,npcId:source.npcId,sectionId,text});
 renderProjectWorkflow();return true;
}
function projectPrepareReviewTask(){
 const taskId=projectReportTaskId(),plan=taskId&&designedWorkspaceTaskPlan(taskId);if(!plan)return null;
 const current=state.activeArtifactTask;
 if(!current?.hasTask||current.sourceTaskId!==taskId||current.status!=='draft'){state.activeArtifactTask=normalizeLaptopTaskPlan(plan);state.activeArtifactTask.id=`project-task-${state.sessionId}-${++projectReportTaskSequence}`;}
 const task=state.activeArtifactTask;
 const previous=state.submittedArtifacts.filter(a=>a.sourceTaskId===taskId).at(-1);
 if(previous){task.revisionOf=previous.id;task.revisionSourceEventId=previous.sourceEventId;task.revisionEpoch=state.sessionEpoch;}
 state.selectedArtifactOption=task.options[0]?.id||'';return task;
}
async function sendProjectReportForReview(){
 if(!projectWorkflowUiSafe()||!projectReportTaskId()||projectWorkflowState().formalSubmission)return;
 const task=projectPrepareReviewTask();if(!task)return;
 try{
  const capture=projectReportReviewSnapshot(task);state.artifactDraft=capture.body;document.getElementById('artifact-draft-input').value=capture.body;await submitArtifact();
  const status=document.getElementById('project-workflow-status'),warningNode=document.getElementById('artifact-warning'),p=projectWorkflowState(),version=p.versions.at(-1);
  if(status&&version?.artifactId===task.id&&projectActualReview(version)){
   if(warningNode)warningNode.textContent='';
   status.textContent=state.language==='zh'?`V${p.versions.length} 审阅完成：${artifactStatusLabel(version.status)}。继续修改后需再次送审。`:`V${p.versions.length} review complete: ${artifactStatusLabel(version.status)}. Further edits need another review.`;
  }else if(status&&warningNode?.textContent?.trim())status.textContent=warningNode.textContent;
 }
 catch(error){const status=document.getElementById('project-workflow-status');if(status)status.textContent=state.language==='zh'&&/unchanged/.test(error.message)?'请明确勾选原样送审；原样送审不记作已修改。':state.language==='zh'&&/exceeds/.test(error.message)?`报告正文请控制在 ${projectWorkflowState().maxBodyChars} 字以内；草稿已保留。`:state.language==='zh'&&/Write report/.test(error.message)?'请先填写报告正文，再送审。':error.message;}
}
function projectWorkspaceView(){
 if(!projectWorkflowEnabled()||!projectReportTaskId())return null;
 const p=projectWorkflowState(),task=workspaceTaskTemplate(projectReportTaskId());
 return {kind:'work_ready',taskId:projectReportTaskId(),canSubmit:!p.formalSubmission,title:scenarioText(currentScenario().projectWorkflow.title),note:'',documentId:task?.sourceDocumentIds?.[0]||''};
}
function projectNode(tag,text,id){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(id)n.id=id;return n;}
function projectDiscussSection(){
 if(!projectWorkflowUiSafe())return false;saveProjectWorkflowDraft();
 const sectionId=document.getElementById('project-discuss-section').value,npc=state.npcs.find(n=>n.id===document.getElementById('project-discuss-npc').value);
 const section=projectWorkflowState().draft.sections.find(s=>s.id===sectionId),question=document.getElementById('project-discuss-question').value.trim();
 if(!section||!npc||!question)return false;
 const epoch=state.sessionEpoch,stageId=currentStage()?.id;closeBackpack();
 void approachNpcForConversation(npc,{sideTalkOptions:{selectedReply:question},isCurrent:()=>epoch===state.sessionEpoch&&stageId===currentStage()?.id&&!state.sessionClosed&&!state.apiFatalError});return true;
}
function renderProjectWorkflow(){
 const enabled=projectWorkflowEnabled()&&Boolean(projectReportTaskId()),old=document.getElementById('project-workflow-workbench');
 if(!enabled){if(old)old.hidden=true;return false;}
 const p=projectWorkflowState(),zh=state.language==='zh';
 let host=old;
 if(!host){
  host=projectNode('section',undefined,'project-workflow-workbench');host.className='project-workflow-workbench';document.getElementById('artifact-task-summary').before(host);
  host.append(projectNode('h3',scenarioText(currentScenario().projectWorkflow.title)));
  host.append(projectNode('p',zh?'查看“材料包”里的初稿和数据，在下方修改报告正文，然后将当前版本送给老师审阅。':'Read the draft and data in Materials, edit the report below, then send this version to the advisors for review.'));
  const criteria=projectNode('details',undefined,'project-review-criteria');criteria.append(projectNode('summary',zh?`查看送审标准 · 正文上限${p.maxBodyChars}字`:`Review criteria · ${p.maxBodyChars}-character limit`),projectNode('div',undefined,'project-review-criteria-content'));host.append(criteria);
  for(const section of p.draft.sections){const label=projectNode('label',section.title),input=projectNode('textarea');input.dataset.projectSection=section.id;input.rows=4;label.append(input);host.append(label);input.addEventListener('input',()=>{saveProjectWorkflowDraft();const checkbox=document.getElementById('project-unchanged-review');if(checkbox)checkbox.checked=false;const status=document.getElementById('project-workflow-status');if(status)status.textContent=zh?'有未送审的修改。':'There are edits that have not been sent for review.';syncProjectWorkflowAvailability();});}
  const controls=projectNode('div');controls.className='project-workflow-actions';
  const save=projectNode('button',zh?'保存草稿':'Save draft','project-save-draft');save.type='button';save.onclick=()=>{if(projectWorkflowUiSafe()){saveProjectWorkflowDraft();document.getElementById('project-workflow-status').textContent=zh?'草稿已保存，尚未送审。':'Draft saved; not sent for review.';}};
  const send=projectNode('button',zh?'将当前正文送审':'Send this report for review','project-send-review');send.type='button';send.onclick=()=>void sendProjectReportForReview();controls.append(save,send);host.append(controls);
  const unchanged=projectNode('label',zh?'原样送审（正文未修改）':'Send the unchanged report'),check=projectNode('input',undefined,'project-unchanged-review');check.type='checkbox';unchanged.prepend(check);host.append(unchanged);
  const status=projectNode('p','', 'project-workflow-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');host.append(status,projectNode('h4',zh?'老师和组员的意见':'Feedback'),projectNode('div',undefined,'project-feedback-list'));
  const noteTarget=projectNode('label',zh?'笔记采用到报告哪一段':'Report section for adopted notes'),noteSelect=projectNode('select',undefined,'project-note-section');const emptyTarget=projectNode('option',zh?'先选择目标段落':'Choose a target section');emptyTarget.value='';noteSelect.append(emptyTarget);for(const section of p.draft.sections){const o=projectNode('option',section.title);o.value=section.id;noteSelect.append(o);}noteTarget.append(noteSelect);host.append(noteTarget);
  const discussion=projectNode('details');discussion.append(projectNode('summary',zh?'找成员讨论具体段落':'Discuss a report section with a member'));
  const sectionLabel=projectNode('label',zh?'讨论哪一段':'Section to discuss'),sectionSelect=projectNode('select',undefined,'project-discuss-section');
  for(const section of p.draft.sections){const o=projectNode('option',section.title);o.value=section.id;sectionSelect.append(o);}sectionLabel.append(sectionSelect);
  const npcLabel=projectNode('label',zh?'找哪位成员':'Member'),npcSelect=projectNode('select',undefined,'project-discuss-npc');for(const npc of state.npcs){const o=projectNode('option',npc.name);o.value=npc.id;npcSelect.append(o);}npcLabel.append(npcSelect);
  const questionLabel=projectNode('label',zh?'可编辑的问题；到交谈框后再确认发送':'Editable question; send explicitly from the conversation'),questionInput=projectNode('textarea',undefined,'project-discuss-question');
  const questionForSection=()=>{const s=p.draft.sections.find(s=>s.id===sectionSelect.value);questionInput.value=zh?`我想请教报告中“${s.title}”这一段应怎样表达。你能给我具体建议或可参考的文字吗？`:`Could you suggest concrete wording or advice for the "${s.title}" section of the report?`;};questionForSection();sectionSelect.onchange=questionForSection;questionLabel.append(questionInput);
  const discuss=projectNode('button',zh?'找成员讨论这一段':'Discuss this section with the member','project-discuss-open');discuss.type='button';discuss.onclick=projectDiscussSection;
  discussion.append(sectionLabel,npcLabel,questionLabel,discuss,projectNode('p',zh?'问题会先放入交谈框，由你确认发送。得到建议后，可以回来修改报告。':'Your question opens as a draft for you to send. Return to the report when you want to use the advice.'));host.append(discussion);
  const adoption=projectNode('details'),heading=projectNode('summary',zh?'采用组员提供的文字':'Use wording shared by a member');adoption.append(heading,projectNode('p',zh?'选择组员在讨论中提供的文字，核对内容后加入报告。':'Choose wording shared in discussion, check its accuracy, and add it to the report.'));
  const sources=projectNode('select',undefined,'project-adopt-source'),sections=projectNode('select',undefined,'project-adopt-section'),text=projectNode('textarea',undefined,'project-adopt-text');
  for(const s of p.draft.sections){const o=projectNode('option',s.title);o.value=s.id;sections.append(o);}
  sources.onchange=()=>{text.value=projectPublicTextSources().find(s=>s.key===sources.value)?.text||'';};
  const apply=projectNode('button',zh?'采用到所选段落':'Adopt into selected section','project-adopt-apply');apply.type='button';apply.onclick=projectAdoptPublicText;adoption.append(sources,sections,text,apply);host.append(adoption);
  const formal=projectNode('button',zh?'正式提交当前报告':'Formally submit this report','project-formal-submit');formal.type='button';formal.onclick=submitProjectFormally;host.append(formal,projectNode('p',undefined,'project-formal-status'));
  host.append(projectNode('h4',zh?'送审版本历史':'Review version history'),projectNode('div',undefined,'project-version-history'));
  const firstEditor=host.querySelector('label:has([data-project-section])');firstEditor.before(controls,unchanged,document.getElementById('project-workflow-status'));
 }
 host.hidden=false;const currentBody=document.getElementById('workspace-current-body');if(currentBody.firstElementChild!==host)currentBody.prepend(host);
 for(const section of p.draft.sections){const input=host.querySelector(`[data-project-section="${section.id}"]`);if(document.activeElement!==input)input.value=section.text;}
 const sources=projectPublicTextSources(),select=document.getElementById('project-adopt-source'),selected=select.value;select.replaceChildren();
 for(const source of sources){const o=projectNode('option',`${source.speaker}: ${source.text.slice(0,70)}`);o.value=source.key;select.append(o);}if(sources.some(s=>s.key===selected))select.value=selected;
 const adoptedText=document.getElementById('project-adopt-text');if(document.activeElement!==adoptedText&&!adoptedText.value)adoptedText.value=sources[0]?.text||'';
 const feedback=document.getElementById('project-feedback-list');feedback.replaceChildren();
 for(const source of sources.filter(s=>['advisor_review','revision_review'].includes(s.anchorId)||p.versions.some(v=>v.sourceEventId===s.eventId))){
  const row=projectNode('article'),version=p.versions.find(v=>v.sourceEventId===source.eventId||v.artifactId===source.artifactId),number=version?p.versions.indexOf(version)+1:0;
  const kind=({advisor_review:zh?'导师初审':'Advisor first review',revision_review:zh?'导师复审':'Advisor second review'})[source.anchorId]||(zh?'本次送审反馈':'Report review feedback');
  row.append(projectNode('strong',`${number?'V'+number+' · ':''}${kind}`),projectNode('p',`${source.speaker}: ${source.text}`));const label=projectNode('label',zh?'选择这条意见对应的段落':'Select the section for this feedback'),focus=projectNode('select');
  const prompt=projectNode('option',zh?'选择要修改的段落':'Choose a section to edit');prompt.value='';focus.append(prompt);
  for(const s of p.draft.sections){const o=projectNode('option',s.title);o.value=s.id;focus.append(o);}label.append(focus);const locate=projectNode('button',zh?'定位编辑':'Locate and edit');locate.type='button';locate.onclick=()=>{if(focus.value)focusProjectReportEditor(focus.value);};row.append(label,locate);feedback.append(row);
 }
 const history=document.getElementById('project-version-history');history.replaceChildren();
 p.versions.forEach((v,i)=>{const row=projectNode('details'),actual=projectActualReview(v);row.append(projectNode('summary',`V${i+1} · ${v.taskId==='brief_review'?(zh?'首次报告':'First report'):(zh?'修改报告':'Revised report')} · ${actual?artifactStatusLabel(v.status):(zh?'反馈待展示':'Feedback not delivered')} ${v.unchanged?(zh?'· 原样送审':'· unchanged'):''}`));row.append(projectNode('pre',v.body),projectNode('p',actual?v.feedbackText:''));history.append(row);});
 const formalVisible=currentStage()?.id==='stage_3_revision_conflict';document.getElementById('project-formal-submit').hidden=!formalVisible;document.getElementById('project-formal-status').hidden=!formalVisible;syncProjectWorkflowAvailability();
 document.getElementById('project-formal-status').textContent=p.formalSubmission?(zh?`已正式提交 V${p.versions.findIndex(v=>v.versionId===p.formalSubmission.versionId)+1} · Day ${p.formalSubmission.submittedAtDay}`:`Formally submitted on Day ${p.formalSubmission.submittedAtDay}`):(projectCanFormallySubmit()?(zh?'这版报告已准备好，可以正式提交参赛。':'This report is ready for formal competition submission.'):(zh?'提交前请完成报告修改，并将当前版本交老师复审。收到意见后，可以回到组里继续交流。':'Complete the report edits and send this version to the advisors for review. You can return to the team to discuss their comments.'));
 return true;
}
function renderProjectWorkflowBackpack(){
 if(!renderProjectWorkflow())return false;
 for(const id of ['artifact-options','artifact-option-label','artifact-note-label','artifact-draft-input','submit-artifact-btn'])document.getElementById(id).hidden=true;
 const oldSummary=document.getElementById('artifact-task-summary');oldSummary.hidden=true;const summary=document.getElementById('project-review-criteria-content'),task=workspaceTaskTemplate(projectReportTaskId());summary.replaceChildren();
 if(task){summary.append(projectNode('h4',state.language==='zh'?'本轮送审标准':'Review criteria'));const list=projectNode('ul');for(const criterion of task.criteria||[])list.append(projectNode('li',scenarioText(criterion)));summary.append(list);}
 return true;
}
