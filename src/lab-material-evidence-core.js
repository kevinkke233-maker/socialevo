// Current run's public evidence, never an invented revised manuscript/dataset.
(function(root){
 'use strict';
 const TASKS=['brief_review','revision_plan','contribution_statement'];
 function project({epoch,events=[],artifacts=[]}={}){
  const publicEvents=events.filter(e=>e.sessionEpoch===epoch&&e.status==='committed'&&e.audience?.visibility==='group');
  const byId=new Map(publicEvents.map(e=>[e.eventId,e])),rows=[];
  for(const a of artifacts){const e=byId.get(a.sourceEventId);if(!e||e.type!=='artifact_submission'||!TASKS.includes(a.sourceTaskId)||e.metadata?.artifactId!==a.id||!['accepted','needs_revision','rejected'].includes(a.status))continue;
   rows.push({kind:'submission',sourceEventId:e.eventId,stageId:e.metadata.stageId||'',taskId:a.sourceTaskId,title:a.title||'',status:a.status,selectedOption:a.selectedOption||'',note:a.note||'',feedback:(e.dialogueDeliveries||[]).filter(d=>d.status==='delivered'&&d.npcId).map(d=>({speaker:d.speaker,text:d.text})),order:events.indexOf(e)});
  }
  for(const e of publicEvents){if(!['story_anchor_step','key_decision'].includes(e.type))continue;const lines=(e.dialogueDeliveries||[]).filter(d=>d.status==='delivered').map(d=>({speaker:d.speaker,text:d.text}));if(!lines.length)continue;
   rows.push({kind:e.type,sourceEventId:e.eventId,stageId:e.metadata?.stageId||'',anchorId:e.metadata?.anchorId||'',feedback:lines,order:events.indexOf(e)});
  }
  return rows.sort((a,b)=>a.order-b.order);
 }
 const SOURCE_WORD='(?:原表|原始表(?:格)?|登记表|分析表|原始(?:数据|记录|行|口径)|来源(?:材料)?|资料|材料|依据|表头|raw (?:tables?|data|records?)|(?:analysis|intake) tables?|source(?:s| materials?)?|headers?)';
 const ACQUIRE_WORD='(?:拿到|取得|获取|获得|收到|提供|补齐|拿齐|索取|请求|obtain(?:ed|ing)?|receiv(?:e|ed|ing)|provid(?:e|ed|ing)|request(?:ed|ing)?)';
 function sourceCondition(prefix){
  // An unknown elsewhere in the sentence is not a condition on this action.
  const local=prefix.split(/但是|不过|然而|否则|但|\bbut\b|\bhowever\b/iu).at(-1);
  const patterns=[new RegExp(`${ACQUIRE_WORD}.{0,24}${SOURCE_WORD}.{0,12}(?:后|再|然后|之后)`,'giu'),new RegExp(`${SOURCE_WORD}.{0,12}${ACQUIRE_WORD}.{0,8}(?:后|再|之后)`,'giu'),new RegExp(`(?:待|等)?${SOURCE_WORD}.{0,16}(?:齐备|齐全|到位|补齐|提供|收到).{0,5}(?:后|再|才)`,'giu'),new RegExp(`\\b(?:after|once)\\b.{0,65}(?:${ACQUIRE_WORD}|available).{0,35}${SOURCE_WORD}|\\b(?:after|once)\\b.{0,35}${SOURCE_WORD}.{0,35}(?:provided|received|obtained|available)`,'giu')];
  return patterns.some(p=>[...local.matchAll(p)].some(m=>!/(?:未|没|没有|无法|不能|尚未).{0,3}(?:拿到|取得|获取|获得|提供|补齐|收到)|\bnot\s+(?:provided|received|obtained|available)/iu.test(m[0])));
 }
 function acquisitionPlan(text){
  return /(?:先|计划|打算|准备|first|plan to)/iu.test(text)&&new RegExp(`${ACQUIRE_WORD}.{0,24}${SOURCE_WORD}|${SOURCE_WORD}.{0,12}(?:提供|补齐)`,'iu').test(text)&&!/(?:未|没|没有|无法|不能|尚未).{0,3}(?:拿到|取得|获取|获得|提供|补齐|收到)/u.test(text);
 }
 function deferredComparison(q,m,previousAcquisition){
  const prefix=q.slice(0,m.index),suffix=q.slice(m.index+m[0].length);
  const local=prefix.split(/[，,]|但是|不过|然而|否则|但|\bbut\b|\bhowever\b/iu).at(-1);
  if(sourceCondition(prefix)||(previousAcquisition&&/^(?:再|然后|之后|接着|届时|then\b|next\b|after that\b)/iu.test(q.trim())))return true;
  if(/(?:不能|无法|不要求|不需要|不必|不用|无需|不要|尚未|还没|没有|不是让你)(?:现在|立即|马上|先|再|你|把|去|做|核对|对齐|比对|验证|查|\s)*$/u.test(local)||/(?:cannot|not yet|do not|don.t need to)\s*$/iu.test(local))return true;
  if(/(?:不做|不要求|不需要|不能|不要|尚未).{0,5}(?:逐条|逐行|核对|对齐|比对|验证|查)/u.test(m[0]))return true;
  // Recording a future check is different from performing it now.
  return /^.{0,10}(?:列为|标为|写成|记为|记录为)(?:待核(?:查|对)?项?|待确认|未知|未核对)/u.test(suffix)||/^.{0,14}(?:前提是|须先|必须先).{0,5}/u.test(suffix)&&sourceCondition(suffix+'后');
 }
 function unavailableQuestion(text){
  if(typeof text!=='string')return null;
  let previousAcquisition=false;
  for(const raw of text.match(/[^。！？?；;\n]+[。！？?；;\n]?/gu)||[]){
   const q=raw.replace(/[。！？?；;\n]$/u,'').trim();
   const carry=previousAcquisition;previousAcquisition=acquisitionPlan(q);
   const ask=/[?？]$/u.test(raw)||/(?:告诉我|说清|指出|选出|你先|tell me|specify|identify)/iu.test(q);
   const expert=/(?:怎么|如何|怎样).{0,14}(?:确认|核对|确定|验证).{0,25}(?:这张图|图\s*2|图表).{0,14}(?:对应|数据|样本|范围)|\bhow\b.{0,25}\b(?:confirm|verify|establish|determine)\b.{0,35}\b(?:figure|plot|chart)\b.{0,25}\b(?:scope|mapping|sample|rows)\b/iu.exec(q);
   if(ask&&expert&&!deferredComparison(q,expert,carry)&&!/(?:不用|不必|不需要|不是让你|do not need to|don.t need to).{0,12}$/iu.test(q.slice(0,expert.index)))return {code:'unavailable_data_question',quote:q,dependency:expert[0]};
   const column=/(?:哪(?:一|个|些)?列|哪(?:个|些)字段|(?:具体|准确)(?:列名|字段名)|哪(?:些|几|一)行|(?:哪些|哪几个)(?:样本|记录)(?:编号|ID)|(?:表格|分析表).{0,10}哪(?:部分|里|块).{0,12}(?:对不上|不对应)|\b(?:which|what)\b.{0,50}\b(?:columns?|fields?|rows?|record IDs?)\b)/iu.exec(q);
   if(ask&&column){
    const lastYou=Math.max(q.lastIndexOf('你'),q.toLowerCase().lastIndexOf('you')),prefix=q.slice(0,column.index);
    const unknownBackground=lastYou>column.index&&/(?:不知道|无法|没有|缺少|不确定|don.t know|do not know|not (?:provided|supplied)|cannot|can.t|unknown)/iu.test(q.slice(0,lastYou));
    const referral=/(?:请|让).{0,10}(?:原成员|原项目成员|原始成员|Kai).{0,15}(?:提供|确认|指出|说清)/u.test(prefix);
    const unrelatedRows=/哪(?:些|几|一)行|\brows?\b/iu.test(column[0])&&!/(?:分析表|数据|图\s*2|样本|analysis|table|figure|data)/iu.test(q);
    if(!unknownBackground&&!referral&&!unrelatedRows&&!deferredComparison(q,column,carry))return {code:'unavailable_data_question',quote:q,dependency:column[0]};
   }
   // Do not let an earlier negated action swallow a later imperative. Keep
   // original offsets so a source condition before a comma still binds.
   let offset=0;
   for(const part of q.split(/([，,]|但是|不过|然而|否则|但|\bbut\b|\bhowever\b)/iu)){
    const start=offset;offset+=part.length;
    const immediate=/(?:下一步|先|你|请|把|现在|next|first|you|now)/iu.test(part);
    const figures=/(?:核对|对齐|比对|验证|查).{0,30}(?:图\s*2|试点标签|图表).{0,40}(?:79\s*行|分析表).{0,30}(?:对得上|对不对得上|对齐|对应|比对|一致|核对)/iu.exec(part);
    const tables=/(?:登记表|126\s*条).{0,25}(?:分析表|79\s*行).{0,35}(?:逐条|逐行|对一遍|对齐|对账)|(?:79\s*行|分析表).{0,25}(?:126\s*条|登记表).{0,35}(?:逐条|逐行|对一遍|对齐|对账)/iu.exec(part);
    // Summary counts do not identify missing rows. A suggested first step is
    // still an unavailable comparison if it asks to match those rows by site
    // or registry; ordinary source requests/unknown lists are not comparisons.
    const records=/(?:按|根据|用|拿|把)(?:站点|登记表|分析表|原始记录).{0,18}(?:逐条|逐行|逐项)(?:比对|核对|对齐|对账|核查).{0,10}(?:缺失|漏掉|未纳入)(?:的)?记录|(?:逐条|逐行|逐项)(?:比对|核对|对齐|对账|核查).{0,12}(?:登记表|分析表|原始记录).{0,10}(?:缺失|漏掉|未纳入)(?:的)?记录/iu.exec(part);
    // Late16 also asks to map summary rows back to registrations or treats
    // both counts as available tables. Merely reading coverage notes is valid.
    const summaryRows=/(?:79\s*行|分析表).{0,25}(?:对回|匹配到|匹配回).{0,12}(?:126\s*条|登记表)/iu.exec(part);
    const summaryCoverage=/(?:登记表|126\s*条).{0,25}(?:分析表|79\s*行).{0,20}(?:核对|比对|核查)(?:覆盖范围|覆盖口径)|(?:79\s*行|分析表).{0,25}(?:126\s*条|登记表).{0,20}(?:核对|比对|核查)(?:覆盖范围|覆盖口径)/iu.exec(part);
    const detailed=/(?:核对|对齐|比对|验证).{0,18}(?:图\s*2|图表|标签).{0,18}(?:当前|79\s*行|分析表).{0,12}(?:一致|对应|是否|对齐)|(?:compare|verify|align).{0,30}(?:figure|labels?).{0,35}(?:analysis table|79.rows).{0,25}(?:match|correspond|consistent)/iu.exec(part);
    const reverse=/(?:图\s*2|图表|标签).{0,28}(?:79\s*行|分析表|analysis table).{0,18}((?:逐项|逐条|逐行)?(?:核对|对齐|比对|验证|对一遍))/iu.exec(part);
    if(immediate&&reverse){const operation={0:reverse[1],index:reverse.index+reverse[0].lastIndexOf(reverse[1])};if(!deferredComparison(q,reverse,carry)&&!deferredComparison(q,operation,carry))return {code:'unavailable_data_question',quote:q,dependency:'Actual figure/table comparison requires original sources first.'};}
    const recordCommand=records&&(immediate||/^(?:再|然后|之后|接着|届时)/u.test(part.trim()))?records:null;
    const summaryCommands=immediate||/^(?:再|然后|之后|接着|届时)/u.test(part.trim())?[summaryRows,summaryCoverage]:[];
    for(const comparison of [...(immediate?[figures,tables]:[]),recordCommand,...summaryCommands,detailed]){
     if(!comparison)continue;comparison.index+=start;
     if(!deferredComparison(q,comparison,carry))return {code:'unavailable_data_question',quote:q,dependency:'Current row/figure comparison requires original sources first; summary counts are not the tables.'};
    }
   }
   const availabilityOnly=/(?:问|确认|了解|检查|check|ask).{0,45}(?:是否|有没有|有无|whether).{0,12}(?:已|已经|有)?(?:提供|可用|available|provided)/iu.test(q)&&!/(?:列出来|算出|报出|给出具体|give me|calculate|list the)/iu.test(q);
   if(!availabilityOnly&&/(?:把|请|你|先|给我|告诉我|provide|list|tell me).{0,35}(?:缺失记录数|缺失人数|站点(?:分布|拆分)|missing (?:record|participant) count|site (?:breakdown|distribution)).{0,20}(?:列|算|写|说|报|提供|出来|数|list|count|provide)/iu.test(q)&&!/(?:拿到|取得|提供|补齐).{0,25}(?:后|再)|(?:未知|不知道|没有依据|尚未|无法|不能|未提供|待确认|待核查)|(?:请|让).{0,8}(?:原成员|原项目成员|Kai).{0,12}(?:补|提供)|(?:after|once).{0,45}(?:provided|obtained)|unknown|not provided/iu.test(q))return {code:'unavailable_data_question',quote:q.trim(),dependency:'Missing counts/site distribution require absent sources, not arithmetic on summary counts.'};
  }
  return null;
 }
 function unsupportedGradePrerequisite(taskId,status,reason){
  if(taskId!=='brief_review'||!['needs_revision','rejected'].includes(status)||typeof reason!=='string')return null;
  const clauses=reason.split(/[。！？?；;\n]/u);
  for(let i=0;i<clauses.length;i++){
   const q=clauses[i],m=/(?:分工(?:归属)?|责任人|负责归属).{0,12}(?:未落实|未确认|尚未落实|尚未确认)|(?:assignment|responsible person|task owner).{0,18}(?:unconfirmed|unassigned|not confirmed|not assigned)/iu.exec(q);if(!m)continue;
   const prefix=q.slice(0,m.index),tail=q.slice(m.index+m[0].length).split(/但是|不过|然而|但|\bbut\b|\bhowever\b/iu)[0];
   if(/(?:不因|不能因|不应因|不是因为|不以)[“”"'「」\s]{0,4}$/u.test(prefix)||/(?:不影响|不构成|不作为|不因此|不会因此|并不因此)|does not affect|not a (?:grading )?prerequisite/iu.test(tail))continue;
   if(/(?:旧候选|先前候选|被拒(?:绝)?的(?:理由|候选)|旧输出)/u.test(prefix)&&/(?:理由不成立|理由错误|理由无效|不能采用)/u.test(tail))continue;
   const follow=tail.trim()?tail:(clauses[i+1]||'').trim();
   const causal=/(?:因此|所以|故|导致|因而)|\b(?:therefore|thus|so)\b/iu.test(follow)||/(?:因为|由于|因)|\b(?:because|since)\b/iu.test(prefix);
   const grade=/(?:未满足|不满足).{0,15}(?:标准|要求)|(?:需|需要|须)(?:修订|修改)|(?:审阅|稿件|本次提交).{0,12}(?:不通过|不合格|不能接受)|扣分|needs_revision|rejected|\breview\b.{0,18}(?:needs revision|fails|not accepted)/iu.test(follow);
   if(causal&&grade)return {code:'additional_artifact_requirement',quote:(q+(tail.trim()?'':'。'+follow)).trim(),dependency:'Review grading does not require colleague consent or implemented assignments, even alongside a real missing criterion.'};
  }
  return null;
 }
 function qualifiedClaim(text,m){
  const before=text.slice(Math.max(0,m.index-70),m.index).replace(/[“”"'「」]/gu,'').trim();
  const local=before.split(/[。！？?；;，,\n]|但是|不过|然而|但|\bbut\b|\bhowever\b/iu).at(-1);
  const after=text.slice(m.index+m[0].length,m.index+m[0].length+35);
  if(/(?:Kai|凯|Lin|林老师|Jun|Emma|Zhao|赵老师|玩家|你).{0,10}(?:说|原话|写|表示|称|said|says)[：:,，]?\s*$/iu.test(before)||/(?:据|根据|按照).{0,10}(?:Kai|凯|Lin|Jun|Emma|Zhao).{0,8}(?:所说|所述|说法|自述)[：:,，]?\s*$/iu.test(before))return true;
  if(/(?:可能|也许|尚未确认|未确认|不能确认|无法确认|不确定|不知道是否|假设|如果|cannot confirm|uncertain|hypothetically).{0,12}$/iu.test(local))return true;
  if(/(?:不能|不应|不该|不要|没有|从未)(?:再)?(?:声称|说|写成|认定|算作)?\s*$/u.test(local))return true;
  return /^[”"」]?[，,：:]?\s*(?:这(?:个)?(?:说法|归属|主张)?(?:尚未确认|没有依据|未被证实)|(?:只是猜测|尚未确认|没有依据|未被证实|不准确|不成立)|is (?:unconfirmed|not established)|not established)/iu.test(after);
 }
 function unsupportedMaterialClaim(text){
  if(typeof text!=='string')return null;
  for(const clause of text.split(/[。！？!?；;\n]/u)){
   const figureOwner=/(?:图\s*2)(?:的)?(?:原始|原有|原作|既有)?(?:归属|作者归属|贡献归属).{0,4}(?:是|在|属于|划给|划到|划归|归于)\s*(?:Kai|凯)(?:那边)?|图\s*2(?:的原作|的原始贡献)?\s*(?:属于|归于|归)\s*(?:Kai|凯)(?:那边)?|图\s*2\s*(?:是|属于)\s*(?:Kai|凯)(?:的)?(?:原始|原有|既有)?贡献/iu.exec(clause);
   const assignedCheck=figureOwner&&!/(?:原始|归属|贡献|原作)/u.test(figureOwner[0])&&/^(?:来|负责|做)?(?:核对|复核|比对|标签检查)/u.test(clause.slice(figureOwner.index+figureOwner[0].length));
   if(figureOwner&&!assignedCheck&&!qualifiedClaim(clause,figureOwner)&&!/(?:可能|也许|不确定|不是|不属于|不归)/u.test(figureOwner[0]))return {code:'unestablished_material_claim',quote:figureOwner[0],dependency:'Kai organized the legacy table; Figure 2 original ownership/credit and its copier are not established.'};
   const count=/(?:缺失|缺少|漏掉|缺的|缺了|少了).{0,4}\d+\s*(?:条|个|人)|\d+\s*(?:missing|lost|excluded)\s*(?:records?|participants?|people|rows?)/iu.exec(clause);
   if(count&&!/(?:不能|无法|不应|不该|未确认|不确定|没有依据|未知|尚未|不能确认|not established|unknown|cannot|can.t|not confirmed)/iu.test(clause))return {code:'unestablished_material_claim',quote:clause.trim(),dependency:'No actual missing-record/participant count is supplied; arithmetic differences are not verified missing counts.'};
   const handover=/(?:交接|接手|移交)(?:时|的时候|当时|过程中).{0,15}(?:只有|仅有|只(?:剩|留|给|交)了?|没(?:有|留|给|交)|未(?:留|给|交)|没有留下)|(?:handover|handed over).{0,30}(?:only|nothing|no (?:records|criteria|documentation))/iu.exec(clause);
   if(handover&&!/(?:据|按照|根据).{0,12}(?:Kai|凯|所说|所述|自述)|(?:Kai|凯).{0,8}(?:说|提到|表示|称)|(?:不能确认|无法确认|未确认|尚不清楚|不确定|未知|不能断定|not established|unknown|cannot confirm|according to)/iu.test(clause))return {code:'unestablished_material_claim',quote:clause.trim(),dependency:'The complete legacy handover contents are not established; retain attribution/uncertainty rather than asserting an exhaustive inventory.'};
   const patterns=[/(?:图\s*2|旧(?:试点)?标签|试点标签).{0,12}(?:是|由).{0,8}(?:Kai|Lin|Emma|Jun|Zhao|我).{0,18}(?:搬|复制|拷贝)/iu,/(?:分析表|源文件|原始数据).{0,20}(?:还在|只在|留在|存放在|保存在).{0,12}(?:原组|旧组|原项目组|另一组|组里|原始成员手里|原项目成员手里|原成员手里)/u,/(?:简报|材料)(?:里|中)(?:的|提到的)(?:图注范围|图表需求(?:清单)?|完整表头|逐行数据)/u,/(?:analysis table|source files?|raw data).{0,30}(?:still (?:in|with)|stored (?:in|with)).{0,20}(?:old|original|other) (?:group|team)/iu,/(?:列名|字段|表头).{0,5}(?:还没|尚未|未)(?:定下来|确定|定下|设定)/u,/(?:哪些|哪几)(?:列|字段)(?:是|为).{0,8}(?:后来|自己).{0,6}(?:加|添加)|(?:后来|自己).{0,6}(?:加|添加)(?:的|过)(?:列|字段)|\bcolumns?\b.{0,20}\b(?:added|inserted) (?:later|by (?:him|me|Kai))\b/iu];
   for(const p of patterns){const m=p.exec(clause);if(!m)continue;
    const prefix=clause.slice(Math.max(0,m.index-35),m.index),suffix=clause.slice(m.index+m[0].length,m.index+m[0].length+25);
    if(/(?:可能|也许|尚未确认|未确认|不能确认|无法确认|不确定|不知道是否|假设|如果|cannot confirm|uncertain|hypothetically)/iu.test(prefix)||(p===patterns[0]&&/(?:可能|也许|尚未确认|未确认|不确定)/u.test(m[0]))||/(?:不准确|不成立|只是猜测|没有依据|not established|not accurate)/iu.test(suffix))continue;
    return {code:'unestablished_material_claim',quote:clause.trim(),dependency:m[0]};
   }
  }
  return null;
 }
 function incorrectLegacyOwner(text,speakerId,writeEvidence){
  const unsupportedWrite=unsupportedNpcWriteClaim(text,speakerId,writeEvidence);if(unsupportedWrite)return unsupportedWrite;
  if(typeof text!=='string'||!speakerId||speakerId==='sam')return null;
  const pattern=/我经手(?:过)?的?(?:是|只是|主要是)\s*(?:旧(?:初步)?表格|旧表|初步表格)(?:的)?(?:整理|汇总|编制)(?!说明|记录|文案|反馈|的文字|的措辞)|(?:初步(?:表格|表)|旧(?:表格|表)|(?:登记表和分析表|旧数据|旧文件)的口径).{0,12}(?:是|由)?我.{0,15}(?:整理|汇总|准备|编制)|我[^。！？?；;，,“”\n]{0,18}(?:整理|汇总|准备|编制)[^。！？?；;，,“”\n]{0,20}(?:初步(?:表格|表)|旧(?:表格|表))|我.{0,10}(?:按|根据).{0,8}(?:旧|原).{0,8}(?:文件|资料).{0,8}(?:整理|汇总).{0,8}(?:表格|初步表)|(?:legacy|preliminary) table.{0,25}\b(?:I|me)\b.{0,20}(?:assembl|organiz|prepar)|(?:legacy|preliminary) table.{0,25}(?:assembled|organi[sz]ed|prepared)\s+by\s+me|\bI\b.{0,12}(?:assembled|organi[sz]ed|prepared).{0,15}(?:legacy|preliminary) table/giu;
  for(const m of text.matchAll(pattern)){
   if(qualifiedClaim(text,m))continue;
   const before=text.slice(0,m.index),near=before.slice(-70),lead=near.replace(/[“”"'「」]/gu,'').trim();
   // Quotes can emphasize the current speaker's own claim. Exempt only an
   // explicitly attributed other-speaker statement, not arbitrary quote marks.
   if(/(?:Kai|凯|Jun|Emma|Zhao|玩家|你).{0,10}(?:说|原话|写|表示|said|says)[：:,，]?\s*$/iu.test(lead))continue;
   if(/我(?:可以|愿意|打算|计划|希望|会|要|想(?:先|帮))|\bI\s+(?:can|could|will|would|want to|plan to)\b/iu.test(m[0])||/(?:如果|假设|要是|if|suppose).{0,12}$/iu.test(lead))continue;
   if(/(?:不是|并非|不|not)\s*$/iu.test(lead)||/(?:不应|不能|不该|从未|未曾|没有|never|cannot|should not|did not|didn't).{0,12}(?:声称|说|claim|say)?\s*$/iu.test(lead)||/(?:不是|并非|并不|没有|从未|未曾|不应|never|not|didn't).{0,24}(?:我|由我|me|I|prepared|assembled|organized|整理|准备|汇总|编制)/iu.test(m[0]))continue;
   return {code:'unestablished_material_claim',quote:m[0],dependency:'The legacy preliminary table was organized by Kai (sam), not this speaker.'};
  }
  return null;
 }
 function unsupportedNpcWriteClaim(text,speakerId,writeEvidence){
  // Text alone cannot establish that a legitimate NPC write did not occur.
  // The caller must supply a COMPLETE, controller-owned ledger for this record,
  // not actor participation, model verdicts or statements claiming a write.
  if(typeof text!=='string'||!['mina','leo','sam','riley','nora'].includes(speakerId)||writeEvidence?.complete!==true||!writeEvidence.documentId||!Number.isInteger(writeEvidence.epoch)||!Array.isArray(writeEvidence.receipts))return null;
  const pattern=/我(?:实际|已经|这轮|本轮|只)?(?:改的是|修改的是|改了|修改了).{0,12}(?:负责人|责任人).{0,8}检查点.{0,5}(?:两|2)(?:栏|列)|我(?:实际|已经|这轮|本轮|只)?(?:改的是|修改的是|改了|修改了).{0,12}检查点.{0,8}(?:负责人|责任人).{0,5}(?:两|2)(?:栏|列)|\bI\s+(?:changed|edited|updated|modified)\s+(?:the\s+)?(?:owner|responsible person)\s+(?:and|&)\s+(?:the\s+)?checkpoint\s+(?:columns|fields)\b|\bI\s+(?:changed|edited|updated|modified)\s+(?:the\s+)?checkpoint\s+(?:and|&)\s+(?:the\s+)?(?:owner|responsible person)\s+(?:columns|fields)\b/giu;
  for(const m of text.matchAll(pattern)){
   if(qualifiedClaim(text,m))continue;
   const fields=new Set(writeEvidence.receipts.filter(r=>r?.kind==='write'&&r.status==='committed'&&r.writerId===speakerId&&r.documentId===writeEvidence.documentId&&r.sessionEpoch===writeEvidence.epoch&&typeof r.sourceEventId==='string'&&r.sourceEventId.trim()).flatMap(r=>Array.isArray(r.writtenFields)?r.writtenFields:[]));
   if(!fields.has('owner')||!fields.has('checkpoint'))return {code:'unestablished_material_claim',quote:m[0],dependency:'No actual committed write by this NPC establishes both owner/checkpoint columns in this record.'};
  }
  return null;
 }
 function navigationClaim(text,catalog=[]){
  if(typeof text!=='string')return null;
  for(const clause of text.split(/[。！？!?；;\n]/u)){
   if(/(?:打开|去|在|位于|open|in).{0,8}(?:B\s*盘|[BCD]\s*drive)|(?:B\s*盘|[BCD]\s*drive).{0,10}(?:里|中|打开|文件)/iu.test(clause)&&!/(?:没有|不存在|不是|并非|不用|not a|no such)/iu.test(clause))return {code:'unestablished_material_claim',quote:clause,dependency:'B is the keyboard shortcut for the shared computer, not a disk/drive.'};
   if(/(?:文件夹|\bfolder\b)/iu.test(clause)&&/(?:打开|去|在|位于|存放|保存|放在|交接|open|in|under|stored|located)/iu.test(clause)&&!/(?:没有|不存在|不在|不是|不需要|无需|不用|不要|no (?:such )?folder|not (?:in|a)|there (?:is|are) no)/iu.test(clause))return {code:'unestablished_material_claim',quote:clause,dependency:'The shared computer has tabs and source cards, not an authored folder hierarchy.'};
   for(const d of catalog){const identities=[d.title,d.fileName,...d.aliases||[]].filter(Boolean);if(!identities.some(s=>clause.includes(s)))continue;
    const headings=d.headings||[];
    const section=/(?:里的?|中的?|文件中|file.{0,8})(?:[“"「]([^”"」]{1,45})[”"」])(?:\s*(?:那|这|的|部分|节|段|section|part))?/iu.exec(clause);
    if(section&&!headings.includes(section[1])&&!identities.includes(section[1])&&!/(?:没有|不存在|不叫|不准确|not (?:a |the )?section)/iu.test(clause))return {code:'unestablished_material_claim',quote:clause,dependency:'The quoted section heading is not in this actual source document.'};
   }
  }return null;
 }
 const api=Object.freeze({VERSION:'lab-public-work-evidence-v1',ANSWERABILITY_VERSION:'lab-question-answerability-v8-bound-conditions-persona',project,unavailableQuestion,unsupportedGradePrerequisite,unsupportedMaterialClaim,incorrectLegacyOwner,unsupportedNpcWriteClaim,navigationClaim});
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 root.LabMaterialEvidenceCore=api;
})(typeof window!=='undefined'?window:globalThis);
