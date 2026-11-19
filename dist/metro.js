'use strict';
const el=id=>document.getElementById(id);
let audio, running=false, nextTime=0, beat=0, timer, generation=0;
const clicks=new Set(), lights=new Set();
function draw(active=-1){el('lights').innerHTML=Array.from({length:+el('meter').value},(_,i)=>i===active?'<i class="active"></i>':'<i></i>').join('')}
function schedule(){
  if(nextTime<audio.currentTime-.05) nextTime=audio.currentTime;
  while(nextTime<audio.currentTime+.12){
    const current=beat, when=Math.max(audio.currentTime,nextTime);
    const tick=makeClick(audio,audio.destination,when,current===0);
    clicks.add(tick);tick.addEventListener('ended',()=>clicks.delete(tick),{once:true});
    const light=setTimeout(()=>{lights.delete(light);draw(current)},Math.max(0,(when-audio.currentTime)*1000));
    lights.add(light);nextTime+=60/+el('slider').value;beat=(beat+1)%+el('meter').value;
  }
}
function stop(){
  generation++;running=false;clearInterval(timer);
  for(const tick of clicks)tick.stop();clicks.clear();
  for(const id of lights)clearTimeout(id);lights.clear();draw();el('start').textContent='▶ Start';
}
el('start').onclick=async()=>{
  if(running){stop();return}
  running=true;const token=++generation;
  try{audio??=new (window.AudioContext||window.webkitAudioContext)();await audio.resume();
    if(token!==generation)return;
    nextTime=audio.currentTime+.02;beat=0;schedule();timer=setInterval(schedule,25);el('start').textContent='■ Stop';
  }catch(error){stop();el('error').textContent=error.message}
};
el('slider').oninput=()=>el('bpm').value=el('slider').value;
el('bpm').onchange=()=>{const bpm=Math.max(30,Math.min(300,Math.round(Number(el('bpm').value))||95));el('slider').value=el('bpm').value=bpm};
el('meter').onchange=()=>{beat=0;draw()};
window.addEventListener('pagehide',stop);draw();
