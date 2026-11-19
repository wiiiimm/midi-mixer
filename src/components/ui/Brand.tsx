import type { ReactNode } from 'react';
import { KeysLogo, type KeysLogoProps } from '../icons';

export interface BrandProps {
  title?: string;
  subtitle?: string;
  logoPlay?: KeysLogoProps['play'];
  logoClassName?: string;
  className?: string;
  action?: ReactNode;
}

export function Brand({
  title = 'midi-mixer',
  subtitle,
  logoPlay,
  logoClassName = 'logo',
  className = '',
  action,
}: BrandProps) {
  const classes = ['brand', className].filter(Boolean).join(' ');

  return (
    <div className={classes}>
      <KeysLogo play={logoPlay} className={logoClassName} />
      {subtitle ? (
        <div>
          {title}
          <small>{subtitle}</small>
        </div>
      ) : (
        <> {title}</>
      )}
      {action}
    </div>
  );
}

export default Brand;
