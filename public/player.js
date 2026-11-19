'use strict';
const $=id=>document.getElementById(id),esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const colours=['#27afe3','#9d80e6','#2ec499','#eca14c','#de7697','#8ca454'];
let song,mix=[],pos=0,page=0,rate=1,playing=false,looping=false,ctx,buses=[],master,voices=[],origin=0,scheduled=0,cue=0;
const time=x=>Math.floor(x/60)+':'+String(Math.floor(x%60)).padStart(2,'0');
const playable=i=>!mix[i].mute&&(!mix.some(m=>m.solo)||mix[i].solo);
function gain(){buses.forEach((g,i)=>g.gain.setTargetAtTime(playable(i)?mix[i].vol/100:0,ctx.currentTime,.008))}
function stopNotes(){clearClicks();for(const v of voices){try{v.osc.stop()}catch{}}voices=[]}
const instrumentWaves = ['triangle','sine','sine','sawtooth','triangle','sawtooth','triangle','sawtooth','square','sine','triangle'];
const instrumentCutoffs = [3600,1800,1600,1300,600,1450,850,2200,1400,3000,2000];
const instrumentAttacks = [.007,.01,.025,.003,.009,.075,.09,.035,.025,.035,.003];
function sound(i,n,when,dur){if(dur<=0)return;let t=mix[i].inst,osc=ctx.createOscillator(),amp=ctx.createGain(),filter=ctx.createBiquadFilter();
 osc.type=instrumentWaves[t];
 osc.frequency.value=440*2**((n.p-69)/12);filter.type='lowpass';filter.frequency.value=instrumentCutoffs[t];
 if(t===10)osc.frequency.setTargetAtTime(50,when,.025);
 let attack=Math.min(dur/3,instrumentAttacks[t]),peak=.17*(.2+.8*n.v);
 amp.gain.setValueAtTime(.0001,when);amp.gain.exponentialRampToValueAtTime(peak,when+attack);amp.gain.exponentialRampToValueAtTime(Math.max(.00011,peak*([0,1,3,4,10].includes(t)?Math.exp(-dur*(t===10?12:1.4)):.86)),when+dur);amp.gain.exponentialRampToValueAtTime(.0001,when+dur+.035);
 osc.connect(filter).connect(amp).connect(buses[i]);osc.start(when);osc.stop(when+dur+.04);const voice={osc,track:i,pitch:n.p,start:when,end:when+dur};voices.push(voice);osc.onended=()=>{osc.disconnect();filter.disconnect();amp.disconnect();let j=voices.indexOf(voice);if(j>=0)voices.splice(j,1)}}
function barAt(q){let l=0,r=song.bars.length-1;while(l+1<r){let m=(l+r)>>1;if(song.bars[m].q<=q)l=m;else r=m}return l}
function range(){const v=song.bars;const clampBar=(value,fallback)=>Math.max(1,Math.min(v.length-1,Math.round(Number(value))||fallback));const a=clampBar($('a').value,1),b=Math.max(a,clampBar($('b').value,a));return [song.seconds(v[a-1].q),song.seconds(v[b].q)]}
function restart(){stopNotes();origin=ctx.currentTime-pos/rate;scheduled=pos;const end=looping?range()[1]:song.duration;
 song.tracks.forEach((t,i)=>{for(const n of t.notes){if(n.s>=pos)break;if(n.e>pos)sound(i,n,ctx.currentTime,(Math.min(n.e,end)-pos)/rate)}});schedule()}
function schedule(){if(!playing)return;const end=looping?range()[1]:song.duration;pos=Math.min(end,Math.max(0,(ctx.currentTime-origin)*rate));if(pos>=end-.00001){if(looping){pos=range()[0];restart()}else{playing=false;stopNotes();$('play').textContent='▶　Play';seek(cue)}return}
 const horizon=Math.min(end,pos+.13*rate);song.tracks.forEach((t,i)=>{let l=0,r=t.notes.length;while(l<r){let m=(l+r)>>1;if(t.notes[m].s<scheduled)l=m+1;else r=m}for(let k=l;k<t.notes.length&&t.notes[k].s<horizon;k++){let n=t.notes[k],start=Math.max(n.s,pos);sound(i,n,origin+start/rate,(Math.min(n.e,end)-start)/rate)}});scheduleClicks(scheduled,horizon);scheduled=horizon}
setInterval(schedule,32);
let scoreWidth = 0, barsPerPage = 4, engravedView;
const engravedScore = $('engravedScore');
const scoreViewport = $('scoreViewport');
const followScore = $('followScore');
const scoreWorkspace = engravedScore.closest('.workspace');
const scoreStart = 69, rightMargin = 14;
const pageFor = bar => Math.floor(bar / barsPerPage) * barsPerPage;
const barWidth = () => (scoreWidth-scoreStart-rightMargin) / barsPerPage;
function fitScore() {
  const width = Math.round($('scorewrap').getBoundingClientRect().width);
  if (!width || width === scoreWidth) return;
  scoreWidth = width;
  barsPerPage = Math.max(1, Math.floor((width-scoreStart-rightMargin)/200));
  if (engravedView) updateVisibleBars();
  else if (song) {
    page = pageFor(playing ? barAt(song.beat(pos)) : page);
    score();
  }
}
new ResizeObserver(fitScore).observe($('scorewrap'));
fitScore();
function seek(s){
  pos=Math.min(song.duration,Math.max(0,s));
  if(playing&&looping&&(pos<range()[0]||pos>=range()[1]))pos=range()[0];
  page=pageFor(barAt(song.beat(pos)));
  if(playing)restart();
  if(!engravedView)score();
  display();
  if(engravedView)revealPlayhead(engravedView.playheadX,true);
}
async function enableAudio(){if(!ctx){ctx=new (window.AudioContext||window.webkitAudioContext)();master=ctx.createDynamicsCompressor();master.connect(ctx.destination)}if(ctx.state!=='running')await ctx.resume()}
$('play').onclick=async()=>{if(playing){playing=false;stopNotes();$('play').textContent='▶　Play';return}try{await enableAudio();if(!buses.length){buses=mix.map(()=>{let g=ctx.createGain();g.connect(master);return g});gain()}if(pos>=song.duration)pos=cue;if(looping&&(pos<range()[0]||pos>=range()[1]))pos=range()[0];playing=true;restart();$('play').textContent='Ⅱ　Pause'}catch(e){$('status').textContent=e.message}};
const staffLabels = $('staffLabels');
const sharpNames = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
const solfaNames = ['Do','Di','Re','Ri','Mi','Fa','Fi','Sol','Si','La','Li','Ti'];

function staffLabel(pitch, key, mode) {
  if (mode === 'solfa') return solfaNames[(pitch - key.tonic + 12) % 12];
  return sharpNames[pitch % 12] + (Math.floor(pitch / 12) - 1);
}

staffLabels.onchange = () => { if (song) appLoading.during('Updating staff labels…', score); };
const staffSteps = [0,0,1,1,2,3,3,4,4,5,5,6];
function noteY(pitch, top, reference) {
  const step = (Math.floor(pitch / 12) - 1) * 7 + staffSteps[pitch % 12];
  return top + 28 - (step - reference) * 3.5;
}

// MIDI note-offs often come slightly early for articulation.
const writtenValues = [4,3,2,1.5,1,.75,.5,.375,.25,.125];
function writtenLength(length) {
  return writtenValues.reduce((best,value) =>
    Math.abs(Math.log(length/value)) < Math.abs(Math.log(length/best)) ? value : best
  );
}

function flagCount(length) {
  return length <= .125 ? 3 : length <= .25 ? 2 : length < 1 ? 1 : 0;
}

function beamGroups(notes, bar, end, top, reference, xAt) {
  const stems = new Map();
  let group = [];
  function finish() {
    if (group.length > 1) {
      const first = group[0], last = group.at(-1);
      const rise = Math.max(-7, Math.min(7, last.y - first.y));
      const offset = first.down ? 22 : -22;
      const base = (first.down ? Math.max : Math.min)(
        ...group.map(({x,y}) => y - rise * (x-first.x) / (last.x-first.x))
      ) + offset;
      group.forEach((item,index) => {
        item.endY = base + rise * (item.x-first.x) / (last.x-first.x);
        item.next = group[index+1];
        item.previous = group[index-1];
        stems.set(item.note,item);
      });
    }
    group = [];
  }
  const beatLength = 4 / bar.d;
  for (let i=0;i<notes.length;i++) {
    const note = notes[i];
    if (note.q>=end) break;
    if (note.q<bar.q) continue;
    const length = writtenLength(note.len), flags = flagCount(length);
    const chord = notes[i-1]?.q===note.q || notes[i+1]?.q===note.q;
    const beat = Math.floor((note.q-bar.q)/beatLength+1e-7);
    if (!flags || chord || note.q+length>end+1e-7 ||
        note.q+length>bar.q+(beat+1)*beatLength+1e-7) {
      finish();
      continue;
    }
    const y = noteY(note.p,top,reference),down = y<top+14;
    const prior = group.at(-1);
    if (prior && (prior.down!==down || prior.beat!==beat ||
        Math.abs(prior.note.q+prior.length-note.q)>.015)) finish();
    group.push({note,x:xAt(note.q)+(down?-4.2:4.2),y,down,flags,beat,length});
  }
  finish();
  return stems;
}

window.addEventListener('score-engraver-ready', () => {
  scoreWidth = 0;
  fitScore();
});

function score() {
  if (window.engraveMidiScore && scoreWidth) {
    const mode=staffLabels.value;
    if (engravedView?.song===song && engravedView.mode===mode) return;
    try {
      const previous=engravedView?.song===song ? engravedView : undefined;
      const scroll=scoreViewport.scrollLeft;
      const index=previous && scoreBarAtX(scroll);
      const offset=previous ? scroll-previous.geometry.get(index).left : 0;
      const {svg, measures, timing} = window.engraveMidiScore(song,mode);
      engravedScore.innerHTML = svg;
      const notation=engravedScore.querySelector('svg');
      notation.setAttribute('width',notation.viewBox.baseVal.width);
      notation.setAttribute('height',notation.viewBox.baseVal.height);
      $('engravedTitle').textContent=song.title;
      $('engravedTitle').hidden=false;
      scoreViewport.hidden=false;
      $('score').setAttribute('hidden','');
      engravedView = { song, mode, measures, timing, active:new Set(), geometry:new Map() };
      engravedScore.insertAdjacentHTML('beforeend',
        '<div class="score-position cue-marker" aria-hidden="true" hidden><span>Cue</span></div>' +
        '<div class="score-position playhead-marker" aria-hidden="true" hidden></div>');
      engravedView.cueMarker=engravedScore.querySelector('.cue-marker');
      engravedView.playheadMarker=engravedScore.querySelector('.playhead-marker');
      cacheScorePositions();
      scoreViewport.scrollLeft=previous ? engravedView.geometry.get(index).left+offset : 0;
      cursor();
      if (!previous && pos>0) revealPlayhead(engravedView.playheadX);
      updateVisibleBars();
      return;
    } catch (error) {
      console.warn('Engraving fell back to the rehearsal score', error);
    }
  }
  engravedView = undefined;
  scoreViewport.hidden = $('engravedTitle').hidden = true;
  $('score').removeAttribute('hidden');
  rehearsalScore();
}

function scoreBarAtX(x) {
  const {geometry}=engravedView;
  let low=0,high=geometry.size-1;
  while(low<high){
    const middle=(low+high)>>1;
    if(geometry.get(middle).right<x)low=middle+1;
    else high=middle;
  }
  return low;
}

function updateVisibleBars() {
  if (!engravedView) return;
  const {scrollLeft,clientWidth,scrollWidth}=scoreViewport;
  const first=scoreBarAtX(scrollLeft+1)+1;
  const last=scoreBarAtX(scrollLeft+clientWidth-1)+1;
  $('bars').textContent=first===last ? 'Bar '+first : 'Bars '+first+'–'+last;
  $('prev').disabled=scrollLeft<1;
  $('next').disabled=scrollLeft+clientWidth>=scrollWidth-1;
}

function revealPlayhead(x, cancelPan=false) {
  const {scrollLeft,clientWidth}=scoreViewport;
  const margin=Math.min(70,clientWidth*.15);
  const outside=x<scrollLeft || x>scrollLeft+clientWidth-margin;
  if(cancelPan || outside){
    const left=pos===0 ? 0 : outside ? x-margin : scrollLeft;
    scoreViewport.scrollTo({left,behavior:'auto'});
  }
}

scoreViewport.addEventListener('scroll',updateVisibleBars,{passive:true});
followScore.onclick=()=>{
  const follow=followScore.getAttribute('aria-pressed')!=='true';
  followScore.setAttribute('aria-pressed',follow);
  if(follow&&engravedView)revealPlayhead(engravedView.playheadX);
};

function cacheScorePositions() {
  const host = engravedScore.getBoundingClientRect();
  const geometry = engravedView.geometry;
  for (const [id,index] of engravedView.measures) {
    const measure = $(id);
    const rect = measure.getBoundingClientRect();
    const firstLine = measure.querySelector('.staff > path')?.getBoundingClientRect() ?? rect;
    geometry.set(index, {
      left:firstLine.left-host.left, right:firstLine.right-host.left,
      top:rect.top-host.top, height:rect.height, onsets:new Map(), notes:[],
    });
  }
  for (const [id,{start,end}] of engravedView.timing) {
    const note = $(id);
    const head = note?.querySelector('.notehead');
    const index = engravedView.measures.get(note?.closest('.measure')?.id);
    const bar = geometry.get(index);
    if (!bar) continue;
    bar.notes.push({id,start,end});
    if (!head || bar.onsets.has(start)) continue;
    const {left,width} = head.getBoundingClientRect();
    bar.onsets.set(start,left+width/2-host.left);
  }
  for (const [index,bar] of geometry) {
    const start = song.bars[index].q;
    bar.anchors = [[start,bar.left+2],...bar.onsets].sort(([a],[b])=>a-b);
    bar.anchors.push([song.bars[index+1].q,bar.right]);
    for (let i=1;i<bar.anchors.length;i++) {
      if (bar.anchors[i][0]===bar.anchors[i-1][0]) bar.anchors.splice(--i,1);
    }
  }
}

function interpolate(anchors, value, axis) {
  const other = 1-axis;
  let previous = anchors[0];
  for (const next of anchors.slice(1)) {
    if (value <= next[axis]) {
      const distance = next[axis]-previous[axis];
      const ratio = distance ? Math.max(0,(value-previous[axis])/distance) : 0;
      return previous[other]+ratio*(next[other]-previous[other]);
    }
    previous = next;
  }
  return previous[other];
}

function positionMarker(marker, beat, offset=0) {
  const bar = engravedView.geometry.get(barAt(beat));
  marker.hidden = !bar;
  if (!bar) return;
  const x = interpolate(bar.anchors,beat,0);
  marker.style.transform = 'translate('+(x+offset)+'px,'+bar.top+'px)';
  marker.style.height = bar.height+'px';
  return x;
}

engravedScore.onclick = event => {
  const note = event.target.closest('.note, .chord');
  let beat = engravedView?.timing.get(note?.id)?.start;
  if (beat === undefined) {
    const host = engravedScore.getBoundingClientRect();
    const x = event.clientX-host.left, y = event.clientY-host.top;
    const bar=engravedView.geometry.get(scoreBarAtX(x));
    if(x<bar.left || x>bar.right || y<bar.top || y>bar.top+bar.height)return;
    beat = interpolate(bar.anchors,x,1);
  }
  const target = song.seconds(beat);
  if (event.shiftKey) cue = target;
  seek(target);
  updateCue();
};

function rehearsalScore(){const bars=song.bars,count=Math.min(barsPerPage,bars.length-1-page),w=barWidth(),svg=$('score'),mode=staffLabels.value;
 let top=52,previousStaff;
 let connectors='';
 let s='<rect width="100%" height="32" fill="#111d30"/>';const line=(x,y,x2,y2,col='#98929a',width=.8)=>'<path d="M'+x+' '+y+' L'+x2+' '+y2+'" stroke="'+col+'" stroke-width="'+width+'"/>';
 for(let j=0;j<count;j++)s+='<text x="'+(scoreStart+j*w)+'" y="21" fill="#bed1df" font-size="11">'+(page+j+1)+'</text>';
 song.tracks.forEach((t,i)=>{const labels=new Map();let labelFloor=top+28;const c=colours[i%colours.length],sample=t.notes.slice(0,80),bass=sample.reduce((a,n)=>a+n.p,0)/sample.length<58,ref=bass?18:30;let clef=clefs[bass?'bass':'treble'],ch=bass?26:48,k=ch/(clef[4]-clef[2]);s+='<circle cx="7" cy="'+(top-13)+'" r="4" fill="'+c+'"/><text x="14" y="'+(top-10)+'" font-weight="600" font-size="13"><title>'+esc(t.name)+'</title>'+esc(t.name.length>10?t.name.slice(0,9)+'…':t.name)+'</text>';
 if(previousStaff!==undefined){
   connectors+=line(7,previousStaff+28,7,top,'#77717d',1.1);
   for(let j=0;j<=count;j++){
     const boundary=scoreStart+j*w;
     connectors+=line(boundary,previousStaff+28,boundary,top,'#bab4bf');
   }
 }
 previousStaff=top;
 for(let j=0;j<5;j++)s+=line(7,top+j*7,scoreWidth-rightMargin,top+j*7);s+='<path d="'+clef[0]+'" transform="translate('+(11-clef[1]*k)+' '+(top+(bass?0:-9)+clef[4]*k)+') scale('+k+' '+(-k)+')" fill="#33303b"/>';
 for(let j=0;j<count;j++){const b=bars[page+j],end=bars[page+j+1].q,x=scoreStart+j*w,changed=j===0||bars[page+j-1].n!==b.n||bars[page+j-1].d!==b.d;if(changed)s+='<text text-anchor="end" x="'+(x-5)+'" y="'+(top+13)+'" font-family="serif" font-size="17" font-weight="bold">'+b.n+'<tspan x="'+(x-5)+'" dy="14">'+b.d+'</tspan></text>';s+=line(x,top,x,top+28);
 const xAt=q=>x+14+(q-b.q)/(end-b.q)*(w-20);
 const beams=beamGroups(t.notes,b,end,top,ref,xAt);
 let seen=false;for(const n of t.notes){
   if(n.q>=end)break;
   if(n.q+n.len<=b.q)continue;
   seen=true;
   const xx=xAt(Math.max(n.q,b.q)),pc=n.p%12,y=noteY(n.p,top,ref);
   const down=y<top+14,dy=down?22:-22,stem=xx+(down?-4.2:4.2);
   const len=writtenLength(Math.min(end,n.q+n.len)-Math.max(n.q,b.q)),beam=beams.get(n);
   for(let ly=top-7;ly>=y;ly-=7)s+=line(xx-7,ly,xx+7,ly);
   for(let ly=top+35;ly<=y;ly+=7)s+=line(xx-7,ly,xx+7,ly);
   if([1,3,6,8,10].includes(pc))s+='<text x="'+(xx-13)+'" y="'+(y+4)+'" font-size="12">♯</text>';
   s+='<ellipse cx="'+xx+'" cy="'+y+'" rx="5" ry="3.2" transform="rotate(-19 '+xx+' '+y+')" fill="'+(len>=1.9?'white':'#302c36')+'" stroke="#302c36"/>';
   if(len<3.9){
     s+=line(stem,y,stem,beam?.endY??y+dy,'#302c36',1.3);
     if(beam){
       for(let f=0;f<beam.flags;f++){
         const offset=f*(down?-5:5);
         const next=beam.next,previous=beam.previous;
         if(next?.flags>f){
           s+='<g class="score-beam">'+line(stem,beam.endY+offset,next.x,next.endY+offset,'#302c36',3.3)+'</g>';
         }else if(f>0 && !(previous?.flags>f)){
           const neighbour=next??previous;
           const fraction=Math.min(.45,8/Math.abs(neighbour.x-stem));
           s+=line(stem,beam.endY+offset,stem+(neighbour.x-stem)*fraction,
             beam.endY+offset+(neighbour.endY-beam.endY)*fraction,'#302c36',3.3);
         }
       }
     }else{
       for(let f=0;f<flagCount(len);f++)s+='<path d="M'+stem+' '+(y+dy+(down?-4:4)*f)+' q 8 '+(down?-4:4)+' 5 '+(down?-11:11)+'" fill="none" stroke="#302c36" stroke-width="2"/>';
     }
   }
   labelFloor=Math.max(labelFloor,Math.max(y,beam?.endY??y+dy)+4);
   if(mode!=='none'){
   if(!labels.has(xx))labels.set(xx,new Map());
   labels.get(xx).set(n.p,staffLabel(n.p,song.keyAt(n.q),mode));
 }if([.375,.75,1.5,3].includes(len))s+='<circle cx="'+(xx+8)+'" cy="'+(y-1.8)+'" r="1.4"/>'}if(!seen)s+='<rect x="'+(x+w/2-4)+'" y="'+(top+7)+'" width="8" height="3"/>'}
 s+=line(scoreStart+count*w,top,scoreStart+count*w,top+28);
 const laneEnds=[];
 for(const [x,pitches] of labels){
   for(const [,label] of [...pitches].sort(([a],[b])=>b-a)){
     const halfWidth=label.length*3.5;
     let lane=laneEnds.findIndex(end=>end+3<=x-halfWidth);
     if(lane<0)lane=laneEnds.length;
     laneEnds[lane]=x+halfWidth;
     s+='<text class="staff-label" x="'+x+'" y="'+(labelFloor+13+lane*13)+'" text-anchor="middle" fill="#33465a" font-size="11">'+label+'</text>';
   }
 }
 const labelSpace=Math.max(0,labelFloor-top+laneEnds.length*13-43);
 if(i<song.tracks.length-1)s+=line(15,top+56+labelSpace,scoreWidth,top+56+labelSpace,'#eeeaf0');
 top+=78+labelSpace;
 });
 const h=top-20;
 svg.setAttribute('viewBox','0 0 '+scoreWidth+' '+h);
 svg.setAttribute('preserveAspectRatio','xMinYMin meet');
 svg.style.height=h+'px';
 svg.innerHTML='<rect width="100%" height="'+h+'" fill="#f5f8fb"/>'+connectors+s+
 '<g id="cueCursor" pointer-events="none"><rect y="5" width="27" height="13" rx="2" fill="#a7410b"/><text x="3" y="15" fill="white" font-size="9">Cue</text><path d="M0 18V'+(h-10)+'" stroke="#ca5a19" stroke-dasharray="3 3"/></g>'+
 '<g id="cursor" pointer-events="none"><path d="M-4 25h8l-4 6z" fill="#00ad81"/>'+line(0,30,0,h-10,'#00ad81',1.5)+'</g>';$('bars').textContent='Bars '+(page+1)+'–'+(page+count);$('prev').disabled=page===0;$('next').disabled=page+count>=bars.length-1;cursor()}
function cursor(){const q=song.beat(pos),idx=barAt(q);
 if(engravedView){
   const cueBeat=song.beat(cue);
   engravedView.playheadX=positionMarker(engravedView.playheadMarker,q);
   positionMarker(engravedView.cueMarker,cueBeat,Math.abs(q-cueBeat)<.025?-4:0);
   const next=new Set();
   const measure=engravedView.geometry.get(idx);
   if(measure){
     next.add('midi-bar-'+idx);
     for(const {id,start,end} of measure.notes)if(start<=q&&end>q)next.add(id);
     if(playing&&followScore.getAttribute('aria-pressed')==='true')revealPlayhead(engravedView.playheadX);
   }
   for(const id of engravedView.active)if(!next.has(id))$(id)?.classList.remove('score-current');
   for(const id of next)if(!engravedView.active.has(id))$(id)?.classList.add('score-current');
   engravedView.active=next;
   return;
 }
 const place = (marker, beat, offset=0) => {
   if (!marker) return;
   const bar=barAt(beat);
   marker.style.display=bar<page||bar>=page+barsPerPage?'none':'';
   const width=barWidth(), start=song.bars[bar].q, end=song.bars[bar+1].q;
   const x=scoreStart+(bar-page)*width+14+(beat-start)/(end-start)*(width-20);
   marker.setAttribute('transform','translate('+(x+offset)+' 0)');
 };
 const cueBeat=song.beat(cue);
 place($('cueCursor'),cueBeat,Math.abs(q-cueBeat)<.025?-4:0);
 place($('cursor'),q);
}
$('score').onclick=e=>{const r=$('score').getBoundingClientRect(),x=(e.clientX-r.left)/r.width*scoreWidth;if(x<scoreStart)return;const count=Math.min(barsPerPage,song.bars.length-1-page),w=barWidth(),j=Math.min(count-1,Math.max(0,Math.floor((x-scoreStart)/w))),b=song.bars[page+j].q,d=song.bars[page+j+1].q-b;const target=song.seconds(b+Math.max(0,Math.min(.999,(x-scoreStart-j*w-14)/(w-20)))*d);if(e.shiftKey)cue=target;seek(target);updateCue()};
function sourceBpm() {
  const changes = song.tempos;
  let low = 0, high = changes.length;
  while (low + 1 < high) {
    const mid = (low + high) >> 1;
    if (changes[mid].sec <= pos) low = mid; else high = mid;
  }
  return 60000000 / changes[low].us;
}
function updateTempoDisplay() {
  const original = sourceBpm();
  for (const option of $('rate').options) {
    const value = Math.round(original * Number(option.value) * 100) / 100;
    const disabled = value < 30 || value > 190;
    if (option.disabled !== disabled) option.disabled = disabled;
  }
  if (document.activeElement !== $('tempoBpm')) $('tempoBpm').value = Number((sourceBpm()*rate).toFixed(2));
}
function display(){if(!song)return;updateTempoDisplay();const q=song.beat(pos),i=barAt(q),bar=song.bars[i];$('beatpos').textContent=(i+1)+' : '+Math.min(bar.n,1+Math.floor((q-bar.q)*bar.d/4));$('seek').value=pos;$('clock').textContent=time(pos)+' / '+time(song.duration);cursor()}
setInterval(()=>{if(playing&&!engravedView&&followScore.getAttribute('aria-pressed')==='true'){let p=pageFor(barAt(song.beat(pos)));if(p!==page){page=p;score()}}display()},70);
function groupState(){let sel=mix.filter(m=>m.selected);$('solosel').disabled=!sel.length;$('solosel').textContent=sel.length&&sel.every(t=>t.solo)?'Unsolo selected':'Solo selected';$('group').disabled=!sel.length;$('group').textContent=sel.length&&sel.every(m=>m.mute)?'Unmute selected':'Mute selected';$('all').checked=sel.length===mix.length;$('all').indeterminate=sel.length>0&&sel.length<mix.length}
function mixer(){$('rows').innerHTML=mix.map((m,i)=>{let name=esc(song.tracks[i].name);return '<tr data-i="'+i+'"><td><input type="checkbox" data-k="selected" aria-label="Select '+name+'" '+(m.selected?'checked':'')+'></td><td><strong><i class="dot" style="background:'+colours[i%colours.length]+'"></i>'+name+'</strong></td><td><button type="button" class="instrument-picker" aria-haspopup="dialog" aria-label="'+name+' instrument: '+esc(instruments[m.inst])+'" data-instrument-select="trackInstrument'+i+'">'+esc(instruments[m.inst])+'</button><select hidden id="trackInstrument'+i+'" data-k="inst">'+instruments.map((v,k)=>'<option value="'+k+'" '+(k===m.inst?'selected':'')+'>'+v+'</option>').join('')+'</select></td><td><input type="range" data-k="vol" aria-label="'+name+' volume" min="0" max="100" value="'+m.vol+'"><output>'+m.vol+'%</output></td><td>'+['solo','mute'].map(k=>'<button title="'+k+' '+name+'" aria-label="'+k+' '+name+'" data-k="'+k+'" aria-pressed="'+m[k]+'">'+k[0].toUpperCase()+'</button>').join('')+'</td></tr>'}).join('');groupState();gain()}
$('rows').oninput=e=>{let k=e.target.dataset.k,m=mix[e.target.closest('tr').dataset.i];if(k==='vol'){m.vol=+e.target.value;e.target.nextElementSibling.value=m.vol+'%';gain()}if(k==='inst'){m.inst=+e.target.value;if(playing)restart()}if(k==='selected'){m.selected=e.target.checked;groupState()}};
$('rows').onclick=e=>{let k=e.target.dataset.k;if(k==='mute'||k==='solo'){let m=mix[e.target.closest('tr').dataset.i];m[k]=!m[k];e.target.setAttribute('aria-pressed',m[k]);gain();groupState()}};
$('group').onclick=()=>{let sel=mix.filter(m=>m.selected),v=!sel.every(m=>m.mute);sel.forEach(m=>m.mute=v);mixer()};$('all').onchange=e=>{mix.forEach(m=>m.selected=e.target.checked);mixer()};
function reset(){mix=song.tracks.map(t=>({inst:t.inst,vol:80,solo:false,mute:false,selected:false}));song.mix=mix;mixer()}$('reset').onclick=()=>{reset();if(playing)restart()};
function library(){$('filecount').textContent=songs.length;$('files').innerHTML=songs.map((s,i)=>'<button data-index="'+i+'" class="'+(s===song?'active':'')+'"><span class="fileicon">♫</span><span>'+esc(s.title)+'<small>'+s.tracks.length+' tracks · '+time(s.duration)+'</small></span></button>').join('');filterSongs()}
$('files').onclick=e=>{const b=e.target.closest('button');if(!b)return;const next=songs[+b.dataset.index];if(next===song)return;appLoading.during('Loading '+next.title+'…',()=>select(next))};
function select(s){playing=false;stopNotes();buses.forEach(g=>g.disconnect());buses=[];song=s;pos=page=cue=0;$('startBar').max=s.bars.length-1;$('startBar').value=1;scoreWorkspace.scrollTop=0;looping=false;$('loop').setAttribute('aria-pressed',false);$('play').textContent='▶　Play';$('a').max=$('b').max=s.bars.length-1;$('a').value=1;$('b').value=Math.min(4,s.bars.length-1);$('seek').max=s.duration;$('title').textContent=s.title;$('meta').textContent=s.tracks.length+' tracks　·　'+(s.bars.length-1)+' bars';if(s.mix){mix=s.mix;mixer()}else reset();library();score();display();window.dispatchEvent(new Event("pianosong"))}
function moveScore(direction){
  if(engravedView){
    scoreViewport.scrollBy({left:direction*scoreViewport.clientWidth*.85,behavior:'smooth'});
    return;
  }
  page+=direction*barsPerPage;
  scoreWorkspace.scrollTop=0;
  score();
}
$('prev').onclick=()=>moveScore(-1);
$('next').onclick=()=>moveScore(1);
$('seek').oninput=e=>seek(+e.target.value);$('home').onclick=()=>seek(cue);

function updateCue() {
  if (!song) return;
  $('startBar').value=barAt(song.beat(cue))+1;
  cursor();
}

$('cueHere').onclick=()=>{
  if (!song) return;
  cue=pos;
  updateCue();
  $('status').textContent='Start cue pinned at bar '+$('startBar').value+'.';
};
$('startBar').onchange=()=>{
  if (!song) return;
  const index=Math.min(song.bars.length-2,Math.max(0,Math.round(Number($('startBar').value)||1)-1));
  cue=song.seconds(song.bars[index].q);
  seek(cue);
  updateCue();
};
$('rate').innerHTML=[.25,.5,.65,.75,.85,.9,1,1.1,1.25,1.5,1.75,2].map(v=>'<option value="'+v+'" '+(v===1?'selected':'')+'>'+v+'×</option>').join('');$('rate').onchange=e=>{rate=+e.target.value;if(playing)restart()};
$('tempoBpm').onchange = e => {
  if (!song) return;
  const input = e.target.valueAsNumber;
  if (!Number.isFinite(input)) {
    e.target.value = Number((sourceBpm()*rate).toFixed(2));
    return;
  }
  const target = Math.max(30, Math.min(190, input));
  e.target.value = target;
  const ratio = target/sourceBpm();
  const select = $('rate');
  select.querySelector('[data-custom]')?.remove();
  let option = Array.from(select.options).find(o => Math.abs(Number(o.value)-ratio)<0.00001);
  if (!option) {
    option = new Option(Number(ratio.toFixed(3))+'×', String(ratio));
    option.dataset.custom = 'true';
    select.add(option);
  }
  select.value = option.value;
  select.onchange({target:select});
};
$('tempoBpm').onkeydown = e => {if (e.key === 'Enter') e.target.blur()};
function loopChange(){if(looping){let [a,b]=range();if(pos<a||pos>=b)seek(a);else if(playing)restart()}else if(playing)restart()}
$('loop').onclick=()=>{looping=!looping;$('loop').setAttribute('aria-pressed',looping);loopChange()};
for(const id of ['a','b'])$(id).onchange=()=>{let el=$(id);el.value=Math.max(1,Math.min(song.bars.length-1,Math.round(+el.value)||1));if(+$('a').value>+$('b').value)$(id==='a'?'b':'a').value=el.value;loopChange()};
document.addEventListener('keydown', event => {
  if (event.defaultPrevented || event.repeat || event.isComposing || event.ctrlKey ||
      event.metaKey || event.altKey || event.target.closest?.('input,select,textarea,[contenteditable],dialog,[popover]')) return;
  const action = event.code === 'Space' && event.target === document.body ? 'play' :
    event.code === 'KeyR' && !event.shiftKey ? 'home' :
    event.code === 'KeyL' && event.shiftKey ? 'loop' : '';
  if (!action) return;
  event.preventDefault();
  $(action).click();
});

let playbackClick = false;
const ticks = new Set();
function clearClicks() { for(const tick of ticks) tick.stop(); ticks.clear() }
function scheduleClicks(from,to) {
  if(!playbackClick) return;
  for(let i=barAt(song.beat(from)); i<song.bars.length-1; i++){
    const bar=song.bars[i];
    if(song.seconds(bar.q)>=to) break;
    for(let beat=0;beat<bar.n;beat++){
      const q=bar.q+beat*4/bar.d, sec=song.seconds(q);
      if(q>=song.bars[i+1].q || sec>=to) break;
      if(sec<from || origin+sec/rate < ctx.currentTime-.035) continue;
      const tick=makeClick(ctx, master, Math.max(ctx.currentTime,origin+sec/rate),beat===0);
      ticks.add(tick);tick.addEventListener('ended',()=>ticks.delete(tick),{once:true});
    }
  }
}
$('click').onclick=()=>{playbackClick=!playbackClick;$('click').setAttribute('aria-pressed',playbackClick);if(!playbackClick)clearClicks()};
$('keytoggle').onclick=e=>{const piano=document.querySelector('.piano');piano.hidden=!piano.hidden;e.currentTarget.setAttribute('aria-pressed',!piano.hidden)};
$('solosel').onclick=()=>{const sel=mix.filter(t=>t.selected),on=!sel.every(t=>t.solo);sel.forEach(t=>t.solo=on);mixer()};
function filterSongs(){const query=$('filter').value.trim().toLowerCase();for(const b of $('files').children)b.hidden=!songs[+b.dataset.index].title.toLowerCase().includes(query)}
$('filter').oninput=filterSongs;

let dbp=new Promise(resolve=>{try{const req=indexedDB.open('partbook-midi',1);req.onupgradeneeded=()=>req.result.createObjectStore('scores',{keyPath:'id'});req.onsuccess=()=>resolve(req.result);req.onerror=()=>resolve(null)}catch{resolve(null)}});
async function saveFile(item){let db=await dbp;if(!db)return false;return new Promise(resolve=>{const tx=db.transaction('scores','readwrite');tx.objectStore('scores').put(item);tx.oncomplete=()=>resolve(true);tx.onerror=tx.onabort=()=>resolve(false)})}
$('import').onclick=()=>$('upload').click();$('upload').onchange=e=>{const files=Array.from(e.target.files);if(files.length)appLoading.during('Loading '+(files.length===1?files[0].name:files.length+' MIDI files')+'…',()=>importFiles(e,files))};async function importFiles(e,files){let first,errors=[];for(const f of files){try{const data=await f.arrayBuffer(),name=f.name.replace(/\.midi?$/i,''),id=f.name+'|'+f.size+'|'+f.lastModified;let s=songs.find(t=>t.id===id);if(!s){s=parseMidi(data,name);s.id=id;songs.push(s);if(!await saveFile({id,name,data}))errors.push(f.name+' is available for this session only.')}first??=s}catch(err){errors.push(f.name+' — '+err.message)}}if(first){select(first);refreshLibrary()}$('status').textContent=errors.join(' ');e.target.value=''};
function refreshLibrary() {
  if (!song && songs.length) select(songs[0]);
  else library();
  for (const id of ['play','home','seek','rate','tempoBpm','loop','a','b','reset','all','startBar','cueHere','followScore']) $(id).disabled = !song;
  if (!song) {
    $('prev').disabled = $('next').disabled = true;
    $('title').textContent = 'Load a MIDI file';
  }
}
async function openLibrary() {
  refreshLibrary();
  const results = await Promise.allSettled(bundledSongs.map(async ([title, path]) => {
    const response = await fetch(path);
    if (!response.ok) throw new Error('Could not load ' + title);
    return parseMidi(await response.arrayBuffer(), title);
  }));
  songs.unshift(...results.filter(r => r.status === 'fulfilled').map(r => r.value));
  const failures = results.filter(r => r.status === 'rejected');
  if (failures.length) $('status').textContent = failures.map(r => r.reason.message).join(' ');
  refreshLibrary();
  window.dispatchEvent(new Event('library-ready'));
  const db = await dbp;
  if (!db) return;
  const request = db.transaction('scores').objectStore('scores').getAll();
  request.onsuccess = () => {
    for (const file of request.result) {
      if (songs.some(s => s.id === file.id)) continue;
      try {
        const restored = parseMidi(file.data, file.name);
        restored.id = file.id;
        songs.push(restored);
      } catch {}
    }
    refreshLibrary();
  };
}
openLibrary();
