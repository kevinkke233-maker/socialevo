// Later episodes use the existing authoritative task/anchor/decision handlers.
const WORK_EPISODE_COPY={
 zh:{stage_3_revision_conflict:{title:'继续改这份参赛报告',intro:'回看老师已经给出的意见，继续编辑电脑里的报告。需要时可以找成员商量具体问题。',return_to_team:'修改后的报告已经送审。带上报告和收到的意见，继续与老师和组员交流。',draft:'继续编辑研究问题、方法与样本、结果与图表、结论、局限。核对表内数字和报告用词，改好后再次送审。',discussion:'回看刚才的交流，把需要的修改落实到正文。准备好后，可以讨论正式提交。'},stage_4_credit:{title:'说明各自的贡献',intro:'回看比赛结果、提交的报告和合作记录，整理这次项目中每个人做过的工作。',draft:'写清自己的正文修改、使用的数据和他人提供的帮助。可以引用报告版本，也可以注明仍有分歧的地方。',final_check:'贡献说明已经提交。带上报告版本和合作记录，与组员核对。',discussion:'可以回应刚才提出的问题，也可以回看记录后继续讨论。'},reply:'对方还有一个问题。可以继续回应，也可以先去查看材料。',handoff:'可以继续交流，也可以查看刚才的回应，准备好后再继续。',feedback_pending:'报告已送审，正在等老师的反馈。草稿和提交记录都已保存。',actions:{return_to_team:'听取审阅并回组交流',draft:'继续编辑报告正文',final_check:'与组员核对贡献',discussion:'参加小组讨论',check:'继续准备讨论',reply:'继续回应对方',handoff:'查看刚才的回应',materials:'查看材料和老师意见',people:'带着问题找成员'}},
 en:{stage_3_revision_conflict:{title:'Keep revising the competition report',intro:'Review the advisor comments you have received and keep editing the report on the computer. Ask a member about a specific issue if useful.',return_to_team:'The revised report has been sent for review. Bring the report and received comments to the advisors and team.',draft:'Edit question, methods and participants, results and figures, conclusion and limitations. Check the source values and wording before sending it for review again.',discussion:'Look back at the conversation and apply any needed edits to the report. Discuss formal submission when ready.'},stage_4_credit:{title:'Describe everyone’s contribution',intro:'Review the competition result, submitted report and collaboration notes to describe what each person did.',draft:'Describe your edits, the data used and help from others. Cite report versions and note any disagreements.',final_check:'Your contribution statement has been submitted. Review it with the team using the report versions and collaboration notes.',discussion:'Respond to questions from the conversation, or look back at your notes before continuing.'},reply:'A question is awaiting you. Continue the reply, or check the material first.',handoff:'Keep talking, or review the replies and continue when ready.',feedback_pending:'The report has been sent. Your draft and submission record are saved while you await feedback.',actions:{return_to_team:'Hear the review and talk with the team',draft:'Continue editing the report',final_check:'Review contribution with the team',discussion:'Join the group discussion',check:'Prepare for the discussion',reply:'Continue the reply',handoff:'View the replies',materials:'View material and advisor comments',people:'Ask a member'}}
};
function workEpisodeSnapshot(){const id=currentStage()?.id,v=LabWorkEpisodeCore.project({epoch:state.sessionEpoch,stageId:id,events:state.eventLedger,artifacts:state.submittedArtifacts,anchor:labAnchorRecord(id==='stage_3_revision_conflict'?'return_blame':'final_check'),anchorSteps:typeof labAnchorSteps==='function'?labAnchorSteps(id==='stage_3_revision_conflict'?'return_blame':'final_check'):null,pendingCore:labStoryState().pendingCore,question:openingQuestionIsCurrent()?openingQuestionPending:null,ready:stageKeyDecisionReady()});return v&&typeof workRevisionDraftCurrent==='function'&&workRevisionDraftCurrent()&&!v.question?{...v,phase:'draft',revisionPending:true}:v;}
function workEpisodeUiSafe(){return state.screen==='game'&&isBackpackOpen()&&workspaceTab==='current'&&!state.sessionClosed&&!state.apiFatalError&&!state.finalOutcome&&!state.isIntroPlaying&&!state.isScenePlaying&&!state.isGmThinking&&!state.activeEventLock&&!state.dialogueAdvancePending&&!state.decisionPanelVisible&&!isSideTalkOpen()&&!isPlayerToolOpen()&&!isTaskBoardOpen()&&!labStoryRuntime&&!labDayHandoff&&!privateConversationPendingIsCurrent()&&!(state.voiceModality?.enabled&&['loading','buffering','speaking'].includes(state.voiceModality.status));}
function workEpisodeOwner(){return `${state.sessionEpoch}:${currentStage()?.id}:${state.language}`;}
function workEpisodeAction(action,owner){
 if(owner!==workEpisodeOwner()||!workEpisodeUiSafe())return false;const v=workEpisodeSnapshot();if(!v)return false;
 if(!['return_to_team','draft','final_check','discussion','check','reply','handoff','materials','people','credit'].includes(action))return false;
 if(action==='credit')return typeof openCreditWorkflow==='function'&&openCreditWorkflow();
 saveWorkspaceEditorDraft();
 if(action==='materials'){setWorkspaceTab('materials');return true;}
 if(action==='draft'){if(v.phase!=='draft'||!workspaceStateView().canSubmit||!state.activeArtifactTask?.hasTask||state.activeArtifactTask.sourceTaskId!==v.taskId||state.artifactTaskLoading)return false;if(typeof projectReportTaskId==='function'&&projectReportTaskId())focusProjectReportEditor();else document.getElementById('artifact-draft-input').focus();return true;}
 if(['return_to_team','final_check','discussion','check','handoff'].includes(action)&&!currentLabTimingReady())return false;
 if(['return_to_team','final_check'].includes(action)&&(v.anchorPresented||v.question||action!==v.phase))return false;
 if(action==='final_check'&&typeof creditWorkflowEnabled==='function'&&creditWorkflowEnabled()&&!creditWorkflowContext()?.published?.proposalId)return false;
 if(action==='discussion'&&!v.discussionReady)return false;
 if(action==='check'&&v.phase!=='discussion')return false;
 if(action==='reply'&&!v.question)return false;
 if(action==='handoff'&&!v.handoff)return false;
 closeBackpack();
 if(action==='people'){openPlayerTool('journal','people');return true;}
 if(action==='reply')return resumeOpeningQuestion();
 if(action==='handoff'){renderLabCoreHandoff();const p=document.getElementById('ui-lab-core-handoff');if(!p.hidden)p.querySelector('details').open=true;return !p.hidden;}
 if(action==='check'){void scheduleStageProgressCheck('player requested later work discussion readiness');return true;}
 if(action==='discussion'){void enterStageKeyDecision();return true;}
 if(action==='return_to_team'||action==='final_check'){
  // The real guard requires a closed computer. Stage 3 first hears its actual
  // pending advisor review, then returns to the group; no parent is skipped.
  const anchorId=action==='return_to_team'?labAnchorIdForStage():v.anchorId;
  if(owner!==workEpisodeOwner()||!labAnchorCanStart(anchorId))return false;
  void runLabStoryAnchor(anchorId);return true;
 }
 return false;
}
function renderWorkEpisode(){
 const host=document.getElementById('workspace-work-episode');if(!host)return;const v=workEpisodeSnapshot();host.hidden=!v;if(!v)return;
 const c=WORK_EPISODE_COPY[state.language]||WORK_EPISODE_COPY.en,copy=c[v.stageId],owner=workEpisodeOwner();host.dataset.workEpisodePhase=v.phase;host.dataset.workEpisodeVersion=v.version;
 host.querySelector('h3').textContent=copy.title;host.querySelector('[data-work-intro]').textContent=copy.intro;host.querySelector('[data-work-next]').textContent=copy[v.phase]||c[v.phase]||'';
 const creditClose=v.stageId==='stage_4_credit'&&state.roundIndex>=getDecisionWindows().length&&typeof creditWorkflowEnabled==='function'&&creditWorkflowEnabled();
 const action=creditClose?'credit':v.phase==='discussion'&&!v.discussionReady?'check':v.phase,primary=host.querySelector('[data-work-primary]');primary.textContent=creditClose?(state.language==='zh'?'查看并结束贡献讨论':'Review and close the credit discussion'):action==='draft'&&v.stageId==='stage_4_credit'?(state.language==='zh'?'编辑贡献说明':'Edit the contribution statement'):c.actions[action]||c.actions.materials;primary.dataset.workAction=action;
 const publishPending=action==='final_check'&&typeof creditWorkflowEnabled==='function'&&creditWorkflowEnabled()&&!creditWorkflowContext()?.published?.proposalId;
 if(publishPending)host.querySelector('[data-work-next]').textContent=state.language==='zh'?'先在下方填写并公开贡献提案，再与组员核对这版介绍。':'Fill in and publish the contribution proposal below, then check this description with the team.';
 primary.disabled=publishPending||!workEpisodeUiSafe()||v.phase==='feedback_pending'||(!['draft','reply'].includes(v.phase)&&!currentLabTimingReady())||(v.phase==='draft'&&(!workspaceStateView().canSubmit||!state.activeArtifactTask?.hasTask||state.activeArtifactTask.sourceTaskId!==v.taskId||state.artifactTaskLoading));primary.onclick=()=>workEpisodeAction(action,owner);
 const materials=host.querySelector('[data-work-materials]');materials.textContent=c.actions.materials;materials.disabled=!workEpisodeUiSafe();materials.onclick=()=>workEpisodeAction('materials',owner);
 const people=host.querySelector('[data-work-people]');people.textContent=c.actions.people;people.disabled=!workEpisodeUiSafe();people.onclick=()=>workEpisodeAction('people',owner);
}
function initializeWorkEpisode(){const host=document.createElement('section');host.id='workspace-work-episode';host.hidden=true;host.innerHTML='<h3></h3><p data-work-intro></p><p data-work-next role="status"></p><div class="review-episode-actions"><button type="button" data-work-primary></button><button type="button" data-work-materials></button><button type="button" data-work-people></button></div>';document.getElementById('workspace-current-body').append(host);}
initializeWorkEpisode();
