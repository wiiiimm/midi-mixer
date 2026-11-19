import { InstrumentPickerTrigger, SelectField, ToggleButton } from '../ui';

export function SoundCheckPiano() {
  return (
    <section className="piano">
      <div className="panelhead">
        <h2>▥　Sound check piano</h2>
        <div className="octaves">
          <button id="lowerKeys" type="button" aria-label="Scroll one octave lower">
            −8ve
          </button>
          <span id="keysRange" className="keys-range" aria-live="polite" />
          <button id="higherKeys" type="button" aria-label="Scroll one octave higher">
            +8ve
          </button>
        </div>
        <ToggleButton
          id="sustain"
          pressed={false}
          title="Hold notes after release. Turn off to release them."
        >
          Sustain
        </ToggleButton>
        <InstrumentPickerTrigger
          wrapperClassName="piano-sound"
          selectId="pianoVoice"
          defaultLabel="Sound: Acoustic grand piano"
        />
        <SelectField
          label="Shortcut octave"
          labelClassName="shortcut-octave"
          id="octave"
          aria-label="Piano starting octave"
        />
      </div>
      <div className="pianoscroll">
        <div id="keys" aria-label="Practice piano keys" />
      </div>
    </section>
  );
}

export default SoundCheckPiano;
