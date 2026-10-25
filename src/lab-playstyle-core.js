// Deterministic post-game entertainment projection. Never a research score or real personality assessment.
(function(root){
  'use strict';
  const STAGES=['stage_1_entry','stage_2_first_failure','stage_3_revision_conflict','stage_4_credit'];
  const TYPES={
    OJBK:{name:'无所谓人',line:'你们先决定，我先喝口水。',description:'本局多次把方向或归属的决定留给别人。这里描述的是选择方式，不是你真实的在意程度。',hint:'不想争也可以；重要范围仍值得说清楚。',color:'#547a5c',sheet:'first-family.png',box:[30,145,685,432]},
    NOPE:{name:'反锅人',line:'稿可以改，锅不能顺手归我。',description:'你更常在合作前说明自己的范围，或区分旧项目问题与本轮责任。',hint:'边界说清之后，也给出一个能落地的下一步。',color:'#2e5c80',sheet:'first-family.png',box:[729,145,690,432]},
    'ALL-IN':{name:'全包人',line:'先答应下来，明天的我会想办法。',description:'本局出现了不止一次全面承接任务或责任的选择。热心是特点，不等于承诺都已完成。',hint:'先划清能做的部分，不必靠包揽来证明价值。',color:'#a96912',sheet:'first-family.png',box:[30,590,685,432]},
    DDL:{name:'压线人',line:'给截止时间一点参与感。',description:'你在交付期限的最后一个游戏工作日完成交付。这个称号只描述时机，不推断拖延动机。',hint:'最后一天不等于不认真，交付时间与作品质量分开看。',color:'#b6533f',sheet:'first-family.png',box:[729,590,690,432]},
    PROOF:{name:'留痕人',line:'你说你说，我记下了。',description:'你更常先澄清依据，再把问题、职责或贡献放进可核对的记录里。',hint:'留痕不是把所有核查都接下来；必要证据仍需原成员补齐。',color:'#6d5b92',sheet:'second-family.png',box:[27,129,489,411]},
    CTRL:{name:'安排人',line:'你们继续聊，我先把负责人那列填上。',description:'你更常要求明确负责人、检查点或透明的贡献分配方式。',hint:'提出分工不等于大家已经同意；下一步还要实际确认。',color:'#36797a',sheet:'second-family.png',box:[528,129,484,411]},
    PEACE:{name:'和事人',line:'问题可以再研究，大家先别急眼。',description:'你的部分核心选择更侧重降低冲突或让讨论能继续。',hint:'缓和语气很有用，但没有因此自动解决材料与责任问题。',color:'#417397',sheet:'second-family.png',box:[1024,129,489,411]},
    SIGN:{name:'留名人',line:'论文可以没发，我做过的不能没了。',description:'你在贡献环节明确提出记录自己的实际工作或透明划分贡献。这里只说主张，不默认已获得署名。',hint:'讲清做过什么，也保留原项目成员应有的贡献。',color:'#b45240',sheet:'second-family.png',box:[27,550,489,429]},
    WAIT:{name:'再想想人',line:'手还没动，脑内组会已经开了三轮。',description:'本局有多次先观察、询问期待或暂缓确定方向的核心选择。没有用等待时长推断你的思考。',hint:'想清楚没问题；明确一个可开始的小步骤会更轻松。',color:'#527952',sheet:'second-family.png',box:[528,550,484,429]},
    MIX:{name:'混合路数人',line:'这局打法有点混搭，暂时不硬凑一种。',description:'目前没有足够清晰、跨情境重复的核心选择线索来对应一个称号。不把未知硬判成一种人格。',hint:'有些情境需要不同做法，本来就不必始终走同一路数。',color:'#92701e',sheet:'second-family.png',box:[1024,550,489,429]}
  };
  // Entertainment mapping, not validated psychometrics or a ranking of players.
  const RULES=[
    {entry_context_needs:{PROOF:1},entry_overpromise:{'ALL-IN':2},entry_perfunctory:{OJBK:1,WAIT:1},entry_fair_start:{NOPE:1,PEACE:1}},
    {task_risk_verification:{PROOF:2},task_avoid_critique:{OJBK:1,PEACE:1},task_blame_kai:{},task_dependency:{WAIT:1}},
    {revision_legacy_current:{NOPE:2,PROOF:1},revision_self_blame:{'ALL-IN':2},revision_public_challenge:{NOPE:1},revision_visible_owners:{CTRL:2,PROOF:1}},
    {credit_evidence_acknowledge:{SIGN:2,PROOF:1},credit_defer:{OJBK:1,PEACE:1},credit_overclaim:{},credit_transparent_split:{SIGN:2,CTRL:1,PEACE:1}}
  ];
  const LABELS={entry_context_needs:'先澄清实验室最需要什么，再承接有边界的起点任务',entry_overpromise:'承诺可以承接任何紧急任务',entry_perfunctory:'先观察，等待别人分配任务',entry_fair_start:'承认情境尴尬，并请求清楚公平的起点',task_risk_verification:'指出简报的主要风险，提出一个小的核查步骤',task_avoid_critique:'表示简报没问题，避免批评既有工作',task_blame_kai:'把问题归到 Kai 之前的假设',task_dependency:'询问 Kai 实验室期待怎样的答案',revision_legacy_current:'区分遗留问题与当前责任，并提出修改记录',revision_self_blame:'承担全部责任，让小组继续往前',revision_public_challenge:'公开质疑导师安排的不公平',revision_visible_owners:'要求每项修改有可见的负责人和下一次检查',credit_evidence_acknowledge:'用证据说明实际贡献，同时承认原有工作',credit_defer:'把贡献归属交给资深成员决定',credit_overclaim:'主张自己解决危机、应获得主要贡献',credit_transparent_split:'请求透明划分贡献，并进行简短反馈'};
  const FREE_RULES={evidence_clarification:{PROOF:1},bounded_collaboration:{NOPE:1},passive_avoidance:{OJBK:1,WAIT:1},overcommitment:{'ALL-IN':2},responsibility_visibility:{CTRL:2,PROOF:1},credit_self_erasure:{PEACE:1},transparent_credit:{SIGN:2,PROOF:1}};
  const FREE_LABELS={evidence_clarification:'在公共核心发言中澄清证据或提出有边界的核查问题',bounded_collaboration:'提出范围明确的协作',passive_avoidance:'在核心选择中暂缓确定方向或交由别人安排',overcommitment:'在核心选择中承接超出可确认范围的责任',responsibility_visibility:'要求让责任、证据或检查点明确可见',credit_self_erasure:'在贡献讨论中让出自己的贡献主张以避免冲突',transparent_credit:'主张按实际证据记录贡献，同时承认他人工作'};
  const ORDER=['CTRL','NOPE','ALL-IN','SIGN','PROOF','PEACE','OJBK','WAIT'];
  function freeze(x){if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;}
  function match(recap,{research=false,presentationOnly=false,freeActions=[]}={}){
    // Explicit paired-study presentation uses the same source-only matching.
    // This opt-in has no write access to outcomes, appraisal or study scores.
    if(research&&presentationOnly!==true)return null;
    if(!recap||!['success','partial_outcome','unhealthy_failure'].includes(recap.ending)||!Array.isArray(recap.stages)||recap.stages.length!==4||recap.stages.some((r,i)=>r.stageId!==STAGES[i]||r.completed!==true||(i>0&&r.anchorPresented!==true)||!Array.isArray(r.sourceEventIds)||!r.sourceEventIds.length||r.sourceEventIds.some(id=>typeof id!=='string'||!id)))return {available:false,reason:'尚未形成完整的、来源可追溯的结局记录，暂不发称号。'};
    const evidence=recap.stages.flatMap((r,i)=>{
      if(Object.prototype.hasOwnProperty.call(RULES[i],r.optionId))return [{stage:i+1,optionId:r.optionId,label:LABELS[r.optionId],sourceId:r.sourceEventIds[0],signals:RULES[i][r.optionId]}];
      // Unknown nonempty option IDs are not silently treated as free choices.
      if(r.optionId!=='')return [];
      const a=freeActions.find(x=>x.stageId===r.stageId&&x.sourceId===r.sourceEventIds[0]&&typeof x.confidence==='number'&&Number.isFinite(x.confidence)&&x.confidence>=.7&&x.confidence<=1&&Object.hasOwn(FREE_RULES,x.actionCode));
      return a?[{stage:i+1,optionId:'validated_free_action',actionCode:a.actionCode,label:FREE_LABELS[a.actionCode],sourceId:r.sourceEventIds[0],signals:FREE_RULES[a.actionCode]}]:[];
    });
    const contribution=recap.stages[3],claim=evidence.find(e=>Object.hasOwn(e.signals,'SIGN'));
    if(claim&&['accepted','needs_revision','rejected'].includes(contribution.taskStatus)&&contribution.sourceEventIds.length>=2&&contribution.sourceEventIds[1]!==claim.sourceId)evidence.push({stage:4,optionId:'recorded_contribution',label:'实际提交了贡献说明；不据此默认署名已经获准',sourceId:contribution.sourceEventIds[1],signals:{SIGN:1}});
    const candidates=ORDER.map((code,index)=>{const support=evidence.filter(e=>Object.hasOwn(e.signals,code));return {code,support,value:support.reduce((n,e)=>n+e.signals[code],0),priority:index};}).filter(c=>c.support.length>=(c.code==='OJBK'?3:2)).sort((a,b)=>b.value-a.value||b.support.length-a.support.length||a.priority-b.priority);
    let code=candidates[0]?.code||'MIX';
    const d=recap.delivery,validTime=d&&Number.isInteger(d.day)&&d.day>=1&&typeof d.onTime==='boolean'&&d.onTime===(d.day<=7);
    if(validTime&&d.day===7&&d.onTime)code='DDL';
    const selected=candidates.find(c=>c.code===code);
    const support=(code==='SIGN'?evidence.filter(e=>e.signals.SIGN):selected?.support||[]).map(({stage,label,sourceId,actionCode})=>({stage,label,sourceId,...(actionCode?{actionCode}:{})}));
    const other=candidates.find(c=>c.code!==code);
    // Only mention a credit-claim secondary as one recorded moment, not a
    // stable disposition. Blame/overclaim never become proof of fair boundaries.
    const credit=evidence.find(e=>e.optionId==='credit_evidence_acknowledge'||e.optionId==='credit_transparent_split'||e.actionCode==='transparent_credit');
    return {available:true,code,type:TYPES[code],secondary:other?{code:other.code,name:TYPES[other.code].name}:null,evidence:support,timing:validTime?{day:d.day,label:d.onTime?(d.day===7?'截止日交付':'按时交付'):'逾期交付'}:null,creditMoment:credit?{label:credit.label,sourceId:credit.sourceId}:null,knownCoreChoices:evidence.filter(e=>e.optionId!=='recorded_contribution').length,note:'只对应本局记录，娱乐称号不是真实人格测试。'};
  }
  const api=freeze({VERSION:'lab-playstyle-v2-paired-presentation',TYPES,STAGES,match});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.LabPlaystyleCore=api;
})(typeof window!=='undefined'?window:globalThis);
