import type { InputHTMLAttributes } from 'react';

export interface NumberFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  labelClassName?: string;
}

export function NumberField({
  label,
  labelClassName,
  ...inputProps
}: NumberFieldProps) {
  return (
    <label className={labelClassName}>
      {label} <input type="number" {...inputProps} />
    </label>
  );
}

export default NumberField;
