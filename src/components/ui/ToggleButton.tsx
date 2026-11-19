import type { ButtonHTMLAttributes, ReactNode } from 'react';

export interface ToggleButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-pressed'> {
  pressed?: boolean;
  icon?: ReactNode;
  label?: string;
}

export function ToggleButton({
  pressed = false,
  icon,
  label,
  type = 'button',
  children,
  ...rest
}: ToggleButtonProps) {
  return (
    <button type={type} aria-pressed={pressed} {...rest}>
      {icon}
      {icon && label ? ' ' : null}
      {label ? <span className="label">{label}</span> : null}
      {children}
    </button>
  );
}

export default ToggleButton;
