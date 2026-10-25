// Shared, source-wording questionnaire presentation. No agent calls or scoring.
// The game receives only the current owner-authorized form, never the catalogue.
(function (global) {
  'use strict';
  const copy = {
    zh: {optional:'所有问题均可留空；请选择符合实际经历的回答。',progress:'已填写',of:'／',questions:'题',page:'页',previous:'上一页',next:'保存并继续下一页',submit:'提交本份问卷',skip:'跳过本份问卷',clear:'清除此题回答',blank:'未填写',saving:'正在保存，请保持页面打开…',saved:'服务器已确认保存草稿。',failed:'尚未确认保存，请重试；你的回答仍保留在此页。',skipNotice:'跳过会将本份问卷的所有回答留空。',confirmSkip:'确认跳过并继续',cancel:'继续填写',language:'语言',noQuestions:'当前没有需要填写的问题。'},
    en: {optional:'Every question may be left blank. Please answer from your actual experience.',progress:'Answered',of:' / ',questions:'questions',page:'Page',previous:'Previous page',next:'Save and continue',submit:'Submit this questionnaire',skip:'Skip this questionnaire',clear:'Clear this answer',blank:'Unanswered',saving:'Saving. Please keep this page open…',saved:'The server has confirmed saving the draft.',failed:'Saving has not been confirmed. Retry; your answers remain on this page.',skipNotice:'Skipping leaves all answers in this questionnaire blank.',confirmSkip:'Confirm skip and continue',cancel:'Keep answering',language:'Language',noQuestions:'There are no questions to answer at this point.'}
  };
  const localized = (value, language) => typeof value === 'string' ? value : value?.[language] || value?.en || value?.zh || '';
  const node = (tag, text, className) => {const item=document.createElement(tag);if(text!==undefined)item.textContent=text;if(className)item.className=className;return item;};
  let mountSequence=0;
  function mount(root, config) {
    const mountId=`questionnaire-view-${++mountSequence}`;
    const form=config.form || {}, items=Array.isArray(form.items)?form.items:[];
    const byId=new Map(items.map(item=>[item.id,item]));
    let language=config.language==='zh'?'zh':'en', busy=false, pageIndex=0, skipConfirm=false, disposed=false;
    const answers=Object.fromEntries(items.map(item=>[item.id,config.answers?.[item.id] ?? null]));
    const openedAt=new Date().toISOString(), started=performance.now();
    let draftTimer=null, statusMessage='', statusKind='', localRevision=0;
    const pages=[];
    for(const section of form.sections || []) {
      const ids=(section.itemIds || []).filter(id=>byId.has(id));
      if(ids.length)pages.push({...section,itemIds:ids});
    }
    if(!pages.length)pages.push({itemIds:items.map(item=>item.id)});
    const listed=new Set(pages.flatMap(page=>page.itemIds));
    const extra=items.filter(item=>!listed.has(item.id)).map(item=>item.id);if(extra.length)pages.push({itemIds:extra});
    const text=(key)=>copy[language][key];
    const completeAnswers=()=>Object.fromEntries(items.map(item=>[item.id,answers[item.id] === '' ? null : answers[item.id] ?? null]));
    const timing=(step)=>({openedAt,elapsedMs:Math.max(0,Math.round(performance.now()-started)),step:String(step),explicitSkip:step==='explicit-skip'});
    const setStatus=(kind,message)=>{statusKind=kind;statusMessage=message || '';const target=root.querySelector('[data-questionnaire-status]');if(target){target.textContent=statusMessage;target.dataset.kind=kind;}};
    const setBusy=(value)=>{busy=Boolean(value);for(const field of root.querySelectorAll('button,input,textarea,select'))field.disabled=busy;root.setAttribute('aria-busy',String(busy));};
    const refreshCount=()=>{const count=items.filter(item=>answers[item.id]!==null&&answers[item.id]!==''&&answers[item.id]!==undefined&&(!Array.isArray(answers[item.id])||answers[item.id].length)).length;const target=root.querySelector('[data-questionnaire-count]');if(target)target.textContent=`${text('progress')} ${count}${text('of')}${items.length} ${text('questions')}`;};
    async function saveDraft() {
      clearTimeout(draftTimer);draftTimer=null;
      if(disposed || !config.onDraft)return true;
      const revision=localRevision, snapshot=completeAnswers();
      setStatus('saving',config.preview ? localized(config.previewSaving,language) : text('saving'));
      try {await config.onDraft(snapshot,timing(`page-${pageIndex+1}`));if(disposed)return false;if(revision===localRevision)setStatus('saved',config.preview ? localized(config.previewSaved,language) : text('saved'));return true;}
      catch(error){if(!disposed)setStatus('error',error?.message || text('failed'));return false;}
    }
    function changed(id,value) {localRevision++;answers[id]=value;refreshCount();setStatus('unsaved',language==='zh'?'回答已更改，尚未确认保存。':'Answers changed; saving is not yet confirmed.');clearTimeout(draftTimer);draftTimer=setTimeout(()=>void saveDraft(),700);}
    function paragraphs(parent,values,className) {for(const value of (Array.isArray(values)?values:values?[values]:[])){const content=localized(value,language);if(content)parent.append(node('p',content,className));}}
    function question(item) {
      const fieldset=node('fieldset',undefined,'questionnaire-item');fieldset.dataset.questionId=item.id;
      const legend=node('legend');legend.append(node('span',`${item.displayId || ''}. `,'questionnaire-number'),node('span',localized(item.question,language)));fieldset.append(legend);
      const options=Array.isArray(item.options)?item.options:[];
      if(options.length) {
        const choices=node('div',undefined,'questionnaire-choices');
        for(const option of options) {
          const label=node('label',undefined,'questionnaire-choice');const input=node('input');
          input.type=item.type==='multiple_choice'?'checkbox':'radio';input.name=`${mountId}-${item.id}`;input.value=String(option.value);
          input.checked=input.type==='checkbox'?Array.isArray(answers[item.id])&&answers[item.id].includes(option.value):answers[item.id]===option.value;
          input.addEventListener('change',()=>{if(input.type==='checkbox'){const selected=new Set(Array.isArray(answers[item.id])?answers[item.id]:[]);input.checked?selected.add(option.value):selected.delete(option.value);changed(item.id,[...selected]);}else changed(item.id,option.value);});
          label.append(input,node('span',localized(option.label,language)));choices.append(label);
        }
        fieldset.append(choices);
      } else {
        const area=node('textarea');area.rows=4;area.maxLength=8000;area.value=typeof answers[item.id]==='string'?answers[item.id]:'';
        area.setAttribute('aria-label',localized(item.question,language));area.addEventListener('input',()=>changed(item.id,area.value));area.addEventListener('blur',()=>{if(draftTimer)void saveDraft();});fieldset.append(area);
      }
      paragraphs(fieldset,item.before,'questionnaire-item-note');paragraphs(fieldset,item.after,'questionnaire-item-note');
      const clear=node('button',text('clear'),'questionnaire-clear');clear.type='button';clear.addEventListener('click',()=>{changed(item.id,null);render();});fieldset.append(clear);
      return fieldset;
    }
    async function submit(skip) {
      if(busy)return;clearTimeout(draftTimer);draftTimer=null;setBusy(true);setStatus('saving',config.preview?localized(config.previewSaving,language):text('saving'));
      const data=skip?Object.fromEntries(items.map(item=>[item.id,null])):completeAnswers();
      try {await config.onSubmit(data,{...timing(skip?'explicit-skip':`submit-page-${pageIndex+1}`),submittedAt:new Date().toISOString()});}
      catch(error){if(!disposed){
        if(error?.code==='questionnaire_final_unknown'){
          setBusy(true);setStatus('error',error.message);const retry=node('button',language==='zh'?'重试确认保存':'Retry confirming submission','secondary-btn');retry.type='button';retry.dataset.questionnaireRetryFinal='';retry.onclick=()=>{retry.remove();busy=false;void submit(skip);};root.append(retry);
        } else {setBusy(false);setStatus('error',error?.message || text('failed'));}
      }}
    }
    function render() {
      if(disposed)return;root.replaceChildren();root.classList.add('study-questionnaire');
      const header=node('header',undefined,'questionnaire-header'),title=node('h1',localized(form.title,language));title.tabIndex=-1;
      const lang=node('select');lang.setAttribute('aria-label',text('language'));lang.dataset.questionnaireLanguage='';
      for(const [value,label] of [['zh','中文'],['en','English']]){const option=node('option',label);option.value=value;option.selected=language===value;lang.append(option);}
      lang.addEventListener('change',()=>{language=lang.value;config.onLanguage?.(language);render();});header.append(title,lang);root.append(header);
      const meta=node('div',undefined,'questionnaire-meta');const counter=node('span');counter.dataset.questionnaireCount='';meta.append(counter);if(!config.readOnly)meta.append(node('span',`${text('page')} ${pageIndex+1}${text('of')}${pages.length}`));root.append(meta);
      paragraphs(root,form.intro,'questionnaire-intro');
      if(pageIndex===0)paragraphs(root,form.contextPrompt,'questionnaire-context');
      root.append(node('p',text('optional'),'questionnaire-optional'));
      for(const page of config.readOnly?pages:[pages[pageIndex]]){
        if(page.groupTitle)root.append(node('p',localized(page.groupTitle,language),'questionnaire-group-title'));
        if(page.title)root.append(node('h2',localized(page.title,language),'questionnaire-section-title'));
        paragraphs(root,page.before,'questionnaire-instruction');
        const body=node('div',undefined,'questionnaire-items');for(const id of page.itemIds)body.append(question(byId.get(id)));root.append(body);
        paragraphs(root,page.after,'questionnaire-instruction');
      }
      if(config.readOnly || pageIndex===pages.length-1)paragraphs(root,form.outro,'questionnaire-outro');
      const status=node('p',statusMessage,'questionnaire-status');status.dataset.questionnaireStatus='';status.dataset.kind=statusKind;status.setAttribute('role','status');status.setAttribute('aria-live','polite');root.append(status);
      const actions=node('footer',undefined,'questionnaire-actions');
      if(pageIndex>0){const previous=node('button',text('previous'),'secondary-btn');previous.type='button';previous.addEventListener('click',()=>{pageIndex--;render();root.scrollIntoView({block:'start'});});actions.append(previous);}
      if(pageIndex<pages.length-1){const next=node('button',text('next'),'primary-btn');next.type='button';next.dataset.questionnaireNext='';next.addEventListener('click',async()=>{if(busy)return;setBusy(true);if(await saveDraft()){pageIndex++;setBusy(false);render();root.scrollIntoView({block:'start'});}else setBusy(false);});actions.append(next);}
      else {const send=node('button',text('submit'),'primary-btn');send.type='button';send.dataset.questionnaireSubmit='';send.addEventListener('click',()=>void submit(false));actions.append(send);}
      const skip=node('button',text('skip'),'questionnaire-skip');skip.type='button';skip.dataset.questionnaireSkip='';skip.addEventListener('click',()=>{skipConfirm=true;render();root.querySelector('[data-questionnaire-confirm-skip]')?.focus();});actions.append(skip);root.append(actions);
      if(skipConfirm){const confirm=node('section',undefined,'questionnaire-skip-confirm');confirm.setAttribute('role','group');confirm.setAttribute('aria-label',text('skipNotice'));confirm.append(node('p',text('skipNotice')));const yes=node('button',text('confirmSkip'),'secondary-btn');yes.type='button';yes.dataset.questionnaireConfirmSkip='';yes.onclick=()=>void submit(true);const no=node('button',text('cancel'),'questionnaire-clear');no.type='button';no.onclick=()=>{skipConfirm=false;render();};confirm.append(yes,no);root.append(confirm);}
      if(config.readOnly)actions.remove();
      refreshCount();setBusy(busy || config.readOnly);
    }
    render();
    return {answers:completeAnswers,setStatus,setBusy,language(value){language=value==='zh'?'zh':'en';render();},destroy(){disposed=true;clearTimeout(draftTimer);root.replaceChildren();}};
  }
  global.StudyQuestionnaireUI=Object.freeze({mount,localized});
})(window);

const studyQuestionnaireRuntime={enabled:null,availability:null,version:'',policy:'',payload:null,view:null,serial:Promise.resolve(),request:0,continuation:null,opening:false,sequences:{}};
function studyQuestionnaireText(zh,en){return state.language==='zh'?zh:en;}
async function studyQuestionnaireAvailability(){
  if(!studyPairRequested())return false;
  if(studyQuestionnaireRuntime.enabled!==null)return studyQuestionnaireRuntime.enabled;
  if(studyQuestionnaireRuntime.availability)return studyQuestionnaireRuntime.availability;
  studyQuestionnaireRuntime.availability=(async()=>{
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),5000);
    let response,data;
    try {response=await fetch('/health',{cache:'no-store',credentials:'same-origin',signal:controller.signal});data=await response.json();}
    finally {clearTimeout(timeout);}
    if(!response.ok || data.status!=='ok')throw Error(studyQuestionnaireText('暂时无法确认问卷安排，请重试。','Could not confirm the questionnaire schedule. Please retry.'));
    const feature=data.studyQuestionnaire;
    studyQuestionnaireRuntime.enabled=feature?.enabled===true;
    if(studyQuestionnaireRuntime.enabled){
      if(feature.version!=='full-package-v0.4-no-followup-20261019' || feature.policy!=='full-v04' || feature.scores!==false || feature.followup!==false)throw Error(studyQuestionnaireText('问卷版本不匹配，请联系研究者。','The questionnaire version does not match. Contact the researcher.'));
      studyQuestionnaireRuntime.version=feature.version;studyQuestionnaireRuntime.policy=feature.policy;
    }
    return studyQuestionnaireRuntime.enabled;
  })().catch(error=>{studyQuestionnaireRuntime.enabled=null;studyQuestionnaireRuntime.availability=null;throw error;});
  return studyQuestionnaireRuntime.availability;
}
function studyQuestionnaireAccept(payload){
  if(payload?.ok!==true || payload.enabled!==true || payload.version!==studyQuestionnaireRuntime.version)throw Error(studyQuestionnaireText('问卷回复不完整，尚未确认保存。','The questionnaire response is incomplete; saving is not confirmed.'));
  if(payload.currentForm && (!payload.currentStage || !Array.isArray(payload.currentForm.items)))throw Error(studyQuestionnaireText('问卷内容不完整，请重试。','The questionnaire content is incomplete. Please retry.'));
  for(const [stage,entry] of Object.entries(payload.stages || {})) {
    const sequence=Number.isInteger(entry.lastSaveSequence)?entry.lastSaveSequence:-1;
    studyQuestionnaireRuntime.sequences[stage]=Math.max(studyQuestionnaireRuntime.sequences[stage]??-1,sequence);
  }
  if(payload.currentStage && Number.isInteger(payload.currentSequence))studyQuestionnaireRuntime.sequences[payload.currentStage]=Math.max(studyQuestionnaireRuntime.sequences[payload.currentStage]??-1,payload.currentSequence);
  studyQuestionnaireRuntime.payload=payload;return payload;
}
async function studyQuestionnaireLoad(){return studyQuestionnaireAccept(await studyPairRequest('/api/study/pair/questionnaire'));}
function studyQuestionnaireQueue(body){
  const run=()=>studyPairRequest('/api/study/pair/questionnaire',body).then(payload=>{
    if(payload.persisted!==true)throw Error(studyQuestionnaireText('服务器尚未确认保存，请重试。','The server has not confirmed saving. Please retry.'));
    return studyQuestionnaireAccept(payload);
  });
  const pending=studyQuestionnaireRuntime.serial.catch(()=>{}).then(run);studyQuestionnaireRuntime.serial=pending;return pending;
}
function studyQuestionnaireRequestId(){return typeof crypto?.randomUUID==='function'?crypto.randomUUID():`questionnaire-${Date.now()}-${Math.random().toString(36).slice(2)}`;}
function studyQuestionnaireNextSequence(stage){const next=(studyQuestionnaireRuntime.sequences[stage]??-1)+1;studyQuestionnaireRuntime.sequences[stage]=next;return next;}
function studyQuestionnaireContainer(){
  const screen=document.getElementById('study-questionnaire-screen');screens.questionnaire=screen;return document.getElementById('study-questionnaire-form');
}
function studyQuestionnaireRevealSummary(){
  document.body.classList.remove('study-questionnaire-game-pending');showScreen('summary');if(typeof renderLabRecap==='function')renderLabRecap();renderStudyPairUi();
}
function studyQuestionnaireHasLiveSummary(label=studyPairRuntime.pair?.currentGame){
  const game=studyPairRuntime.pair?.games?.[label];
  return Boolean(state.finalOutcome && state.sessionId && game?.sessionId===state.sessionId && state.researchProfile?.gameLabel===label);
}
function studyQuestionnaireRequireSummary(){
  if(studyQuestionnaireHasLiveSummary())return;
  throw Error(studyQuestionnaireText('本局记录已保存，完整回顾尚未恢复。请重试恢复；不会覆盖记录、确认回顾或自动开始下一局。','The game record is saved, but its full recap has not been restored. Retry recovery. Records will not be overwritten, the recap will not be acknowledged, and the next game will not start automatically.'));
}
async function studyQuestionnaireResumeSavedSummary(){
  if(!studyQuestionnaireHasLiveSummary() && typeof studyPairRecoverCurrent==='function')await studyPairRecoverCurrent();
  studyQuestionnaireRequireSummary();studyQuestionnaireRevealSummary();
}
function studyQuestionnaireDone(continuation){
  const root=studyQuestionnaireContainer();studyQuestionnaireRuntime.view?.destroy();studyQuestionnaireRuntime.view=null;root.replaceChildren();
  const title=document.createElement('h1');title.textContent=studyQuestionnaireText('已确认保存','Saving confirmed');
  const note=document.createElement('p');note.textContent=studyQuestionnaireText('你的回答或跳过选择已由服务器确认保存。','The server has confirmed saving your answers or choice to skip.');
  const button=document.createElement('button');button.type='button';button.className='primary-btn';button.dataset.questionnaireContinue='';button.textContent=studyQuestionnaireText('继续','Continue');button.onclick=()=>{studyQuestionnaireRuntime.continuation=null;continuation();};root.append(title,note,button);showScreen('questionnaire');button.focus();
}
function studyQuestionnaireAnswersEqual(first,second){
  if(!first || !second)return false;
  const normalize=value=>Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)));
  return JSON.stringify(normalize(first))===JSON.stringify(normalize(second));
}
function studyQuestionnaireShowConflict(payload,stage,localAnswers,continuation,allowedStages){
  const saved=payload.seenForms?.[stage];
  if(!saved?.form || !saved.answers)throw Error(studyQuestionnaireText('另一页已提交本问卷，但无法核对已保存回答。请联系研究者。','Another page submitted this questionnaire, but the saved answers cannot be checked. Contact the researcher.'));
  const root=studyQuestionnaireContainer();studyQuestionnaireRuntime.view?.destroy();root.replaceChildren();
  const heading=document.createElement('h1');heading.textContent=studyQuestionnaireText('另一页已经提交了不同的回答','Another page submitted different answers');
  const note=document.createElement('p');note.textContent=studyQuestionnaireText('本页的不同回答没有覆盖服务器记录。请核对以下已保存内容，再决定继续。','This page’s different answers did not overwrite the server record. Review the saved content below before continuing.');root.append(heading,note);
  const stored=document.createElement('div');root.append(stored);StudyQuestionnaireUI.mount(stored,{form:saved.form,language:state.language,answers:saved.answers,readOnly:true});
  const details=document.createElement('details'),summary=document.createElement('summary'),local=document.createElement('div');summary.textContent=studyQuestionnaireText('查看本页未保存的回答','View this page’s unsaved answers');details.append(summary,local);root.append(details);StudyQuestionnaireUI.mount(local,{form:saved.form,language:state.language,answers:localAnswers,readOnly:true});
  const button=document.createElement('button');button.type='button';button.className='primary-btn';button.dataset.questionnaireAcceptSaved='';button.textContent=studyQuestionnaireText('已核对，按已保存记录继续','Reviewed: continue with the saved record');button.onclick=()=>studyQuestionnairePresent(payload,continuation,allowedStages);root.append(button);showScreen('questionnaire');
}
function studyQuestionnairePresent(payload,continuation,allowedStages){
  const root=studyQuestionnaireContainer();studyQuestionnaireRuntime.continuation=continuation;
  if(!payload.currentForm){studyQuestionnaireDone(continuation);return;}
  if(!allowedStages.includes(payload.currentStage))throw Error(studyQuestionnaireText('当前问卷与此步骤不一致，请重试读取或联系研究者。','The current questionnaire does not match this step. Reload it or contact the researcher.'));
  studyQuestionnaireRuntime.view?.destroy();
  const stage=payload.currentStage,form=payload.currentForm;
  let pendingSubmission=null;
  studyQuestionnaireRuntime.view=StudyQuestionnaireUI.mount(root,{form,language:state.language,answers:payload.currentAnswers || form.answers || {},
    onLanguage(language){state.language=language;if(typeof applyLanguage==='function')applyLanguage();},
    onDraft(answers,clientTiming){return studyQuestionnaireQueue({stage,version:studyQuestionnaireRuntime.version,answers,language:state.language,status:'draft',clientTiming,saveSequence:studyQuestionnaireNextSequence(stage),requestId:studyQuestionnaireRequestId()});},
    async onSubmit(answers,clientTiming){
      pendingSubmission ||= {stage,version:studyQuestionnaireRuntime.version,answers,language:state.language,status:'submitted',clientTiming,saveSequence:studyQuestionnaireNextSequence(stage),requestId:studyQuestionnaireRequestId()};
      try {
        const next=await studyQuestionnaireQueue(pendingSubmission);
        studyQuestionnairePresent(next,continuation,allowedStages);
      } catch(error) {
        // A lost reply can follow a successful immutable submission. Reconcile
        // the owner record before retrying the identical request and request ID.
        try {
          const current=await studyQuestionnaireLoad();
          if(current.stages?.[stage]?.status==='submitted'){
            if(studyQuestionnaireAnswersEqual(current.seenForms?.[stage]?.answers,pendingSubmission.answers))studyQuestionnairePresent(current,continuation,allowedStages);
            else studyQuestionnaireShowConflict(current,stage,pendingSubmission.answers,continuation,allowedStages);
            return;
          }
          pendingSubmission=null;
        } catch(_reconcileError) {
          const unknown=Error(studyQuestionnaireText('尚未确认最终提交是否保存。回答暂时锁定，请重试确认；不会另发不同的回答。','The final submission is not yet confirmed. Answers are temporarily locked. Retry confirmation; a different answer set will not be sent.'));
          unknown.code='questionnaire_final_unknown';throw unknown;
        }
        throw error;
      }
    }
  });showScreen('questionnaire');root.querySelector('h1')?.focus({preventScroll:true});window.scrollTo({top:0});
}
async function studyQuestionnaireBeforeBegin(participantId){
  if(!await studyQuestionnaireAvailability())return true;
  if(!studyPairRuntime.pair)await requestStudyPairProfile(participantId);
  const payload=await studyQuestionnaireLoad();
  if(payload.currentStage==='pre'){
    studyQuestionnairePresent(payload,()=>{showScreen('config');void beginGame();},['pre']);return false;
  }
  if(payload.currentForm)throw Error(studyQuestionnaireText('请先完成当前问卷或选择跳过，再继续。','Complete the current questionnaire or choose to skip before continuing.'));
  return true;
}
function studyQuestionnaireGamePending(){
  if(studyQuestionnaireRuntime.enabled!==true)return false;
  const stage=state.researchProfile?.gameLabel==='B'?'game_b':'game_a';return !['submitted','missing_legacy'].includes(studyQuestionnaireRuntime.payload?.stages?.[stage]?.status);
}
function studyQuestionnaireOnSummary(){if(studyQuestionnaireGamePending())document.body.classList.add('study-questionnaire-game-pending');}
async function studyQuestionnaireAfterTerminal(){
  if(studyQuestionnaireRuntime.enabled!==true)return;
  const payload=await studyQuestionnaireLoad();
  if(['game_a','game_b'].includes(payload.currentStage))studyQuestionnairePresent(payload,()=>void studyQuestionnaireResumeSavedSummary().catch(error=>{studyPairRuntime.error=error.message;renderStudyPairUi();}),['game_a','game_b']);
  else document.body.classList.remove('study-questionnaire-game-pending');
}
async function studyQuestionnaireBeforeContinue(){
  if(!await studyQuestionnaireAvailability())return true;
  const label=studyPairRuntime.pair.currentGame;
  const current=await studyQuestionnaireLoad();
  if(label==='A' && ['game_b','comparison'].includes(current.currentStage) || label==='B' && ['game_a','post_a'].includes(current.currentStage)){
    studyPairFlagConflict('inactive_study_game');throw Object.assign(Error(studyPairRuntime.recoveryError),{code:'inactive_study_game'});
  }
  if(['game_a','game_b'].includes(current.currentStage)){
    studyQuestionnairePresent(current,()=>{
      void studyQuestionnaireResumeSavedSummary().catch(error=>{showScreen('config');studyPairRuntime.error=error.message;renderStudyPairUi();});
    },['game_a','game_b']);return false;
  }
  if(['summary_a','summary_b'].includes(current.waitingFor) && !studyQuestionnaireHasLiveSummary()){
    if(typeof studyPairRecoverCurrent==='function')await studyPairRecoverCurrent();
    studyQuestionnaireRequireSummary();return false;
  }
  const payload=await studyQuestionnaireQueue({action:'acknowledge_summary',gameLabel:label,version:studyQuestionnaireRuntime.version,language:state.language});
  if(payload.currentForm){
    studyQuestionnairePresent(payload,()=>void studyPairContinue(),label==='A'?['game_a','post_a']:['game_b','comparison']);return false;
  }
  return true;
}
function studyQuestionnaireComparisonComplete(){return studyQuestionnaireRuntime.enabled!==true || studyQuestionnaireRuntime.payload?.stages?.comparison?.status==='submitted';}

async function studyQuestionnaireRestoreAfterGame(result){
  if(studyQuestionnaireRuntime.enabled!==true)return;
  const payload=studyQuestionnaireRuntime.payload || await studyQuestionnaireLoad();
  if(['game_a','game_b'].includes(payload.currentStage)){
    studyQuestionnairePresent(payload,()=>void studyQuestionnaireResumeSavedSummary().catch(error=>{studyPairRuntime.error=error.message;renderStudyPairUi();}),['game_a','game_b']);return;
  }
  if(['post_a','comparison'].includes(payload.currentStage)){
    studyQuestionnairePresent(payload,()=>void studyPairContinue(),[payload.currentStage]);return;
  }
  if(payload.currentStage==='pre'){
    studyQuestionnairePresent(payload,()=>showScreen(result?.screen || 'game'),['pre']);return;
  }
  if(result?.screen==='summary')studyQuestionnaireRevealSummary();
}
