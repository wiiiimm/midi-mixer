'use strict';

(() => {
  const pitch = $('tuningPitch');
  const play = $('tuningPlay');
  const panel = $('tuningFork');
  let tone, generation = 0;
  for (let note = 48; note < 84; note++) {
    pitch.add(new Option(sharpNames[note % 12] + (Math.floor(note / 12) - 1), note, note === 69, note === 69));
  }
  const frequency = () => 440 * 2 ** ((Number(pitch.value) - 69) / 12);
  function updatePitch() {
    const hz = frequency();
    $('tuningFrequency').textContent = 'Pure tone · ' + Number(hz.toFixed(2)) + ' Hz';
    if (tone) tone.osc.frequency.setTargetAtTime(hz, ctx.currentTime, .015);
  }
  function stopTone() {
    generation++;
    if (tone) {
      const {osc, gain} = tone;
      tone = undefined;
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(0, now, .015);
      osc.stop(now + .09);
    }
    play.textContent = 'Play tone';
  }
  play.onclick = async () => {
    if (tone) {
      stopTone();
      return;
    }
    const request = ++generation;
    $('tuningError').textContent = '';
    try {
      await enableAudio();
      if (request !== generation || !panel.matches(':popover-open')) return;
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = frequency();
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.setTargetAtTime(.12, ctx.currentTime, .025);
      osc.connect(gain).connect(master);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
      osc.start();
      tone = {osc, gain};
      play.textContent = 'Stop tone';
    } catch (error) {
      $('tuningError').textContent = error.message;
    }
  };
  pitch.onchange = updatePitch;
  panel.addEventListener('beforetoggle', event => { if (event.newState === 'closed') stopTone(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopTone(); });
  updatePitch();
})();

(() => {
  const dialog = $('instrumentDialog');
  const search = $('instrumentSearch');
  const results = $('instrumentResults');
  let source, trigger;

  function editDistance(a,b) {
    let row = Array.from({length:b.length+1},(_,i)=>i), earlier;
    for (let i=0;i<a.length;i++) {
      const next = [i+1];
      for (let j=0;j<b.length;j++) {
        const transpose = i>0 && j>0 && a[i]===b[j-1] && a[i-1]===b[j]
          ? earlier[j-1]+1 : Infinity;
        next.push(Math.min(next[j]+1,row[j+1]+1,row[j]+Number(a[i]!==b[j]),transpose));
      }
      earlier=row;
      row=next;
    }
    return row[b.length];
  }

  function rank(name, words) {
    let score=0;
    for (const word of words) {
      const index=name.indexOf(word);
      if (index>=0) {
        score+=index===0 ? 0 : 2;
        continue;
      }
      let position=0;
      for (const character of name) {
        if (character===word[position]) position++;
      }
      if (position===word.length) {
        score+=5;
        continue;
      }
      if (word.length<3) return Infinity;
      const distance=Math.min(...name.split(' ').map(part=>editDistance(word,part.slice(0,word.length))),
        editDistance(word,name.replaceAll(' ','').slice(0,word.length)));
      if (distance>(word.length<6 ? 1 : 2)) return Infinity;
      score+=7+distance;
    }
    return score;
  }

  function showResults() {
    const words=search.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const matches=[...source.options]
      .map(option=>({option,score:rank(option.text.toLowerCase(),words)}))
      .filter(match=>Number.isFinite(match.score))
      .sort((a,b)=>a.score-b.score);
    results.replaceChildren(...matches.map(({option})=>{
      const button=document.createElement('button');
      button.type='button';
      button.dataset.value=option.value;
      button.textContent=option.text;
      button.setAttribute('aria-pressed',option.selected);
      return button;
    }));
    $('instrumentEmpty').hidden=matches.length>0;
  }

  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-instrument-select]');
    if (!button) return;
    const select=$(button.dataset.instrumentSelect);
    if (!select?.options.length) return;
    source=select;
    trigger=button;
    search.value='';
    showResults();
    dialog.showModal();
    search.focus();
  });

  function choose(button) {
    if (!button) return;
    source.value=button.dataset.value;
    const name=source.selectedOptions[0].text;
    if (source.id==='pianoVoice') trigger.textContent='Sound: '+name;
    else {
      trigger.textContent=name;
      const label=trigger.getAttribute('aria-label').split(': ')[0];
      trigger.setAttribute('aria-label',label+': '+name);
    }
    source.dispatchEvent(new Event('input',{bubbles:true}));
    dialog.close();
  }

  search.oninput=showResults;
  results.onclick=event=>choose(event.target.closest('[data-value]'));
  dialog.addEventListener('keydown',event=>{
    if (event.key==='Enter' && event.target===search) {
      event.preventDefault();
      choose(results.querySelector('button'));
    }
    if (event.key!=='ArrowDown' && event.key!=='ArrowUp') return;
    const buttons=[...results.querySelectorAll('button')];
    const index=buttons.indexOf(document.activeElement);
    if (index<0 && event.target!==search) return;
    event.preventDefault();
    const next=index+(event.key==='ArrowDown' ? 1 : -1);
    (buttons[next] ?? (next===-1 ? search : buttons.at(-1)))?.focus();
  });
})();
