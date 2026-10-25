// One authoritative computer view: availability comes from current mainline
// state, not a narrator phrase or a recall-answer result. No scoring side effects.
const WORKSPACE_UI_VERSION='lab-workspace-v7-social-world';
let workspaceTab='current',workspaceResumeOwner='',workspaceResumeTab='current',workspaceScrollOwner='';
function workspaceStateView(){
 const zh=state.language==='zh',stage=currentStage(),rule=SocialEvoCore.STAGE_MILESTONE_RULES.find(r=>r.stageId===stage?.id),taskId=rule?.requiredArtifactId||'';
 const template=taskId&&workspaceTaskTemplate(taskId),submitted=taskId&&evaluatedWorkspaceSubmission(taskId);
 if(typeof projectWorkspaceView==='function'){const projectView=projectWorkspaceView();if(projectView)return projectView;}
 const creditPhase=typeof creditWorkflowWorkspacePhase==='function'?creditWorkflowWorkspacePhase():'';
 if(creditPhase==='record')return {kind:'credit_record',taskId:'contribution_statement',canSubmit:false,title:zh?'整理对外介绍与贡献记录':'Prepare the external contribution record',note:zh?'贡献说明的送审和反馈已保存在提交记录。现在编辑下方提案，公开后与组员核对；尚未解决的分歧可以保留。':'Your reviewed statement and feedback are in Submissions. Edit the proposal below, publish it and check it with the team. Unresolved differences can remain.'};
 if(creditPhase==='feedback')return {kind:'credit_feedback',taskId:'contribution_statement',canSubmit:false,title:zh?'贡献说明已送审，等待反馈展示':'Contribution statement submitted; feedback is pending',note:zh?'本次提交已经记录。请返回实验室继续查看回应；反馈展示后，再整理对外贡献记录。':'Your submission is recorded. Return to the laboratory to continue reading the reply, then prepare the public contribution record.'};
 if(creditPhase==='submission')return {kind:state.artifactTaskLoading?'preparing':'work_ready',taskId,canSubmit:true,title:zh?'送审贡献说明':'Review your contribution statement',note:typeof workRevisionDraftCurrent==='function'&&workRevisionDraftCurrent()?(zh?'修改稿尚未送审，旧版本和评价仍保存在提交记录。':'This revision has not been reviewed; the previous version and evaluation remain in Submissions.'):(zh?'先选择说明方式，写明实际完成的工作并送审。读完反馈后，再整理和公开对外贡献记录。':'Choose an approach, describe the work actually performed and submit it for review. After reading the feedback, prepare and publish the external contribution record.'),documentId:template?.sourceDocumentIds?.[0]||''};
 if(isEntryEpisodeStage()&&entryEpisodeChoicePending())return {kind:'entry_record',taskId:'',canSubmit:false,title:zh?'查看这次起步安排的实际回应':'Review the actual starting arrangement',note:zh?'可以回看你的提议和组员的回应，继续交流或确认接下来的安排。':'Review your proposal and the team’s replies. Continue the conversation or confirm the next steps.'};
 if(isEntryEpisodeStage())return {kind:'entry_read_only',taskId:'',canSubmit:false,title:zh?'先了解起步安排':'Understand the starting arrangement',
  note:zh?'这里可以查看项目简介和刚才的讨论记录，先了解手头的工作。':'Read the project introduction and recent discussion to learn about the work at hand.',documentId:ENTRY_SCOPE_DOCUMENT_ID};
 if(taskId==='revision_plan'&&!labRevisionPreparationAllowed(taskId))return {kind:'story_before_work',taskId,canSubmit:false,title:zh?'先把反馈带回组里':'Bring feedback back to the team',note:zh?'可以把老师的意见带回组里讨论，报告草稿会保留。':'Bring the advisor comments back to the team. Your report draft is saved.'};
 if(typeof workRevisionDraftCurrent==='function'&&workRevisionDraftCurrent())return {kind:'work_ready',taskId,canSubmit:true,title:scenarioText(template.title),note:zh?'修改稿尚未提交；旧评价仍是实际记录。':'Correction not submitted; the earlier evaluation remains the actual record.',documentId:template.sourceDocumentIds?.[0]||''};
 if(submitted)return {kind:'work_feedback',taskId,canSubmit:false,title:zh?'这份提交已有反馈':'This submission has feedback',note:zh?'请在提交记录查看实际回应，再继续当前讨论。收到反馈不等于所有问题已解决。':'Read the actual feedback in Submissions, then continue the current discussion. Feedback does not mean every issue is resolved.',submitted};
 if(template)return {kind:state.artifactTaskLoading?'preparing':'work_ready',taskId,canSubmit:true,title:scenarioText(template.title),note:scenarioText(template.brief),documentId:template.sourceDocumentIds?.[0]||''};
 return {kind:'discussion',taskId:'',canSubmit:false,title:zh?'继续当前讨论':'Continue the current discussion',note:nextStepText()};
}
function workspaceForAgentContext(){const v=workspaceStateView();return {kind:v.kind,currentStageId:currentStage()?.id,availableTaskId:v.canSubmit?v.taskId:null,
 instruction:'Use only this actual workflow availability. A recall answer or NPC suggestion does not unlock a future-stage task. In entry, offer plain explanation/read-only materials, not an immediately due graded review. Do not claim work is completed, a new file exists, or a task has opened unless supplied here.'};}
function workspaceTabText(id){return state.language==='zh'?{current:'当前事项',materials:'材料包',notes:'我的笔记',records:'提交记录'}[id]:{current:'Current',materials:'Work pack',notes:'My notes',records:'Submissions'}[id];}
function saveWorkspaceEditorDraft(){if(typeof projectWorkflowEnabled==='function'&&projectWorkflowEnabled()&&projectReportTaskId()){saveProjectWorkflowDraft();return;}if(state.activeArtifactTask?.hasTask&&!document.getElementById('artifact-draft-input').hidden)state.artifactDraft=document.getElementById('artifact-draft-input').value;}
function setWorkspaceTab(tab){
 if(!['current','materials','notes','records'].includes(tab))return;saveWorkspaceEditorDraft();workspaceTab=tab;renderWorkspaceUi();
 document.getElementById(`workspace-${tab}-pane`).scrollTop=0;if(tab==='current')document.getElementById('workspace-current-body').scrollTop=0;
 if(tab==='materials')markVisibleWorkspaceDocuments();
 if(tab==='records'){const receipt=document.getElementById('entry-workspace-receipt');if(receipt?.open&&receipt.getClientRects().length)recordEntryReceiptViewed();}
}
function workspaceElementPresented(element){
 if(!isBackpackOpen()||!element?.getClientRects().length)return false;
 const r=element.getBoundingClientRect(),pane=element.closest('[role="tabpanel"]')?.getBoundingClientRect()||document.getElementById('backpack-panel').getBoundingClientRect();
 return r.bottom>Math.max(0,pane.top)&&r.top<Math.min(innerHeight,pane.bottom)&&r.right>pane.left&&r.left<pane.right;
}
function markVisibleWorkspaceDocuments(){
 if(!isBackpackOpen()||workspaceTab!=='materials')return;
 for(const d of document.querySelectorAll('[data-workspace-document-id][open]'))if(workspaceElementPresented(d))recordWorkspaceDocumentViewed(d.dataset.workspaceDocumentId);
}
function showWorkspaceDocument(id){
 if(!id)return;setWorkspaceTab('materials');const d=document.querySelector(`[data-workspace-document-id="${id}"]`);if(!d)return;
 d.open=true;state.openWorkspaceDocumentIds=[...new Set([...state.openWorkspaceDocumentIds,id])];
 const pane=document.getElementById('workspace-materials-pane');
 if(pane)pane.scrollTop+=d.getBoundingClientRect().top-pane.getBoundingClientRect().top;
 markVisibleWorkspaceDocuments();
}
function workspaceCurrentEditorAvailable(view=workspaceStateView()){
 return Boolean(view.canSubmit&&state.activeArtifactTask?.hasTask&&state.activeArtifactTask.sourceTaskId===view.taskId&&!state.artifactTaskLoading&&!state.sessionClosed&&!state.apiFatalError&&!state.finalOutcome&&state.artifactSubmissionStatus!=='submitting');
}
function startWorkspaceWriting(){
 if(!isBackpackOpen()||workspaceTab!=='current'||!workspaceCurrentEditorAvailable())return false;
 const label=document.getElementById('artifact-option-label'),input=document.getElementById('artifact-draft-input');
 if(label.hidden||input.hidden||input.disabled)return false;
 label.scrollIntoView({block:'start',inline:'nearest'});
 const body=document.getElementById('workspace-current-body');body.scrollTop=Math.max(0,body.scrollTop-8);
 (document.querySelector('#artifact-options button:not(:disabled)')||input).focus({preventScroll:true});
 return true;
}
function renderWorkspaceUi(){
 const panel=document.getElementById('backpack-panel');if(!panel?.querySelector('#workspace-tabs'))return;
 const view=workspaceStateView(),zh=state.language==='zh';panel.dataset.workspaceState=view.kind;panel.dataset.workspaceUiVersion=WORKSPACE_UI_VERSION;
 for(const b of panel.querySelectorAll('[data-workspace-tab]')){b.textContent=workspaceTabText(b.dataset.workspaceTab);b.setAttribute('aria-selected',String(b.dataset.workspaceTab===workspaceTab));b.tabIndex=b.dataset.workspaceTab===workspaceTab?0:-1;}
 const scrollOwner=`${state.sessionEpoch}:${currentStage()?.id}`;for(const name of ['current','materials','notes','records']){const pane=document.getElementById(`workspace-${name}-pane`);pane.hidden=workspaceTab!==name;if(workspaceScrollOwner!==scrollOwner)pane.scrollTop=0;}if(workspaceScrollOwner!==scrollOwner)document.getElementById('workspace-current-body').scrollTop=0;workspaceScrollOwner=scrollOwner;
 document.getElementById('workspace-stage-label').textContent=`${labDayContext()?.label||''} · ${currentStageLabel()}`;
 document.getElementById('workspace-current-title').textContent=view.title;document.getElementById('workspace-current-note').textContent=view.note;
 renderWorkspaceWorkEvidence();
 if(typeof renderReviewMaterials==='function')renderReviewMaterials();
 if(typeof renderReviewEpisode==='function')renderReviewEpisode();
 if(typeof renderCooperationWorkspace==='function')renderCooperationWorkspace();
 if(typeof renderWorkEpisode==='function')renderWorkEpisode();
 if(typeof renderWorkRevision==='function')renderWorkRevision();
 if(typeof renderProjectWorkflowBackpack==='function')renderProjectWorkflowBackpack();
 if(typeof renderCreditWorkflow==='function')renderCreditWorkflow();
 const start=document.getElementById('workspace-start-writing');start.hidden=typeof projectReportTaskId==='function'&&Boolean(projectReportTaskId())||!workspaceCurrentEditorAvailable(view);start.disabled=start.hidden;start.textContent=zh?'选择方式并填写':'Choose an approach and write';
 const action=document.getElementById('workspace-current-action');action.hidden=!['entry_read_only','entry_record','work_feedback','story_before_work','credit_feedback'].includes(view.kind);
 action.textContent=view.kind==='credit_feedback'?(zh?'返回实验室查看回应':'Return to the laboratory for the reply'):view.kind==='entry_record'?(zh?'查看起步记录':'Read the entry record'):view.kind==='work_feedback'?(zh?'查看反馈':'Read feedback'):view.kind==='story_before_work'?(zh?'返回组里讨论':'Return to the team'):(zh?'查看起步说明':'Read the starting scope');
  action.onclick=()=>{if(view.kind==='entry_record'){setWorkspaceTab('records');const r=document.getElementById('entry-workspace-receipt');if(r){r.open=true;if(r.getClientRects().length)recordEntryReceiptViewed();}}else if(view.kind==='work_feedback')setWorkspaceTab('records');else if(['story_before_work','credit_feedback'].includes(view.kind)){closeBackpack();setWorldHelp(labStoryNextAction());}else showWorkspaceDocument(view.documentId);};
 const missingMaterial=typeof stageMissingRequiredMaterial==='function'?stageMissingRequiredMaterial():null;
 if(missingMaterial){
  const owner=stagePacingToken();
  document.getElementById('workspace-current-note').textContent=stageRequiredMaterialText(missingMaterial);
  action.hidden=false;action.textContent=zh?`打开“${missingMaterial.title}”`:`Open "${missingMaterial.title}"`;
  action.onclick=()=>{if(owner===stagePacingToken()&&isBackpackOpen()&&workspaceTab==='current'&&stageMissingRequiredMaterial()?.id===missingMaterial.id)showWorkspaceDocument(missingMaterial.id);};
 }
 const records=document.getElementById('workspace-submission-list');records.replaceChildren();
 const submissions=LabReviewEpisodeCore.submissions({epoch:state.sessionEpoch,events:state.eventLedger,artifacts:state.submittedArtifacts});
 if(!submissions.length){const p=document.createElement('p');p.className='workspace-empty-records';p.textContent=zh?'还没有提交记录。':'No submissions yet.';records.append(p);}
 const latestSubmissions=new Map();for(const a of submissions)latestSubmissions.set(a.taskId,a.id);
 for(const a of submissions.slice().reverse()){
  const row=document.createElement('article'),title=document.createElement('h4'),status=document.createElement('span'),text=document.createElement('p');row.className='workspace-submission-record';
  title.textContent=a.title||a.taskId;status.textContent=a.feedback.length?artifactStatusLabel(a.status):(zh?'提交已记录 · 反馈尚未展示':'Submission recorded · Feedback not presented');status.className='artifact-status';
  text.textContent=a.feedback.map(d=>`${d.speaker}: ${d.text}`).join('\n');
  const version=document.createElement('small');version.textContent=latestSubmissions.get(a.taskId)===a.id?(zh?'当前实际提交版':'Current actual submission'):(zh?'此前尝试 · 评价保留，后续已有新提交':'Earlier attempt · grade retained; a later submission exists');row.append(version);
  const own=document.createElement('details'),caption=document.createElement('summary'),note=document.createElement('p');caption.textContent=zh?'查看我实际提交的内容':'Inspect my actual submission';note.textContent=[a.action,a.note].filter(Boolean).join('\n\n');own.append(caption,note);
  row.append(title,status,own,text);records.append(row);
 }
}
function initializeWorkspaceUi(){
 const panel=document.getElementById('backpack-panel'),header=panel.querySelector('.side-talk-header'),inventory=panel.querySelector('.inventory-tool');inventory.hidden=true;
 const tabs=document.createElement('nav');tabs.id='workspace-tabs';tabs.setAttribute('role','tablist');
 for(const name of ['current','materials','records']){const b=document.createElement('button');b.type='button';b.dataset.workspaceTab=name;b.setAttribute('role','tab');b.setAttribute('aria-controls',`workspace-${name}-pane`);b.onclick=()=>setWorkspaceTab(name);tabs.append(b);}
 const stage=document.createElement('p');stage.id='workspace-stage-label';header.after(stage,tabs);
 const current=document.createElement('section');current.id='workspace-current-pane';current.setAttribute('role','tabpanel');current.innerHTML='<div class="workspace-current-card"><h3 id="workspace-current-title"></h3><p id="workspace-current-note"></p><button id="workspace-current-action" type="button"></button></div>';
 const body=document.createElement('div');body.id='workspace-current-body';body.append(current.firstElementChild);current.append(body);
 const start=document.createElement('button');start.id='workspace-start-writing';start.type='button';start.className='secondary-btn full-width';start.hidden=true;start.setAttribute('aria-controls','artifact-options');start.onclick=startWorkspaceWriting;body.before(start);
 for(const id of ['backpack-guidance','artifact-task-summary','artifact-option-label','artifact-options','artifact-note-label','artifact-draft-input','artifact-warning','submit-artifact-btn'])(id==='submit-artifact-btn'?current:body).append(document.getElementById(id));
 const files=document.createElement('section');files.id='workspace-materials-pane';files.setAttribute('role','tabpanel');
 const boundary=document.createElement('section');boundary.id='workspace-source-boundary';
 const work=document.createElement('details');work.id='workspace-work-evidence';work.innerHTML='<summary id="workspace-work-evidence-heading"></summary><p id="workspace-work-evidence-note"></p><div id="workspace-work-evidence-list"></div>';
 const review=document.createElement('section');review.id='workspace-review-materials';
 files.append(review,boundary,work,document.getElementById('workspace-documents'));
 const records=document.createElement('section');records.id='workspace-records-pane';records.setAttribute('role','tabpanel');records.innerHTML='<div id="workspace-submission-list"></div>';
 panel.append(current,files,records);files.addEventListener('scroll',markVisibleWorkspaceDocuments);records.addEventListener('scroll',()=>{const r=document.getElementById('entry-workspace-receipt');if(r?.open&&workspaceElementPresented(r))recordEntryReceiptViewed();});document.getElementById('artifact-draft-input').addEventListener('input',saveWorkspaceEditorDraft);
 tabs.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const names=['current','materials','notes','records'],i=names.indexOf(e.target.dataset.workspaceTab||workspaceTab),next=e.key==='Home'?0:e.key==='End'?2:(i+(e.key==='ArrowRight'?1:3))%4;setWorkspaceTab(names[next]);tabs.querySelector(`[data-workspace-tab="${names[next]}"]`).focus();});
}
initializeWorkspaceUi();

function renderWorkspaceWorkEvidence(){
 const boundary=document.getElementById('workspace-source-boundary');if(!boundary)return;const zh=state.language==='zh';
 boundary.replaceChildren();const title=document.createElement('strong'),p=document.createElement('p'),button=document.createElement('button');
 title.textContent=zh?'项目资料与工作记录':'Project materials and work records';
 p.textContent=typeof projectWorkflowEnabled==='function'&&projectWorkflowEnabled()?(zh?'材料包里有收到的报告初稿和12行匿名成绩。到“当前事项”编辑报告，到“提交记录”查看送审版本和老师意见。':'Materials contains the starting draft and twelve anonymous score rows. Edit the report in Current, and read reviewed versions and advisor comments in Submissions.'):(zh?'原始简报保留接手时的版本，不会被后续对话覆盖。实际提交、修改计划与已展示的公开反馈会更新在本局记录中；这里没有完整分析表、表头或图 2 对应的逐行数据。':'The original brief retains its handover version. Actual submissions, revision plans and delivered public feedback update the run record. No complete analysis table, column headers or row-by-row Figure 2 data is supplied here.');
 button.type='button';button.textContent=zh?'查看本局记录':'View this run’s record';button.onclick=()=>{const work=document.getElementById('workspace-work-evidence');work.open=true;work.scrollIntoView({block:'start'});};boundary.append(title,p,button);
 const rows=LabMaterialEvidenceCore.project({epoch:state.sessionEpoch,events:state.eventLedger,artifacts:state.submittedArtifacts}),list=document.getElementById('workspace-work-evidence-list');list.replaceChildren();
 document.getElementById('workspace-work-evidence-heading').textContent=zh?`工作记录 · ${rows.length} 条记录`:`Work records · ${rows.length} entries`;
 document.getElementById('workspace-work-evidence-note').textContent=typeof projectWorkflowEnabled==='function'&&projectWorkflowEnabled()?(zh?'在这里回看送审的报告版本、老师意见和小组讨论。':'Review report versions, advisor comments and team discussions here.'):(zh?'以下是实际提交与已展示的公开交流，不是自动完成的新实验、核验数据或修改后的原稿。计划与提议不代表已执行或已达成一致。':'Actual submissions and delivered public exchanges, not automatic experiments, verified data or a revised manuscript. A plan or proposal is not completed work or agreement.');
 if(!rows.length){const p=document.createElement('p');p.className='workspace-empty-records';p.textContent=zh?'还没有工作记录，可以先查看项目材料。':'No work records yet. Start with the project materials.';list.append(p);}
 for(const r of rows){const card=document.createElement('article');card.className='workspace-work-evidence-row';card.dataset.sourceEventId=r.sourceEventId;
  const heading=document.createElement('h4');heading.textContent=r.kind==='submission'?(r.title||r.taskId):(zh?{advisor_review:'导师反馈',return_blame:'回组责任讨论',final_check:'实际工作与贡献核对'}[r.anchorId]||'小组讨论':{advisor_review:'Advisor feedback',return_blame:'Team responsibility discussion',final_check:'Actual work and credit check'}[r.anchorId]||'Group discussion');card.append(heading);
  if(r.kind==='submission'){const status=document.createElement('span');status.className='artifact-status';status.textContent=artifactStatusLabel(r.status);card.append(status);
   for(const [label,text]of [[zh?'实际提交方式':'Submitted approach',r.selectedOption],[zh?'实际提交的说明':'Submitted note',r.note]])if(text){const p=document.createElement('p');p.textContent=`${label}：${text}`;card.append(p);}
   if(!r.feedback.length){const p=document.createElement('p');p.textContent=zh?'这份工作已提交，正在等待回复。':'Your work has been submitted and is awaiting a reply.';card.append(p);}}
  for(const line of r.feedback){const p=document.createElement('p');p.textContent=`${line.speaker}: ${line.text}`;card.append(p);}list.append(card);
 }
}

// Keep the visible submit state aligned with its handler, without rerendering
// the form or clearing the draft while asynchronous chronology is settling.
function syncWorkspaceSubmitAvailability(){
 const button=document.getElementById('submit-artifact-btn'),warning=document.getElementById('artifact-warning'),artifact=state.activeArtifactTask;
 if(!button||button.hidden||!isBackpackOpen()||!artifact?.hasTask)return;
 const timing=labTimingPending.size>0||Object.keys(labClock().errors).length>0;
 const task=state.projectTasks.find(t=>t.id===artifact.sourceTaskId);
 button.disabled=Boolean(timing||state.sessionClosed||state.apiFatalError||state.isIntroPlaying||state.isScenePlaying||state.isGmThinking||state.decisionPanelVisible||state.artifactTaskLoading||state.artifactSubmissionStatus==='submitting'||!state.selectedArtifactOption||!workspaceStateView().canSubmit);
 if(timing&&warning&&state.artifactSubmissionStatus!=='submitting'){
  warning.dataset.timingWait='true';warning.textContent=state.language==='zh'?'正在确认上一段工作的耗时，草稿已保留。确认后可提交，不会自动发送；若判断失败，可关闭电脑后重试。':'The previous work-time check is pending. Your draft is retained; submit once it settles. Nothing is sent automatically. If it fails, close the workspace and retry timing.';
 }else if(warning?.dataset.timingWait){delete warning.dataset.timingWait;warning.textContent='';}
}
