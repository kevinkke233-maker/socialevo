// Public contribution records. Saving, recognition and publication are distinct.
(function(root){
 'use strict';
 const VERSION='lab-credit-workflow-v1',MAX_ENTRIES=8,MAX_ENTRY_CHARS=500;
 const copy=x=>JSON.parse(JSON.stringify(x));
 const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
 // Rebuild the field order of the original credit-record builders before
 // hashing. Cloud storage sorts object keys; the original FNV hashes and text
 // must still bind the same entries, citations and public source records.
 // Arrays retain their order. Extra fields are included, never discarded.
 // A legacy hash from an unrecorded, nonstandard field order is not guessed or
 // replaced: if its original bytes cannot be reconstructed, validation fails.
 function hashValue(value){
  if(Array.isArray(value))return value.map(hashValue);
  if(!value||typeof value!=='object')return value;
  const has=keys=>keys.every(key=>Object.hasOwn(value,key));let order;
  if(has(['proposal','reports','publicStatements','rule']))order=['version','proposal','reports','publicStatements','rule'];
  else if(has(['adoptionEventId','sourceCoreEventId','unresolvedAllowed']))order=['eventId','proposalId','proposalHash','sourceHash','adoptionEventId','sourceCoreEventId','sourceBinding','entries','positions','previousResponses','publicStatements','reviewStatus','consensus','unresolvedAllowed'];
  else if(has(['sourceSnapshot','reviewEventId','adoptedBy']))order=['eventId','proposalId','proposalHash','sourceHash','sourceSnapshot','entries','reviewEventId','reviewStatus','positions','previousResponses','adoptedBy','consensus'];
  else if(has(['proposalId','revision','entries','createdAt']))order=['proposalId','revision','entries','bodyHash','sourceBinding','createdAt'];
  else if(has(['entryId','actorId','text','citations']))order=['entryId','actorId','text','citations'];
  else if(has(['entryId','npcId','workPosition','wordingPosition']))order=['entryId','npcId','eventId','deliveryId','quote','workPosition','wordingPosition','reason'];
  else if(value.kind==='report'&&has(['reportVersionId']))order=['kind','reportVersionId'];
  else if(value.kind==='public_statement'&&has(['eventId','deliveryId','quote']))order=['kind','eventId','deliveryId','quote'];
  else if(has(['reportVersionId','sourceEventId','feedbackText']))order=['reportVersionId','sourceEventId','artifactId','taskId','body','bodyHash','status','feedbackText'];
  else if(has(['submissionEventId','submittedAtMinutes','resultEventId']))order=['projectId','submissionEventId','reportVersionId','bodyHash','submittedAtMinutes','status','resultEventId'];
  else if(has(['deliveryId','eventIndex','creditProposalId']))order=['deliveryId','npcId','speaker','text','channel','generatedAt','deliveredAt','status','eventId','eventIndex','creditProposalId'];
  const keys=Object.keys(value),ordered=order?[...order.filter(key=>Object.hasOwn(value,key)),...keys.filter(key=>!order.includes(key)).sort()]:keys;
  return Object.fromEntries(ordered.map(key=>[key,hashValue(value[key])]));
 }
 const originalHash=x=>{let h=2166136261;for(const c of typeof x==='string'?x:JSON.stringify(x)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return 'credit-'+(h>>>0).toString(16);};
 const hash=x=>originalHash(typeof x==='string'?x:hashValue(x));
 // If an old object still retains its exact original order, its original JSON
 // bytes also remain valid proof. Never guess missing order or rewrite a hash.
 const matchesHash=(value,expected)=>hash(value)===expected||originalHash(value)===expected;
 function same(a,b){
  if(a===b)return true;
  if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
  const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(key=>Object.hasOwn(b,key)&&same(a[key],b[key]));
 }
 const require=(ok,message)=>{if(!ok)throw new TypeError(message);};
 const exact=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
 const publicEvent=(e,s)=>e&&e.sessionId===s.sessionId&&e.sessionEpoch===s.epoch&&e.status==='committed'&&e.commit&&
  (e.audience?.visibility==='public'||e.audience?.visibility==='group'&&(s.actorIds||[]).filter(id=>id!=='player').every(id=>e.audience.npcIds?.includes(id)));
 const event=(s,id)=>{const rows=(s.events||[]).filter(e=>e.eventId===id);return rows.length===1?rows[0]:null;};
 function binding(s){
  const f=s.formalSubmission,r=s.competitionResult,fe=f&&event(s,f.eventId||f.sourceEventId),re=r&&event(s,r.sourceEventId);
  require(s.projectId&&Number.isInteger(s.epoch)&&s.sessionId&&publicEvent(fe,s)&&fe.type==='project_submission'&&publicEvent(re,s)&&re.type==='competition_result'&&
   fe.metadata?.projectId===s.projectId&&fe.metadata.reportVersionId===f.reportVersionId&&fe.metadata.bodyHash===f.bodyHash&&
   fe.metadata.submittedAtMinutes===f.submittedAtMinutes&&r.submissionEventId===fe.eventId&&r.reportVersionId===f.reportVersionId&&
   re.metadata?.submissionEventId===fe.eventId&&re.metadata.reportVersionId===f.reportVersionId&&re.metadata.readCompletedAt===r.readCompletedAt&&r.readCompletedAt&&
   Number.isInteger(f.submittedAtMinutes)&&f.submittedAtMinutes>=0&&f.status===(f.submittedAtMinutes<3360?'on_time':'late')&&
   re.metadata.simulationAuthored===true&&re.metadata.narrativeDaysLater===7&&r.narrativeDaysLater===7&&
   re.metadata.resultType===r.resultType&&r.resultType===(f.status==='on_time'?'award':'showcase')&&
   re.dialogueDeliveries?.some(d=>d.status==='delivered'&&d.channel==='competition_result'&&d.text===r.text),'Actual formal submission and read competition result are required.');
  const reviewed=report(s,f.reportVersionId);require(reviewed.status==='accepted'&&reviewed.bodyHash===f.bodyHash&&reviewed.body===f.body&&reviewed.sourceEventId===f.sourceReviewEventId,'Formal record differs from its actual accepted reviewed version.');
  return {projectId:s.projectId,submissionEventId:fe.eventId,reportVersionId:f.reportVersionId,bodyHash:f.bodyHash,
   submittedAtMinutes:f.submittedAtMinutes,status:f.status,resultEventId:re.eventId};
 }
 function current(state,s){require(state.version===VERSION&&state.epoch===s.epoch&&state.sessionId===s.sessionId&&same(state.sourceBinding,binding(s)),'The contribution record belongs to another project or source.');}
 function report(s,id){
  const rows=(s.reports||[]).filter(r=>r.reportVersionId===id),r=rows[0],e=r&&event(s,r.sourceEventId);
  require(rows.length===1&&publicEvent(e,s)&&e.type==='artifact_submission'&&e.metadata?.projectReportVersion===id&&e.metadata.artifactId===r.artifactId&&
   e.metadata.playerNote===r.body&&['accepted','needs_revision','rejected'].includes(r.status)&&
   e.dialogueDeliveries?.some(d=>d.status==='delivered'&&d.npcId&&d.channel==='artifact_evaluation'&&d.text===r.feedbackText),'Citation is not an actual publicly reviewed report version.');return r;
 }
 function line(s,eventId,deliveryId){
  const e=event(s,eventId),rows=e?.dialogueDeliveries?.filter(d=>d.deliveryId===deliveryId)||[],d=rows[0];
  require(publicEvent(e,s)&&rows.length===1&&d.npcId&&(s.actorIds||[]).includes(d.npcId)&&d.status==='delivered'&&typeof d.text==='string'&&d.text.trim()&&
   e.metadata?.stageId==='stage_4_credit'&&['artifact_submission','story_anchor_step','key_decision','npc_followup','public_exchange'].includes(e.type)&&
   (e.type!=='story_anchor_step'||e.metadata.readCompletedAt),'Citation is not an actual accessible Stage 4 public statement.');
  return {...copy(d),eventId:e.eventId,eventIndex:s.events.indexOf(e),creditProposalId:e.metadata.creditProposalId||''};
 }
 function rows(entries,s,publish=false){
  require(Array.isArray(entries)&&entries.length>0&&entries.length<=MAX_ENTRIES&&new Set(entries.map(e=>e.entryId)).size===entries.length,'Use one to eight uniquely identified contribution entries.');
  return entries.map(e=>{
   require(exact(e,['entryId','actorId','text','citations'])&&typeof e.entryId==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(e.entryId)&&['player',...(s.actorIds||[])].includes(e.actorId)&&typeof e.text==='string'&&e.text.length<=MAX_ENTRY_CHARS&&Array.isArray(e.citations)&&e.citations.length<=8,'Invalid contribution entry.');
   require(!publish||e.text.trim()&&e.citations.length,'Each published entry needs text and an actual source citation.');
   const citations=e.citations.map(c=>{
    if(c.kind==='report'){require(exact(c,['kind','reportVersionId']),'Invalid report citation.');if(publish)report(s,c.reportVersionId);return copy(c);}
    require(exact(c,['kind','eventId','deliveryId','quote'])&&c.kind==='public_statement'&&typeof c.quote==='string'&&c.quote.trim(),'Invalid statement citation.');
    if(publish)require(line(s,c.eventId,c.deliveryId).text.includes(c.quote),'Citation quote is absent from the actual delivered statement.');return copy(c);
   });return {entryId:e.entryId,actorId:e.actorId,text:e.text,citations};
  });
 }
 function create(s,entries){return freeze({version:VERSION,epoch:s.epoch,sessionId:s.sessionId,projectId:s.projectId,sourceBinding:binding(s),draft:rows(entries,s),proposals:[],reviews:[],reviewAttempts:[],adoptions:[],pendingCore:null,closed:null});}
 function save(state,entries,s){current(state,s);require(!state.closed,'This record has already been closed.');const next=copy(state);next.draft=rows(entries,s);return freeze(next);}
 function publish(state,{eventId,createdAt},s){
  current(state,s);require(!state.closed&&eventId&&createdAt,'A new actual proposal event is required.');const entries=rows(state.draft,s,true),last=state.proposals.at(-1);
  require(!last||!matchesHash(entries,last.bodyHash),'The current proposal is already published; edit it before publishing another version.');
  const next=copy(state);next.proposals.push({proposalId:eventId,revision:next.proposals.length+1,entries,bodyHash:hash(entries),sourceBinding:copy(state.sourceBinding),createdAt});return freeze(next);
 }
 function published(state,s){const p=state.proposals.at(-1),e=p&&event(s,p.proposalId);return p&&publicEvent(e,s)&&e.type==='credit_record_proposal'&&e.metadata?.proposalHash===p.bodyHash&&e.metadata.projectId===state.projectId?p:null;}
 function reviewInput(state,s){
  current(state,s);const p=published(state,s);require(p,'Publish the contribution proposal before reviewing public responses.');
  const publicStatements=(s.events||[]).filter(e=>publicEvent(e,s)&&e.metadata?.stageId==='stage_4_credit'&&e.type!=='story_anchor')
   .flatMap(e=>(e.dialogueDeliveries||[]).filter(d=>d.npcId&&d.status==='delivered').map(d=>{try{return line(s,e.eventId,d.deliveryId);}catch{return null;}}).filter(Boolean));
  return freeze({version:VERSION,proposal:copy(p),reports:(s.reports||[]).map(r=>{report(s,r.reportVersionId);return copy(r);}),publicStatements,
   rule:'A report citation establishes that exact reviewed version. Public speech establishes only the named speaker position. Work acknowledgment is distinct from agreeing to this proposal wording; earlier speech is not consent to a later proposal. No unanimity, official authorship order or new research is required.'});
 }
 function beginReview(state,{eventId},s){const input=reviewInput(state,s),p=input.proposal,previous=state.reviewAttempts.filter(a=>a.proposalId===p.proposalId).at(-1),old=previous&&event(s,previous.eventId),retry=old?.type==='credit_record_review'&&old.sessionId===s.sessionId&&old.sessionEpoch===s.epoch&&
  (old.status==='failed'&&!old.commit&&!old.dialogueDeliveries?.length||old.status==='committed'&&!matchesHash(input,previous.sourceHash)&&state.reviews.some(r=>r.eventId===old.eventId&&reviewBound(r,s)));
  require(!previous||retry,'A bounded review is already pending or completed for this proposal.');require(eventId&&!state.reviewAttempts.some(a=>a.eventId===eventId),'A new explicit review event is required.');const next=copy(state);next.reviewAttempts.push({eventId,proposalId:p.proposalId,sourceHash:hash(input),retryOfEventId:previous?.eventId||''});return {state:freeze(next),input};}
 function normalizeReview(value,{proposal,sources}){
  require(exact(value,['positions'])&&Array.isArray(value.positions)&&value.positions.length<=64,'Credit review must contain only a bounded positions array.');const seen=new Set();
  return freeze({positions:value.positions.map(p=>{
   require(exact(p,['entryId','npcId','eventId','deliveryId','quote','workPosition','wordingPosition','reason'])&&proposal.entries.some(e=>e.entryId===p.entryId)&&
    ['acknowledge','dispute','no_position'].includes(p.workPosition)&&['agree','dispute','no_position'].includes(p.wordingPosition)&&typeof p.reason==='string'&&p.reason.trim()&&p.reason.length<=500&&typeof p.quote==='string'&&p.quote.trim(),'Invalid source-bound credit position.');
   const d=line(sources,p.eventId,p.deliveryId),key=[p.entryId,p.npcId,p.eventId,p.deliveryId].join('|');require(!seen.has(key)&&d.npcId===p.npcId&&d.text.includes(p.quote),'Credit response actor or exact quote does not match its source.');seen.add(key);
   if(p.wordingPosition!=='no_position')require(d.creditProposalId===proposal.proposalId&&d.eventIndex>sources.events.findIndex(e=>e.eventId===proposal.proposalId),'Earlier or another-proposal speech is not a position on this wording.');
   return copy(p);
  })});
 }
 function reviewed(state,{eventId,sourceHash,result},s){
  const input=reviewInput(state,s),attempt=state.reviewAttempts.find(a=>a.eventId===eventId);
  require(attempt&&attempt.proposalId===input.proposal.proposalId&&attempt.sourceHash===sourceHash&&matchesHash(input,sourceHash)&&!state.reviews.some(r=>r.eventId===eventId),'Review source changed or was already recorded.');
  const normalized=normalizeReview(result,{proposal:input.proposal,sources:s}),next=copy(state);next.reviews.push({eventId,proposalId:input.proposal.proposalId,sourceHash,...copy(normalized)});return freeze(next);
 }
 function bindCore(state,{eventId,decision,window},s){current(state,s);const e=event(s,eventId);require(publicEvent(e,s)&&e.type==='key_decision'&&e.metadata.stageId==='stage_4_credit','An actual completed Stage 4 core is required.');if(state.pendingCore){require(state.pendingCore.sourceEventId===eventId,'Another final core cannot replace this record.');return state;}const next=copy(state);next.pendingCore={sourceEventId:eventId,decision:copy(decision),window:copy(window)};return freeze(next);}
 function reviewBound(r,s){const e=event(s,r.eventId);return e?.status==='committed'&&e.commit&&e.type==='credit_record_review'&&e.sessionId===s.sessionId&&e.sessionEpoch===s.epoch&&e.metadata?.proposalId===r.proposalId&&e.metadata.sourceHash===r.sourceHash&&matchesHash(e.metadata.creditSource,r.sourceHash)&&JSON.stringify(e.metadata.positions)===JSON.stringify(r.positions);}
 function adopt(state,{eventId},s){
  current(state,s);const p=published(state,s);require(!state.closed&&p&&matchesHash(rows(state.draft,s,true),p.bodyHash),'The final representation must match the latest published proposal.');
  require(state.pendingCore,'Complete the actual final discussion before adopting the shared record.');
  const input=reviewInput(state,s),sourceHash=hash(input),review=state.reviews.filter(r=>r.proposalId===p.proposalId&&r.sourceHash===sourceHash&&reviewBound(r,s)).at(-1),ctx=context(state,s),next=copy(state);next.adoptions.push({eventId,proposalId:p.proposalId,proposalHash:p.bodyHash,sourceHash,sourceSnapshot:copy(input),entries:copy(p.entries),reviewEventId:review?.eventId||'',reviewStatus:ctx.reviewStatus,positions:copy(review?.positions||[]),previousResponses:copy(ctx.previousResponses||[]),adoptedBy:'player',consensus:false});return freeze(next);
 }
 function finish(state,{eventId},s){
  current(state,s);const p=published(state,s),a=state.adoptions.at(-1),ae=a&&event(s,a.eventId);
  require(!state.closed&&state.pendingCore&&p&&a?.proposalId===p.proposalId&&matchesHash(state.draft,p.bodyHash)&&matchesHash(reviewInput(state,s),a.sourceHash)&&publicEvent(ae,s)&&ae.type==='credit_record_adoption'&&ae.metadata.proposalId===p.proposalId&&ae.metadata.proposalHash===p.bodyHash&&matchesHash(a,ae.metadata.recordHash),'Adopt the current actual public representation before finishing.');
  const next=copy(state);next.closed={eventId,proposalId:p.proposalId,proposalHash:p.bodyHash,sourceHash:a.sourceHash,adoptionEventId:a.eventId,sourceCoreEventId:state.pendingCore.sourceEventId,sourceBinding:copy(state.sourceBinding),entries:copy(a.entries),positions:copy(a.positions),previousResponses:copy(a.previousResponses),publicStatements:copy(a.sourceSnapshot.publicStatements),reviewStatus:a.reviewStatus,consensus:false,unresolvedAllowed:true};return freeze(next);
 }
 function receipt(state,s){
  if(!state?.closed)return null;try{current(state,s);const c=state.closed,e=event(s,c.eventId),a=event(s,c.adoptionEventId),p=published(state,s);return publicEvent(e,s)&&e.type==='credit_record_close'&&e.metadata?.sourceCoreEventId===c.sourceCoreEventId&&e.metadata.proposalId===c.proposalId&&e.metadata.proposalHash===c.proposalHash&&matchesHash(c,e.metadata.recordHash)&&p?.proposalId===c.proposalId&&publicEvent(a,s)&&a.type==='credit_record_adoption'&&matchesHash(state.adoptions.at(-1),a.metadata?.recordHash)?freeze(copy(c)):null;}catch{return null;}
 }
 function context(state,s){current(state,s);const closed=receipt(state,s),cutoff=closed?s.events.findIndex(e=>e.eventId===closed.eventId):-1,source=cutoff>=0?{...s,events:s.events.slice(0,cutoff)}:s;
  const p=published(state,source),review=p&&state.reviews.filter(r=>r.proposalId===p.proposalId&&reviewBound(r,source)).at(-1),sourceHash=p?hash(reviewInput(state,source)):'',fresh=review?.sourceHash===sourceHash,adopted=state.adoptions.at(-1),attempt=p&&state.reviewAttempts.filter(a=>a.proposalId===p.proposalId).at(-1),reviewStatus=fresh?'checked':attempt&&attempt.eventId!==review?.eventId?(event(source,attempt.eventId)?.status==='failed'?'unavailable':'pending'):review?'outdated':'not_requested';return freeze({version:VERSION,projectId:state.projectId,formalSubmission:{...copy(state.sourceBinding),eventId:state.sourceBinding.submissionEventId},competitionResult:copy(s.competitionResult),published:p?copy(p):null,publicSourceHash:sourceHash,reviewStatus,individualResponses:copy(fresh?review.positions:[]),previousResponses:copy(!fresh&&review?review.positions:[]),adopted:adopted&&adopted.proposalId===p?.proposalId&&publicEvent(event(source,adopted.eventId),source)?copy(adopted):null,closed,rule:'This is an actual player-published contribution record. Self claims, individual public acknowledgment, agreement to specific wording and player adoption remain distinct. After closure this record is immutable as of its close event; later speech is separate evidence. PreviousResponses describe an older source snapshot, not the latest positions. Missing/unavailable review or silence means unknown, never opposition. Saving or closing is not consensus, settled authorship, scientific proof or automatic interpersonal success.'});}
 const api=Object.freeze({VERSION,MAX_ENTRIES,MAX_ENTRY_CHARS,create,save,publish,published,reviewInput,beginReview,normalizeReview,reviewed,bindCore,adopt,finish,receipt,context,hash});if(typeof module==='object'&&module.exports)module.exports=api;root.LabCreditWorkflowCore=api;
})(typeof globalThis==='object'?globalThis:this);
