import type { SelectHTMLAttributes } from 'react';

export interface SelectOption {
  value: string | number;
  label: string;
}

export interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options?: SelectOption[];
  labelClassName?: string;
  /** Render `<label htmlFor={id}>` as a sibling before `<select>` instead of wrapping it. */
  separateLabel?: boolean;
}

export function SelectField({
  label,
  options,
  labelClassName,
  separateLabel = false,
  id,
  children,
  ...selectProps
}: SelectFieldProps) {
  const selectEl = (
    <select id={id} {...selectProps}>
      {options
        ? options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))
        : children}
    </select>
  );

  if (separateLabel) {
    return (
      <>
        <label htmlFor={id} className={labelClassName}>
          {label}
        </label>
        {selectEl}
      </>
    );
  }

  return (
    <label className={labelClassName}>
      {label} {selectEl}
    </label>
  );
}

export default SelectField;
