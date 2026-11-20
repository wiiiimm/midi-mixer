import { $, esc } from '../lib/dom';
import type { Song } from '../lib/types';
import { type Section, songSections } from '../midi/sections';
import { studio } from './state';
import { cueRange } from './transport';

// Section chips (V1, C1, Bridge…) from the song's MIDI markers. A chip jumps to the
// section, pins the start cue there and sets loop A–B to the section's bars, so
// turning Loop on repeats just that section.

let sections: Section[] = [];
let selected = -1;

function chips() {
  return [...$('sections').children] as HTMLButtonElement[];
}

function select(index: number) {
  selected = index;
  chips().forEach((chip, i) => chip.setAttribute('aria-pressed', String(i === index)));
}

/** Shows the sections of `song`, or hides the group if it has none. */
export function renderSections(song: Song | null): void {
  sections = song ? songSections(song) : [];
  $('sections').innerHTML = sections.map((s, i) => {
    const bars = s.firstBar === s.lastBar ? 'bar ' + s.firstBar : 'bars ' + s.firstBar + '–' + s.lastBar;
    return '<button type="button" class="section-chip" data-index="' + i + '" aria-pressed="false" title="' +
      esc(s.name + ' · ' + bars) + '" aria-label="' + esc(s.name + ', ' + bars) + '">' + esc(s.label) + '</button>';
  }).join('');
  $('sections').closest<HTMLElement>('.section-group')!.hidden = !sections.length;
  selected = -1;
  markPlaying();
}

/** Marks the chip of the section under the playhead. */
function markPlaying() {
  const song = studio.song;
  const q = song ? song.beat(studio.pos) : -1;
  const index = sections.findLastIndex(s => s.start <= q + 1e-6);
  chips().forEach((chip, i) => chip.classList.toggle('now', i === index && q < sections[i].end));
}

export function initSections(): void {
  $('sections').addEventListener('click', event => {
    const chip = (event.target as Element).closest<HTMLButtonElement>('.section-chip');
    const song = studio.song;
    if (!chip || !song) return;
    const index = Number(chip.dataset.index), section = sections[index];
    cueRange(song.seconds(section.start), section.firstBar, section.lastBar);
    select(index);
    markPlaying();
    const bars = section.firstBar === section.lastBar ? 'bar ' + section.firstBar : 'bars ' + section.firstBar + '–' + section.lastBar;
    $('status').textContent = section.name + ' cued (' + bars + ').' + (studio.looping ? ' Looping this section.' : ' Turn on Loop to repeat it.');
  });
  // Editing the loop bars by hand means the chip no longer describes the loop.
  for (const id of ['a', 'b']) $(id).addEventListener('change', () => select(-1));
  setInterval(markPlaying, 150);
}
