import { gmFamilies } from '../audio/sampler';
import { $ } from '../lib/dom';

// One searchable dialog serves every instrument <select>: a trigger button with
// data-instrument-select="<select id>" opens it, and choosing an item updates the
// hidden select and dispatches an `input` event on it.

function editDistance(a: string, b: string): number {
  let row = Array.from({length: b.length + 1}, (_, i) => i), earlier: number[] = [];
  for (let i = 0; i < a.length; i++) {
    const next = [i + 1];
    for (let j = 0; j < b.length; j++) {
      const transpose = i > 0 && j > 0 && a[i] === b[j - 1] && a[i - 1] === b[j] ? earlier[j - 1] + 1 : Infinity;
      next.push(Math.min(next[j] + 1, row[j + 1] + 1, row[j] + Number(a[i] !== b[j]), transpose));
    }
    earlier = row;
    row = next;
  }
  return row[b.length];
}

/** Lower is better; Infinity means no match. Tolerates small typos. */
function rank(name: string, words: string[]): number {
  let score = 0;
  for (const word of words) {
    const index = name.indexOf(word);
    if (index >= 0) {
      score += index === 0 ? 0 : 2;
      continue;
    }
    let position = 0;
    for (const character of name) if (character === word[position]) position++;
    if (position === word.length) {
      score += 5;
      continue;
    }
    if (word.length < 3) return Infinity;
    const distance = Math.min(...name.split(' ').map(part => editDistance(word, part.slice(0, word.length))),
      editDistance(word, name.replaceAll(' ', '').slice(0, word.length)));
    if (distance > (word.length < 6 ? 1 : 2)) return Infinity;
    score += 7 + distance;
  }
  return score;
}

export function initInstrumentPicker(): void {
  const dialog = $<HTMLDialogElement>('instrumentDialog');
  const search = $<HTMLInputElement>('instrumentSearch');
  const results = $('instrumentResults');
  let source: HTMLSelectElement | null = null, trigger: HTMLElement | null = null;

  function showResults() {
    if (!source) return;
    const words = search.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const matches = [...source.options]
      .map(option => ({option, score: rank(option.text.toLowerCase(), words)}))
      .filter(match => Number.isFinite(match.score))
      .sort((a, b) => a.score - b.score);
    // With no filter, show the General MIDI families as section headings.
    const grouped = !words.length;
    let family = -1;
    const rows: HTMLElement[] = [];
    for (const {option} of matches) {
      const value = Number(option.value), group = value >= 128 ? 16 : Math.floor(value / 8);
      if (grouped && group !== family) {
        family = group;
        const heading = document.createElement('div');
        heading.className = 'picker-group';
        heading.textContent = group === 16 ? 'Drums' : gmFamilies[group];
        rows.push(heading);
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.value = option.value;
      button.textContent = option.text;
      button.setAttribute('aria-pressed', String(option.selected));
      rows.push(button);
    }
    results.replaceChildren(...rows);
    const empty = $('instrumentEmpty');
    empty.textContent = 'No matching instruments.';
    empty.hidden = matches.length > 0;
  }

  function choose(button: HTMLElement | null) {
    if (!button || !source || !trigger) return;
    if (!source.isConnected || !trigger.isConnected) {
      // The mixer was rebuilt (e.g. an import finished) while the picker was open.
      results.replaceChildren();
      const notice = $('instrumentEmpty');
      notice.textContent = 'This track list changed. Close and reopen the instrument picker.';
      notice.hidden = false;
      return;
    }
    source.value = button.dataset.value!;
    const name = source.selectedOptions[0].text;
    if (source.id === 'pianoVoice') trigger.textContent = 'Sound: ' + name;
    else {
      trigger.textContent = name;
      trigger.setAttribute('aria-label', trigger.dataset.track + ' instrument: ' + name);
    }
    source.dispatchEvent(new Event('input', {bubbles: true}));
    dialog.close();
  }

  document.addEventListener('click', event => {
    const button = (event.target as Element).closest<HTMLElement>('[data-instrument-select]');
    if (!button) return;
    const select = document.getElementById(button.dataset.instrumentSelect!) as HTMLSelectElement | null;
    if (!select?.options.length) return;
    source = select;
    trigger = button;
    search.value = '';
    showResults();
    dialog.showModal();
    // Scrolling the list is the main way to pick; only desktop gets the filter focused.
    const selected = results.querySelector<HTMLElement>('[aria-pressed=true]');
    selected?.scrollIntoView({block: 'nearest'});
    (matchMedia('(pointer: fine)').matches ? search : selected ?? dialog).focus({preventScroll: true});
  });

  search.addEventListener('input', showResults);
  results.addEventListener('click', event => choose((event.target as Element).closest<HTMLElement>('[data-value]')));
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Enter' && event.target === search) {
      event.preventDefault();
      choose(results.querySelector('button'));
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const buttons = [...results.querySelectorAll<HTMLElement>('button')];
    const index = buttons.indexOf(document.activeElement as HTMLElement);
    if (index < 0 && event.target !== search) return;
    event.preventDefault();
    const next = index + (event.key === 'ArrowDown' ? 1 : -1);
    (buttons[next] ?? (next === -1 ? search : buttons.at(-1)))?.focus();
  });
}
