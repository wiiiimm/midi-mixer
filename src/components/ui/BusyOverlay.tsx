import { Spinner } from './Spinner';

export interface BusyOverlayProps {
  id?: string;
  textId?: string;
  defaultMessage?: string;
  hidden?: boolean;
}

export function BusyOverlay({
  id = 'scoreBusy',
  textId = 'scoreBusyText',
  defaultMessage = 'Loading…',
  hidden = true,
}: BusyOverlayProps) {
  return (
    <div id={id} className="score-busy" role="status" aria-live="polite" hidden={hidden}>
      <Spinner />
      <span id={textId}>{defaultMessage}</span>
    </div>
  );
}

export default BusyOverlay;
