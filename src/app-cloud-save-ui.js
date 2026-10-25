// Presentation only. The controller owns durable saves and recovery.
const cloudSaveUiRuntime={key:'',pendingSave:false,pendingConfirm:false};
function cloudSaveUiZh(){return typeof state!=='undefined'&&state.language==='zh';}
function cloudSaveUiCopy(zh,en){return cloudSaveUiZh()?zh:en;}
function cloudSaveUiText(node,value){if(node&&node.textContent!==value)node.textContent=value;}
function cloudSaveUiDisabled(node,value){if(node&&node.disabled!==Boolean(value))node.disabled=Boolean(value);}
function cloudSaveUiView(){return typeof cloudSaveView==='function'?cloudSaveView():{visible:false,status:'not_saved',saveDisabled:true,restoreDisabled:true};}
function cloudSaveUiTime(value,short=false){
  if(typeof value!=='string'||!value)return '';
  const date=new Date(value);if(!Number.isFinite(date.getTime()))return '';
  try{return new Intl.DateTimeFormat(cloudSaveUiZh()?'zh-CN':'en-GB',short?{hour:'2-digit',minute:'2-digit',hour12:false}:{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(date);}catch(_error){return value;}
}
function cloudSaveUiStatus(view){
  const rows={saved:['云端：已保存','Cloud: saved'],pending:['云端：有修改待保存','Cloud: changes waiting to save'],saving:['云端：保存中…','Cloud: saving…'],offline:['云端：离线，尚未确认','Cloud: offline, not confirmed'],error:['云端：尚未确认保存','Cloud: saving not confirmed'],conflict:['云端：需恢复最新进度','Cloud: restore newer progress'],recovering:['云端：正在恢复…','Cloud: restoring…'],not_saved:['云端：尚未确认保存','Cloud: saving not confirmed'],stopped:['云端：本局已停止','Cloud: this game has stopped']};
  const row=rows[view.status]||rows.not_saved,time=view.status==='saved'?cloudSaveUiTime(view.confirmedAt,true):'';
  return row[cloudSaveUiZh()?0:1]+(time?' '+time:'');
}
function cloudSaveUiShortStatus(view){
  const rows={saved:['已保存','Saved'],pending:['待保存','Pending'],saving:['保存中','Saving'],offline:['离线','Offline'],error:['未确认','Unconfirmed'],conflict:['需恢复','Restore'],recovering:['恢复中','Restoring'],not_saved:['未确认','Unconfirmed'],stopped:['已停止','Stopped']};
  return (rows[view.status]||rows.not_saved)[cloudSaveUiZh()?0:1];
}
function cloudSaveUiAction(callback,kind){
  if(typeof callback!=='function'||kind==='save'&&cloudSaveUiRuntime.pendingSave||kind==='confirm'&&cloudSaveUiRuntime.pendingConfirm)return;
  const key=kind==='save'?'pendingSave':kind==='confirm'?'pendingConfirm':'';
  if(key)cloudSaveUiRuntime[key]=true;renderCloudSaveUi();
  let result;try{result=callback();}catch(_error){if(key)cloudSaveUiRuntime[key]=false;renderCloudSaveUi();return;}
  Promise.resolve(result).catch(()=>{}).finally(()=>{if(key)cloudSaveUiRuntime[key]=false;renderCloudSaveUi();});
}
function cloudSaveUiModalVisible(){
  return [...document.querySelectorAll('dialog[open],[role="dialog"][aria-modal="true"]')].some(node=>node.getClientRects().length&&!node.hidden&&getComputedStyle(node).visibility!=='hidden');
}
function initializeCloudSaveUi(){
  if(document.getElementById('study-pair-game-card'))return true;
  const hud=document.getElementById('ui-mainline-hud'),rail=document.getElementById('ui-mainline-actions');if(!hud||!rail)return false;
  const controls=document.createElement('section');controls.id='cloud-save-controls';controls.hidden=true;
  // Keep the save action outside both disclosure and story-action folding.
  // Native button activation is the only save path, including Enter and Space.
  for(const name of ['click','keyup'])controls.addEventListener(name,event=>event.stopPropagation());
  controls.addEventListener('keydown',event=>{if(event.repeat&&['Enter',' '].includes(event.key))event.preventDefault();event.stopPropagation();});
  const save=document.createElement('button');save.type='button';save.id='cloud-save-now';save.setAttribute('aria-describedby','cloud-save-summary-text');
  save.onclick=()=>{if(save.getAttribute('aria-disabled')!=='true'&&!cloudSaveUiModalVisible()&&!cloudSaveUiView().saveDisabled)cloudSaveUiAction(typeof cloudSaveNow==='function'?cloudSaveNow:null,'save');};
  const card=document.createElement('details');card.id='study-pair-game-card';card.className='cloud-save-card';card.hidden=true;
  const summary=document.createElement('summary');summary.id='cloud-save-summary';
  const icon=document.createElement('span');icon.className='cloud-save-icon';icon.setAttribute('aria-hidden','true');icon.textContent='☁';
  const status=document.createElement('span');status.id='cloud-save-summary-text';status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.setAttribute('aria-atomic','true');
  const shortStatus=document.createElement('span');shortStatus.id='cloud-save-short-status';shortStatus.setAttribute('aria-hidden','true');summary.append(icon,status,shortStatus);
  const body=document.createElement('div');body.className='cloud-save-card-body';
  const identity=document.createElement('p');identity.id='cloud-save-game-label';
  const timestamp=document.createElement('p');timestamp.className='cloud-save-confirmation';
  const label=document.createElement('span');label.id='cloud-save-confirmed-label';const time=document.createElement('time');time.id='cloud-save-confirmed-time';timestamp.append(label,time);
  const message=document.createElement('p');message.id='cloud-save-message';message.hidden=true;
  const actions=document.createElement('div');actions.className='cloud-save-actions';
  const restore=document.createElement('button');restore.type='button';restore.id='cloud-save-restore';restore.onclick=()=>{if(!restore.disabled)cloudSaveUiAction(typeof requestCloudSaveRestore==='function'?requestCloudSaveRestore:null,'request');};actions.append(restore);
  const note=document.createElement('p');note.id='cloud-save-auto-note';body.append(identity,timestamp,message,actions,note);card.append(summary,body);controls.append(save,card);hud.insertBefore(controls,rail);return true;
}
function renderCloudSaveUi(){
  if(!initializeCloudSaveUi())return;
  const view=cloudSaveUiView()||{},card=document.getElementById('study-pair-game-card'),visible=Boolean(view.visible);
  const key=JSON.stringify([visible,view.participantId||'',view.gameLabel||'',view.status||'',view.confirmedAt||'',Boolean(view.saveDisabled),Boolean(view.restoreDisabled),view.message||'',cloudSaveUiZh(),cloudSaveUiRuntime.pendingSave,cloudSaveUiRuntime.pendingConfirm]);
  if(key===cloudSaveUiRuntime.key)return;cloudSaveUiRuntime.key=key;
  const changed=card.hidden===visible;card.hidden=!visible;
  const controls=document.getElementById('cloud-save-controls');controls.hidden=!visible;
  const controlsLabel=cloudSaveUiCopy('云端保存','Cloud saving');if(controls.getAttribute('aria-label')!==controlsLabel)controls.setAttribute('aria-label',controlsLabel);
  const hud=document.getElementById('ui-mainline-hud');if(hud&&hud.classList.contains('cloud-save-present')!==visible)hud.classList.toggle('cloud-save-present',visible);
  if(visible){
    const status=view.status||'not_saved';if(card.dataset.saveStatus!==status)card.dataset.saveStatus=status;
    cloudSaveUiText(document.getElementById('cloud-save-summary-text'),cloudSaveUiStatus(view));
    cloudSaveUiText(document.getElementById('cloud-save-short-status'),cloudSaveUiShortStatus(view));
    const summary=document.getElementById('cloud-save-summary'),summaryLabel=cloudSaveUiStatus(view)+cloudSaveUiCopy('；查看保存详情','; View save details');
    if(summary.getAttribute('aria-label')!==summaryLabel)summary.setAttribute('aria-label',summaryLabel);
    if(summary.title!==summaryLabel)summary.title=summaryLabel;
    cloudSaveUiText(document.getElementById('cloud-save-game-label'),[view.participantId,view.gameLabel?cloudSaveUiCopy(view.gameLabel+' 局','Game '+view.gameLabel):''].filter(Boolean).join(' · '));
    cloudSaveUiText(document.getElementById('cloud-save-confirmed-label'),cloudSaveUiCopy('最近确认保存：','Last confirmed save: '));
    const time=document.getElementById('cloud-save-confirmed-time'),formatted=cloudSaveUiTime(view.confirmedAt);cloudSaveUiText(time,formatted||cloudSaveUiCopy('尚无确认时间','No confirmation yet'));
    if(formatted){if(time.getAttribute('datetime')!==view.confirmedAt)time.setAttribute('datetime',view.confirmedAt);}else if(time.hasAttribute('datetime'))time.removeAttribute('datetime');
    const message=document.getElementById('cloud-save-message'),text=typeof view.message==='string'?view.message:'';cloudSaveUiText(message,text);if(message.hidden!==!text)message.hidden=!text;
    const save=document.getElementById('cloud-save-now'),restore=document.getElementById('cloud-save-restore');cloudSaveUiText(save,cloudSaveUiCopy('立即保存','Save now'));cloudSaveUiText(restore,cloudSaveUiCopy('从云端恢复','Restore from cloud'));
    // Keep keyboard focus here while saving; disabling a focused native button
    // moves focus to the game, where a following Enter/Space can advance speech.
    const saveDisabled=String(Boolean(view.saveDisabled||cloudSaveUiRuntime.pendingSave||typeof cloudSaveNow!=='function'));
    if(save.getAttribute('aria-disabled')!==saveDisabled)save.setAttribute('aria-disabled',saveDisabled);
    cloudSaveUiDisabled(restore,view.restoreDisabled||typeof requestCloudSaveRestore!=='function');
    cloudSaveUiText(document.getElementById('cloud-save-auto-note'),cloudSaveUiCopy('关键进度会自动同步，也可点击“立即保存”。确认已保存后再刷新或换设备；恢复不会自动重发未完成请求。','Key progress syncs automatically. You can also select “Save now”. Wait for a confirmed save before reloading or switching devices; restoring never automatically resends unfinished requests.'));
  }else closeCloudSaveRestoreDialog();
  const dialog=document.getElementById('cloud-save-restore-dialog');if(dialog?.open)renderCloudSaveRestoreDialog(view,true);
  if(changed&&typeof syncMainlineActionRail==='function')syncMainlineActionRail();
}
function renderCloudSaveRestoreDialog(view=cloudSaveUiView(),open=true){
  let dialog=document.getElementById('cloud-save-restore-dialog');
  if(!dialog){
    dialog=document.createElement('dialog');dialog.id='cloud-save-restore-dialog';dialog.className='project-info-dialog cloud-save-restore-dialog';dialog.setAttribute('aria-labelledby','cloud-save-restore-title');dialog.setAttribute('aria-describedby','cloud-save-restore-note');
    const content=document.createElement('div');content.className='project-info-content';const title=document.createElement('h2');title.id='cloud-save-restore-title';const note=document.createElement('p');note.id='cloud-save-restore-note';const confirmation=document.createElement('p');confirmation.id='cloud-save-restore-confirmed';const actions=document.createElement('div');actions.className='cloud-save-dialog-actions';
    const cancel=document.createElement('button');cancel.type='button';cancel.id='cloud-save-restore-cancel';cancel.className='secondary-btn';cancel.autofocus=true;cancel.onclick=()=>{if(cancel.disabled)return;if(typeof cancelCloudSaveRestore==='function')cloudSaveUiAction(cancelCloudSaveRestore,'cancel');else closeCloudSaveRestoreDialog();};
    const confirm=document.createElement('button');confirm.type='button';confirm.id='cloud-save-restore-confirm';confirm.className='primary-btn';confirm.onclick=()=>{if(!confirm.disabled)cloudSaveUiAction(typeof confirmCloudSaveRestore==='function'?confirmCloudSaveRestore:null,'confirm');};
    actions.append(cancel,confirm);content.append(title,note,confirmation,actions);dialog.append(content);document.body.append(dialog);
    for(const name of ['click','keyup'])dialog.addEventListener(name,event=>event.stopPropagation());
    dialog.addEventListener('keydown',event=>{
      if(event.key==='Tab'){
        const buttons=[...dialog.querySelectorAll('button')].filter(node=>!node.disabled),first=buttons[0],last=buttons.at(-1);
        if(!buttons.length)event.preventDefault();
        else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
      }
      event.stopPropagation();
    });
    dialog.addEventListener('cancel',event=>{event.preventDefault();if(cloudSaveUiRuntime.pendingConfirm)return;if(typeof cancelCloudSaveRestore==='function')cloudSaveUiAction(cancelCloudSaveRestore,'cancel');else closeCloudSaveRestoreDialog();});
  }
  cloudSaveUiText(document.getElementById('cloud-save-restore-title'),cloudSaveUiCopy('从云端恢复最近进度？','Restore the latest cloud save?'));
  cloudSaveUiText(document.getElementById('cloud-save-restore-note'),cloudSaveUiCopy('这会载入本局最近确认保存的进度。当前尚未确认保存的输入可能丢失，未完成的请求不会自动重发。','This loads the latest confirmed save for this game. Inputs that have not been confirmed saved may be lost. Unfinished requests are not resent automatically.'));
  const time=cloudSaveUiTime(view?.confirmedAt);cloudSaveUiText(document.getElementById('cloud-save-restore-confirmed'),cloudSaveUiCopy('最近确认保存：','Last confirmed save: ')+(time||cloudSaveUiCopy('尚无确认时间','No confirmation yet')));
  const waiting=cloudSaveUiRuntime.pendingConfirm||view?.status==='recovering';cloudSaveUiText(document.getElementById('cloud-save-restore-cancel'),cloudSaveUiCopy('取消，留在本页','Cancel, stay here'));cloudSaveUiText(document.getElementById('cloud-save-restore-confirm'),waiting?cloudSaveUiCopy('正在恢复…','Restoring…'):cloudSaveUiCopy('确认恢复','Confirm restore'));
  cloudSaveUiDisabled(document.getElementById('cloud-save-restore-cancel'),waiting);cloudSaveUiDisabled(document.getElementById('cloud-save-restore-confirm'),waiting||view?.restoreDisabled||typeof confirmCloudSaveRestore!=='function');
  if(open&&view?.visible){if(!dialog.open)dialog.showModal();}else if(dialog.open)dialog.close();return dialog;
}
function closeCloudSaveRestoreDialog(){const dialog=document.getElementById('cloud-save-restore-dialog');if(dialog?.open)dialog.close();}
initializeCloudSaveUi();renderCloudSaveUi();
