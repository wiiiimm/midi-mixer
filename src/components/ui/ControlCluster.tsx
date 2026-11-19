import type { ReactNode } from 'react';

export interface ControlClusterProps {
  className?: string;
  mobileHome?: 'practice' | 'mix';
  mobileHeading?: string;
  children: ReactNode;
}

export function ControlCluster({
  className = '',
  mobileHome,
  mobileHeading,
  children,
}: ControlClusterProps) {
  const classes = ['cluster', className].filter(Boolean).join(' ');

  return (
    <div
      className={classes}
      data-mobile-home={mobileHome}
      data-mobile-heading={mobileHeading}
    >
      {children}
    </div>
  );
}

export default ControlCluster;
