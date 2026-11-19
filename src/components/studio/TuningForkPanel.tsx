import { TuningForkIcon } from '../icons';
import { FloatingWindow } from '../ui';

export function TuningForkPanel() {
  return (
    <FloatingWindow
      id="tuningFork"
      titleId="tuningTitle"
      title="Tuning fork"
      icon={<TuningForkIcon />}
      closeLabel="Close tuning fork"
    >
      <div className="float-body tuner">
        <div className="tuner-readout" aria-live="polite">
          <strong id="tuningNote">A4</strong>
          <output id="tuningFrequency" htmlFor="tuningPitch" />
        </div>
        <div className="tuner-keys" id="tuningKeys" role="group" aria-label="Choose a note" />
        <div className="tuner-octave">
          <button id="tuningOctDown" type="button" aria-label="Octave down">
            −
          </button>
          <span>
            Octave <b id="tuningOctave">4</b>
          </span>
          <button id="tuningOctUp" type="button" aria-label="Octave up">
            +
          </button>
        </div>
        <button id="tuningPlay" type="button">
          Play tone
        </button>
        <select id="tuningPitch" hidden aria-hidden="true" tabIndex={-1} />
        <p className="tuner-hint">Tap a key to hear it · ← → semitone · ↑ ↓ octave</p>
        <p id="tuningError" role="status" />
      </div>
    </FloatingWindow>
  );
}

export default TuningForkPanel;
