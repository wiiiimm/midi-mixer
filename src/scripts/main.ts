// Studio entry point. Modules export init functions and this file calls them in
// a fixed order, so there are no import-time side effects to reason about.
import { initShortcuts } from './lib/shortcuts';
import { initPwa } from './ui/pwa';
import { initScoreZoom } from './ui/score-zoom';
import { blockPagePinchZoom } from './ui/page-zoom';
import { initBrand, playBrandScale } from './ui/brand';
import { initFloatingWindows } from './ui/floating-windows';
import { initInstrumentPicker } from './ui/instrument-picker';
import { initLayout } from './ui/layout';
import { initLoading, startupStepDone } from './ui/loading';
import { initLibrary, openLibrary } from './studio/library';
import { initMixer } from './studio/mixer';
import { initPlayback } from './studio/playback';
import { setEngraver } from './studio/score';
import { initSections } from './studio/sections';
import { initTransport } from './studio/transport';
import { initEditor } from './studio/editor';
import { initMetronomeWindow } from './tools/metronome-window';
import { initPiano } from './tools/piano';
import { initPitchDetector } from './tools/pitch-detector';
import { initTuningFork } from './tools/tuning-fork';

initShortcuts();
initLoading();
initFloatingWindows();
initPlayback();
initTransport();
initEditor();
blockPagePinchZoom();
initScoreZoom();
initSections();
initMixer();
initLibrary();
initPiano();
initTuningFork();
initPitchDetector();
initMetronomeWindow();
initInstrumentPicker();
initLayout();
initBrand();
initPwa();

openLibrary().finally(() => {
  startupStepDone('library');
  setTimeout(playBrandScale, 400);
});

// The engraver (with the large Verovio build) loads in its own chunk.
import('./score/engraver')
  .then(module => module.createEngraver())
  .then(setEngraver)
  .catch(error => console.error('Score engraving is unavailable', error))
  .finally(() => startupStepDone('engraver'));
