'use strict';

(() => {
  const pitch = $('tuningPitch');
  const play = $('tuningPlay');
  const panel = $('tuningFork');
  let tone, generation = 0;
  const lowest = 36, highest = 95; // C2–B6
  for (let note = lowest; note <= highest; note++) {
    pitch.add(new Option(sharpNames[note % 12] + (Math.floor(note / 12) - 1), note, note === 69, note === 69));
  }
  // One-octave keyboard: white keys in a row, black keys laid over the gaps.
  const keys = $('tuningKeys');
  const whiteIndex = {0:0, 2:1, 4:2, 5:3, 7:4, 9:5, 11:6};
  const keyNames = ['C','C sharp','D','D sharp','E','F','F sharp','G','G sharp','A','A sharp','B'];
  for (let pc = 0; pc < 12; pc++) {
    const key = document.createElement('button');
    key.type = 'button';
    key.dataset.pc = pc;
    const black = !(pc in whiteIndex);
    key.className = black ? 'black' : 'white';
    key.textContent = black ? '' : sharpNames[pc];
    key.setAttribute('aria-label', keyNames[pc]);
    if (black) key.style.left = 'calc(' + (whiteIndex[pc - 1] + 1) + ' * 100% / 7)';
    keys.append(key);
  }
  const current = () => Number(pitch.value);
  function setPitch(note, sound) {
    pitch.value = Math.max(lowest, Math.min(highest, note));
    updatePitch();
    if (sound && !tone) play.onclick();
  }
  keys.onclick = e => {
    const key = e.target.closest('[data-pc]');
    if (!key) return;
    const octaveBase = current() - current() % 12;
    setPitch(octaveBase + Number(key.dataset.pc), true);
  };
  $('tuningOctDown').onclick = () => setPitch(current() - 12);
  $('tuningOctUp').onclick = () => setPitch(current() + 12);
  panel.addEventListener('keydown', e => {
    if (e.target.closest('select,input')) return;
    const step = {ArrowLeft: -1, ArrowRight: 1, ArrowDown: -12, ArrowUp: 12}[e.key];
    if (!step) return;
    e.preventDefault();
    setPitch(current() + step);
    keys.querySelector('[aria-pressed=true]')?.focus();
  });
  const frequency = () => 440 * 2 ** ((Number(pitch.value) - 69) / 12);
  function updatePitch() {
    const hz = frequency();
    const note = current();
    $('tuningFrequency').textContent = Number(hz.toFixed(2)) + ' Hz';
    $('tuningNote').textContent = sharpNames[note % 12];
    $('tuningOctave').textContent = Math.floor(note / 12) - 1;
    $('tuningOctDown').disabled = note - 12 < lowest;
    $('tuningOctUp').disabled = note + 12 > highest;
    for (const key of keys.children) key.setAttribute('aria-pressed', Number(key.dataset.pc) === note % 12);
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
    panel.classList.remove('sounding');
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
      if (request !== generation || !panel.open) return;
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
      panel.classList.add('sounding');
    } catch (error) {
      $('tuningError').textContent = error.message;
    }
  };
  pitch.onchange = updatePitch;
  floatingWindows.register({panel, opener: $('openTuning'), onClose: stopTone});
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
    // With no filter, show the General MIDI families as section headings.
    const grouped=!words.length;
    let family=-1;
    const rows=[];
    for (const {option} of matches) {
      const value=Number(option.value), group=value>=128 ? 16 : Math.floor(value/8);
      if (grouped && group!==family) {
        family=group;
        const heading=document.createElement('div');
        heading.className='picker-group';
        heading.textContent=group===16 ? 'Drums' : gmSampler.families[group];
        rows.push(heading);
      }
      const button=document.createElement('button');
      button.type='button';
      button.dataset.value=option.value;
      button.textContent=option.text;
      button.setAttribute('aria-pressed',option.selected);
      rows.push(button);
    }
    results.replaceChildren(...rows);
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
    // Scrolling the list is the main way to pick; only desktop gets the filter focused.
    const selected=results.querySelector('[aria-pressed=true]');
    selected?.scrollIntoView({block:'nearest'});
    (matchMedia('(pointer: fine)').matches ? search : selected ?? dialog).focus({preventScroll:true});
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
