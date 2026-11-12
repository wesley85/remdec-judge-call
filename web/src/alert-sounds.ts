export const alertSounds={
 default:{label:'Default beep',tones:[[720,0,0.25]]},
 chime:{label:'Rising chime',tones:[[660,0,0.16],[990,0.18,0.24]]},
 double:{label:'Double beep',tones:[[820,0,0.12],[820,0.22,0.12]]},
 low:{label:'Low tone',tones:[[420,0,0.35]]},
};
export type AlertSound=keyof typeof alertSounds;
export function alertSoundOrDefault(value:unknown):AlertSound{
 return typeof value==='string'&&Object.hasOwn(alertSounds,value)?value as AlertSound:'default';
}
export function playAlert(context:AudioContext|null,sound:AlertSound){
 if(!context||context.state!=='running')return;
 const start=context.currentTime;
 for(const [frequency,delay,length] of alertSounds[sound].tones){
  const tone=context.createOscillator(),gain=context.createGain();
  tone.frequency.value=frequency;
  gain.gain.value=.12;
  tone.connect(gain).connect(context.destination);
  tone.onended=()=>{tone.disconnect();gain.disconnect()};
  tone.start(start+delay);
  tone.stop(start+delay+length);
 }
}
