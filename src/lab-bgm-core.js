// Original C audition, approved at 60 BPM. Pure audio score; no game inputs.
(function(root){
  'use strict';
  const CHORDS=[[50,62,66,69,71],[55,62,67,71,74],[54,62,66,69,74],[57,61,64,69,71],
    [50,62,66,69,71],[55,62,67,71,74],[52,62,64,67,71],[57,61,64,69,74]];
  const MELODY=[[[0,74,1.2],[2,78,1]],[[.5,79,1],[2.5,78,1]],[[0,76,1],[2,74,1.2]],
    [[.5,73,1],[2.5,76,1]],[[0,78,1],[1.5,81,.8],[3,78,.8]],[[0,79,1.2],[2.5,78,.8]],
    [[.5,76,1],[2,74,1]],[[0,73,1],[2,76,.7],[3,74,.8]]];
  const HARMONICS={guitar:[0,1,.49,.16,.1,.06,.035,.019],piano:[0,1,.48,.22,.11,.045,.022,.01]};
  const BPM=60,BEAT_SECONDS=60/BPM,BAR_SECONDS=4*BEAT_SECONDS;
  function barNotes(bar,start=.05){
    if(!Number.isInteger(bar)||bar<0||!Number.isFinite(start)||start<.005)throw Error('Invalid audio bar');
    const row=CHORDS[bar%8],b=BEAT_SECONDS;
    const notes=[{note:row[0],at:start,duration:1.8*b,volume:.064,kind:'guitar',pan:-.13}];
    const pattern=[row[1],row[2],row[3],row[2],row[4],row[3],row[2],row[3]];
    pattern.forEach((note,i)=>notes.push({note,at:start+i*.5*b+((i%3)-1)*.005,duration:1.7*b,volume:i%2?.039:.046,kind:'guitar',pan:(i%3-1)*.14}));
    for(const [offset,note,length] of MELODY[bar%8])notes.push({note,at:start+offset*b+.006*(bar%3),duration:Math.min(2.3,length*b+1.05),volume:.034,kind:'piano',pan:.10});
    return notes;
  }
  function freeze(x){if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;}
  const api=freeze({VERSION:'lab-bgm-score-v1-c-slow60',TRACK_ID:'c-slow60',BPM,BEAT_SECONDS,BAR_SECONDS,
    TITLE:{zh:'慢慢来，也会完成',en:'Take Your Time, You’ll Get There'},KEY:'D major',CHORDS,MELODY,HARMONICS,
    // Audition's measured local render normalization, not a player metric.
    NORMALIZATION_GAIN:7.415389737298628,barNotes});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.LabBgmCore=api;
})(typeof window!=='undefined'?window:globalThis);
