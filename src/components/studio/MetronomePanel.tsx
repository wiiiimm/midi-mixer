import { MetronomeIcon } from '../icons';
import { FloatingWindow } from '../ui';

export function MetronomePanel() {
  return (
    <FloatingWindow
      id="metroPanel"
      titleId="metroTitle"
      title="Metronome"
      icon={<MetronomeIcon />}
      closeLabel="Close metronome"
      handleId="metroHandle"
      closeId="closeMetro"
    >
      <div id="metroBody" />
    </FloatingWindow>
  );
}

export default MetronomePanel;
