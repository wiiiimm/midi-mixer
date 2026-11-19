'use strict';
(() => {
  const panel = document.getElementById('metroPanel');
  const handle = document.getElementById('metroHandle');
  const opener = document.getElementById('popmetro');
  const body = document.getElementById('metroBody');
  let drag;
  function place(x,y) {
    const maxX = Math.max(0,document.documentElement.clientWidth - panel.offsetWidth);
    const maxY = Math.max(0,window.innerHeight - panel.offsetHeight);
    panel.style.left = Math.max(0,Math.min(x,maxX)) + 'px';
    panel.style.top = Math.max(0,Math.min(y,maxY)) + 'px';
  }
  function close() {
    panel.close();
    body.replaceChildren();
    opener.setAttribute('aria-expanded','false');
    opener.focus();
  }
  opener.onclick = () => {
    if(panel.open){close();return}
    const frame = document.createElement('iframe');
    frame.title = 'Metronome controls';
    frame.src = './metronome.html?embedded';
    body.append(frame);
    panel.show();
    const bounds = opener.getBoundingClientRect();
    place(panel.style.left ? panel.offsetLeft : bounds.right-panel.offsetWidth,
          panel.style.top ? panel.offsetTop : bounds.bottom+8);
    opener.setAttribute('aria-expanded','true');
  };
  document.getElementById('closeMetro').onclick = close;
  handle.onpointerdown = e => {
    if(e.button!==0 || e.target.closest('button')) return;
    drag = {id:e.pointerId,x:e.clientX-panel.offsetLeft,y:e.clientY-panel.offsetTop};
    handle.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  handle.onpointermove = e => {if(drag?.id===e.pointerId)place(e.clientX-drag.x,e.clientY-drag.y)};
  handle.onlostpointercapture = () => {drag=null};
  window.addEventListener('resize',()=>{if(panel.open)place(panel.offsetLeft,panel.offsetTop)});
  window.addEventListener('keydown',e=>{if(e.key==='Escape'&&panel.open)close()});
  window.addEventListener('message',e=>{if(panel.open && e.source===body.firstChild?.contentWindow && e.origin===location.origin && e.data==='close-metronome')close()});
})();
