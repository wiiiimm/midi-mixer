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
  $('sections').closest<HTMLElement>('.section-bar')!.hidden = !sections.length;
  $('sections').scrollLeft = 0;
  selected = -1;
  playingIndex = -1;
  markPlaying();
}

/** Scrolls the chip row (not the page) so `chip` is fully visible. */
function reveal(chip: HTMLElement) {
  const row = $('sections'), edge = 28;
  const left = chip.offsetLeft, right = left + chip.offsetWidth;
  if (left < row.scrollLeft + edge) row.scrollTo({left: left - edge, behavior: 'smooth'});
  else if (right > row.scrollLeft + row.clientWidth - edge) row.scrollTo({left: right - row.clientWidth + edge, behavior: 'smooth'});
}

let playingIndex = -1;

/** Marks the chip of the section under the playhead, keeping it in view while playing. */
function markPlaying() {
  const song = studio.song;
  const q = song ? song.beat(studio.pos) : -1;
  let index = sections.findLastIndex(s => s.start <= q + 1e-6);
  if (index >= 0 && q >= sections[index].end) index = -1;
  chips().forEach((chip, i) => chip.classList.toggle('now', i === index));
  if (index !== playingIndex) {
    playingIndex = index;
    if (index >= 0 && studio.playing) reveal(chips()[index]);
  }
}

export function initSections(): void {
  $('sections').addEventListener('click', event => {
    const chip = (event.target as Element).closest<HTMLButtonElement>('.section-chip');
    const song = studio.song;
    if (!chip || !song) return;
    const index = Number(chip.dataset.index), section = sections[index];
    cueRange(song.seconds(section.start), section.firstBar, section.lastBar);
    select(index);
    reveal(chip);
    markPlaying();
    const bars = section.firstBar === section.lastBar ? 'bar ' + section.firstBar : 'bars ' + section.firstBar + '–' + section.lastBar;
    $('status').textContent = section.name + ' cued (' + bars + ').' + (studio.looping ? ' Looping this section.' : ' Turn on Loop to repeat it.');
  });
  // Editing the loop bars by hand means the chip no longer describes the loop.
  for (const id of ['a', 'b']) $(id).addEventListener('change', () => select(-1));
  // A vertical mouse wheel scrolls the row sideways (trackpads already scroll it).
  $('sections').addEventListener('wheel', event => {
    const row = $('sections');
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX) || row.scrollWidth <= row.clientWidth) return;
    event.preventDefault();
    row.scrollLeft += event.deltaY;
  }, {passive: false});
  // After a resize (e.g. rotating a phone), bring the chosen or playing section back into view.
  window.addEventListener('resize', () => {
    const chip = chips()[selected >= 0 ? selected : playingIndex];
    if (chip) reveal(chip);
  });
  setInterval(markPlaying, 150);
}
