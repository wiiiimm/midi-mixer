import type { IconProps } from './MetronomeIcon';

export function TuningForkIcon({ className = 'tool-icon' }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M7 3v7a5 5 0 0 0 10 0V3 M12 15v6 M10 21h4" />
    </svg>
  );
}

export default TuningForkIcon;
