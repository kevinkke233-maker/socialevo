// Authored fictional competition consequence, never an external-world claim.
(function(root){
 'use strict';
 const VERSION='lab-project-outcome-v1';
 function resultFor(submission,language='zh'){
  if(!submission||!submission.sourceEventId||!submission.reportVersionId||!Number.isInteger(submission.submittedAtMinutes)||submission.submittedAtMinutes<0||typeof submission.submittedOnTime!=='boolean')throw new TypeError('A real formal report receipt is required.');
  const onTime=submission.submittedAtMinutes<7*480;
  if(onTime!==submission.submittedOnTime)throw new TypeError('Submission time and deadline label disagree.');
  const zh=language==='zh',resultType=onTime?'award':'showcase';
  return {version:VERSION,resultId:`${submission.sourceEventId}-competition-result`,submissionEventId:submission.sourceEventId,reportVersionId:submission.reportVersionId,resultType,narrativeDaysLater:7,
   title:onTime?(zh?'优秀报告奖':'Excellent Report Award'):(zh?'项目收录展示':'Project accepted for showcase'),
   text:onTime?(zh?'一周后，校内学生科研竞赛公布结果：团队正式提交的研究报告获得“优秀报告奖”。获奖针对报告的清晰表达与证据使用，不代表学习提醒的因果效果得到证实。团队开始讨论最终贡献记录。':'One week later, the student research competition announces that the team’s formally submitted report has received the Excellent Report Award for clear reporting and use of evidence. This does not establish a causal effect of reminders. The team now discusses contribution credit.'):
    (zh?'一周后，校内学生科研竞赛公布结果：团队的报告已收录展示。作品在截止后提交，因此不参与本轮奖项评选。提交时间已按当时记录保留，团队仍需讨论实际贡献。':'One week later, the student research competition confirms the report’s inclusion in its showcase. It was submitted after the deadline and is ineligible for this round’s awards. The original submission time is retained; the team still needs to discuss actual contributions.'),
   rule:'Authored fictional competition result after a formally submitted report that met its published report criteria. On-time qualifying entries receive the report award; late qualifying entries are showcased. This is not a scientific replication, external service response, personal credit agreement or automatic interpersonal success.'};
 }
 const api=Object.freeze({VERSION,resultFor});if(typeof module==='object'&&module.exports)module.exports=api;root.LabProjectOutcomeCore=api;
})(typeof window!=='undefined'?window:globalThis);
