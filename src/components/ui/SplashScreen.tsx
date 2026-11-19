import { KeysLogo } from '../icons';
import { Spinner } from './Spinner';

export interface SplashScreenProps {
  id?: string;
  statusId?: string;
  title?: string;
  subtitle?: string;
  statusText?: string;
}

export function SplashScreen({
  id = 'splash',
  statusId = 'splashStatus',
  title = 'midi-mixer',
  subtitle = 'Rehearsal Studio',
  statusText = 'Loading songs and notation…',
}: SplashScreenProps) {
  return (
    <div id={id} className="splash" role="status" aria-live="polite">
      <div className="splash-card">
        <KeysLogo play="loop" className="logo" />
        <strong>{title}</strong>
        <small>{subtitle}</small>
        <Spinner />
        <span id={statusId}>{statusText}</span>
      </div>
    </div>
  );
}

export default SplashScreen;
