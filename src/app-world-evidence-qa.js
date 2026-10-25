// Independent complete-utterance world-evidence assessment with bound receipts.
async function validateLabWorldEvidenceScope(raw,{eventId='',signal,epoch=state.sessionEpoch,sourcePlayerDelivery=null}={}){
 const input=LabWorldEvidenceQaCore.input(raw),candidateHash=SocialEvoCore.stableHash(input.candidate),sourceHash=SocialEvoCore.stableHash(input.evidence),actorHash=SocialEvoCore.stableHash(input.speaker),inputHash=SocialEvoCore.stableHash(input);
 if(eventId&&input.evidence.conditionalSceneClaims&&input.evidence.conditionalSceneClaims.sourceEventId!==eventId){const error=new TypeError('Prepared scene evidence belongs to another event.');error.code='world_evidence_context_preflight';throw error;}
 const event=eventId?state.eventLedger.find(e=>e.eventId===eventId&&e.sessionEpoch===epoch):null;
 let playerReference=null;
 if(sourcePlayerDelivery){
  const source=state.eventLedger.find(e=>e.eventId===sourcePlayerDelivery.eventId&&e.sessionEpoch===epoch),delivery=source?.dialogueDeliveries?.find(d=>d.deliveryId===sourcePlayerDelivery.deliveryId&&d.status==='delivered'&&!d.npcId&&d.speaker==='You');
  const visible=source?.audience?.visibility==='public'||source?.audience?.visibility==='group'&&(input.speaker.id==='controller'||source.audience.npcIds?.includes(input.speaker.id))||input.speaker.audience==='private'&&source?.audience?.visibility==='private'&&source.audience.npcIds?.includes(input.speaker.id);
  if(!delivery||!visible)throw new TypeError('Source player provenance must reference an actual accessible delivery in this epoch.');
  playerReference={eventId:source.eventId,deliveryId:delivery.deliveryId};
 }
 const check=()=>{currentEpochOrThrow(epoch);if(signal?.aborted||state.sessionClosed||(eventId&&(!event||state.eventLedger.find(e=>e.eventId===eventId)!==event||['failed','committed'].includes(event.status))))throw new StaleSessionError();};
 const attempts=[];let reason='',verdict;check();
 for(let attempt=0;attempt<2;attempt++){
  const payload={provider:'deepseek',model:DEEPSEEK_FLASH_MODEL,temperature:0,responseFormat:'json_object',maxTokens:8192,agentPurpose:'lab_world_evidence_scope',messages:[
   {role:'system',content:LabWorldEvidenceQaCore.INSTRUCTION},
   {role:'user',content:JSON.stringify({...input,...(attempt?{retryInstruction:'Malformed prior report: '+reason+'. Reassess the SAME candidate and evidence with the exact short contract. No rewritten dialogue, invented fields or forced pass.'}:{})})}]};
  // Inspect the normalized body that fetchWithTimeout will actually transmit.
  const body=normalizeProductRequestOptions('/api/chat',{body:JSON.stringify(payload)}).body;
  LabWorldEvidenceQaCore.assertJsonModeRequest(JSON.parse(body));
  let response;
  try{response=await fetchWithTimeout('/api/chat',{signal,method:'POST',headers:{'Content-Type':'application/json'},body},60000,{agentPurpose:'lab_world_evidence_scope',eventId,timeoutBudgetMs:60000});
  }catch(error){check();throw error;}
  check();if(!response.ok){const error=await agentHttpErrorFromResponse(response,'World-evidence QA',{agentPurpose:'lab_world_evidence_scope',eventId});check();throw error;}
  // Reading the transport envelope is outside the model-report retry. A body
  // abort/network/invalid-envelope error must not trigger a paid reassessment.
  let envelope;try{envelope=await response.json();}catch(error){check();throw error;}check();
  try{const rawReport=envelope?.choices?.[0]?.message?.content;if(typeof rawReport!=='string'||!rawReport.trim())throw Error('Missing world-evidence JSON.');verdict=LabWorldEvidenceQaCore.normalize(JSON.parse(rawReport),{candidate:input.candidate});attempts.push({attempt:attempt+1,valid:true});break;}
  catch(error){check();if(error instanceof ReferenceError||error instanceof TypeError||isStaleRequestError(error))throw error;reason=String(error.message).slice(0,240);attempts.push({attempt:attempt+1,valid:false,reason});if(attempt)throw markAgentOutputValidationError(error,'World-evidence report');}
 }
 check();const receipt={...verdict,speakerId:input.speaker.id,speakerName:input.speaker.name,audience:input.speaker.audience,candidateHash,sourceHash,actorHash,inputHash,input:JSON.parse(JSON.stringify(input)),attempts,...(playerReference?{provenance:{sourcePlayerDelivery:playerReference}}:{})};
 if(event){event.metadata||={};event.metadata.worldEvidenceScopeChecks||=[];event.metadata.worldEvidenceScopeChecks.push(receipt);}
 else{state.log||=[];state.log.push({type:'World evidence scope checked without event',agentPurpose:'lab_world_evidence_scope',sessionEpoch:epoch,eventBound:false,npcId:input.speaker.id,audience:input.speaker.audience,stageIndex:Number.isInteger(state.stageIndex)?state.stageIndex:null,stageId:typeof currentStage==='function'?currentStage()?.id||null:state.stageStatus||null,roundIndex:Number.isInteger(state.roundIndex)?state.roundIndex:null,elapsedWorkMinutes:state.labCalendar?.epoch===epoch&&Number.isFinite(state.labCalendar.elapsedMinutes)?state.labCalendar.elapsedMinutes:null,receipt,timestamp:new Date().toISOString()});}
 return receipt;
}
