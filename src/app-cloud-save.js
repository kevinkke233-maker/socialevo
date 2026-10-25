// Player controls use the existing owner-bound durable study store. No model
// request, new enrolment, assignment change or gameplay rollback is a save.
const cloudSaveRuntime={manual:null,restoreOwner:'',reloading:false,receiptOwner:'',confirmedAt:''};

function cloudSaveOwner(){
 if(typeof studyPairRequested!=='function'||!studyPairRequested())return '';
 const pair=studyPairRuntime.pair,profile=state.researchProfile;
 if(!state.sessionId||!pair||!profile?.active||pair.pairId!==profile.pairId||pair.participantId!==state.participantId||pair.currentGame!==profile.gameLabel||studyPairRuntime.sessionId!==state.sessionId)return '';
 const game=pair.games?.[pair.currentGame];if(!game||game.sessionId&&game.sessionId!==state.sessionId)return '';
 return [state.sessionEpoch,state.sessionId,pair.pairId,pair.currentGame].join(':');
}
function cloudSaveChanged(){if(typeof renderCloudSaveUi==='function')renderCloudSaveUi();}
function cloudSaveReset(){cloudSaveRuntime.receiptOwner='';cloudSaveRuntime.confirmedAt='';cloudSaveRuntime.restoreOwner='';cloudSaveRuntime.manual=null;cloudSaveChanged();}
function cloudSaveAcceptCheckpoint(result,payload){
 const owner=cloudSaveOwner(),pair=studyPairRuntime.pair,label=state.researchProfile?.gameLabel,remote=result?.pair;
 if(!owner||result?.persisted!==true||payload?.session?.sessionId!==state.sessionId||payload?.researchStudy?.pairId!==pair.pairId||payload.researchStudy.gameLabel!==label)return;
 if(remote&&(remote.pairId!==pair.pairId||remote.participantId!==pair.participantId||remote.currentGame!==label||remote.games?.[label]?.sessionId!==state.sessionId))return;
 const remoteGame=remote?.pairId===pair.pairId&&remote.currentGame===label&&remote.games?.[label]?.sessionId===state.sessionId?remote.games[label]:null;
 const timestamp=remoteGame?.lastSavedAt;
 cloudSaveRuntime.receiptOwner=owner;
 cloudSaveRuntime.confirmedAt=typeof timestamp==='string'&&Number.isFinite(Date.parse(timestamp))?timestamp:new Date(studyPairRuntime.lastCheckpointAt||Date.now()).toISOString();
}
function cloudSaveAcceptRestored(reference){
 const owner=cloudSaveOwner(),timestamp=reference?.receivedAt;
 if(!owner)return;
 cloudSaveRuntime.receiptOwner=owner;
 cloudSaveRuntime.confirmedAt=typeof timestamp==='string'&&Number.isFinite(Date.parse(timestamp))?timestamp:'';
}
function cloudSaveView(){
 const owner=cloudSaveOwner(),pair=studyPairRuntime.pair,game=pair?.games?.[pair.currentGame];
 const visible=Boolean(owner&&state.screen==='game'&&pair.status!=='completed'&&!game?.completed);
 const recovering=cloudSaveRuntime.reloading||studyPairRuntime.recoveryPending||typeof gameRecoveryRuntime!=='undefined'&&(gameRecoveryRuntime.restoring||gameRecoveryRuntime.paused);
 const saving=Boolean(studyPairRuntime.checkpointJob||cloudSaveRuntime.manual||studyPairRuntime.terminalGate||studyPairRuntime.initialSavePending&&!studyPairRuntime.checkpointError);
 const stopped=Boolean(state.sessionClosed||state.apiFatalError||state.finalOutcome);
 const confirmedAt=cloudSaveRuntime.receiptOwner===owner?cloudSaveRuntime.confirmedAt:'';
 let status=studyPairRuntime.checkpointConflict?'conflict':recovering?'recovering':navigator.onLine===false?'offline':saving?'saving':studyPairRuntime.checkpointError?'error':stopped?'stopped':studyPairRuntime.checkpointDirty?'pending':confirmedAt?'saved':'not_saved';
 const message=status==='error'?studyPairText('最近一次保存尚未得到确认。已有云端记录保留，可重试保存。','The latest save is not confirmed. Existing cloud records are retained; retry saving.'):
  status==='offline'?studyPairText('当前网络已断开。重新联网后会尝试保存；请先保留本页。','You are offline. Saving will be attempted when the connection returns; keep this page open.'):
  status==='conflict'?studyPairText('云端已有更新的进度，请从云端恢复后继续。','Newer progress exists in the cloud. Restore it before continuing.'):
  status==='stopped'?studyPairText('本步已停止。可以从云端恢复最近确认保存的进度，再按原步骤继续。','This step has stopped. Restore the latest confirmed cloud progress and continue from that step.'):
  status==='pending'?studyPairText('有新的进度等待保存；也可以点击立即云端保存。','New progress is waiting to be saved. You can also save it now.'):
  status==='saving'?studyPairText('正在等待云端确认，请保持页面打开。','Waiting for cloud confirmation. Keep this page open.'):
  status==='recovering'?studyPairText('正在恢复已保存的同一局。','Restoring the same saved game.'):
  status==='not_saved'?studyPairText('本局还没有收到云端保存确认。','No cloud save has been confirmed for this game yet.'):'';
 return {visible,participantId:pair?.participantId||'',gameLabel:pair?.currentGame||'',status,confirmedAt,message,
  saveDisabled:!visible||saving||recovering||stopped||studyPairRuntime.checkpointConflict||studyPairRuntime.busy||navigator.onLine===false,
  restoreDisabled:!visible||cloudSaveRuntime.reloading||studyPairRuntime.recoveryPending||studyPairRuntime.initialSavePending||Boolean(studyPairRuntime.terminalGate)};
}
async function cloudSaveNow(){
 const view=cloudSaveView();if(view.saveDisabled)return false;
 const owner=cloudSaveOwner();
 if(!studyPairRuntime.checkpointDirty&&!studyPairRuntime.checkpointError&&!studyPairRuntime.failedCheckpoint&&studyPairCheckpointKey()===studyPairRuntime.lastCheckpointSignature){cloudSaveChanged();return true;}
 const request={owner,promise:null};cloudSaveRuntime.manual=request;cloudSaveChanged();
 request.promise=(async()=>{
  try{return await studyPairSaveCheckpoint('manual_cloud_save');}
  finally{if(cloudSaveRuntime.manual===request)cloudSaveRuntime.manual=null;cloudSaveChanged();}
 })();return request.promise;
}
function requestCloudSaveRestore(){
 const view=cloudSaveView();if(view.restoreDisabled)return false;
 if(typeof stopPlayerNavigation==='function')stopPlayerNavigation('cloud_restore_prompt');
 cloudSaveRuntime.restoreOwner=cloudSaveOwner();
 if(typeof renderCloudSaveRestoreDialog==='function')renderCloudSaveRestoreDialog(view,true);
 return true;
}
function cancelCloudSaveRestore(){cloudSaveRuntime.restoreOwner='';if(typeof closeCloudSaveRestoreDialog==='function')closeCloudSaveRestoreDialog();}
function confirmCloudSaveRestore(){
 if(!cloudSaveRuntime.restoreOwner||cloudSaveRuntime.restoreOwner!==cloudSaveOwner()||cloudSaveView().restoreDisabled){cancelCloudSaveRestore();return false;}
 cloudSaveRuntime.reloading=true;cloudSaveRuntime.restoreOwner='';
 if(studyPairRuntime.scheduledCheckpoint)clearTimeout(studyPairRuntime.scheduledCheckpoint);studyPairRuntime.scheduledCheckpoint=0;
 for(const request of studyPairRuntime.checkpointQueue)request.resolve(false);studyPairRuntime.checkpointQueue=[];
 if(typeof gameRecoveryRuntime!=='undefined')gameRecoveryRuntime.paused=true;
 cloudSaveChanged();window.location.reload();return true;
}
function cloudSaveLeavingForRestore(){return cloudSaveRuntime.reloading;}
window.addEventListener('offline',cloudSaveChanged);
window.addEventListener('online',()=>{
 cloudSaveChanged();
 if(cloudSaveOwner()&&!cloudSaveView().saveDisabled){
  if(studyPairRuntime.initialSavePending)void studyPairRetrySave();
  else void studyPairSaveCheckpoint('connection_restored');
 }
});
