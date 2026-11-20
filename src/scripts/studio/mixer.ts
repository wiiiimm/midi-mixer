import { loadInstrument, whenInstrumentsReady } from '../audio/sampler';
import { $, esc } from '../lib/dom';
import { trackColours } from '../lib/notes';
import type { MixChannel, Song, Track } from '../lib/types';
import { DRUM_KIT, instruments } from '../midi/parse';
import { whileBusy } from '../ui/loading';
import { applyGains, restart } from './playback';
import { studio } from './state';

// Track mixer: instrument, volume, solo and mute per track, plus bulk actions
// on the selected tracks.

const CHOIR_AAHS = 52, VOICE_OOHS = 53;
let soundRevision = 0;

type VocalPreset = number | 'by-part';

function vocalProgram(track: Track, preset: VocalPreset): number {
  if (typeof preset === 'number') return preset;
  if (/\b(tenors?|baritones?|bass(?:es)?|men|male)\b/i.test(track.name)) return CHOIR_AAHS;
  if (/\b(sopranos?|altos?|trebles?|descants?)\b/i.test(track.name)) return VOICE_OOHS;
  const pitches = track.notes.map(note => note.p).sort((a, b) => a - b);
  return pitches[Math.floor(pitches.length / 2)] < 58 ? CHOIR_AAHS : VOICE_OOHS;
}

const vocalPresets = [
  ['voiceOohs', VOICE_OOHS],
  ['choirAahs', CHOIR_AAHS],
  ['vocalsByPart', 'by-part'],
] as const;

function updateVocalControls(): void {
  const song = studio.song;
  if (!song) return;
  const melodicTracks = song.tracks.filter(track => track.inst !== DRUM_KIT);
  for (const [id, preset] of vocalPresets) {
    const button = $<HTMLButtonElement>(id);
    button.disabled = melodicTracks.length === 0;
    button.setAttribute('aria-pressed', String(!button.disabled && song.tracks.every((track, index) =>
      track.inst === DRUM_KIT || studio.mix[index].inst === vocalProgram(track, preset))));
  }
  $<HTMLButtonElement>('resetSounds').disabled = song.tracks.every((track, index) =>
    studio.mix[index].inst === track.inst);
}

function refreshPlaybackSounds(programs: number[]): void {
  const revision = ++soundRevision, mix = studio.mix;
  if (!studio.playing) {
    for (const program of new Set(programs)) void loadInstrument(program);
    return;
  }
  const currentPrograms = mix.map(channel => channel.inst);
  void whileBusy('Loading instrument sounds…', () => whenInstrumentsReady(currentPrograms, 12000)).then(() => {
    if (revision === soundRevision && studio.mix === mix && studio.playing) restart();
  });
}

function applyTrackSounds(preset?: VocalPreset): void {
  const song = studio.song;
  if (!song) return;
  const changed: number[] = [];
  song.tracks.forEach((track, index) => {
    const channel = studio.mix[index];
    if (preset !== undefined && track.inst === DRUM_KIT) return;
    const program = preset === undefined ? track.inst : vocalProgram(track, preset);
    if (channel.inst === program) return;
    channel.inst = program;
    changed.push(program);
  });
  if (!changed.length) return;
  renderMixer();
  refreshPlaybackSounds(changed);
}

function groupState() {
  const selected = studio.mix.filter(m => m.selected);
  const solo = $<HTMLButtonElement>('solosel'), mute = $<HTMLButtonElement>('group'), all = $<HTMLInputElement>('all');
  solo.disabled = mute.disabled = !selected.length;
  solo.textContent = selected.length && selected.every(m => m.solo) ? 'Unsolo selected' : 'Solo selected';
  mute.textContent = selected.length && selected.every(m => m.mute) ? 'Unmute selected' : 'Mute selected';
  all.checked = selected.length === studio.mix.length;
  all.indeterminate = selected.length > 0 && selected.length < studio.mix.length;
}

function row(song: Song, m: MixChannel, i: number): string {
  const name = esc(song.tracks[i].name), sound = esc(instruments[m.inst]);
  const options = instruments.map((label, k) => '<option value="' + k + '" ' + (k === m.inst ? 'selected' : '') + '>' + label + '</option>').join('');
  const toggles = (['solo', 'mute'] as const).map(k =>
    '<button title="' + k + ' ' + name + '" aria-label="' + k + ' ' + name + '" data-k="' + k + '" aria-pressed="' + m[k] + '">' + k[0].toUpperCase() + '</button>').join('');
  return '<tr data-i="' + i + '">' +
    '<td><input type="checkbox" data-k="selected" aria-label="Select ' + name + '" ' + (m.selected ? 'checked' : '') + '></td>' +
    '<td><strong><i class="dot" style="background:' + trackColours[i % trackColours.length] + '"></i>' + name + '</strong></td>' +
    '<td><button type="button" class="instrument-picker" aria-haspopup="dialog" aria-label="' + name + ' instrument: ' + sound +
      '" data-instrument-select="trackInstrument' + i + '">' + sound + '</button>' +
      '<select hidden id="trackInstrument' + i + '" data-k="inst">' + options + '</select></td>' +
    '<td><input type="range" data-k="vol" aria-label="' + name + ' volume" min="0" max="100" value="' + m.vol + '"><output>' + m.vol + '%</output></td>' +
    '<td>' + toggles + '</td></tr>';
}

export function renderMixer(): void {
  const song = studio.song;
  if (!song) return;
  $('rows').innerHTML = studio.mix.map((m, i) => row(song, m, i)).join('');
  groupState();
  updateVocalControls();
  applyGains();
}

/** Uses the song's remembered mix, or a fresh one from its MIDI instruments. */
export function useMixFor(song: Song): void {
  studio.mix = song.mix ?? (song.mix = freshMix(song));
  renderMixer();
}

const freshMix = (song: Song): MixChannel[] =>
  song.tracks.map(track => ({inst: track.inst, vol: 80, solo: false, mute: false, selected: false}));

const channelOf = (target: Element) => studio.mix[Number(target.closest('tr')!.dataset.i)];

export function initMixer(): void {
  for (const [id, preset] of vocalPresets) $(id).addEventListener('click', () => applyTrackSounds(preset));
  $('resetSounds').addEventListener('click', () => applyTrackSounds());
  const rows = $('rows');
  rows.addEventListener('input', event => {
    const target = event.target as HTMLInputElement, m = channelOf(target);
    switch (target.dataset.k) {
      case 'vol':
        m.vol = Number(target.value);
        (target.nextElementSibling as HTMLOutputElement).value = m.vol + '%';
        applyGains();
        break;
      case 'inst':
        m.inst = Number(target.value);
        updateVocalControls();
        refreshPlaybackSounds([m.inst]);
        break;
      case 'selected':
        m.selected = target.checked;
        groupState();
        break;
    }
  });
  rows.addEventListener('click', event => {
    const target = event.target as HTMLElement, key = target.dataset.k;
    if (key !== 'mute' && key !== 'solo') return;
    const m = channelOf(target);
    m[key] = !m[key];
    target.setAttribute('aria-pressed', String(m[key]));
    applyGains();
    groupState();
  });
  $('group').addEventListener('click', () => {
    const selected = studio.mix.filter(m => m.selected), mute = !selected.every(m => m.mute);
    selected.forEach(m => { m.mute = mute; });
    renderMixer();
  });
  $('solosel').addEventListener('click', () => {
    const selected = studio.mix.filter(m => m.selected), solo = !selected.every(m => m.solo);
    selected.forEach(m => { m.solo = solo; });
    renderMixer();
  });
  $<HTMLInputElement>('all').addEventListener('change', event => {
    const checked = (event.target as HTMLInputElement).checked;
    studio.mix.forEach(m => { m.selected = checked; });
    renderMixer();
  });
  $('reset').addEventListener('click', () => {
    const song = studio.song;
    if (!song) return;
    song.mix = freshMix(song);
    useMixFor(song);
    if (studio.playing) refreshPlaybackSounds(studio.mix.map(channel => channel.inst));
  });
}
