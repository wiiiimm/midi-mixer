export interface ReadoutProps {
  label: string;
  valueId: string;
  defaultValue?: string;
  emphasized?: boolean;
}

export function Readout({
  label,
  valueId,
  defaultValue,
  emphasized = false,
}: ReadoutProps) {
  return (
    <div className="readout">
      <small>{label}</small>
      {emphasized ? (
        <strong id={valueId}>{defaultValue}</strong>
      ) : (
        <span id={valueId}>{defaultValue}</span>
      )}
    </div>
  );
}

export default Readout;
