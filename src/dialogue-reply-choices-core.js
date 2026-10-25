// Player-side reply affordances, extracted from explicit delivered alternatives.
// Not NPC speech, inferred knowledge, authored task effects or a judge metric.
(function(root){
 'use strict';
 const CN_ACTION=/^(?:继续|再|暂时|直接)?(?:听|看|了解|知道|聊|讨论|确认|弄清|弄明白|问|查看|核对|阅读|谈|比较|说|整理|从|选|去|帮|接|做|介绍|检查|处理|参与|复盘|写|回|找|见|休息|等)/u;
 const CN_INHERIT=/^(?:弄清楚|弄明白|弄清|听明白|听清楚|了解|知道|听听|听|看看|看|讨论|聊聊|聊|确认|核对|阅读|参与|复盘|整理|查看)/u;
 const EN_INHERIT=/^(?:hear about|learn about|look at|ask about|talk about|discuss|understand|review|see|read|clarify)\b/i;
 function splitAlternatives(body,language){
  const token=language==='zh'?'还是':null,at=language==='zh'?body.indexOf(token):body.search(/\s+or\s+/i);
  if(at<0)return null;
  const before=body.slice(0,at),separators=[...before.matchAll(/(?:——|—|：|:)\s*/gu)],delimiter=separators.at(-1);
  // A question can state a shared predicate before noun alternatives:
  // “了解哪一块——实验流程，还是卡住的环节？” or
  // “弄清楚的是项目内容，还是自己会被安排做什么？”
  const informationVerb=language==='zh'?CN_INHERIT.exec(before)?.[0]:'',focus=informationVerb?before.slice(informationVerb.length).match(/^(?:一下)?的是\s*/u):null;
  // Only a focus marker immediately after a known shared information verb is
  // structural. “看标题写的是…的简报” contains a noun modifier, not a new list.
  const shared=delimiter?before.slice(0,delimiter.index).trim():focus?informationVerb:'',tail=delimiter?body.slice(delimiter.index+delimiter[0].length):focus?body.slice(informationVerb.length+focus[0].length):body;
  const parts=language==='zh'?tail.split(/[，,]?\s*还是(?:想|希望|打算|准备|要)?(?:先)?/u):tail.split(/\s*,?\s+or\s+(?:would\s+you\s+like\s+to\s+)?/i);
  return {parts,shared};
 }
 function project(text,language='zh'){
  const source=typeof text==='string'?text.trim():'';
  if(!source||source.length>2000)return [];
  const pattern=language==='zh'
   ? /你(?:现在|目前|此刻)?(?:(?:是|最先|更|最|比较)?(?:想|希望|打算|准备|要|愿意)(?:先)?|(?:先)?(?:说一句|说一下|选一下|选|告诉我)[：:,，]?\s*(?:是)?(?:想|希望|要)(?:先)?)([^。！？?；;\n]{1,500})/gu
   : /(?:would|do)\s+you\s+(?:like\s+to|want\s+to|prefer\s+to|rather)\s+([^.!?\n]{1,650})/gi;
  const candidate=[...source.matchAll(pattern)].filter(m=>{const before=source.slice(0,m.index);return ['"','“”','「」'].every(chars=>[...before].filter(c=>chars.includes(c)).length%2===0);}).map(m=>splitAlternatives(m[1],language)).filter(Boolean).at(-1);
  if(!candidate||candidate.parts.length<2||candidate.parts.length>3)return [];
  const clean=raw=>raw.trim().replace(/^[，,\s]+|[，,\s]+$/gu,'').split(/(?:——|—|[，,])/u)[0].trim();
  const parts=candidate.parts.map(clean),shared=candidate.shared.replace(/(?:\s+first)$/i,'');
  const inherited=(language==='zh'?CN_INHERIT:EN_INHERIT).exec(shared||parts[0])?.[0]||'';
  const npcActs=language==='zh'&&parts[0].startsWith('让我');
  const rows=parts.map(quote=>{
   if(!quote||quote.length>(language==='zh'?70:140)||!source.includes(quote))return null;
   let phrase=language==='zh'?quote.replace(/^(?:想|希望|打算|准备|要)?先/u,''):quote.replace(/^to\s+/i,'');
   let utterance;
   if(language==='zh'){
    if(phrase.startsWith('让我'))utterance=`我想请你先${phrase.slice(2).replace(/带你/g,'带我').replace(/给你/g,'给我')}。`;
    else if(npcActs&&/^(?:带你|给你)/u.test(phrase))utterance=`我想请你先${phrase.replace(/^带你/u,'带我').replace(/^给你/u,'给我')}。`;
    else {if(!CN_ACTION.test(phrase)){if(!inherited)return null;phrase=inherited+phrase;}utterance=/^(?:继续|暂时|直接|再)/u.test(phrase)?`我想${phrase}。`:`我想先${phrase}。`;}
   }else{
    // Only inherit when the question supplies a shared verb before its list,
    // or the right-hand branch is a noun paired with a known information verb.
    if(inherited&&(candidate.shared||!/^(?:hear|learn|look|ask|talk|discuss|understand|review|see|read|clarify|explain|check|go|start|write|choose)\b/i.test(phrase)))phrase=inherited+' '+phrase;
    utterance=`I'd like to ${phrase.charAt(0).toLowerCase()+phrase.slice(1)} first.`;
   }
   return {label:utterance,utterance,sourceQuote:quote};
  });
  return rows.every(Boolean)&&new Set(rows.map(r=>r.label)).size===rows.length?rows:[];
 }
 const api=Object.freeze({VERSION:'npc-branch-replies-v3-focus',project});
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 root.DialogueReplyChoicesCore=api;
})(typeof window!=='undefined'?window:globalThis);
