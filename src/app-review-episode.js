// Guided Stage 2 work loop. Actions delegate to existing authoritative handlers.
const REVIEW_EPISODE_COPY={
 zh:{title:'首次报告送审',intro:'小组正在整理学习提醒与测验成绩的参赛报告。查看已有资料，修改下方五节正文，准备好后送给老师审阅。',
  steps:{materials:'材料已展示',draft:'首次报告已提交',feedback:'收到实际反馈',advisor:'首次老师审阅已读',discussion:'小组回应已记录',handoff:'自己确认交接'},
  notes:{orient:'先看项目简介、报告初稿和成绩资料。有不清楚的地方，可以找成员讨论。',draft:'在下方编辑报告正文，核对文字、数据和图表是否一致。草稿会保存，准备好后再送审。',feedback_pending:'报告已送出，正在等待回复。',advisor:'报告已有反馈，可以当面听取老师的意见。',discussion:'老师的意见已经收到。可以回到组里讨论修改，也可以继续核对报告。',handoff:'这次讨论已记下。可以继续交流，或确认接下来的安排。',reply:'对方正在等你回应。可以接着聊，也可以先去看材料。'},
  actions:{materials:'查看现有材料',draft:'继续编辑报告正文',feedback:'查看实际反馈',advisor:'听老师审阅这份报告',discussion:'进入当前小组讨论',check:'检查讨论是否已准备好',handoff:'查看本轮回应与交接',reply:'继续回应对方',ask:'可选：带着问题找成员',closeAsk:'收起成员选择'},
  route:'草稿已保存。走到成员旁边后，可以继续询问报告里的问题。',draftNotice:'已有未送审的报告正文；还不是完成的提交。',progressNote:'已完成的工作',receipt:'老师最近的回复',limits:'材料包包含报告初稿、12行匿名成绩、选入说明和汇总图。修改时可以对照原文，核对每项说法的依据。'},
 en:{title:'First report review',intro:'The team is preparing a competition report about study reminders and quiz scores. Read the materials, edit the five sections below, and send the report to the advisors when it is ready.',
  steps:{materials:'Material presented',draft:'First report submitted',feedback:'Actual feedback delivered',advisor:'First advisor review read',discussion:'Group responses recorded',handoff:'You confirm the handoff'},
  notes:{orient:'Read the project introduction, starting draft and score data. Ask a member about anything unclear.',draft:'Edit the report below and check that the text, data and figure agree. Your draft is saved; send it for review when it is ready.',feedback_pending:'Your report has been sent and is awaiting a reply.',advisor:'Your report has received feedback. Hear what the advisors have to say.',discussion:'The advisors’ comments have arrived. Discuss the edits with the team or continue reviewing the report.',handoff:'This discussion has been recorded. Continue the conversation or confirm the next steps.',reply:'Someone is waiting for your reply. Continue the exchange or check the materials first.'},
  actions:{materials:'Inspect available material',draft:'Continue editing the report',feedback:'Read actual feedback',advisor:'Hear the review of this report',discussion:'Join the current group discussion',check:'Check discussion readiness',handoff:'View responses and handoff',reply:'Continue the reply',ask:'Optional: ask a member',closeAsk:'Hide member selection'},
  route:'Your draft is saved. Walk over to a member to ask about the report.',draftNotice:'An unsent report body exists; it is not a completed submission.',progressNote:'Work completed',receipt:'Latest advisor reply',limits:'Materials contains the starting draft, twelve anonymous score rows, inclusion notes and a summary figure. Refer to these sources when checking the report’s claims.'}
};
function reviewEpisodeSnapshot(){if(currentStage()?.id!==LabReviewEpisodeCore.STAGE)return null;const v=LabReviewEpisodeCore.project({epoch:state.sessionEpoch,stageId:currentStage()?.id,events:state.eventLedger,artifacts:state.submittedArtifacts,draft:state.artifactDraft,
 advisor:labAnchorRecord('advisor_review'),pendingCore:labStoryState().pendingCore,question:openingQuestionIsCurrent()?openingQuestionPending:null,ready:stageKeyDecisionReady()});return typeof workRevisionDraftCurrent==='function'&&workRevisionDraftCurrent()&&!v.question?{...v,phase:'draft',revisionPending:true}:v;}
function reviewEpisodeUiSafe(){return state.screen==='game'&&isBackpackOpen()&&workspaceTab==='current'&&!isTaskBoardOpen()&&!state.sessionClosed&&!state.apiFatalError&&!state.finalOutcome&&!state.isIntroPlaying&&!state.decisionPanelVisible&&!state.activeEventLock&&!state.isScenePlaying&&!state.isGmThinking&&!state.dialogueAdvancePending&&!isSideTalkOpen()&&!isPlayerToolOpen()&&!labStoryRuntime&&!labDayHandoff&&!privateConversationPendingIsCurrent()&&!(state.voiceModality?.enabled&&['loading','buffering','speaking'].includes(state.voiceModality.status));}
function reviewEpisodeOwner(){return `${state.sessionEpoch}:${currentStage()?.id}`;}
function reviewEpisodeAction(action,owner){
 if(owner!==reviewEpisodeOwner()||!reviewEpisodeUiSafe()||!reviewEpisodeSnapshot())return false;
 if(!['materials','draft','feedback','reply','advisor','discussion','check','handoff'].includes(action))return false;
 saveWorkspaceEditorDraft();const view=reviewEpisodeSnapshot();
 if(action==='materials'){showWorkspaceDocument('inherited-project-brief-v1');return true;}
 if(action==='draft'){if(!reviewMaterialsCanDraft())return false;setWorkspaceTab('current');if(typeof projectReportTaskId==='function'&&projectReportTaskId())focusProjectReportEditor();else document.getElementById('artifact-draft-input').focus();return true;}
 if(action==='feedback'){setWorkspaceTab('records');return true;}
 closeBackpack();
 if(action==='reply'){if(!view.question)return false;return resumeOpeningQuestion();}
 if(action==='advisor'){if(!view.submission?.feedback.length||view.advisorPresented||view.question||!labAnchorCanStart('advisor_review'))return false;void runLabStoryAnchor('advisor_review');return true;}
 if(action==='discussion'){if(!view.advisorPresented||view.question||view.handoff)return false;void enterStageKeyDecision();return true;}
 if(action==='check'){if(!view.advisorPresented||view.question||view.handoff)return false;void scheduleStageProgressCheck('player requested review discussion readiness');return true;}
 if(action==='handoff'){if(!view.handoff)return false;renderLabCoreHandoff();const panel=document.getElementById('ui-lab-core-handoff');if(!panel.hidden)panel.querySelector('details').open=true;return true;}
 return false;
}
function renderReviewEpisode(){
 const host=document.getElementById('workspace-review-episode'),panel=document.getElementById('backpack-panel');if(!host)return;
 const view=reviewEpisodeSnapshot();host.hidden=!view;panel.classList.toggle('review-episode-active',Boolean(view));if(!view)return;
 const c=REVIEW_EPISODE_COPY[state.language]||REVIEW_EPISODE_COPY.en,owner=reviewEpisodeOwner();
 host.dataset.episodePhase=view.phase;host.dataset.episodeVersion=view.version;
 panel.classList.toggle('review-episode-submitted',Boolean(view.submission));
 host.querySelector('h3').textContent=c.title;host.querySelector('[data-review-intro]').textContent=c.intro;host.querySelector('[data-review-next]').textContent=c.notes[view.phase];host.querySelector('[data-review-limits]').textContent=c.limits;
 host.querySelector('.review-episode-limits summary').textContent=state.language==='zh'?'材料说明':'About the materials';
 if(['advisor','discussion','handoff'].includes(view.phase)&&!currentLabTimingReady())host.querySelector('[data-review-next]').textContent+=state.language==='zh'?' 正在整理刚才的工作记录，草稿已保存。':' The recent work record is being saved. Your draft is retained.';
 host.querySelector('[data-review-progress-note]').textContent=c.progressNote;
 const receipt=host.querySelector('[data-review-receipt]');receipt.hidden=!view.submission?.feedback.length;receipt.querySelector('strong').textContent=c.receipt;receipt.querySelector('span').textContent=view.submission?.feedback.length?artifactStatusLabel(view.submission.status):'';receipt.querySelector('p').textContent=(view.submission?.feedback||[]).map(d=>`${d.speaker}: ${d.text}`).join('\n');
 const steps=host.querySelector('[data-review-steps]');steps.replaceChildren();for(const s of view.steps.filter(s=>s.done)){const li=document.createElement('li');li.textContent=c.steps[s.id];li.dataset.done=String(s.done);if(s.draftOnly)li.title=c.draftNotice;steps.append(li);}
 steps.hidden=!steps.children.length;host.querySelector('[data-review-progress-note]').hidden=!steps.children.length;
 const primary=host.querySelector('[data-review-primary]'),action=view.phase==='discussion'&&!view.materialPresented?'materials':{orient:'materials',draft:'draft',feedback_pending:'feedback',advisor:'advisor',discussion:view.discussionReady?'discussion':'check',handoff:'handoff',reply:'reply'}[view.phase];
 if(view.phase==='discussion'&&!view.materialPresented)host.querySelector('[data-review-next]').textContent+=state.language==='zh'?' 可以先打开报告初稿，对照老师的意见。':' Open the starting draft to compare it with the advisors’ comments.';
 primary.textContent=c.actions[action];primary.disabled=!reviewEpisodeUiSafe()||view.phase==='feedback_pending'||(['advisor','discussion','handoff'].includes(view.phase)&&!currentLabTimingReady());primary.onclick=()=>reviewEpisodeAction(action,owner);
 const material=host.querySelector('[data-review-materials]');material.hidden=action==='materials';material.textContent=c.actions.materials;material.disabled=!reviewEpisodeUiSafe();material.onclick=()=>reviewEpisodeAction('materials',owner);
 const feedback=host.querySelector('[data-review-feedback]');feedback.hidden=!view.submission?.feedback.length;feedback.textContent=c.actions.feedback;feedback.disabled=!reviewEpisodeUiSafe();feedback.onclick=()=>reviewEpisodeAction('feedback',owner);
 const ask=host.querySelector('[data-review-ask]'),picker=host.querySelector('[data-review-members]');ask.textContent=picker.hidden?c.actions.ask:c.actions.closeAsk;ask.disabled=!reviewEpisodeUiSafe();ask.onclick=()=>{if(owner!==reviewEpisodeOwner()||!reviewEpisodeUiSafe())return;picker.hidden=!picker.hidden;ask.textContent=picker.hidden?c.actions.ask:c.actions.closeAsk;};
 if(picker.dataset.owner!==owner+':'+state.language){picker.replaceChildren();picker.dataset.owner=owner+':'+state.language;picker.hidden=true;const note=document.createElement('p');note.textContent=c.route;picker.append(note);for(const npc of state.npcs){const b=document.createElement('button');b.type='button';b.textContent=npc.name;b.onclick=()=>{if(owner!==reviewEpisodeOwner()||!reviewEpisodeUiSafe())return;saveWorkspaceEditorDraft();closeBackpack();if(!isFreeExplorationActive())return;void approachNpcForConversation(npc);};picker.append(b);}}
 ask.textContent=picker.hidden?c.actions.ask:c.actions.closeAsk;
 for(const b of picker.querySelectorAll('button'))b.disabled=!reviewEpisodeUiSafe();
}
function initializeReviewEpisode(){const pane=document.getElementById('workspace-current-body');const host=document.createElement('section');host.id='workspace-review-episode';host.hidden=true;host.innerHTML='<h3></h3><p data-review-intro></p><ol data-review-steps></ol><small data-review-progress-note></small><p data-review-next role="status"></p><article data-review-receipt hidden><strong></strong><span class="artifact-status"></span><p></p></article><div class="review-episode-actions"><button type="button" data-review-primary></button><button type="button" data-review-materials></button><button type="button" data-review-feedback></button><button type="button" data-review-ask></button></div><div data-review-members hidden></div><details class="review-episode-limits"><summary>材料说明 / About the materials</summary><p data-review-limits></p></details>';pane.prepend(host);}
initializeReviewEpisode();
