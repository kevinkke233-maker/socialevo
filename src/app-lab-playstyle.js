// Post-game entertainment only. Never enters NPC state, scoring, judge inputs,
// terminal exports or the paid illustration request.
const LAB_PLAYSTYLE_PRESENTATION_VERSION='lab-playstyle-ui-v1';
const LAB_PLAYSTYLE_EN={
 OJBK:{name:'Whatever Works',line:'You decide. I will grab some water.',description:'This run repeatedly left direction or attribution decisions to others. That describes recorded choices, not how much you really care.',hint:'It is fine not to compete. Important boundaries still deserve a clear sentence.'},
 NOPE:{name:'Blame Umbrella',line:'Happy to revise. Not to inherit the blame.',description:'You more often clarified your scope or separated legacy problems from current responsibility.',hint:'After stating a boundary, offer one workable next step.'},
 'ALL-IN':{name:'All-In Helper',line:'Say yes now. Tomorrow-me will figure it out.',description:'More than one choice accepted broad tasks or responsibility. Enthusiasm does not mean every promise was fulfilled.',hint:'Define the part you can actually do. You do not have to carry everything to earn a place.'},
 DDL:{name:'Deadline Rider',line:'Let the deadline join the conversation.',description:'You delivered on the final fictional workday before the deadline. This describes timing, not a motive to procrastinate.',hint:'Last-day delivery is not proof of careless work. Timing and quality are separate.'},
 PROOF:{name:'Evidence Keeper',line:'Keep talking. I am writing this down.',description:'You more often clarified evidence and made questions, responsibility or contributions checkable in a record.',hint:'Documenting limits does not make every verification your job. Missing source evidence still needs its original owners.'},
 CTRL:{name:'Task Coordinator',line:'Keep discussing. I will fill the owner column.',description:'You more often requested visible owners, checkpoints or a transparent contribution split.',hint:'Proposing a division is not agreement. The next step still needs actual confirmation.'},
 PEACE:{name:'Peace Maker',line:'We can study the problem. First, less shouting.',description:'Some core choices prioritized reducing conflict or keeping the discussion moving.',hint:'A calmer tone helps, but it does not automatically fix evidence or responsibility.'},
 SIGN:{name:'Credit Keeper',line:'The paper may wait. My work should not vanish.',description:'You asked to record your actual contribution or make the split transparent. A request is not granted authorship.',hint:'Name what you actually did and preserve the original team’s contribution too.'},
 WAIT:{name:'Wait-and-Ask',line:'Three imaginary meetings before the first move.',description:'More than one core choice observed, asked what was expected or deferred deciding. No waiting duration was used to infer thought.',hint:'Thinking first is fine. Choose one small step that can actually start.'},
 MIX:{name:'Mixed Approach',line:'One run, several routes. No forced label.',description:'The recorded core choices do not provide enough clear repeated signals for one title. Unknown is not filled with a guess.',hint:'Different situations can deserve different approaches.'}
};
function labPlaystyleText(code){code=Object.hasOwn(LabPlaystyleCore.TYPES,code)?code:'MIX';const t=LabPlaystyleCore.TYPES[code];return state.language==='zh'?t:{...t,...LAB_PLAYSTYLE_EN[code||'MIX']};}
function labPlaystyleAssetUrl(code){const t=LabPlaystyleCore.TYPES[code]||LabPlaystyleCore.TYPES.MIX;return `./assets/playstyles/v1/${t.sheet}?v=${encodeURIComponent(BUILD_VERSION)}`;}
function labPlaystyleSvg(code){
 const t=LabPlaystyleCore.TYPES[code]||LabPlaystyleCore.TYPES.MIX,localized=labPlaystyleText(code),b=t.box,w=t.sheet==='first-family.png'?1448:1536,h=t.sheet==='first-family.png'?1086:1024;
 return `<svg class="lab-playstyle-svg" viewBox="${b.join(' ')}" role="img" aria-label="${escapeHtml(localized.name+' · '+localized.line)}" xmlns="http://www.w3.org/2000/svg"><image href="${labPlaystyleAssetUrl(code)}" width="${w}" height="${h}"/></svg>`;
}
function labPlaystyleFreeActions(facts){
 // Deliberately do not pass raw words, private activity, NPC appraisals, model
 // style, condition labels, grades or wall/API waiting to the title matcher.
 return facts.stages.flatMap(r=>{
  if(r.optionId!=='')return [];
  const e=state.eventLedger.find(x=>x.eventId===r.sourceEventIds[0]&&x.sessionEpoch===state.sessionEpoch&&x.status==='committed'&&x.type==='key_decision'&&x.audience?.visibility==='group'&&x.metadata?.stageId===r.stageId),a=e?.metadata?.actionClassification;
  return a?[{stageId:r.stageId,sourceId:e.eventId,actionCode:a.actionCode,confidence:a.confidence}]:[];
 });
}
function labPlaystyleEvidenceLabel(e,facts){
 if(state.language==='zh')return e.label;
 const row=facts.stages[e.stage-1];
 if(e.sourceId===row?.sourceEventIds[1])return 'Actually submitted a contribution statement; granted authorship is not assumed.';
 const w=getDecisionWindows().find(x=>x.stageId===row?.stageId),index=w?.optionMeta?.findIndex(x=>x.id===row?.optionId)??-1;
 if(index>=0)return w.options[index];
 return {PROOF:'Clarified evidence or a bounded verification question in a public core response.',NOPE:'Proposed bounded collaboration or clarified responsibility.',WAIT:'Deferred or asked what was expected in a core response.',CTRL:'Requested visible responsibility, evidence or checkpoints.',SIGN:'Asked for evidence-based contribution recording.',PEACE:'Prioritized keeping the discussion moving.','ALL-IN':'Accepted broad responsibility in a core response.'}[e.code]||({evidence_clarification:'Clarified evidence or a bounded verification question.',bounded_collaboration:'Proposed collaboration with an explicit scope.',passive_avoidance:'Deferred deciding or left the direction to others.',overcommitment:'Accepted broader responsibility than the current scope supports.',responsibility_visibility:'Requested visible responsibility, evidence or checkpoints.',credit_self_erasure:'Yielded a contribution claim to avoid conflict.',transparent_credit:'Requested evidence-based contribution recording while acknowledging others.'}[e.actionCode]||'A validated public action was recorded in this core response.');
}
function labPlaystylePanelMarkup(owner){
 const zh=state.language==='zh',r=owner.playstyle;
 if(!r?.available)return `<article class="lab-title-panel lab-title-unavailable"><h4>${zh?'本局称号':'This run’s title'}</h4><p>${zh?'这局尚未形成完整、可追溯的结局记录，因此暂不发称号。':'No complete source-linked ending is available. No title is assigned.'}</p><small>${zh?'实际记录仍保留，不虚构后续选择。':'The actual records are retained; later choices are not invented.'}</small></article>`;
 const t=labPlaystyleText(r.code),other=r.secondary?labPlaystyleText(r.secondary.code):null;
 return `<article class="lab-title-panel"><div class="lab-ending-card-heading"><span>${zh?'你的本局称号':'Your title for this run'}</span><span class="lab-ending-label">${zh?'玩法回顾':'Playstyle recap'}</span></div><div id="lab-playstyle-art" class="lab-playstyle-art" data-playstyle-code="${r.code}">${labPlaystyleSvg(r.code)}</div><div class="lab-title-body">${!zh?`<h4 class="lab-playstyle-en-name">${escapeHtml(t.name)} · ${r.code}</h4><p class="lab-playstyle-en-line">${escapeHtml(t.line)}</p>`:''}<p class="lab-playstyle-secondary">${other?escapeHtml(zh?`另一条有记录的玩法线索：${other.name} · 不必只走一种路数`:`Another recorded tendency: ${other.name}. A run need not follow just one approach.`):(zh?'每一局都可以有不同的路数。':'Each run can take a different route.')}</p><p class="lab-playstyle-description">${escapeHtml(t.description)}</p><div class="lab-playstyle-hint"><span>${zh?'下一次，也可以试试':'Something to try next time'}</span><p>${escapeHtml(t.hint)}</p></div><button type="button" id="lab-playstyle-download" class="primary-btn full-width">${zh?'下载我的称号卡 ↓':'Download my title card ↓'}</button><button type="button" id="lab-playstyle-gallery-button" class="secondary-btn full-width">${zh?'查看称号图鉴':'Explore the title gallery'}</button><small class="lab-playstyle-disclaimer">${zh?'只对应本局记录 · 娱乐称号不是真实人格测试':'This run only · Entertainment, not a real personality test'}</small></div></article>`;
}
function labPlaystyleWhyMarkup(owner){
 const r=owner.playstyle,zh=state.language==='zh';if(!r?.available)return '';
 const body=r.evidence.length?r.evidence.slice(0,4).map(e=>`<article class="lab-playstyle-evidence"><small>${zh?`阶段 ${e.stage} · 实际记录`:`Stage ${e.stage} · Recorded action`}</small><p>${escapeHtml(labPlaystyleEvidenceLabel(e,owner.facts))}</p></article>`).join(''):`<article class="lab-playstyle-evidence"><small>${zh?'不硬贴标签':'No forced label'}</small><p>${r.code==='DDL'?(zh?'实际交付发生在截止期限的最后一个游戏工作日。':'The actual delivery occurred on the final deadline workday.'):(zh?'重复且明确的线索不足；不会拿隐藏分数或等待时间来补。':'Clear repeated signals are insufficient; hidden scores or waiting time are not used to fill the gap.')}</p></article>`;
 return `<section class="lab-playstyle-why"><h4>${zh?'为什么更像这个路数？':'Why this approach?'}</h4><p class="lab-ending-muted">${zh?'来自已提交的实际核心选择，不看 NPC 隐藏分数。':'Based on actual committed core actions, not hidden NPC scores.'}</p><div class="lab-playstyle-evidence-list">${body}</div></section>`;
}
function initializeLabPlaystylePanel(owner){
 if(!owner.playstyle?.available)return;
 labRecapOwnerElement(owner,'lab-playstyle-download').onclick=()=>downloadLabPlaystyleCard(owner);
 labRecapOwnerElement(owner,'lab-playstyle-gallery-button').onclick=()=>openLabPlaystyleGallery(owner);
}
function closeLabPlaystyleGallery(){const dialog=document.getElementById('lab-playstyle-gallery');if(dialog?.open)dialog.close();dialog?.remove();}
function openLabPlaystyleGallery(owner){
 if(!labRecapOwnerCurrent(owner)||!owner.playstyle?.available)return;
 closeLabPlaystyleGallery();const zh=state.language==='zh',dialog=document.createElement('dialog');dialog.id='lab-playstyle-gallery';dialog.className='lab-playstyle-gallery';dialog.setAttribute('aria-labelledby','lab-playstyle-gallery-heading');
 dialog.innerHTML=`<header><div><h3 id="lab-playstyle-gallery-heading">${zh?'实验室生存图鉴':'The lab playstyle gallery'}</h3><p>${zh?'这是称号样例，不是全部给同一位玩家贴标签。':'These are sample titles, not labels all assigned to one player.'}</p></div><button type="button" id="lab-playstyle-gallery-close">${zh?'关闭 ×':'Close ×'}</button></header><div class="lab-playstyle-gallery-grid">${Object.keys(LabPlaystyleCore.TYPES).map(code=>{const t=labPlaystyleText(code);return `<article>${labPlaystyleSvg(code)}${!zh?`<h4>${escapeHtml(t.name)} · ${code}</h4><p>${escapeHtml(t.line)}</p>`:''}<p>${escapeHtml(t.description)}</p></article>`;}).join('')}</div><p class="lab-playstyle-disclaimer">${zh?'图中的纸张和道具是漫画夸张，不是实际工作量或心理状态的证据。':'Paper and props are comic metaphors, not evidence of real workload or mental state.'}</p>`;
 owner.panelRoot.append(dialog);document.getElementById('lab-playstyle-gallery-close').onclick=()=>dialog.close();
 dialog.addEventListener('click',e=>{if(e.target===dialog){const b=dialog.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)dialog.close();}});dialog.showModal();
}
async function downloadLabPlaystyleCard(owner){
 if(!labRecapOwnerCurrent(owner)||!owner.playstyle?.available)return;
 const button=labRecapOwnerElement(owner,'lab-playstyle-download');button.disabled=true;
 try{
  const code=owner.playstyle.code,t=labPlaystyleText(code),source=new Image();source.src=labPlaystyleAssetUrl(code);await source.decode();if(!labRecapOwnerCurrent(owner))return;
  const zh=owner.language==='zh',canvas=document.createElement('canvas');canvas.width=1000;const c=canvas.getContext('2d');
  const [x,y,w,h]=t.box,dw=880,dh=dw*h/w;
  const lines=(text,font)=>{c.font=font;const units=zh?[...text]:text.split(/(\s+)/),out=[];let line='';for(const unit of units){if(line&&c.measureText(line+unit).width>870){out.push(line.trim());line='';}line+=unit;}if(line)out.push(line.trim());return out;};
  const titleLines=zh?[]:lines(`${t.name} · ${code}`,'25px sans-serif'),description=lines(t.description,'25px sans-serif'),hint=lines((zh?'小提醒：':'Try next: ')+t.hint,'22px sans-serif');
  const bodyStart=137+dh,contentHeight=bodyStart+(titleLines.length+description.length+hint.length)*38+35;canvas.height=Math.max(1260,Math.ceil(contentHeight+155));
  c.fillStyle='#f7f4eb';c.fillRect(0,0,canvas.width,canvas.height);c.fillStyle='#294b43';c.font='26px sans-serif';c.fillText(zh?'实验室 · 本局限定称号':'THE LAB · THIS RUN’S TITLE',60,70);c.drawImage(source,x,y,w,h,60,105,dw,dh);
  let yy=bodyStart;c.fillStyle='#445e55';c.font='25px sans-serif';for(const line of [...titleLines,...description]){c.fillText(line,60,yy);yy+=38;}yy+=15;c.font='22px sans-serif';for(const line of hint){c.fillText(line,60,yy);yy+=38;}
  const d=owner.playstyle.timing;c.font='20px sans-serif';c.fillStyle='#6b776a';c.fillText(d?(zh?`Day ${d.day} · ${d.label} · 作品状态和称号分开记录。`:`Day ${d.day} · ${owner.facts.delivery.onTime?'On-time':'Late'} delivery; timing and quality are separate.`):(zh?'未记录交付时机。':'No delivery timing recorded.'),60,canvas.height-70);c.font='18px sans-serif';c.fillText(zh?'仅为本局玩法回顾，不是真实人格测试或研究指标。':'This run only; not a real personality test or research measure.',60,canvas.height-30);
  if(!labRecapOwnerCurrent(owner))return;const a=document.createElement('a');a.href=canvas.toDataURL('image/png');a.download=owner.hub?`lab-game-${owner.gameLabel}-playstyle-${code}.png`:`lab-playstyle-${code}.png`;a.click();
 }catch(_){if(labRecapOwnerCurrent(owner))labRecapOwnerElement(owner,'lab-recap-status').textContent=state.language==='zh'?'称号卡未能导出，请稍后重试。':'Title card export failed; please retry.';}
 finally{if(labRecapOwnerCurrent(owner))button.disabled=false;}
}
