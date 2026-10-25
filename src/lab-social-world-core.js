// Authored social environment shared by every condition. No scores or gates.
(function(root){
 'use strict';
 const VERSION='lab-social-world-v3-public-identity';
 const IDS=['mina','leo','sam','riley','nora'];
 const roles={
  mina:{name:'Dr. Lin',duties:{zh:'负责参赛短报告的日常指导，解释已发生的老师意见并协调具体帮助。',en:'Provide day-to-day guidance for the competition report, explain delivered advisor comments and coordinate concrete help.'},authority:{zh:'可以提出并协调分工、复核意见；不能替所有人承诺配合或单方面决定署名。',en:'Can propose and coordinate roles and review; cannot promise everyone’s cooperation or unilaterally settle credit.'},knowledge:['newcomer_scope','review_coordination'],limits:'You did not organize Kai’s supplied score table. You can discuss the provided rows and report wording, but cannot invent adherence records, establish causality or speak for Zhao. Procedural fairness is not unconditional advocacy.'},
  leo:{name:'Jun',duties:{zh:'参与学生科研竞赛的日常协作，可以讨论已给材料、实际工作与成员对接。',en:'Participate in everyday competition-project collaboration and discuss supplied materials, actual work and ordinary coordination.'},authority:{zh:'能解释自己知道的日常做法、提供有限帮助；不能代表导师或其他成员批准安排。',en:'Can explain familiar everyday practices and offer limited help; cannot approve arrangements for advisors or other members.'},knowledge:['lab_navigation','bounded_peer_help'],limits:'You are not an all-knowing guide or a dedicated newcomer tutor. Do not disclose private motives or exchanges, invent files, or answer legacy technical questions for Kai. Supporting privately does not guarantee public advocacy.'},
  sam:{name:'Kai',publicIdentity:{zh:'高年级学生',en:'Senior student'},duties:{zh:'整理并提供12行匿名测验成绩，能说明10个完整配对的选入；新的报告修改或核查仍要看实际记录。',en:'Organize and supply the12 anonymous quiz-score rows and explain inclusion of10 complete pairs. New report edits/checks require actual records.'},authority:{zh:'能说明自己的旧工作和当前意见；不能把未经同意的旧责任转给新人或代表全组定分工。',en:'Can describe your own earlier work and current stance; cannot make an unagreed transfer of legacy responsibility binding or assign roles for everyone.'},knowledge:['paired_score_table','complete_pair_limits'],limits:'Organizing the supplied table does not establish that you created every quiz or copied historical Figure2. The12 score rows, complete-pair rule and Figure1 values are supplied; reminder adherence, quiz equivalence and a no-reminder control are not. You may explain actual rows without inventing unavailable evidence or completed edits.'},
  riley:{name:'Prof. Zhao',duties:{zh:'作为参赛报告指导老师，审阅首次报告与改稿，提出有依据的批评和修改优先级。',en:'Review the first and revised competition reports, criticize actual submitted wording and set supported revision priorities.'},authority:{zh:'拥有项目层面的决定权；评价不能使缺失证据凭空出现，也不能把提议说成已经完成。',en:'Has project-level authority; evaluation does not create missing evidence or turn proposals into completed work.'},knowledge:['project_requirements','revision_priority'],limits:'You are not a patient one-stop onboarding tutor or an unseen data source. Ground criticism in the actual submitted report and supplied scores. Extra future experiments do not become mandatory report criteria. An award requires the actual authored competition-result event, not your invented approval.'},
  nora:{name:'Emma',duties:{zh:'参与参赛短报告的文字整合、图1说明与贡献记录，区分建议和已经落实的正文。',en:'Help integrate competition-report wording, Figure1 descriptions and contribution records; distinguish suggestions from implemented body edits.'},authority:{zh:'能提出文字建议、记录实际交付；不能单独确认数据正确、决定署名或保证别人支持。',en:'Can suggest wording and record actual deliveries; cannot independently certify data, decide authorship or guarantee others’ support.'},knowledge:['current_wording','contribution_record'],limits:'Current wording coordination is not evidence you copied historical Figure2 or implemented a report edit. Use the supplied Figure1/score sources and actual report versions. Do not invent awards, earlier file access, version history or completed revisions. Small private help and public support may differ.'}
 };
 function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
 freeze(roles);
 function forNpc(npcId,{language='zh',stageId='',workload=null}={}){
  const role=roles[npcId];if(!role)return null;
  const lang=language==='zh'?'zh':'en';
  return {version:VERSION,npcId,stageId,
   ...(role.publicIdentity?{publicIdentity:role.publicIdentity[lang]}:{}),
   ownResponsibilities:role.duties[lang],authorityBoundary:role.authority[lang],ownKnowledgeDomains:[...role.knowledge],evidenceLimits:role.limits,
   colleagues:IDS.filter(id=>id!==npcId).map(id=>({id,name:roles[id].name,ordinaryRole:roles[id].duties[lang],...(roles[id].publicIdentity?{publicIdentity:roles[id].publicIdentity[lang]}:{})})),
   workload:workload?{activity:String(workload.activity||''),atWork:Boolean(workload.atWork)}:null,
   instruction:'Operational duties are not completed work or binding assignments. Explain your own role when asked; refer using ordinary colleague roles, never confidential knowledge. Respond with bounded help, clarification, deferral, refusal or disagreement as warranted by your actual persona/history, not forced friendliness or hostility. Unknown evidence may stay documented. No trust threshold, chat quota, compulsory visits, coercion or condition-specific opportunity. A promise is not delivery; fair boundaries are legitimate.'};
 }
 function deliveredTestimony({epoch,events=[],npcId}={}){
  const rows=[];
  for(const e of events){
   if(e.sessionEpoch!==epoch||e.status!=='committed')continue;
   const publicEvent=e.audience?.visibility==='group',privateEvent=e.audience?.visibility==='private'&&e.audience?.npcIds?.includes(npcId);
   if(!publicEvent&&!privateEvent)continue;
   // Anchor aggregate duplicates its actual delivered step receipts.
   if(e.type==='story_anchor')continue;
   for(const d of e.dialogueDeliveries||[]){if(d.status!=='delivered'||d.npcId!==npcId||typeof d.text!=='string'||!d.text.trim())continue;
    rows.push({id:d.deliveryId,eventId:e.eventId,stageId:e.metadata?.stageId||'',speakerId:npcId,speaker:d.speaker||roles[npcId]?.name||'',text:d.text,visibility:publicEvent?'group':'private',claimOnly:true});
   }
  }
  return rows;
 }
 function discovery({epoch,events=[],documents=[],npcIds=IDS}={}){
  const presentedIds=new Set(events.filter(e=>e.sessionEpoch===epoch&&e.status==='committed'&&e.type==='shared_artifact_review'&&e.metadata?.documentId).map(e=>e.metadata.documentId));
  const originals=documents.filter(d=>presentedIds.has(d.id)&&d.immutable!==false).map(d=>({id:d.id,title:d.title,fileName:d.fileName,sections:(d.sections||[]).map(s=>({id:s.id,heading:s.heading,body:s.body})),kind:'presented_original',comprehensionAssumed:false}));
  return {version:VERSION,members:npcIds.filter(id=>IDS.includes(id)).map(id=>({id,name:roles[id].name,testimony:deliveredTestimony({epoch,events,npcId:id}),roleVerified:false})),originals,
   rule:'Player-private notebook of actual delivered testimony and originals presented in this session. A member statement is not verified fact, agreement or completion. No authored hidden duty, motive or score is revealed by this projection. Reading is not broadcast to NPCs. Unknown sources remain unknown.'};
 }
 const ACTOR_PURPOSES=new Set(['decision_npc_response','npc_first_contact','private_side_talk_response','npc_followup_response','autonomous_npc_exchange','artifact_evaluation','lab_story_anchor','side_talk_options']);
 function groundPayload(payload,{language='zh',stageId=''}={}){
  if(!ACTOR_PURPOSES.has(payload?.agentPurpose)||!Array.isArray(payload.messages))return payload;
  let added=false;
  const messages=payload.messages.map(m=>{
   if(m.role!=='user'||typeof m.content!=='string')return m;
   let context;try{context=JSON.parse(m.content);}catch{return m;}
   const npcId=context?.speakerNpc?.id||context?.npc?.id;
   const social=forNpc(npcId,{language,stageId});if(!social)return m;
   added=true;
   // Task feedback needs only the evaluator's duty/authority boundary, not a
   // directory or repeated conversational guidance in its bounded input.
   const projection=payload.agentPurpose==='artifact_evaluation'?{version:social.version,npcId,stageId:social.stageId,ownResponsibilities:social.ownResponsibilities,authorityBoundary:social.authorityBoundary,evidenceLimits:social.evidenceLimits}:social;
   return {...m,content:JSON.stringify({...context,socialEnvironment:projection})};
  });
  if(!added)return payload;
  const rule='[LAB_SOCIAL_ENVIRONMENT_V1] socialEnvironment defines operational duties, knowledge limits and authority, not historical proof or hidden personality labels. Preserve public originals. Never claim another member’s work, unprovided data, agreement from a proposal, or completion from reading. Help, refusal, deferral and referral follow actual persona/history, never condition labels or score thresholds; honest unknowns and coordination requests are legitimate. Suggested PLAYER topics use delivered context or neutral questions, not unseen roles or invented prior actions.';
  return {...payload,messages:messages.map(m=>m.role==='system'&&!m.content.includes('[LAB_SOCIAL_ENVIRONMENT_V1]')?{...m,content:m.content+'\n'+(payload.agentPurpose==='artifact_evaluation'?rule.replace(' Suggested PLAYER topics use delivered context or neutral questions, not unseen roles or invented prior actions.',''):rule)}:m)};
 }
 const api=Object.freeze({VERSION,IDS:Object.freeze(IDS),forNpc,discovery,deliveredTestimony,groundPayload});
 if(typeof module==='object'&&module.exports)module.exports=api;root.LabSocialWorldCore=api;
})(typeof window!=='undefined'?window:globalThis);
