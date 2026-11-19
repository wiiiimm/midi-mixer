export interface InstrumentPickerTriggerProps {
  selectId: string;
  defaultLabel: string;
  wrapperClassName?: string;
  buttonClassName?: string;
}

export function InstrumentPickerTrigger({
  selectId,
  defaultLabel,
  wrapperClassName,
  buttonClassName = '',
}: InstrumentPickerTriggerProps) {
  const buttonClasses = ['instrument-picker', buttonClassName].filter(Boolean).join(' ');
  const content = (
    <>
      <button
        type="button"
        className={buttonClasses}
        aria-haspopup="dialog"
        data-instrument-select={selectId}
      >
        {defaultLabel}
      </button>
      <select id={selectId} hidden />
    </>
  );

  if (wrapperClassName) {
    return <div className={wrapperClassName}>{content}</div>;
  }

  return content;
}

export default InstrumentPickerTrigger;
