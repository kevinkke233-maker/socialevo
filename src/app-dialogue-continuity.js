// Re-entry is player presentation, not NPC evolution or inferred understanding.
// Sources are actual current-epoch committed/delivered exchanges with this NPC.
const DIALOGUE_CONTINUITY_VERSION='dialogue-reentry-v1';
const privateComposerDrafts=new Map();
function privateComposerDraftKey(npc){return `${state.sessionEpoch}:${currentStage()?.id}:${state.language}:${npc.id}`;}
function resetDialogueReentryRuntime(){privateComposerDrafts.clear();state.sideTalkContinuityContext=null;state.sideTalkContextLine='';}
function latestNpcPlayerExchange(npc){
 const types=new Set(['private_chat','npc_first_contact','opening_response','npc_followup','key_decision','artifact_submission','story_anchor_step']);
 let latest=null;
 for(const e of state.eventLedger||[]){
  if(e.sessionEpoch!==state.sessionEpoch||e.status!=='committed'||!types.has(e.type))continue;
  if(e.audience?.visibility==='private'&&!e.audience.npcIds?.includes(npc.id))continue;
  if(!['private','group','public'].includes(e.audience?.visibility))continue;
  const reply=(e.dialogueDeliveries||[]).filter(d=>d.npcId===npc.id&&d.status==='delivered').at(-1);if(!reply)continue;
  const source={eventId:e.eventId,stageId:e.metadata?.stageId||'',visibility:e.audience.visibility,speaker:npc.name,text:reply.text};
  latest=source;
 }
 // NPC-to-NPC and GM room framing are excluded: only directed exchanges count.
 return latest;
}
function privateDialogueReentryContext(npc,{newTopic=false,forSpeaker=false}={}){
 const source=latestNpcPlayerExchange(npc),index=source?state.eventLedger.findIndex(e=>e.eventId===source.eventId):-1;
 const events=(state.eventLedger||[]).slice(index+1).filter(e=>e.sessionEpoch===state.sessionEpoch&&e.status==='committed');
 const materialPresentations=forSpeaker?[]:events.filter(e=>e.type==='shared_artifact_review'&&e.actors?.includes('player')).map(e=>{
  const doc=(currentScenario().workspaceDocuments||[]).find(d=>d.id===e.metadata?.documentId);
  return doc?.knownByNpcIds?.includes(npc.id)?{documentId:doc.id,title:scenarioText(doc.title),presentationOnly:true,comprehensionAssumed:false}:null;
 }).filter(Boolean);
 const sharedWork=events.filter(e=>e.type==='artifact_submission'&&['group','public'].includes(e.audience?.visibility)&&e.audience?.npcIds?.includes(npc.id)).map(e=>{
  const a=state.submittedArtifacts.find(a=>a.id===e.metadata?.artifactId);
  return a?{taskId:a.sourceTaskId,status:a.status,feedback:(e.dialogueDeliveries||[]).filter(d=>d.npcId===npc.id&&d.status==='delivered').map(d=>d.text)}:null;
 }).filter(Boolean);
 return {version:DIALOGUE_CONTINUITY_VERSION,npcId:npc.id,
  mode:newTopic?'new_topic':!source?'new_conversation':source.stageId!==currentStage()?.id?'stage_bridge':materialPresentations.length?'return_after_material_presentation':'resume_exchange',
  previousExchange:source,sharedWorkSince:sharedWork,
  ...(forSpeaker?{}:{playerOnlyMaterialPresentationsSince:materialPresentations}),
  currentStageId:currentStage()?.id,
  rule:forSpeaker?'Continue this individual’s actual prior exchange in the current story. Do not reintroduce yourself, repeat an answered question, or infer reading, agreement, understanding or finished work. Player-only UI visits are not supplied as NPC knowledge. An older-stage request is history, not an automatically reopened requirement.':
   'Create replies/questions for the player that connect to this NPC’s actual last words unless new_topic was explicitly chosen. Do not reset to a first-meeting menu. Player-only document presentations are interface context, NOT NPC knowledge or proof of reading/understanding/problems found/work completed. Do not put claims of completed checks or understanding into the player’s mouth. An older-stage topic is history: respect the current core stage, not stale task options. No other NPC’s private exchange or unsent draft is supplied.'};
}
function savePrivateComposerDraft(npc){
 if(!npc||state.sessionClosed||state.apiFatalError)return;
 const value=document.getElementById('side-talk-input').value;
 if(value)privateComposerDrafts.set(privateComposerDraftKey(npc),{text:value,intent:state.sideTalkDraftIntent,sourceEventId:state.sideTalkContinuityContext?.previousExchange?.eventId||''});
 else privateComposerDrafts.delete(privateComposerDraftKey(npc));
}
function restorePrivateComposerDraft(npc){
 const key=privateComposerDraftKey(npc),saved=privateComposerDrafts.get(key);
 if(saved){document.getElementById('side-talk-input').value=saved.text;state.sideTalkDraftIntent=saved.intent;}
}
