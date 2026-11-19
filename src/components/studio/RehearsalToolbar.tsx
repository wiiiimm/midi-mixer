import { MetronomeIcon, TuningForkIcon } from '../icons';
import {
  ControlCluster,
  NumberField,
  SelectField,
  ToggleButton,
  ToolButton,
  type SelectOption,
} from '../ui';

const STAFF_LABEL_OPTIONS: SelectOption[] = [
  { value: 'none', label: 'None' },
  { value: 'note', label: 'Note names' },
  { value: 'solfa', label: 'Sol-fa' },
];

export function RehearsalToolbar() {
  return (
    <div className="toolbar">
      <ControlCluster className="loop-group" mobileHome="practice" mobileHeading="Loop">
        <ToggleButton id="loop" pressed={false}>
          ⟳ Loop
        </ToggleButton>
        <NumberField label="A" id="a" min={1} defaultValue={1} />
        <NumberField label="B" id="b" min={1} defaultValue={4} />
      </ControlCluster>

      <ControlCluster className="cue-controls" mobileHome="practice" mobileHeading="Cue">
        <NumberField label="Start bar" id="startBar" min={1} defaultValue={1} disabled />
        <button id="cueHere" type="button" disabled>
          Cue Here
        </button>
      </ControlCluster>

      <ControlCluster className="staff-group" mobileHome="practice" mobileHeading="Score">
        <SelectField
          label="Staff labels"
          id="staffLabels"
          options={STAFF_LABEL_OPTIONS}
          defaultValue="none"
        />
      </ControlCluster>

      <ControlCluster className="view-tools">
        <div className="pager">
          <button id="prev" type="button" aria-label="Scroll to earlier bars">
            ‹
          </button>
          <span id="bars" />
          <button id="next" type="button" aria-label="Scroll to later bars">
            ›
          </button>
        </div>
        <ToggleButton id="followScore" pressed={true}>
          Follow
        </ToggleButton>
        <ToggleButton id="keytoggle" pressed={true} icon="▥" label="Keys" />
        <span className="tool-divider" aria-hidden="true" />
        <ToolButton
          id="popmetro"
          controls="metroPanel"
          icon={<MetronomeIcon />}
          label="Metronome"
        />
        <ToolButton
          id="openTuning"
          controls="tuningFork"
          icon={<TuningForkIcon />}
          label="Tuning fork"
        />
      </ControlCluster>
    </div>
  );
}

export default RehearsalToolbar;
