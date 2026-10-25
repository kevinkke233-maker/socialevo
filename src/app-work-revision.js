// Real feedback can lead to one more explicit edit, not automatic improvement.
function workRevisionEligibility(){
 if(typeof projectWorkflowEnabled==='function'&&projectWorkflowEnabled()&&projectReportTaskId())return {allowed:false,reason:'shared_report_editor'};
 if(currentStage()?.id==='stage_4_credit'&&typeof creditWorkflowEnabled==='function'&&creditWorkflowEnabled()&&!state.creditWorkflow?.closed){
  const row=LabReviewEpisodeCore.submissions({epoch:state.sessionEpoch,events:state.eventLedger,artifacts:state.submittedArtifacts}).filter(a=>a.taskId==='contribution_statement').at(-1);
  if(row&&!row.feedback.length)return {allowed:false,reason:'feedback_pending'};
  if(row)return {allowed:true,taskId:row.taskId,artifactId:row.id,eventId:row.eventId,note:row.note,status:row.status,
   selectedOptionId:state.eventLedger.find(e=>e.eventId===row.eventId)?.metadata?.selectedOptionId||''};
 }
 return LabWorkRevisionCore.eligibility({epoch:state.sessionEpoch,stageId:currentStage()?.id,events:state.eventLedger,artifacts:state.submittedArtifacts});
}
function workRevisionOwner(){return `${state.sessionEpoch}:${currentStage()?.id}:${state.language}`;}
function workRevisionDraftCurrent(){const a=state.activeArtifactTask,v=workRevisionEligibility();return Boolean(a?.hasTask&&a.status==='draft'&&a.revisionEpoch===state.sessionEpoch&&a.revisionOf&&v.allowed&&a.sourceTaskId===v.taskId&&a.revisionOf===v.artifactId&&a.revisionSourceEventId===v.eventId&&labRevisionPreparationAllowed(v.taskId));}
function workRevisionUiSafe(){return state.screen==='game'&&isBackpackOpen()&&workspaceTab==='current'&&!state.sessionClosed&&!state.finalOutcome&&!state.apiFatalError&&!state.isIntroPlaying&&!state.isScenePlaying&&!state.isGmThinking&&!state.activeEventLock&&!state.dialogueAdvancePending&&!state.decisionPanelVisible&&!isSideTalkOpen()&&!isTaskBoardOpen()&&!isPlayerToolOpen()&&!labStoryRuntime&&!labDayHandoff&&!privateConversationPendingIsCurrent()&&currentLabTimingReady();}
function workRevisionCanStartWithActiveTask(){
 return !state.activeArtifactTask?.hasTask||typeof creditWorkflowWorkspacePhase==='function'&&creditWorkflowWorkspacePhase()==='record';
}
function beginWorkRevision(owner){
 const v=workRevisionEligibility();if(owner!==workRevisionOwner()||!v.allowed||!labRevisionPreparationAllowed(v.taskId)||!workRevisionUiSafe()||!workRevisionCanStartWithActiveTask())return false;
 const retained=state.activeArtifactTask?.hasTask&&state.activeArtifactTask.sourceTaskId===v.taskId&&state.activeArtifactTask.status==='draft'?{note:state.artifactDraft,optionId:state.selectedArtifactOption}:null;
 const plan=designedWorkspaceTaskPlan(v.taskId);if(!plan)return false;
 const task=normalizeLaptopTaskPlan(plan);task.revisionOf=v.artifactId;task.revisionSourceEventId=v.eventId;task.revisionEpoch=state.sessionEpoch;
 state.activeArtifactTask=task;state.artifactDraft=retained?.note??v.note;const optionId=retained?.optionId??v.selectedOptionId;state.selectedArtifactOption=task.options.some(o=>o.id===optionId)?optionId:'';state.artifactSubmissionStatus='';state.artifactTaskLoading=false;renderBackpack();setWorkspaceTab('current');return true;
}
function renderWorkRevision(){
 const host=document.getElementById('workspace-work-revision');if(!host)return;const v=workRevisionEligibility(),a=state.activeArtifactTask,active=workRevisionDraftCurrent(),zh=state.language==='zh';
 host.hidden=!v.allowed&&!a?.revisionOf;if(host.hidden)return;host.replaceChildren();
 const title=document.createElement('strong');title.textContent=zh?'反馈之后，可以调整':'You can respond to feedback';host.append(title);
 const copy=document.createElement('p');copy.textContent=active?(zh?'修改稿尚未送出，准备好后可以再次提交。旧版本和意见保存在记录里。':'This revision has not been sent. Submit it again when ready; earlier versions and feedback are kept in Records.'):(v.allowed?(zh?'可以继续询问不清楚的意见，再修改这份说明；也可以保留当前版本，继续讨论。':'Ask about unclear feedback and revise this statement, or keep the current version and continue the discussion.'):(zh?'这份提交已进入后续评审或讨论，草稿仍保存在电脑里。':'This submission is now under review or discussion. Your draft is still saved on the computer.'));host.append(copy);
 if(v.allowed&&!active&&workRevisionCanStartWithActiveTask()){const b=document.createElement('button');b.type='button';b.dataset.workRevision='start';b.textContent=zh?'根据反馈修改当前提交':'Revise this submission from feedback';b.disabled=!workRevisionUiSafe();const owner=workRevisionOwner();b.onclick=()=>beginWorkRevision(owner);host.append(b);}
}
function validateRevisionSubmission(artifact,option,note){
 if(!artifact.revisionOf)return true;
 if(!workRevisionDraftCurrent()){const message=state.language==='zh'?'后续评审或讨论已经开始，不能用这个草稿替换已有提交。':'The later review/discussion has begun; this draft cannot replace the earlier submission.';document.getElementById('artifact-warning').textContent=message;return false;}
 const v=workRevisionEligibility();if(option.id===v.selectedOptionId&&note.trim()===v.note.trim()){document.getElementById('artifact-warning').textContent=state.language==='zh'?'当前内容与上一份提交相同。请先修改说明或完成方式，再确认提交。':'This is identical to the earlier submission. Change the note or approach before submitting.';return false;}return true;
}
function workRevisionCurrentSubmissions(){const rows=LabReviewEpisodeCore.submissions({epoch:state.sessionEpoch,events:state.eventLedger,artifacts:state.submittedArtifacts}),latest=new Map();for(const r of rows)latest.set(r.taskId,r);return [...latest.values()];}
const workRevisionHost=document.createElement('section');workRevisionHost.id='workspace-work-revision';workRevisionHost.hidden=true;document.querySelector('.workspace-current-card').append(workRevisionHost);
