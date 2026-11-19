import type { ReactNode } from 'react';

export interface FloatingWindowProps {
  id: string;
  titleId: string;
  title: string;
  icon?: ReactNode;
  closeLabel: string;
  handleId?: string;
  closeId?: string;
  className?: string;
  children: ReactNode;
}

export function FloatingWindow({
  id,
  titleId,
  title,
  icon,
  closeLabel,
  handleId,
  closeId,
  className = '',
  children,
}: FloatingWindowProps) {
  const classes = ['floating', className].filter(Boolean).join(' ');

  return (
    <dialog id={id} className={classes} aria-labelledby={titleId}>
      <div id={handleId} className="float-handle">
        <strong id={titleId}>
          {icon}
          {icon ? ' ' : null}
          {title}
        </strong>
        <button id={closeId} type="button" className="float-close" aria-label={closeLabel}>
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}

export default FloatingWindow;
