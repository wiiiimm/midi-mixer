export interface BeatLightsProps {
  count: number;
  activeIndex?: number;
  id?: string;
  className?: string;
}

export function BeatLights({
  count,
  activeIndex = -1,
  id = 'lights',
  className = '',
}: BeatLightsProps) {
  const classes = ['beats', className].filter(Boolean).join(' ');

  return (
    <div className={classes} id={id} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <i key={index} className={index === activeIndex ? 'active' : undefined} />
      ))}
    </div>
  );
}

export default BeatLights;
