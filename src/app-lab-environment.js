// Lightweight room lighting follows FICTIONAL work-time only. No condition,
// hidden state, real waiting, fabricated work, speech or score mutation.
const LAB_ENVIRONMENT_VERSION='lab-clock-lighting-v1';
function labLightAt(minutes){
 const at=LabNarrativeCore.clockAt(minutes),t=at.minuteOfDay/LabNarrativeCore.DAY_MINUTES;
 return {version:LAB_ENVIRONMENT_VERSION,phase:t<.28?'morning':t<.65?'midday':'late_afternoon',
  warmth:Math.max(0,(t-.45)/.55),shade:.015+Math.max(0,t-.6)*.22,
  windowOpacity:.13+Math.sin(t*Math.PI)*.15,skew:-23+t*18,time:at.time};
}
function renderLabEnvironment(){
 const world=document.getElementById('pixel-world');if(!world||state.scenarioId!=='newcomer-circle')return;
 const minutes=labClock().elapsedMinutes;if(world.dataset.labLightMinute===String(minutes)&&document.getElementById('lab-time-light'))return;world.dataset.labLightMinute=String(minutes);
 const light=labLightAt(minutes);world.dataset.labLightPhase=light.phase;world.dataset.labLightVersion=light.version;
 world.style.setProperty('--lab-light-warmth',String(light.warmth));world.style.setProperty('--lab-room-shade',String(light.shade));
 world.style.setProperty('--lab-window-opacity',String(light.windowOpacity));world.style.setProperty('--lab-window-skew',`${light.skew}deg`);
 let overlay=document.getElementById('lab-time-light');if(!overlay){overlay=document.createElement('div');overlay.id='lab-time-light';overlay.setAttribute('aria-hidden','true');world.append(overlay);}
}
