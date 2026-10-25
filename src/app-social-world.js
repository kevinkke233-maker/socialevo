// Player-private discovery projection; not NPC knowledge, a score or a gate.
function socialDiscoverySnapshot(){return LabSocialWorldCore.discovery({epoch:state.sessionEpoch,events:state.eventLedger,documents:state.sharedComputerArtifacts,npcIds:state.npcs.map(n=>n.id)});}
function socialNode(tag,text,className){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;}
function socialDiscoveryOwner(){return `${state.sessionEpoch}:${currentStage()?.id}:${state.language}`;}
function socialPeopleActionSafe(owner){return owner===socialDiscoveryOwner()&&state.screen==='game'&&playerTool==='journal'&&playerJournalTab==='people'&&!state.sessionClosed&&!state.apiFatalError&&!state.finalOutcome&&!state.isScenePlaying&&!state.activeEventLock&&!state.isGmThinking;}
function renderSocialPeople(people){
 const view=socialDiscoverySnapshot(),zh=state.language==='zh',owner=socialDiscoveryOwner();people.replaceChildren();
 const intro=socialNode('section',undefined,'social-discovery-intro');intro.append(socialNode('h3',zh?'认识这个小组':'Getting to know the lab'),socialNode('p',zh?'先弄清谁在做什么，再提出你需要的帮助。这里只保留你实际听到的话与看过的原件；成员的说法不自动等于事实或共同安排。':'Learn who does what, then ask for the help you need. These are words actually delivered and originals you viewed—not automatically verified facts or shared agreements.'));people.append(intro);
 for(const member of view.members){
  const npc=state.npcs.find(n=>n.id===member.id),row=socialNode('article',undefined,'social-member-card');row.dataset.socialMember=member.id;
  const img=document.createElement('img');img.src=galgamePortraitUrl(member.id,'neutral');img.alt='';
  const copy=socialNode('div',undefined,'social-member-copy');copy.append(socialNode('strong',member.name));
  const sources=view.originals.flatMap(d=>d.sections.filter(s=>typeof s.body==='string'&&s.body.includes(member.name)).map(s=>({document:d,text:s.body,heading:s.heading})));
  copy.append(socialNode('p',member.testimony.length||sources.length?(zh?'已保留实际来源；具体分工仍以交流和明确安排为准。':'Sources retained; establish actual roles through conversation and explicit arrangements.'):(zh?'还没有具体分工的交流记录。可以先认识对方，问问平时负责什么。':'No role conversation recorded yet. Meet them and ask what they usually handle.'),'social-member-status'));
  // Keep the first real introduction even after many later exchanges. Never
  // replace the discovered contact context with only the last two replies.
  const recent=member.testimony.slice(-2),first=member.testimony[0];
  const retained=first&&!recent.includes(first)?[first,...recent]:recent;
  for(const statement of retained){
   const record=socialNode('details',undefined,'social-testimony');record.dataset.socialEventId=statement.eventId;
   // The first thing actually learned is immediately readable; do not hide
   // every discovered role behind another click or reveal authored hidden roles.
   if(statement===first)record.open=true;
   record.append(socialNode('summary',`${zh?'对方实际说过':'Their delivered words'} · ${statement.visibility==='private'?(zh?'单独交流':'Private exchange'):(zh?'公开交流':'Public exchange')}`),socialNode('blockquote',statement.text),socialNode('small',zh?'成员自述／观点，不自动确认分工、数据正确或他人同意。':'A member’s account or stance—not automatic role confirmation, verified data or others’ agreement.'));copy.append(record);
  }
  const earlier=member.testimony.filter(t=>!retained.includes(t));if(earlier.length){const history=socialNode('details',undefined,'social-testimony');history.append(socialNode('summary',`${zh?'此前保留的交流':'Earlier retained exchanges'} · ${earlier.length}`));for(const t of earlier)history.append(socialNode('small',t.visibility==='private'?(zh?'单独交流':'Private exchange'):(zh?'公开交流':'Public exchange')),socialNode('blockquote',t.text));copy.append(history);}
  for(const source of sources){const record=socialNode('details',undefined,'social-testimony');record.append(socialNode('summary',`${zh?'已查看的原件':'Viewed original'} · ${source.document.title} · ${source.heading}`),socialNode('blockquote',source.text));copy.append(record);}
  const talk=socialNode('button',zh?'走近并交流':'Approach and talk');talk.type='button';talk.dataset.socialTalk=member.id;talk.disabled=!socialPeopleActionSafe(owner);talk.onclick=()=>{if(!socialPeopleActionSafe(owner)||!npc)return;closePlayerTool();if(isFreeExplorationActive())void approachNpcForConversation(npc);};row.append(img,copy,talk);people.append(row);
 }
 const routes=socialNode('details',undefined,'social-help-routes');routes.append(socialNode('summary',zh?'如果对方忙、回避或不知道，可以怎么办？':'What if someone is busy, evasive or unsure?'));
 for(const text of zh?['把问题缩小：先问有没有现成说明，而不是要求对方从头重做。','问清联系人：谁做过这部分，谁能协调当前安排？不要求别人透露私聊。','必要时请求正式协调；也可以保留“尚未确认”，只做有依据的部分。','善意和赞美不保证配合；不必问遍所有人，也不需要承担全部旧问题。']:['Narrow the request: ask whether an explanation exists, rather than demand that someone redo everything.','Find the right contact: who worked on this part, and who can coordinate the current arrangement? Do not demand private words.','Request coordination if needed, or retain an unresolved item and work within the evidence you have.','Kindness does not guarantee help. You need not visit everyone or absorb every legacy problem.'])routes.append(socialNode('p',text));people.append(routes);
}
