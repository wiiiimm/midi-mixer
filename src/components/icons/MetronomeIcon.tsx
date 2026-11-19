export interface IconProps {
  className?: string;
}

export function MetronomeIcon({ className = 'tool-icon' }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M9.5 3h5L20 20H4L9.5 3Z M7 16h10 M11 15l7-11" />
      <path d="m14.3 8.1 2 1.2" strokeWidth="2.6" />
    </svg>
  );
}

export default MetronomeIcon;
