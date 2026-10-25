// Readable, authored practice data and the received draft. No player edit,
// completed check, causal conclusion, agreement or grade is inferred here.
(function(root){
 'use strict';
 const VERSION='lab-review-materials-v2-paired-quiz',SOURCE_ID='inherited-project-brief-v1',DATA_ID='learning-reminder-scores-v1';
 const copy={zh:{title:'数据资料与收到的初稿',intro:'这里列出匿名成绩和收到的报告初稿。可以对照表格核对图表与文字，到“当前事项”修改报告，并查看老师已经给出的意见。',table:'匿名成绩简表：每行是同一位同学的两次测验',headings:['匿名ID','前测 /100','后测 /100','分数变化','配对比较'],included:'纳入',excluded:'缺一次，不纳入',missing:'未记录',chart:'图1 · 完整配对的平均成绩（0–100分）',before:'前测均值',after:'后测均值',
  claim:{title:'原稿中需要核对的主张',plain:'初稿中的18%、“所有人提高”和“证明提醒有效”需要与成绩资料核对。',limit:'依据表内计算和研究设计，修改报告中的结果与结论。'},
  coverage:{title:'怎样选入这10个配对',plain:'P01–P10有两次成绩；P11、P12各缺一次。缺失不是0分，也不补造分数。',limit:'分析对象是10个完整配对，不是把12行都算进同一个配对均值。'},
  figure:{title:'图1怎样从表里来',plain:'图1只比较同一批完整配对的均值；原表在上方，可以直接复算。',limit:'图1不使用旧图2，也不能证明学习提醒造成了成绩变化。'},
  handoff:{title:'报告应保留的局限',plain:'没有未提醒对照；两份测验是否等难度未检验；没有提醒阅读或执行记录。',limit:'在报告中说明这些限制，结论只覆盖现有记录能够支持的范围。'},
  template:'我引用的行或指标：\n报告中需要改的原句：\n我实际改成了什么：\n仍不能据此得出的结论：'},
 en:{title:'Data and the received draft',intro:'The anonymous scores and starting draft are shown here. Compare the table, figure and wording, edit the report in Current, and refer to advisor comments you have received.',table:'Anonymous scores: each row pairs one student’s two quizzes',headings:['Anonymous ID','Before /100','After /100','Point change','Paired comparison'],included:'Included',excluded:'One score missing; excluded',missing:'Unrecorded',chart:'Figure1 · Mean score of complete pairs (0–100 points)',before:'Before mean',after:'After mean',
  claim:{title:'Draft claims to check',plain:'The draft’s 18%, “everyone improved” and causal-proof claims need checking against the score data.',limit:'Use the calculations and study design to revise the report’s results and conclusion.'},
  coverage:{title:'How the ten pairs are included',plain:'P01–P10 have both scores; P11 and P12 each lack one. Missing is not zero and scores are not filled in.',limit:'The paired means concern ten complete pairs, not all twelve rows.'},
  figure:{title:'How Figure1 comes from the table',plain:'Figure1 compares means for the same complete pairs; the underlying values above can be recalculated.',limit:'It does not use historical Figure2 or prove that reminders caused the score change.'},
  handoff:{title:'Limitations to retain in the report',plain:'There is no no-reminder control, quiz equivalence is untested, and reminder reading/adherence is not recorded.',limit:'Explain these limitations in the report and keep the conclusion within what the available records support.'},
  template:'Rows or measure I quote:\nOriginal sentence to revise:\nWhat I actually changed it to:\nConclusion still not supported:'}};
 function pairedRows(body){
  if(typeof body!=='string')return null;
  const lines=body.trim().split(/\r?\n/),rows=[];lines.shift();
  for(const line of lines){
   const cells=line.split('|').map(s=>s.trim());if(cells.length!==3||!/^P\d{2}$/.test(cells[0]))return null;
   const scores=cells.slice(1).map(s=>s==='—'?null:/^\d{1,3}$/.test(s)&&Number(s)<=100?Number(s):NaN);
   if(scores.some(Number.isNaN)||scores.every(s=>s===null))return null;
   rows.push({id:cells[0],before:scores[0],after:scores[1],included:scores.every(s=>s!==null),change:scores.every(s=>s!==null)?scores[1]-scores[0]:null});
  }
  return rows.length>=8&&rows.length<=12&&new Set(rows.map(r=>r.id)).size===rows.length?rows:null;
 }
 function project(documents=[],language='zh'){
  const source=documents.find(d=>d.id===SOURCE_ID&&d.immutable),data=documents.find(d=>d.id===DATA_ID&&d.immutable),c=copy[language]||copy.en;if(!source||!data)return null;
  const original=id=>source.sections?.find(s=>s.id===id),datum=id=>data.sections?.find(s=>s.id===id),rows=pairedRows(datum('paired_scores')?.body);
  if(!rows||!rows.some(r=>r.included)||['study_design','summary','figure','limits'].some(id=>typeof datum(id)?.body!=='string'||!datum(id).body.trim()))return null;
  const keys=[['claim',source,original('outcome_claim')],['coverage',data,datum('summary')],['figure',data,datum('figure')],['handoff',data,datum('limits')]];
  const cards=keys.map(([key,d,section])=>section&&typeof section.body==='string'&&section.body.trim()?{id:key,...c[key],sourceDocumentId:d.id,sectionId:section.id,sourceLabel:`${d.fileName} · ${section.heading}`,quote:section.body}:null);if(cards.some(card=>!card))return null;
  const pairs=rows.filter(r=>r.included),beforeTotal=pairs.reduce((n,r)=>n+r.before,0),afterTotal=pairs.reduce((n,r)=>n+r.after,0),beforeMean=beforeTotal/pairs.length,afterMean=afterTotal/pairs.length;
  const summary={rowCount:rows.length,pairCount:pairs.length,excludedIds:rows.filter(r=>!r.included).map(r=>r.id),beforeTotal,afterTotal,beforeMean,afterMean,meanChange:afterMean-beforeMean,relativeChangePercent:beforeMean?(afterMean-beforeMean)/beforeMean*100:null,improved:pairs.filter(r=>r.change>0).length,unchanged:pairs.filter(r=>r.change===0).length,declined:pairs.filter(r=>r.change<0).length};
  return {version:VERSION,sourceId:source.id,dataId:data.id,sourceHash:source.contentHash||'',dataHash:data.contentHash||'',title:c.title,intro:c.intro,design:datum('study_design').body,rows,summary,tableCaption:c.table,tableHeadings:[...c.headings],includedLabel:c.included,excludedLabel:c.excluded,missingLabel:c.missing,chart:{title:c.chart,before:c.before,after:c.after,min:0,max:100},cards,template:c.template};
 }
 const api=Object.freeze({VERSION,SOURCE_ID,DATA_ID,project});if(typeof module!=='undefined'&&module.exports)module.exports=api;root.LabReviewMaterialsCore=api;
})(typeof window!=='undefined'?window:globalThis);
