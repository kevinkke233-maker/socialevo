// Post-game presentation only. The terminal facts/score/exports are immutable.
let labRecapRuntime = null;
let labRecapAnonymousSession = null;
let labRecapPairedRuntime = null;
function labRecapOwnerElement(owner, id) { return owner.panelRoot?.querySelector(`[data-lab-recap-ref="${id}"]`) || owner.panelRoot?.querySelector(`#${id}`); }
function labRecapPairedPresentationEnabled() {
  return Boolean(state.researchProfile?.active && state.researchProfile?.pairId && typeof studyPairRequested === "function" && studyPairRequested() && typeof studyPairRuntime !== "undefined" && studyPairRuntime.pair?.pairId === state.researchProfile.pairId);
}
function resetLabRecapPairedRuntime() {
  labRecapPairedRuntime?.controller?.abort();labRecapPairedRuntime = null;
  if(typeof closeLabPlaystyleGallery==='function')closeLabPlaystyleGallery();
  const node=document.getElementById("study-pair-keepsake-panel");if(node)node.replaceChildren();
}
function resetLabRecapRuntime() {
  labRecapRuntime?.controller?.abort(); labRecapRuntime = null;
  if(typeof closeLabPlaystyleGallery==='function')closeLabPlaystyleGallery();
  document.getElementById('summary-screen')?.classList.remove('lab-playstyle-summary');
  const node = document.getElementById('lab-recap'); if (node) { node.replaceChildren(); node.hidden = true; }
}
function captureLabRecapFacts() {
  return LabRecapCore.project({epoch:state.sessionEpoch,events:state.eventLedger,
    completed:stagePacingState().completed,artifacts:state.submittedArtifacts,
    anchors:Object.fromEntries(Object.keys(LabNarrativeCore.ANCHORS).map(id => [id,labAnchorRecord(id)])),
    delivery:state.finalOutcome?.delivery || state.labCalendar?.delivery,outcome:state.finalOutcome,sessionId:state.sessionId});
}
function labRecapCaption(row, index) {
  const zh = state.language === 'zh';
  const titles = zh ? ['初到实验室','把审阅带给导师','回组讨论修改责任','核对贡献与交付'] : ['Arrival','Advisor review','Revision ownership','Credit and delivery'];
  const labels = zh ? {accepted:'已被接纳',needs_revision:'仍需修改',rejected:'未被接纳',not_submitted:'未提交'} : {accepted:'Accepted',needs_revision:'Needs revision',rejected:'Rejected',not_submitted:'Not submitted'};
  const window = getDecisionWindows().find(w => w.stageId === row.stageId);
  const option = window?.optionMeta?.findIndex(m => m.id === row.optionId) ?? -1;
  const choice = option >= 0 ? window.options[option] : row.completed ? (zh ? '使用自己的话作出选择。' : 'You chose in your own words.') : '';
  return {title:titles[index],text:!row.completed ? [(row.taskStatus!=='not_submitted'?(zh?`实际提交：${labels[row.taskStatus]}。`:`Actual submission: ${labels[row.taskStatus]}.`):''),row.anchorPresented?(zh?'相关项目交流已发生。':'The associated project discussion occurred.'):'',zh ? '本阶段未完成；不虚构后续情节。' : 'This stage was not completed; no later events are invented.'].filter(Boolean).join(' ')
    : [choice,index ? (zh ? `实际提交：${labels[row.taskStatus]}。` : `Actual submission: ${labels[row.taskStatus]}.`) : (zh ? '起步选择与实际回应已记录，不默认达成一致。' : 'The proposal and actual replies were recorded; agreement is not assumed.')].filter(Boolean).join(' ')};
}
function renderLabRecap() {
  let node = document.getElementById('lab-recap');
  if (!node) { node = document.createElement('section'); node.id = 'lab-recap'; node.className = 'panel lab-recap-panel'; const grid=document.querySelector('#summary-screen .summary-grid');grid?.insertBefore(node,grid.firstChild); }
  resetLabRecapRuntime();
  const paired=labRecapPairedPresentationEnabled();
  // Explicit presentation opt-in is shared by both assigned conditions. A brief
  // feedback click never claims that a formal questionnaire was completed.
  if ((state.researchProfile?.active && !paired) || !state.sessionId) return;
  const owner = {epoch:state.sessionEpoch,language:state.language,facts:captureLabRecapFacts(),controller:null,image:null,canvas:null,panelRoot:node,paired,gameLabel:paired?state.researchProfile.gameLabel:null}; labRecapRuntime = owner;
  owner.freeActions=labPlaystyleFreeActions(owner.facts);
  renderLabRecapPanel(owner);
  if(paired && typeof studyPairRecordRecapExposure==='function')studyPairRecordRecapExposure(owner);
}
function renderLabRecapKeepsake(gameLabel, game, pairId) {
  resetLabRecapPairedRuntime();
  const node=document.getElementById('study-pair-keepsake-panel');
  if(!node || !game?.recap || studyPairRuntime.pair?.status!=='completed' || studyPairRuntime.pair?.pairId!==pairId)return;
  const owner={language:state.language,facts:game.recap,freeActions:game.freeActions||[],controller:null,image:null,panelRoot:node,paired:true,hub:true,pairId,gameLabel,sourceHash:game.sourceHash};
  labRecapPairedRuntime=owner;renderLabRecapPanel(owner);
  const image=game.image;
  if(image && (image.gameLabel!==owner.gameLabel || image.sourceHash!==owner.sourceHash)) {
    labRecapOwnerElement(owner,'lab-recap-ai').disabled=true;
    labRecapOwnerElement(owner,'lab-recap-status').textContent=owner.language==='zh'?'已保存插画的来源与本局不一致，暂未显示。请联系研究者；文字回顾不受影响。':'The saved image does not match this game’s source. Contact the researcher; the factual recap is retained.';
    return;
  }
  if(image?.status==='ready'&&typeof image.imageDataUrl==='string')applyLabRecapImage(owner,image.imageDataUrl);
  else if(image?.status==='pending'&&typeof image.jobId==='string')void pollLabRecapPairedImage(owner,image.jobId);
  else if(image?.status==='unknown'||image?.status==='failed') {
    labRecapOwnerElement(owner,'lab-recap-ai').disabled=true;
    labRecapOwnerElement(owner,'lab-recap-status').textContent=state.language==='zh'?'上次绘制未完成或状态尚不能确认。请联系研究者；不会重新发起收费请求。':'The previous illustration failed or remains uncertain. Contact the researcher; another paid request will not start.';
  }
}
function renderLabRecapPanel(owner) {
  const node=owner.panelRoot, zh = owner.language === 'zh'; node.hidden = false;
  owner.playstyle=LabPlaystyleCore.match(owner.facts,{research:Boolean(state.researchProfile?.active)||owner.paired,presentationOnly:Boolean(owner.paired),freeActions:owner.freeActions});
  if(!owner.hub)document.getElementById('summary-screen').classList.add('lab-playstyle-summary');
  const d=owner.facts.delivery,outcomeLabel=zh?{success:'目标已充分达成',partial_outcome:'目标部分达成',unhealthy_failure:'未形成健康参与条件',incomplete:'未完成结局'}:{success:'Goal sufficiently achieved',partial_outcome:'Partly achieved goals',unhealthy_failure:'Healthy participation not supported',incomplete:'Incomplete ending'};
  node.innerHTML = `<header class="lab-ending-intro"><div><p class="lab-ending-eyebrow">${zh?'这段经历，留下一个名字':'A story, and a name for this run'}</p><h3>${zh?'这局，你是什么路数？':'What approach did you take?'}</h3><p>${zh?'称号记住你的选择，插画留住这一段经历。不是现实人格测评，也不把游戏输赢变成人品评价。':'A title recalls your choices; an illustration keeps the story. Neither is a personality test or a moral judgment of the player.'}</p></div><div class="lab-ending-pills">${d?`<span class="lab-ending-pill ${d.onTime?'':'late'}">Day ${d.day} · ${zh?(d.onTime?'按时交付':'逾期交付'):(d.onTime?'On-time delivery':'Late delivery')}</span>`:''}<span class="lab-ending-pill neutral">${outcomeLabel[owner.facts.ending]||outcomeLabel.incomplete}</span><small>${zh?'交付时机、作品状态与娱乐称号分别呈现':'Delivery timing, work status and entertainment titles are separate'}</small></div></header><div class="lab-ending-layout">${labPlaystylePanelMarkup(owner)}<article class="lab-ending-illustration"><div class="lab-ending-card-heading"><span>${zh?'本局结局插画':'Illustration of this run'}</span><span class="lab-ending-label">${zh?'封面画风':'Cover style'}</span></div><div class="lab-recap-media"><div class="lab-recap-cover-wait" id="lab-recap-cover-wait"><strong>${zh?'这段经历，会留下怎样的画面？':'What picture does your story leave?'}</strong><span>${zh?'点击绘制：沿用封面画法，依据本局真实记录重新构图。不会默认画成大团圆，也不复用另一局的结局。':'Illustrate using the cover style, recomposed from this run. No automatic happy ending or reuse of another run’s scene.'}</span></div><img id="lab-recap-image" hidden alt="${zh?'本局个性化结局插画':'Personalized illustration of this run'}"></div><div class="lab-ending-art-body"><div class="lab-recap-actions"><button type="button" id="lab-recap-ai" class="secondary-btn">${zh?'绘制我的结局插画':'Illustrate my ending'}</button><button type="button" id="lab-recap-download" class="secondary-btn">${zh?'下载本局记录':'Download session record'}</button><button type="button" id="lab-recap-cancel" hidden>${zh?'停止等待':'Stop waiting'}</button></div><p id="lab-recap-status" role="status"></p><details id="lab-recap-disclosure"><summary>${zh?'绘制前的隐私与费用说明':'Privacy and cost before illustration'}</summary><p>${zh?'AI 绘制需要 OpenAI 图像权限，会发送阶段选择、公开行为类别与人物发言次数、提交状态、交付天数，以及已批准的封面美术参考并产生费用；不发送称号、私聊、自由输入、隐藏分数或身份信息。取消等待不保证上游停止计费。每局插画分别使用自己的记录。':'AI illustration requires OpenAI image access and incurs a charge. Only stage choices, public action categories and speaker counts, submission status and delivery day, with the approved cover reference are sent. No title, private dialogue, free text, hidden scores or identity is sent. Canceling waiting may not cancel the provider charge.'}</p></details><small class="lab-ending-muted">${zh?'插画仅作艺术表现，不证明新实验、团队共识或关系好坏。':'Art is not evidence of new experiments, team consensus or relationship quality.'}</small></div></article></div>${labPlaystyleWhyMarkup(owner)}<section class="lab-ending-records"><h4>${zh?'娱乐之外，事实留下来':'Beyond the keepsake: the factual record'}</h4><div id="lab-recap-cards" class="lab-recap-cards"></div><details class="lab-playstyle-method"><summary>${zh?'称号怎么来的？':'How is the title matched?'}</summary><p>${zh?'用同一套本地娱乐规则匹配已完成且有来源的核心选择。自由核心发言只在已有公开动作分类可信、来源一致时采用；否则保留未知。留名主张需要实际贡献说明记录，不默认署名获准。':'One shared local entertainment rule matches complete source-linked core choices. A free core response is used only with a trusted existing public-action category and matching source; otherwise it stays unknown. A credit claim needs an actual contribution record, not assumed authorship.'}</p><p>${zh?'压线只对应截止工作日的实际交付，逾期不等于压线。没有用 API 等待或 NPC 隐藏分数推断你的想法，也不修改研究评分或游戏结局。':'A deadline-day title uses actual fictional delivery; late is not deadline-day delivery. API waiting and hidden NPC scores do not infer thoughts. This changes neither research scores nor the game outcome.'}</p></details></section>`;
  // Each panel owns its nodes; completed A/B archives never borrow B's live state.
  for(const element of node.querySelectorAll('[id]')) {element.dataset.labRecapRef=element.id;if(owner.hub)element.id=`study-keepsake-${owner.gameLabel}-${element.id}`;}
  initializeLabPlaystylePanel(owner);
  for (const [i,row] of owner.facts.stages.entries()) {
    const c=labRecapCaption(row,i), card=document.createElement('article');card.className='lab-recap-card';
    card.innerHTML=`<h4>${i+1}. ${escapeHtml(c.title)}</h4><p>${escapeHtml(c.text)}</p>`;
    labRecapOwnerElement(owner,'lab-recap-cards').append(card);
  }
  if(d)labRecapOwnerElement(owner,'lab-recap-status').textContent=zh?`Day ${d.day} · ${d.onTime?'按时':'逾期'}交付。时间和质量分别记录。`:`Day ${d.day} · ${d.onTime?'On-time':'Late'} delivery. Timing and quality are separate.`;
  labRecapOwnerElement(owner,'lab-recap-download').onclick = () => downloadLabRecap(owner);
  labRecapOwnerElement(owner,'lab-recap-ai').onclick = () => generateLabRecapIllustration(owner);
  labRecapOwnerElement(owner,'lab-recap-cancel').onclick = () => owner.controller?.abort();
  if(owner.paired&&!owner.hub) {
    const button=labRecapOwnerElement(owner,'lab-recap-ai');button.disabled=true;
    button.textContent=zh?'完成两局后绘制':'Illustrate after both games';
    labRecapOwnerElement(owner,'lab-recap-status').textContent=zh?'称号卡和四阶段回顾现在可以查看、下载。两局结束并确认保存后，可分别选择绘制结局插画；问卷仍待接入。':'Your title and four-stage recap are available now. After both games are completed and saved, you may choose an illustration for each. The questionnaire is still pending.';
  }
  if(!owner.paired && state.runtimeManifest?.pairedOnlyRecapArt) {
    labRecapOwnerElement(owner,'lab-recap-ai').disabled=true;
    labRecapOwnerElement(owner,'lab-recap-ai').textContent=zh?'正式参与者完成两局后可绘制':'Study participants can illustrate after both games';
    labRecapOwnerElement(owner,'lab-recap-status').textContent=zh?'本地称号卡与回顾仍可下载。正式参与者完成并保存两局后，可在结束页选择绘制插画。':'Local title cards and recaps remain downloadable. Study participants may illustrate from the completion page after both games are saved.';
  }
  if (owner.facts.ending === 'incomplete') labRecapOwnerElement(owner,'lab-recap-ai').disabled = true;
}
function anonymizeLabRecapFacts(facts) {
  if(!labRecapAnonymousSession||labRecapAnonymousSession.epoch!==state.sessionEpoch||labRecapAnonymousSession.localId!==facts.sessionId){
    const bytes=new Uint32Array(4);crypto.getRandomValues(bytes);
    labRecapAnonymousSession={epoch:state.sessionEpoch,localId:facts.sessionId,id:'recap-'+[...bytes].map(x=>x.toString(16).padStart(8,'0')).join(''),sources:new Map()};
  }
  const anon=labRecapAnonymousSession;
  const alias=id=>{if(!anon.sources.has(id))anon.sources.set(id,'source-'+String(anon.sources.size+1).padStart(8,'0'));return anon.sources.get(id);};
  return {...facts,sessionId:anon.id,stages:facts.stages.map(r=>({...r,sourceEventIds:r.sourceEventIds.map(alias)})),publicEncounters:facts.publicEncounters.map(p=>({...p,sourceEventIds:p.sourceEventIds.map(alias)}))};
}
function labRecapOwnerCurrent(owner) {
  if(!owner || owner.language!==state.language || !owner.panelRoot?.isConnected)return false;
  if(owner.hub)return owner===labRecapPairedRuntime && state.screen==='studyComplete' && studyPairRuntime.pair?.status==='completed' && studyPairRuntime.pair?.pairId===owner.pairId && studyPairRuntime.keepsakeLabel===owner.gameLabel;
  return owner===labRecapRuntime && owner.epoch===state.sessionEpoch && state.screen==='summary' && (!state.researchProfile?.active || (owner.paired&&labRecapPairedPresentationEnabled()));
}
function applyLabRecapImage(owner,dataUrl) {
  if(!labRecapOwnerCurrent(owner)||typeof dataUrl!=='string'||!dataUrl.startsWith('data:image/png;base64,'))throw Error('invalid_image');
  owner.image=dataUrl;
  if(owner.hub)studyPairRuntime.keepsakes.games[owner.gameLabel].image={status:'ready',imageDataUrl:dataUrl,gameLabel:owner.gameLabel,sourceHash:owner.sourceHash};
  const image=labRecapOwnerElement(owner,'lab-recap-image');image.src=dataUrl;image.hidden=false;
  labRecapOwnerElement(owner,'lab-recap-cover-wait').hidden=true;labRecapOwnerElement(owner,'lab-recap-ai').disabled=true;
  labRecapOwnerElement(owner,'lab-recap-download').textContent=owner.language==='zh'?'下载结局插画':'Download ending illustration';
  labRecapOwnerElement(owner,'lab-recap-status').textContent=owner.language==='zh'?'本局结局插画已生成。下方文字与回顾是事实记录；插画细节仅作艺术表现。':'This run’s illustration is ready. The recap is the factual record; visual details are artistic.';
}
async function waitLabRecapImage(owner,job,controller,paired=false) {
  if(typeof job!=='string'||!/^[a-f0-9]{32}$/.test(job))throw Error('invalid_job');
  while(!controller.signal.aborted&&labRecapOwnerCurrent(owner)) {
    await new Promise((resolve,reject)=>{const abort=()=>{clearTimeout(wait);reject(Error('canceled'));};const wait=setTimeout(()=>{controller.signal.removeEventListener('abort',abort);resolve();},2000);controller.signal.addEventListener('abort',abort,{once:true});if(controller.signal.aborted)abort();});
    const result=await fetch((paired?'/api/study/pair/recap-image-status?job=':'/api/recap-image-status?job=')+job,{signal:controller.signal,credentials:'same-origin',cache:'no-store'});
    const data=await result.json();if(!result.ok)throw Error(data?.error?.code||`HTTP ${result.status}`);
    if(paired&&(data.gameLabel!==owner.gameLabel||data.sourceHash!==owner.sourceHash))throw Error('image_owner_mismatch');
    if(paired)studyPairRuntime.keepsakes.games[owner.gameLabel].image=data;
    if(data.status==='ready')return data;
    if(data.status==='failed'||data.status==='unknown')throw Error(data.errorCode||'image_generation_unavailable');
    if(data.status!=='pending')throw Error('invalid_job_status');
  }
  throw Error('canceled');
}
async function pollLabRecapPairedImage(owner,job) {
  if(!labRecapOwnerCurrent(owner)||owner.controller)return;
  const controller=new AbortController();owner.controller=controller;
  const button=labRecapOwnerElement(owner,'lab-recap-ai'),cancel=labRecapOwnerElement(owner,'lab-recap-cancel'),status=labRecapOwnerElement(owner,'lab-recap-status');
  button.disabled=true;cancel.hidden=false;status.textContent=owner.language==='zh'?'正在读取本局已开始的绘制，不会新增生成请求。':'Reading the illustration already started for this game; no new generation request is made.';
  const timer=setTimeout(()=>controller.abort(),180000);
  try {const data=await waitLabRecapImage(owner,job,controller,true);if(labRecapOwnerCurrent(owner))applyLabRecapImage(owner,data.imageDataUrl);}
  catch(error){if(labRecapOwnerCurrent(owner))status.textContent=owner.language==='zh'?'绘制尚未完成，可稍后刷新读取。本地回顾仍可下载；没有自动重新生成。':'The illustration is not ready. Reload later; the local recap is available and no paid retry starts automatically.';}
  finally {clearTimeout(timer);if(owner.controller===controller)owner.controller=null;if(labRecapOwnerCurrent(owner)){cancel.hidden=true;button.disabled=true;}}
}
async function generateLabRecapIllustration(owner) {
  if (!labRecapOwnerCurrent(owner) || owner.controller || (!owner.paired&&state.runtimeManifest?.pairedOnlyRecapArt) || (owner.paired&&!owner.hub) || (state.researchProfile?.active&&!owner.paired) || owner.facts.ending === 'incomplete') return;
  const zh = state.language === 'zh';
  const confirmation=owner.paired
    ? (zh?'使用项目已配置的图像 API，为这一局绘制结局插画？会发送匿名阶段选择、公开行为类别、已发言人物、实际提交状态、交付时间和批准的封面参考，并消耗项目图像额度；参与者无需支付。停止等待不保证上游停止计费。':'Use the project’s configured image API to illustrate this game? Anonymous choices, public action categories and speaker counts, submissions, delivery time and the approved cover reference will consume project image credits. Participants do not pay. Stopping the wait may not cancel the provider charge.')
    : (zh?'确认发送匿名阶段选择、公开行为类别、已发言人物、实际提交状态与交付时间，并以批准的封面作美术参考，给 OpenAI 生成一张个性化结局插画？这会产生图像 API 费用。':'Send the anonymous choices, public action categories and speaker counts, actual submissions and delivery, with the approved cover reference, to OpenAI for one personalized ending illustration? An image API charge applies.');
  if(!window.confirm(confirmation))return;
  const button = labRecapOwnerElement(owner,'lab-recap-ai'), status = labRecapOwnerElement(owner,'lab-recap-status'), cancel = labRecapOwnerElement(owner,'lab-recap-cancel');
  const controller = new AbortController(); owner.controller = controller; button.disabled = true; cancel.hidden = false;
  status.textContent = zh?'正在绘制，你可以先下载本地回顾或离开；不会影响结局。':'Illustrating. You can download the local recap or leave; the ending is unchanged.';
  const timer = setTimeout(() => controller.abort(),180000);
  try {
    const endpoint=owner.hub?'/api/study/pair/recap-image':'/api/recap-image';
    const body=owner.hub?{gameLabel:owner.gameLabel,consent:true}:{consent:true,recap:anonymizeLabRecapFacts(owner.facts)};
    if(owner.hub)studyPairRuntime.keepsakes.games[owner.gameLabel].image={status:'unknown',gameLabel:owner.gameLabel,sourceHash:owner.sourceHash,errorCode:'request_not_confirmed'};
    const response = await fetch(endpoint,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','Prefer':'respond-async'},signal:controller.signal,body:JSON.stringify(body)});
    let data = await response.json(); if (!response.ok) {
      if(owner.hub&&['image_busy','image_rate_limited','image_pending'].includes(data?.error?.code))studyPairRuntime.keepsakes.games[owner.gameLabel].image=null;
      throw Error(data?.error?.code || `HTTP ${response.status}`);
    }
    if(owner.hub&&(data.gameLabel!==owner.gameLabel||data.sourceHash!==owner.sourceHash))throw Error('image_owner_mismatch');
    if(owner.hub)studyPairRuntime.keepsakes.games[owner.gameLabel].image=data;
    if(data.status==='failed'||data.status==='unknown')throw Error(data.errorCode||'image_generation_unavailable');
    if(response.status===202 || data.status==='pending')data=await waitLabRecapImage(owner,data.jobId,controller,owner.hub);
    if (!labRecapOwnerCurrent(owner)) return;
    applyLabRecapImage(owner,data.imageDataUrl);
    status.textContent = zh?'结局插画已生成。下方文字与本地回顾是事实记录；插画细节仅作艺术表现。':'Illustration ready. The captions and local recap are the factual record; visual detail is artistic.';
  } catch (e) {
    if (labRecapOwnerCurrent(owner)) status.textContent = controller.signal.aborted
      ? (zh?'已停止等待。本地回顾仍可下载；上游可能已计费。':'Stopped waiting. Local recap remains available; the provider may already have charged.')
      : (zh?`绘制未完成（${e.message}）。本局文字记录不受影响；未自动重试。`:`Illustration unavailable (${e.message}). Local recap remains available; no automatic retry.`);
  } finally {
    clearTimeout(timer); if (owner.controller === controller) owner.controller = null;
    if (labRecapOwnerCurrent(owner)) { button.disabled = Boolean(owner.image)||(owner.hub&&['pending','failed','unknown'].includes(studyPairRuntime.keepsakes.games[owner.gameLabel].image?.status)); cancel.hidden = true; }
  }
}
async function downloadLabRecap(owner) {
  if (!labRecapOwnerCurrent(owner)) return;
  const button = labRecapOwnerElement(owner,'lab-recap-download'); button.disabled = true;
  try {
    if(owner.image){const a=document.createElement('a');a.href=owner.image;a.download=owner.hub?`lab-game-${owner.gameLabel}-personalized-ending.png`:'lab-personalized-ending.png';a.click();return;}
    const canvas = document.createElement('canvas'); canvas.width = 1440; canvas.height = 1440;
    const c = canvas.getContext('2d'); c.fillStyle = '#f3efe4'; c.fillRect(0,0,1440,1440);
    c.fillStyle = '#294d47'; c.font = 'bold 36px sans-serif'; c.fillText(state.language === 'zh'?'实验室 · 本局事实记录':'THE LAB · SESSION RECORD',44,58);
    for (let i=0;i<4;i++) {
      const x=36+(i%2)*702,y=94+Math.floor(i/2)*620,w=666,h=590;
      c.fillStyle='#fffdf7';c.fillRect(x,y,w,h);
      const caption=labRecapCaption(owner.facts.stages[i],i);c.fillStyle='#294d47';c.font='bold 27px sans-serif';c.fillText(`${i+1}. ${caption.title}`,x+22,y+55);
      c.font='23px sans-serif';let line='',lineY=y+105;
      for (const ch of caption.text) {if(c.measureText(line+ch).width>w-44){c.fillText(line,x+22,lineY);line='';lineY+=34;}line+=ch;}if(line)c.fillText(line,x+22,lineY);
    }
    c.font='22px sans-serif';c.fillStyle='#56675f'; const d=owner.facts.delivery;
    c.fillText(d?(state.language==='zh'?`Day ${d.day} · ${d.onTime?'按时':'逾期'}交付；时间与质量分别记录。`:`Day ${d.day} · ${d.onTime?'On-time':'Late'} delivery; timing and quality are separate.`):(state.language==='zh'?'未记录完整交付。':'No complete delivery recorded.'),44,1384);
    if(!labRecapOwnerCurrent(owner))return;
    const url=owner.image||canvas.toDataURL('image/png'),a=document.createElement('a');a.href=url;a.download=owner.hub?`lab-game-${owner.gameLabel}-session-record.png`:'lab-session-record.png';a.click();
  } catch (_) { if(labRecapOwnerCurrent(owner))labRecapOwnerElement(owner,'lab-recap-status').textContent=state.language==='zh'?'图片未能加载，请稍后重试。':'Images could not load; please retry.'; }
  finally {if(labRecapOwnerCurrent(owner))button.disabled=false;}
}
