'use strict';
const $=id=>document.getElementById(id),esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const colours=['#27afe3','#9d80e6','#2ec499','#eca14c','#de7697','#8ca454'];
let song,mix=[],pos=0,page=0,rate=1,playing=false,looping=false,ctx,buses=[],master,voices=[],origin=0,scheduled=0;
const time=x=>Math.floor(x/60)+':'+String(Math.floor(x%60)).padStart(2,'0');
const playable=i=>!mix[i].mute&&(!mix.some(m=>m.solo)||mix[i].solo);
function gain(){buses.forEach((g,i)=>g.gain.setTargetAtTime(playable(i)?mix[i].vol/100:0,ctx.currentTime,.008))}
function stopNotes(){clearClicks();for(const v of voices){try{v.osc.stop()}catch{}}voices=[]}
function sound(i,n,when,dur){if(dur<=0)return;let t=mix[i].inst,osc=ctx.createOscillator(),amp=ctx.createGain(),filter=ctx.createBiquadFilter();
 osc.type=['triangle','sine','sine','sawtooth','triangle','sawtooth','triangle','sawtooth','square','sine','triangle'][t];
 osc.frequency.value=440*2**((n.p-69)/12);filter.type='lowpass';filter.frequency.value=[3600,1800,1600,1300,600,1450,850,2200,1400,3000,2000][t];
 if(t===10)osc.frequency.setTargetAtTime(50,when,.025);
 let attack=Math.min(dur/3,[.007,.01,.025,.003,.009,.075,.09,.035,.025,.035,.003][t]),peak=.17*(.2+.8*n.v);
 amp.gain.setValueAtTime(.0001,when);amp.gain.exponentialRampToValueAtTime(peak,when+attack);amp.gain.exponentialRampToValueAtTime(Math.max(.00011,peak*([0,1,3,4,10].includes(t)?Math.exp(-dur*(t===10?12:1.4)):.86)),when+dur);amp.gain.exponentialRampToValueAtTime(.0001,when+dur+.035);
 osc.connect(filter).connect(amp).connect(buses[i]);osc.start(when);osc.stop(when+dur+.04);const voice={osc,track:i,pitch:n.p,start:when,end:when+dur};voices.push(voice);osc.onended=()=>{osc.disconnect();filter.disconnect();amp.disconnect();let j=voices.indexOf(voice);if(j>=0)voices.splice(j,1)}}
function barAt(q){let l=0,r=song.bars.length-1;while(l+1<r){let m=(l+r)>>1;if(song.bars[m].q<=q)l=m;else r=m}return l}
function range(){const v=song.bars;const clampBar=(value,fallback)=>Math.max(1,Math.min(v.length-1,Math.round(Number(value))||fallback));const a=clampBar($('a').value,1),b=Math.max(a,clampBar($('b').value,a));return [song.seconds(v[a-1].q),song.seconds(v[b].q)]}
function restart(){stopNotes();origin=ctx.currentTime-pos/rate;scheduled=pos;const end=looping?range()[1]:song.duration;
 song.tracks.forEach((t,i)=>{for(const n of t.notes){if(n.s>=pos)break;if(n.e>pos)sound(i,n,ctx.currentTime,(Math.min(n.e,end)-pos)/rate)}});schedule()}
function schedule(){if(!playing)return;const end=looping?range()[1]:song.duration;pos=Math.min(end,Math.max(0,(ctx.currentTime-origin)*rate));if(pos>=end-.00001){if(looping){pos=range()[0];restart()}else{playing=false;stopNotes();$('play').textContent='▶　Play'}return}
 const horizon=Math.min(end,pos+.13*rate);song.tracks.forEach((t,i)=>{let l=0,r=t.notes.length;while(l<r){let m=(l+r)>>1;if(t.notes[m].s<scheduled)l=m+1;else r=m}for(let k=l;k<t.notes.length&&t.notes[k].s<horizon;k++){let n=t.notes[k],start=Math.max(n.s,pos);sound(i,n,origin+start/rate,(Math.min(n.e,end)-start)/rate)}});scheduleClicks(scheduled,horizon);scheduled=horizon}
setInterval(schedule,32);
function seek(s){pos=Math.min(song.duration,Math.max(0,s));if(playing&&looping&&(pos<range()[0]||pos>=range()[1]))pos=range()[0];page=Math.floor(barAt(song.beat(pos))/4)*4;if(playing)restart();score();display()}
async function enableAudio(){if(!ctx){ctx=new (window.AudioContext||window.webkitAudioContext)();master=ctx.createDynamicsCompressor();master.connect(ctx.destination)}if(ctx.state!=='running')await ctx.resume()}
$('play').onclick=async()=>{if(playing){playing=false;stopNotes();$('play').textContent='▶　Play';return}try{await enableAudio();if(!buses.length){buses=mix.map(()=>{let g=ctx.createGain();g.connect(master);return g});gain()}if(pos>=song.duration||(looping&&(pos<range()[0]||pos>=range()[1])))pos=looping?range()[0]:0;playing=true;restart();$('play').textContent='Ⅱ　Pause'}catch(e){$('status').textContent=e.message}};
function score(){const bars=song.bars,count=Math.min(4,bars.length-1-page),w=772/count,h=42+song.tracks.length*78,svg=$('score');svg.setAttribute('viewBox','0 0 960 '+h);svg.setAttribute('preserveAspectRatio','none');svg.style.height=h+'px';
 let s='<rect width="960" height="'+h+'" fill="#f5f8fb"/><rect width="960" height="32" fill="#111d30"/>';const line=(x,y,x2,y2,col='#98929a',width=.8)=>'<path d="M'+x+' '+y+' L'+x2+' '+y2+'" stroke="'+col+'" stroke-width="'+width+'"/>';
 for(let j=0;j<count;j++)s+='<text x="'+(168+j*w)+'" y="21" fill="#bed1df" font-size="11">'+(page+j+1)+'</text>';
 song.tracks.forEach((t,i)=>{const top=52+i*78,c=colours[i%colours.length],sample=t.notes.slice(0,80),bass=sample.reduce((a,n)=>a+n.p,0)/sample.length<58,ref=bass?18:30;let clef=clefs[bass?'bass':'treble'],ch=bass?26:48,k=ch/(clef[4]-clef[2]);s+='<circle cx="21" cy="'+(top+14)+'" r="4" fill="'+c+'"/><text x="31" y="'+(top+18)+'" font-weight="600" font-size="13"><title>'+esc(t.name)+'</title>'+esc(t.name.length>10?t.name.slice(0,9)+'…':t.name)+'</text>';
 for(let j=0;j<5;j++)s+=line(116,top+j*7,940,top+j*7);s+='<path d="'+clef[0]+'" transform="translate('+(119-clef[1]*k)+' '+(top+(bass?0:-9)+clef[4]*k)+') scale('+k+' '+(-k)+')" fill="#33303b"/>';
 for(let j=0;j<count;j++){const b=bars[page+j],end=bars[page+j+1].q,x=168+j*w,changed=j===0||bars[page+j-1].n!==b.n||bars[page+j-1].d!==b.d;if(changed)s+='<text text-anchor="end" x="'+(x-5)+'" y="'+(top+13)+'" font-family="serif" font-size="17" font-weight="bold">'+b.n+'<tspan x="'+(x-5)+'" dy="14">'+b.d+'</tspan></text>';s+=line(x,top,x,top+28);
 let seen=false;for(const n of t.notes){if(n.q>=end)break;if(n.q+n.len<=b.q)continue;seen=true;let xx=x+14+(Math.max(n.q,b.q)-b.q)/(end-b.q)*(w-20),pc=n.p%12,step=Math.floor(n.p/12-1)*7+[0,0,1,1,2,3,3,4,4,5,5,6][pc],y=top+28-(step-ref)*3.5,down=y<top+14,dy=down?22:-22,stem=xx+(down?-4.2:4.2),len=Math.min(end,n.q+n.len)-Math.max(n.q,b.q);for(let ly=top-7;ly>=y;ly-=7)s+=line(xx-7,ly,xx+7,ly);for(let ly=top+35;ly<=y;ly+=7)s+=line(xx-7,ly,xx+7,ly);if([1,3,6,8,10].includes(pc))s+='<text x="'+(xx-13)+'" y="'+(y+4)+'" font-size="12">♯</text>';s+='<ellipse cx="'+xx+'" cy="'+y+'" rx="5" ry="3.2" transform="rotate(-19 '+xx+' '+y+')" fill="'+(len>=1.9?'white':'#302c36')+'" stroke="#302c36"/>';if(len<3.9){s+=line(stem,y,stem,y+dy,'#302c36',1.3);for(let f=0;f<(len<.37?2:len<.8?1:0);f++)s+='<path d="M'+stem+' '+(y+dy+(down?-4:4)*f)+' q 8 '+(down?-4:4)+' 5 '+(down?-11:11)+'" fill="none" stroke="#302c36" stroke-width="2"/>'}if([.75,1.5,3].some(v=>Math.abs(len-v)<.035))s+='<circle cx="'+(xx+8)+'" cy="'+(y-1.8)+'" r="1.4"/>'}if(!seen)s+='<rect x="'+(x+w/2-4)+'" y="'+(top+7)+'" width="8" height="3"/>'}
 s+=line(940,top,940,top+28);if(i<song.tracks.length-1)s+=line(15,top+56,943,top+56,'#eeeaf0')});
 svg.innerHTML=s+'<g id="cursor" pointer-events="none"><path d="M-4 25h8l-4 6z" fill="#00ad81"/>'+line(0,30,0,h-10,'#00ad81',1.5)+'</g>';$('bars').textContent='Bars '+(page+1)+'–'+(page+count);$('prev').disabled=page===0;$('next').disabled=page+count>=bars.length-1;cursor()}
function cursor(){const q=song.beat(pos),idx=barAt(q),c=$('cursor');if(!c)return;c.style.display=idx<page||idx>=page+4?'none':'';let w=772/Math.min(4,song.bars.length-1-page);let b=song.bars[idx].q,end=song.bars[idx+1].q;c.setAttribute('transform','translate('+(168+(idx-page)*w+14+(q-b)/(end-b)*(w-20))+' 0)')}
$('score').onclick=e=>{const r=$('score').getBoundingClientRect(),x=(e.clientX-r.left)/r.width*960;if(x<165)return;const count=Math.min(4,song.bars.length-1-page),w=772/count,j=Math.min(count-1,Math.max(0,Math.floor((x-168)/w))),b=song.bars[page+j].q,d=song.bars[page+j+1].q-b;seek(song.seconds(b+Math.max(0,Math.min(.999,(x-168-j*w-14)/(w-20)))*d))};
function display(){if(!song)return;const q=song.beat(pos),i=barAt(q),bar=song.bars[i];$('beatpos').textContent=(i+1)+' : '+Math.min(bar.n,1+Math.floor((q-bar.q)*bar.d/4));$('seek').value=pos;$('clock').textContent=time(pos)+' / '+time(song.duration);cursor()}
setInterval(()=>{if(playing){let p=Math.floor(barAt(song.beat(pos))/4)*4;if(p!==page){page=p;score()}}display()},70);
function groupState(){let sel=mix.filter(m=>m.selected);$('solosel').disabled=!sel.length;$('solosel').textContent=sel.length&&sel.every(t=>t.solo)?'Unsolo selected':'Solo selected';$('group').disabled=!sel.length;$('group').textContent=sel.length&&sel.every(m=>m.mute)?'Unmute selected':'Mute selected';$('all').checked=sel.length===mix.length;$('all').indeterminate=sel.length>0&&sel.length<mix.length}
function mixer(){$('rows').innerHTML=mix.map((m,i)=>{let name=esc(song.tracks[i].name);return '<tr data-i="'+i+'"><td><input type="checkbox" data-k="selected" aria-label="Select '+name+'" '+(m.selected?'checked':'')+'></td><td><strong><i class="dot" style="background:'+colours[i%colours.length]+'"></i>'+name+'</strong></td><td><select data-k="inst" aria-label="'+name+' instrument">'+instruments.map((v,k)=>'<option value="'+k+'" '+(k===m.inst?'selected':'')+'>'+v+'</option>').join('')+'</select></td><td><input type="range" data-k="vol" aria-label="'+name+' volume" min="0" max="100" value="'+m.vol+'"><output>'+m.vol+'%</output></td><td>'+['solo','mute'].map(k=>'<button title="'+k+' '+name+'" aria-label="'+k+' '+name+'" data-k="'+k+'" aria-pressed="'+m[k]+'">'+k[0].toUpperCase()+'</button>').join('')+'</td></tr>'}).join('');groupState();gain()}
$('rows').oninput=e=>{let k=e.target.dataset.k,m=mix[e.target.closest('tr').dataset.i];if(k==='vol'){m.vol=+e.target.value;e.target.nextElementSibling.value=m.vol+'%';gain()}if(k==='inst'){m.inst=+e.target.value;if(playing)restart()}if(k==='selected'){m.selected=e.target.checked;groupState()}};
$('rows').onclick=e=>{let k=e.target.dataset.k;if(k==='mute'||k==='solo'){let m=mix[e.target.closest('tr').dataset.i];m[k]=!m[k];e.target.setAttribute('aria-pressed',m[k]);gain();groupState()}};
$('group').onclick=()=>{let sel=mix.filter(m=>m.selected),v=!sel.every(m=>m.mute);sel.forEach(m=>m.mute=v);mixer()};$('all').onchange=e=>{mix.forEach(m=>m.selected=e.target.checked);mixer()};
function reset(){mix=song.tracks.map(t=>({inst:t.inst,vol:80,solo:false,mute:false,selected:false}));song.mix=mix;mixer()}$('reset').onclick=()=>{reset();if(playing)restart()};
function library(){$('filecount').textContent=songs.length;$('files').innerHTML=songs.map((s,i)=>'<button data-index="'+i+'" class="'+(s===song?'active':'')+'"><span class="fileicon">♫</span><span>'+esc(s.title)+'<small>'+s.tracks.length+' tracks · '+time(s.duration)+'</small></span></button>').join('');filterSongs()}
$('files').onclick=e=>{const b=e.target.closest('button');if(b)select(songs[+b.dataset.index])};
function select(s){playing=false;stopNotes();buses.forEach(g=>g.disconnect());buses=[];song=s;pos=page=0;looping=false;$('loop').setAttribute('aria-pressed',false);$('play').textContent='▶　Play';$('a').max=$('b').max=s.bars.length-1;$('a').value=1;$('b').value=Math.min(4,s.bars.length-1);$('seek').max=s.duration;$('title').textContent=s.title;$('meta').textContent=s.tracks.length+' tracks　·　'+(s.bars.length-1)+' bars　·　'+Math.round(6e7/s.tempos.filter(e=>e.q===0).at(-1).us)+' BPM';if(s.mix){mix=s.mix;mixer()}else reset();library();score();display();window.dispatchEvent(new Event("pianosong"))}
$('prev').onclick=()=>{page-=4;score()};$('next').onclick=()=>{page+=4;score()};$('seek').oninput=e=>seek(+e.target.value);$('home').onclick=()=>seek(looping?range()[0]:0);
$('rate').innerHTML=[.25,.5,.65,.75,.85,.9,1,1.1,1.25,1.5,1.75,2].map(v=>'<option value="'+v+'" '+(v===1?'selected':'')+'>'+v+'×</option>').join('');$('rate').onchange=e=>{rate=+e.target.value;if(playing)restart()};
function loopChange(){if(looping){let [a,b]=range();if(pos<a||pos>=b)seek(a);else if(playing)restart()}else if(playing)restart()}
$('loop').onclick=()=>{looping=!looping;$('loop').setAttribute('aria-pressed',looping);loopChange()};
for(const id of ['a','b'])$(id).onchange=()=>{let el=$(id);el.value=Math.max(1,Math.min(song.bars.length-1,Math.round(+el.value)||1));if(+$('a').value>+$('b').value)$(id==='a'?'b':'a').value=el.value;loopChange()};
document.onkeydown=e=>{if(e.code==='Space'&&e.target===document.body){e.preventDefault();$('play').click()}};

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
$('popmetro').onclick=e=>{if(e.metaKey||e.ctrlKey||e.shiftKey)return;const win=window.open(e.currentTarget.href,'midiMixerMetronome','popup,width=390,height=450');if(win){e.preventDefault();win.focus()}};
$('keytoggle').onclick=e=>{const piano=document.querySelector('.piano');piano.hidden=!piano.hidden;e.currentTarget.setAttribute('aria-pressed',!piano.hidden)};
$('solosel').onclick=()=>{const sel=mix.filter(t=>t.selected),on=!sel.every(t=>t.solo);sel.forEach(t=>t.solo=on);mixer()};
function filterSongs(){const query=$('filter').value.trim().toLowerCase();for(const b of $('files').children)b.hidden=!songs[+b.dataset.index].title.toLowerCase().includes(query)}
$('filter').oninput=filterSongs;

let dbp=new Promise(resolve=>{try{const req=indexedDB.open('partbook-midi',1);req.onupgradeneeded=()=>req.result.createObjectStore('scores',{keyPath:'id'});req.onsuccess=()=>resolve(req.result);req.onerror=()=>resolve(null)}catch{resolve(null)}});
async function saveFile(item){let db=await dbp;if(!db)return false;return new Promise(resolve=>{const tx=db.transaction('scores','readwrite');tx.objectStore('scores').put(item);tx.oncomplete=()=>resolve(true);tx.onerror=tx.onabort=()=>resolve(false)})}
$('import').onclick=()=>$('upload').click();$('upload').onchange=async e=>{let first,errors=[];for(const f of Array.from(e.target.files)){try{const data=await f.arrayBuffer(),name=f.name.replace(/\.midi?$/i,''),id=f.name+'|'+f.size+'|'+f.lastModified;let s=songs.find(t=>t.id===id);if(!s){s=parseMidi(data,name);s.id=id;songs.push(s);if(!await saveFile({id,name,data}))errors.push(f.name+' is available for this session only.')}first??=s}catch(err){errors.push(f.name+' — '+err.message)}}if(first)select(first);$('status').textContent=errors.join(' ');e.target.value=''};
select(songs[0]);dbp.then(db=>{if(!db)return;const req=db.transaction('scores').objectStore('scores').getAll();req.onsuccess=()=>{for(const f of req.result){try{if(songs.some(s=>s.id===f.id))continue;const s=parseMidi(f.data,f.name);s.id=f.id;songs.push(s)}catch{}}library()}});
