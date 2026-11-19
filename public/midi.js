'use strict';
const instruments=['Piano','Electric piano','Organ','Guitar','Bass','Strings','Choir','Brass','Reed','Flute','Percussion'];
function instrument(program,ch){return ch===9?10:program<4?0:program<16?1:program<24?2:program<32?3:program<40?4:program<52?5:program<56?6:program<64?7:program<72?8:program<80?9:1}
function prepare(title,tracks,tempos=[{q:0,us:500000}],meters=[{q:0,n:4,d:4}],keys=[{q:0,sf:0,tonic:0}],markers=[]){
 keys.sort((a,b)=>a.q-b.q);
 tempos.sort((a,b)=>a.q-b.q);meters.sort((a,b)=>a.q-b.q);
 let sec=0;tempos.forEach((e,i)=>{if(i)sec+=(e.q-tempos[i-1].q)*tempos[i-1].us/1e6;e.sec=sec});
 function at(list,x,k){let l=0,r=list.length;while(l+1<r){let m=(l+r)>>1;if(list[m][k]<=x)l=m;else r=m}return list[l]}
 function seconds(q){const e=at(tempos,q,'q');return e.sec+(q-e.q)*e.us/1e6}
 function beat(s){const e=at(tempos,s,'sec');return e.q+(s-e.sec)*1e6/e.us}
 let end=0;tracks.forEach(t=>{t.notes.sort((a,b)=>a.q-b.q);for(const v of t.notes){v.s=seconds(v.q);v.e=seconds(v.q+v.len);end=Math.max(end,v.q+v.len)}});
 if(!end)throw Error('This file contains no playable notes.');
 const bars=[];for(let q=0;q<end-1e-7;){if(bars.length>=50000)throw Error('This score exceeds 50,000 bars.');let m=at(meters,q,'q'),next=meters.find(e=>e.q>q);bars.push({q,n:m.n,d:m.d});q=Math.min(q+m.n*4/m.d,next?.q??Infinity)}bars.push({q:end});return {title,tracks,tempos,bars,markers,seconds,beat,keyAt:q=>at(keys,q,'q'),end,duration:seconds(end)}
}
function parseMidi(bytes,title){
 const d=new DataView(bytes);let p=0,limit=d.byteLength;
 function read(n){if(p+n>limit)throw Error('Incomplete MIDI data.');let x=0;while(n--)x=x*256+d.getUint8(p++);return x}
 function vl(){let x=0;for(let i=0;i<4;i++){let b=read(1);x=x*128+(b&127);if(b<128)return x}throw Error('Invalid MIDI delta.')}
 if(read(4)!==0x4d546864)throw Error('Expected a standard MIDI file.');const header=read(4),format=read(2),count=read(2),ppq=read(2);if(header<6||format>1||!ppq||ppq>=32768)throw Error('Use a type 0 or 1 MIDI file with beat-based timing.');p=8+header;
 const tracks=[],tm=[{q:0,us:500000}],ms=[{q:0,n:4,d:4}],keys=[{q:0,sf:0,tonic:0}],markers=[];
 for(let i=0;i<count;i++){limit=d.byteLength;if(read(4)!==0x4d54726b)throw Error('Invalid MIDI track.');const size=read(4);limit=p+size;if(limit>d.byteLength)throw Error('Incomplete track.');let tick=0,last=0,name='';const lyrics=new Map(),channels=new Map(),active=new Map(),programs=new Array(16).fill(0);
 while(p<limit){tick+=vl();let s=read(1);if(s<128){p--;s=last;if(!s)throw Error('Invalid running status.')}if(s===255){const type=read(1),n=vl(),stop=p+n;if(stop>limit)throw Error('Incomplete MIDI event.');if(type===3||type===5||type===6){
   const text=new TextDecoder().decode(new Uint8Array(bytes,p,n)).replace(/\0/g,'').trim();
   if(type===3)name=text;
   if(type===5&&text)lyrics.set(tick/ppq,text);
   if(type===6&&text)markers.push({q:tick/ppq,text});
 }if(type===81&&n===3){const us=read(3);if(us)tm.push({q:tick/ppq,us})}if(type===88&&n>=2){const num=read(1),exp=read(1);if(num&&exp<8)ms.push({q:tick/ppq,n:num,d:2**exp})}if(type===89&&n===2){
   const sf=(read(1)<<24)>>24,minor=read(1);
   if(sf>=-7&&sf<=7&&minor<=1)keys.push({q:tick/ppq,sf,tonic:(84+7*sf+9*minor)%12});
 }p=stop;continue}
 if(s===240||s===247){const n=vl();p+=n;if(p>limit)throw Error('Invalid SysEx.');last=0;continue}if(s>=240)throw Error('Unsupported MIDI event.');last=s;const op=s>>4,ch=s&15,a=read(1),b=op===12||op===13?0:read(1),key=ch*128+a;if(op===12)programs[ch]=a;
 if(op===9&&b){if(!channels.has(ch))channels.set(ch,{inst:instrument(programs[ch],ch),notes:[]});const v={q:tick/ppq,len:.25,p:a,v:b/127};channels.get(ch).notes.push(v);if(!active.has(key))active.set(key,[]);active.get(key).push(v)}
 else if(op===8||op===9){let v=active.get(key)?.shift();if(v)v.len=Math.max(1/ppq,tick/ppq-v.q)}}
 for(const [ch,t] of channels){
 const onsets=new Set();
 for(const note of t.notes){
   onsets.add(note.q);
   if(lyrics.has(note.q))note.lyric=lyrics.get(note.q);
 }
 for(const [q,text] of lyrics){
   if(onsets.has(q))continue;
   const note=t.notes.findLast(note=>note.q<q&&q<note.q+note.len);
   if(note)(note.lyricCues??=[]).push({q,text});
 }
 t.name=(name||'Track '+(tracks.length+1))+(channels.size>1?' · Ch '+(ch+1):'');tracks.push(t)}}
 return {...prepare(title,tracks,tm,ms,keys,markers),ppq}
}
const songs = [];
