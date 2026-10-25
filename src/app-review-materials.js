// Source-linked, flat project material. Viewing never edits/submits a report.
let reviewMaterialsOwner='';
function reviewMaterialsCanDraft(){const view=workspaceStateView();return Boolean(state.activeArtifactTask?.hasTask&&['brief_review','revision_plan','contribution_statement'].includes(state.activeArtifactTask.sourceTaskId)&&view.canSubmit&&view.taskId===state.activeArtifactTask.sourceTaskId&&!state.artifactTaskLoading&&!state.activeEventLock&&!state.isScenePlaying&&!state.sessionClosed&&!state.apiFatalError);}
function appendReviewDraftText(quote){
 if(!reviewMaterialsCanDraft())return false;saveWorkspaceEditorDraft();
 if(typeof projectReportTaskId==='function'&&projectReportTaskId()){setWorkspaceTab('current');return applyProjectReportNote(quote);}
 const draft=state.artifactDraft||'';
 if(!draft.includes(quote))state.artifactDraft=(draft?draft+'\n\n':'')+quote;
 document.getElementById('artifact-draft-input').value=state.artifactDraft;
 setWorkspaceTab('current');document.getElementById('artifact-draft-input').value=state.artifactDraft;document.getElementById('artifact-draft-input').focus();return true;
}
function quoteReviewMaterial(card){const ref=cooperationReferences(cooperationView()).find(c=>c.documentId===card.sourceDocumentId&&c.sectionId===card.sectionId&&c.quote===card.quote);return ref?cooperationCite(ref,cooperationOwner()):false;}
function renderReviewMaterials(){
 const host=document.getElementById('workspace-review-materials');if(!host)return;
 const view=LabReviewMaterialsCore.project(state.sharedComputerArtifacts,state.language),zh=state.language==='zh';host.hidden=!view;if(!view)return;
 const owner=`${state.sessionEpoch}:${state.language}`;reviewMaterialsOwner=owner;host.replaceChildren();host.dataset.reviewMaterialsVersion=view.version;
 const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 host.append(node('h3',view.title),node('p',view.intro),node('p',view.design));
 const table=node('table'),caption=node('caption',view.tableCaption),thead=node('thead'),head=node('tr'),body=node('tbody');table.append(caption);
 for(const label of view.tableHeadings){const th=node('th',label);th.scope='col';head.append(th);}thead.append(head);table.append(thead);
 for(const r of view.rows){const tr=node('tr');for(const text of [r.id,r.before??view.missingLabel,r.after??view.missingLabel,r.change===null?'—':`${r.change>0?'+':''}${r.change}`,r.included?view.includedLabel:view.excludedLabel])tr.append(node('td',String(text)));body.append(tr);}table.append(body);const dataCard=node('section');dataCard.className='review-material-card';dataCard.dataset.reviewPairedScores='';dataCard.append(table);host.append(dataCard);
 const s=view.summary,summary=node('p',zh?`完整配对 ${s.pairCount} 人：前测平均 ${s.beforeMean} 分，后测 ${s.afterMean} 分，平均变化 ${s.meanChange>0?'+':''}${s.meanChange} 分。${s.improved} 人提高、${s.unchanged} 人持平、${s.declined} 人下降。`:`${s.pairCount} complete pairs: before mean ${s.beforeMean}, after mean ${s.afterMean}, mean change ${s.meanChange>0?'+':''}${s.meanChange} points. ${s.improved} improved, ${s.unchanged} unchanged, ${s.declined} declined.`);summary.dataset.reviewScoreSummary='';dataCard.append(summary);
 const chart=node('figure');chart.dataset.reviewScoreChart='';chart.style.margin='12px 0';chart.append(node('figcaption',view.chart.title));
 for(const [label,value] of [[view.chart.before,s.beforeMean],[view.chart.after,s.afterMean]]){const row=node('p'),meter=node('meter');meter.min=view.chart.min;meter.max=view.chart.max;meter.value=value;meter.setAttribute('aria-label',`${label}: ${value} /100`);row.append(node('span',`${label}: ${value} /100 `),meter);chart.append(row);}chart.append(node('small',zh?`同一批 ${s.pairCount} 人；描述成绩变化，不表示已证明因果。`:`The same ${s.pairCount} pairs; observed score change is not causal proof.`));dataCard.append(chart);
 for(const card of view.cards){
  const row=node('article');row.className='review-material-card';row.dataset.reviewCard=card.id;
  row.append(node('h4',card.title),node('p',card.plain),node('blockquote',card.quote),node('small',card.sourceLabel));
  const limit=node('p',card.limit);limit.className='review-material-limit';row.append(limit);
  const actions=node('div');actions.className='review-material-actions';
  const open=node('button',zh?'查看完整原件':'Open full source');open.type='button';open.onclick=()=>{if(owner===reviewMaterialsOwner)showWorkspaceDocument(card.sourceDocumentId);};actions.append(open);
  const cite=node('button',zh?'摘录到我的笔记':'Quote in my notes');cite.type='button';cite.dataset.reviewQuote=card.id;cite.disabled=!cooperationSafe();cite.onclick=()=>owner===reviewMaterialsOwner&&quoteReviewMaterial(card);actions.append(cite);row.append(actions);host.append(row);
 }
 host.append(node('p',zh?'这里保存成绩资料与原稿。需要改稿时，到“当前事项”编辑报告正文。':'The score data and starting draft are kept here. Edit the report in Current.'));
}
