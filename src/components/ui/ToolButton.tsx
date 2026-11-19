import type { ButtonHTMLAttributes, ReactNode } from 'react';

export interface ToolButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-controls' | 'aria-expanded'> {
  controls: string;
  expanded?: boolean;
  icon?: ReactNode;
  label: string;
}

export function ToolButton({
  controls,
  expanded = false,
  icon,
  label,
  title,
  className = '',
  type = 'button',
  ...rest
}: ToolButtonProps) {
  const classes = ['tool-button', className].filter(Boolean).join(' ');

  return (
    <button
      type={type}
      className={classes}
      aria-haspopup="dialog"
      aria-controls={controls}
      aria-expanded={expanded}
      title={title ?? label}
      {...rest}
    >
      {icon}
      {icon ? ' ' : null}
      <span className="label">{label}</span>
    </button>
  );
}

export default ToolButton;
