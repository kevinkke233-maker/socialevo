// Source-bound player work packs. A projection, not a quest/grade/time engine.
(function(root){
 'use strict';
 const STAGES=['stage_1_entry','stage_2_first_failure','stage_3_revision_conflict','stage_4_credit'];
 const VERSION='lab-cooperation-v2-report-work',TASKS=['','brief_review','revision_plan','contribution_statement'];
 const copy={zh:[
  {title:'项目简介：学习提醒与测验成绩',purpose:'小组正在准备学生科研竞赛短报告。先了解项目、现有资料和自己愿意承担的工作。',deliverable:'向组员介绍自己的想法与可以参与的部分。',next:'可以先看项目简介，也可以找一位成员聊聊。',pack:'项目简介',materials:'项目简介、七个工作日的正式提交期限，以及已有的入组交流记录。',fields:['我理解的项目与成果','我还想问的问题','我愿意承担的部分','我需要说明的边界']},
  {title:'编辑参赛短报告',purpose:'电脑里有收到的报告初稿、12行匿名成绩和读图说明。用这些资料检查报告里的数字与表述。',deliverable:'报告正文五节：问题、方法与样本、结果与图表、结论、局限。',next:'打开最新稿，修改正文；准备好后送给老师审阅。',pack:'项目、初稿与数据',materials:'项目简介、收到的报告初稿、12行匿名成绩，以及已经收到的老师意见。',fields:['我核对的原句与表内数字','报告中需要修改的地方','我打算写进哪一节','仍需保留的科学局限']},
  {title:'继续修改参赛报告',purpose:'结合收到的老师意见，继续编辑同一份报告。需要时与成员核对分工和具体问题。',deliverable:'修改后的报告全文，结果、图1与结论相互一致。',next:'在最新稿中落实修改，准备好后再次送审。',pack:'最新报告与老师意见',materials:'原始成绩、已经送审的报告版本、收到的老师意见和已有的小组交流。',fields:['老师指出的问题','我准备落实到正文的修改','需要澄清的分工与责任','修改后仍需保留的限制']},
  {title:'整理项目贡献',purpose:'参赛报告已经提交。回看比赛结果、报告版本和合作记录，说明各自的工作。',deliverable:'贡献说明：自己的修改、使用的数据、他人的帮助，以及仍需讨论的归属。',next:'参考已有记录编辑贡献说明，并与组员核对。',pack:'比赛结果与报告记录',materials:'正式提交的报告、已经公布的比赛结果、报告版本、老师意见和合作记录。',fields:['我改过并提交的内容','可以引用的报告版本或结果','需要致谢的数据与帮助','仍需讨论的贡献归属']}
 ],en:[
  {title:'Project introduction: study reminders and quiz scores',purpose:'The team is preparing a student competition report. Learn about the project, available material and work you are willing to undertake.',deliverable:'Introduce your ideas and the part you can take on.',next:'Read the project introduction or talk with a member.',pack:'Project introduction',materials:'The introduction, seven-workday formal submission deadline and existing entry conversations.',fields:['The project and deliverable I understand','Questions I still want to ask','The part I can undertake','Boundaries I need to state']},
  {title:'Edit the competition report',purpose:'Use the starting report, 12 anonymous score rows and figure guide to check its values and wording.',deliverable:'The five report sections: question, methods and participants, results and figures, conclusion and limitations.',next:'Open the latest draft, edit the body and send it to the advisors when ready.',pack:'Project, starting draft and data',materials:'The introduction, received report, 12 anonymous score rows and advisor comments already received.',fields:['Original sentence and source values I checked','What needs to change in the body','The report section for that change','Scientific limitations to retain']},
  {title:'Keep revising the competition report',purpose:'Use the comments you have received to keep editing the same report. Ask members about responsibilities or specific questions if useful.',deliverable:'The revised report with consistent results, Figure 1 and conclusion.',next:'Apply edits in the latest draft and send it for review again when ready.',pack:'Current report and advisor comments',materials:'The original scores, reviewed report versions, received advisor comments and existing team conversations.',fields:['What the advisors pointed out','Changes to put in the report body','Responsibilities to clarify','Limits that remain after revision']},
  {title:'Describe project contributions',purpose:'The competition report has been submitted. Review the result, report versions and collaboration notes to describe each person’s work.',deliverable:'A contribution statement covering your edits, data used, help from others and attribution still to discuss.',next:'Edit your contribution statement from the existing record and review it with the team.',pack:'Competition result and report record',materials:'The formally submitted report, published result, report versions, advisor comments and collaboration notes.',fields:['What I edited and submitted','Report version or result I can cite','Data and help to acknowledge','Credit still to discuss']}
 ]};
 function records({epoch,events=[],artifacts=[]}={}){
  const rows=[],pub=events.filter(e=>e.sessionEpoch===epoch&&e.status==='committed'&&e.audience?.visibility==='group');
  for(const e of pub){
   if(e.type==='artifact_submission'){
    const a=artifacts.find(a=>a.sourceEventId===e.eventId&&a.id===e.metadata?.artifactId&&a.sourceTaskId===e.metadata?.sourceTaskId&&a.sourceTaskId&&TASKS.includes(a.sourceTaskId)&&['accepted','needs_revision','rejected'].includes(a.status));if(!a)continue;
    const feedback=(e.dialogueDeliveries||[]).filter(d=>d.status==='delivered'&&d.channel==='artifact_evaluation'&&d.npcId);
    rows.push({id:e.eventId,kind:'submission',stageId:e.metadata.stageId||'',taskId:a.sourceTaskId,status:a.status,title:a.title||a.sourceTaskId,note:a.note||'',action:a.optionAction||a.selectedOption||'',lines:feedback.map(d=>({id:d.deliveryId,speaker:d.speaker,npcId:d.npcId,text:d.text})),timestamp:e.committedAt||e.createdAt||''});
   }else if(e.type==='competition_result'&&e.metadata?.simulationAuthored===true&&e.metadata.narrativeDaysLater===7&&['award','showcase'].includes(e.metadata.resultType)){
    const from=pub.find(x=>x.eventId===e.metadata.submissionEventId&&x.type==='project_submission'&&x.commit&&x.metadata?.projectId===e.metadata.projectId&&x.metadata?.reportVersionId===e.metadata.reportVersionId);
    const lines=(e.dialogueDeliveries||[]).filter(d=>d.status==='delivered'&&d.channel==='competition_result'&&!d.npcId&&d.speaker==='Game Master'&&typeof d.text==='string'&&d.text.trim());if(!from||!lines.length)continue;
    rows.push({id:e.eventId,kind:'competition_result',anchorId:'competition_result',stageId:STAGES[3],title:'',lines:lines.map(d=>({id:d.deliveryId,speaker:d.speaker,npcId:'',text:d.text})),timestamp:e.committedAt||e.createdAt||''});
   }else if(e.type==='story_anchor_step'&&e.metadata?.readCompletedAt){
    const lines=(e.dialogueDeliveries||[]).filter(d=>d.status==='delivered'&&d.npcId&&d.channel==='story_anchor_speech');if(!lines.length)continue;
    rows.push({id:e.eventId,kind:'discussion',anchorId:e.metadata.anchorId||'',stepIndex:e.metadata.stepIndex,stageId:e.metadata.stageId||'',title:'',lines:lines.map(d=>({id:d.deliveryId,speaker:d.speaker,npcId:d.npcId,text:d.text})),timestamp:e.committedAt||e.createdAt||''});
   }else if(['key_decision','opening_response','npc_followup'].includes(e.type)){
    const lines=(e.dialogueDeliveries||[]).filter(d=>d.status==='delivered');if(!lines.length)continue;
    rows.push({id:e.eventId,kind:'discussion',anchorId:'',stageId:e.metadata.stageId||'',title:'',lines:lines.map(d=>({id:d.deliveryId,speaker:d.speaker,npcId:d.npcId||'',text:d.text})),timestamp:e.committedAt||e.createdAt||''});
   }
  }return rows;
 }
 function project({stageIndex=0,epoch,events=[],artifacts=[],documents=[],language='zh'}={}){
  const index=Math.max(0,Math.min(3,Math.floor(Number(stageIndex)||0))),c=(copy[language]||copy.en)[index],all=records({epoch,events,artifacts});
  const relevant=all.filter(r=>STAGES.indexOf(r.stageId)>=0&&STAGES.indexOf(r.stageId)<=index).filter(r=>index===0?r.stageId==='stage_1_entry':index===1?r.taskId==='brief_review'||r.anchorId==='advisor_review':index===2?r.taskId==='brief_review'||r.taskId==='revision_plan'||['advisor_review','return_blame'].includes(r.anchorId):['brief_review','revision_plan','contribution_statement'].includes(r.taskId)||['competition_result','final_check','return_blame'].includes(r.anchorId));
  // Task relevance first; chronology remains visible in the separate log.
  if(index>=2){const priority=r=>index===2?(r.anchorId==='advisor_review'&&r.stepIndex===1?0:r.anchorId==='return_blame'?1:r.anchorId==='advisor_review'?2:r.taskId==='revision_plan'?3:4):(r.kind==='competition_result'?0:r.anchorId==='final_check'?1:r.taskId==='contribution_statement'?2:r.taskId==='revision_plan'?3:r.taskId==='brief_review'?4:5);relevant.sort((a,b)=>priority(a)-priority(b));}
  const originalIds=['entry-scope-note-v1','learning-reminder-scores-v1','inherited-project-brief-v1'];
  const originals=documents.filter(d=>originalIds.includes(d.id)).map(d=>({id:d.id,title:d.title,fileName:d.fileName,sections:(d.sections||[]).filter(s=>typeof s.body==='string'&&s.body.trim()).map(s=>({id:s.id,heading:s.heading,body:s.body}))}));
  return {version:VERSION,index,taskId:TASKS[index],...c,originals,records:relevant,
   emptyRecord:language==='zh'?'这里还没有交流或送审记录。':'There are no conversation or review records here yet.',
   rule:'Source and actual public record only; notes/proposals are not facts, agreement, task completion or new progression prerequisites.'};
 }
 function compile(note,language='zh'){
  const fields=Array.isArray(note?.fields)?note.fields:[],labels=note?.labels||[],parts=fields.flatMap((v,i)=>String(v||'').trim()?[`${labels[i]||i+1}：${String(v).trim()}`]:[]);
  const refs=(note?.citations||[]).map(c=>`[${c.label}] ${c.quote}`);
  return [...parts,...refs.length?[language==='zh'?'来源摘录：':'Source excerpts:',...refs]:[]].join('\n\n');
 }
 const api=Object.freeze({VERSION,TASKS,records,project,compile});if(typeof module!=='undefined'&&module.exports)module.exports=api;root.LabCooperationCore=api;
})(typeof window!=='undefined'?window:globalThis);
