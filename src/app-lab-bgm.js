// Original, local ambient composition. No uploads, external track/license,
// agent calls, fictional time, story evidence or appraisal changes.
const LAB_BGM_VERSION = 'lab-bgm-v2-c-slow60';
let labBgmContext = null, labBgmGain = null, labBgmTimer = 0;
let labBgmGraph = null;
const labBgmVoices = new Set();
let labBgmNext = 0, labBgmBar = 0, labBgmTarget = -1;
let labBgmEnabled = true, labBgmVolume = .22;
try {
  const saved = JSON.parse(localStorage.getItem('socialevo_bgm_v1') || '{}');
  if (typeof saved.enabled === 'boolean') labBgmEnabled = saved.enabled;
  if (Number.isFinite(saved.volume)) labBgmVolume = Math.max(0, Math.min(.5, saved.volume));
} catch (_) {}
function labBgmCanPlay() {
  return labBgmEnabled && state.screen === 'game' &&
    !state.sessionClosed && !state.apiFatalError && !document.hidden;
}
function labBgmSnapshot() {
  return Object.freeze({
    version: LAB_BGM_VERSION,
    trackId: LabBgmCore.TRACK_ID,
    enabled: labBgmEnabled,
    volume: labBgmVolume,
    playbackStatus: !labBgmEnabled ? 'disabled' : !labBgmContext ? 'inactive'
      : labBgmContext.state !== 'running' ? labBgmContext.state
      : !labBgmCanPlay() ? 'idle' : labBgmVolume === 0 ? 'muted' : 'playing'
  });
}
async function prepareLabBgmPlayback() {
  if (!labBgmEnabled) return;
  const C = window.AudioContext || window.webkitAudioContext;
  if (!C) return;
  if (!labBgmContext || labBgmContext.state === 'closed') {
    labBgmContext = new C(); labBgmGraph = createLabBgmGraph(labBgmContext);
    labBgmGain = labBgmGraph.gain;
    labBgmNext = labBgmContext.currentTime + .06; labBgmBar = 0; labBgmTarget = -1;
  }
  const owner = labBgmContext;
  try { await owner.resume(); if (owner === labBgmContext) syncLabBgm(); } catch (_) {}
}
function createLabBgmGraph(c) {
  // The exact approved audition timbres and short room, not the old drone pad.
  const bus=c.createGain(),mix=c.createGain(),gain=c.createGain(),filter=c.createBiquadFilter(),room=c.createConvolver(),wet=c.createGain();
  bus.gain.value=.85;mix.gain.value=.9*LabBgmCore.NORMALIZATION_GAIN;gain.gain.value=0;
  filter.type='highpass';filter.frequency.value=80;filter.Q.value=.55;
  bus.connect(filter);filter.connect(mix);mix.connect(gain);gain.connect(c.destination);
  const impulse=c.createBuffer(2,Math.ceil(c.sampleRate*.55),c.sampleRate);
  let seed=17;const rand=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296*2-1;};
  for(let ch=0;ch<2;ch++){const a=impulse.getChannelData(ch);let smooth=0;for(let i=0;i<a.length;i++){smooth=.6*smooth+.4*rand();a[i]=smooth*Math.exp(-9*i/a.length);}}
  room.buffer=impulse;wet.gain.value=.075;bus.connect(room);room.connect(wet);wet.connect(mix);
  const waves=Object.fromEntries(Object.entries(LabBgmCore.HARMONICS).map(([kind,values])=>[kind,c.createPeriodicWave(new Float32Array(values.length),new Float32Array(values),{disableNormalization:false})]));
  return {bus,gain,waves};
}
function labBgmSchedule() {
  const c = labBgmContext;
  if (!c || c.state !== 'running' || !labBgmCanPlay()) return;
  labBgmNext = Math.max(labBgmNext, c.currentTime + .06);
  while (labBgmNext < c.currentTime + 1.5) {
    for(const n of LabBgmCore.barNotes(labBgmBar,labBgmNext))labBgmNote(n.note,n.at,n.duration,n.volume,n.kind,n.pan);
    // Keep note tails alive across bar/cycle boundaries. No preview outro,
    // fade-to-silence, MP3 encoder padding or pitch-changing playback rate.
    labBgmNext += LabBgmCore.BAR_SECONDS; labBgmBar++;
  }
}
function labBgmNote(note, at, duration, volume, kind, pan) {
  const c=labBgmContext,graph=labBgmGraph;
  if(!c||!graph)return;
  const o=c.createOscillator(),g=c.createGain(),f=c.createBiquadFilter(),p=c.createStereoPanner();
  o.setPeriodicWave(graph.waves[kind]);o.frequency.value=440*2**((note-69)/12);
  f.type='lowpass';f.Q.value=.5;f.frequency.setValueAtTime(kind==='guitar'?2400:2900,at);
  f.frequency.exponentialRampToValueAtTime(kind==='guitar'?1150:1400,at+.35);p.pan.value=pan;
  const d=Math.max(.45,duration),attack=kind==='guitar'?.008:.014,mid=Math.min(d*.35,.3);
  g.gain.setValueAtTime(.00001,at);g.gain.exponentialRampToValueAtTime(volume,at+attack);
  g.gain.exponentialRampToValueAtTime(volume*.36,at+mid);g.gain.exponentialRampToValueAtTime(.00001,at+d);
  o.connect(f);f.connect(g);g.connect(p);p.connect(graph.bus);
  const voice={oscillator:o,nodes:[o,f,g,p]};labBgmVoices.add(voice);
  o.onended=()=>{for(const n of voice.nodes)n.disconnect();labBgmVoices.delete(voice);};
  o.start(at);o.stop(at+d+.02);
}
function syncLabBgm() {
  const allowed = labBgmCanPlay();
  const talking = state.voiceModality?.enabled && ['loading','buffering','speaking'].includes(state.voiceModality.status);
  const target = allowed ? labBgmVolume * (talking ? .18 : 1) : 0;
  if (labBgmGain && labBgmContext?.state !== 'closed' && target !== labBgmTarget) {
    labBgmTarget = target; labBgmGain.gain.setTargetAtTime(target, labBgmContext.currentTime, .3);
  }
  if (allowed && labBgmContext?.state==='running' && !labBgmTimer) { labBgmSchedule(); labBgmTimer = setInterval(labBgmSchedule, 350); }
  if (!allowed && labBgmTimer) { clearInterval(labBgmTimer); labBgmTimer = 0; }
  for (const input of document.querySelectorAll('[data-lab-bgm]')) { input.checked = labBgmEnabled; input.disabled = false; }
  for (const input of document.querySelectorAll('[data-lab-bgm-volume]')) { input.value = String(Math.round(labBgmVolume * 200)); input.disabled = false; }
  for (const node of document.querySelectorAll('[data-lab-bgm-note]')) node.textContent = state.language === 'zh' ? '《慢慢来，也会完成》· C 慢速版 60 BPM；配音时自动降低音量。' : 'Take Your Time, You’ll Get There · C at 60 BPM; softer during speech.';
  for (const node of document.querySelectorAll('[data-lab-bgm-label]')) node.textContent = state.language === 'zh' ? '背景音乐' : 'Background music';
  for (const node of document.querySelectorAll('[data-lab-bgm-volume-label]')) node.textContent = state.language === 'zh' ? '音乐音量' : 'Music volume';
}
function stopLabBgm() {
  if (labBgmTimer) clearInterval(labBgmTimer); labBgmTimer = 0;
  const c = labBgmContext; labBgmContext = null; labBgmGain = null; labBgmGraph = null; labBgmTarget = -1;
  for(const voice of labBgmVoices){try{voice.oscillator.stop();}catch(_){}for(const n of voice.nodes)n.disconnect();}
  labBgmVoices.clear();
  if (c && c.state !== 'closed') c.close().catch(() => {});
}
function initializeLabBgm() {
  for (const host of [document.getElementById('voice-modality-field'), document.getElementById('ui-settings')]) {
    if (!host) continue;
    const node = document.createElement('section'); node.className = 'lab-bgm-controls';
    node.innerHTML = '<label><span data-lab-bgm-label></span><input type="checkbox" data-lab-bgm aria-label="Background music"></label><label><span data-lab-bgm-volume-label></span><input type="range" min="0" max="100" step="1" data-lab-bgm-volume aria-label="Music volume"></label><small data-lab-bgm-note></small>';
    node.querySelector('[data-lab-bgm]').onchange = e => {
      labBgmEnabled = e.target.checked; saveLabBgmPreferences();
      if (labBgmEnabled) void prepareLabBgmPlayback();
      syncLabBgm();
      if (typeof studyPairRecordAudioSettings === 'function') studyPairRecordAudioSettings('music_enabled');
    };
    node.querySelector('[data-lab-bgm-volume]').oninput = e => {
      labBgmVolume = Number(e.target.value) / 200; saveLabBgmPreferences(); syncLabBgm();
      if (typeof studyPairRecordAudioSettings === 'function') studyPairRecordAudioSettings('music_volume');
    };
    if (host.id === 'ui-settings') {
      (host.querySelector('.voice-settings-controls') || host.querySelector('header'))?.insertAdjacentElement('afterend', node);
    } else host.append(node);
  }
  syncLabBgm();
}
function saveLabBgmPreferences() { try { localStorage.setItem('socialevo_bgm_v1', JSON.stringify({enabled:labBgmEnabled,volume:labBgmVolume})); } catch (_) {} }
document.addEventListener('visibilitychange', () => {
  const c = labBgmContext; syncLabBgm();
  if (document.hidden) c?.suspend().catch(() => {});
  else if (labBgmCanPlay()) c?.resume().then(()=>{if(c===labBgmContext)syncLabBgm();}).catch(() => {});
});
initializeLabBgm();
