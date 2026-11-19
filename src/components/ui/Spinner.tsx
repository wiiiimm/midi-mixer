export interface SpinnerProps {
  className?: string;
}

export function Spinner({ className = '' }: SpinnerProps) {
  const classes = ['spinner', className].filter(Boolean).join(' ');
  return <span className={classes} aria-hidden="true" />;
}

export default Spinner;
