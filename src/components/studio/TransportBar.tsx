import { MetronomeIcon } from '../icons';
import { ControlCluster, NumberField, Readout, SelectField, ToggleButton } from '../ui';

export function TransportBar() {
  return (
    <header className="transport">
      <button
        id="menuToggle"
        className="menu-toggle"
        type="button"
        aria-controls="drawer"
        aria-expanded="false"
        aria-label="Open menu"
      >
        <span />
        <span />
        <span />
      </button>

      <ControlCluster className="playback">
        <button id="home" type="button" aria-label="Return to start cue">
          Ⅰ◀
        </button>
        <button id="play" type="button">
          ▶ Play
        </button>
        <ToggleButton id="click" pressed={false} icon={<MetronomeIcon />} label="Click" />
      </ControlCluster>

      <div className="song">
        <h1 id="title" />
        <small id="meta" />
      </div>

      <div className="readouts">
        <Readout label="BAR : BEAT" valueId="beatpos" defaultValue="1 : 1" emphasized />
        <Readout label="TIME" valueId="clock" />
      </div>

      <ControlCluster className="tempo-group" mobileHome="practice" mobileHeading="Tempo">
        <NumberField
          label="BPM"
          id="tempoBpm"
          min={30}
          max={190}
          step="any"
          aria-label="Playback tempo in BPM"
        />
        <SelectField label="Speed" id="rate" aria-label="Playback speed" />
      </ControlCluster>
    </header>
  );
}

export default TransportBar;
