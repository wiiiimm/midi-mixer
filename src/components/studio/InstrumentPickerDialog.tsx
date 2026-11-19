export interface InstrumentPickerDialogProps {
  id?: string;
  title?: string;
  placeholder?: string;
  emptyText?: string;
}

export function InstrumentPickerDialog({
  id = 'instrumentDialog',
  title = 'Choose an instrument',
  placeholder = 'Filter (optional)',
  emptyText = 'No matching instruments.',
}: InstrumentPickerDialogProps) {
  return (
    <dialog id={id} aria-labelledby="instrumentTitle">
      <form method="dialog" className="instrument-heading">
        <h2 id="instrumentTitle">{title}</h2>
        <button aria-label="Close instrument picker">×</button>
      </form>
      <label htmlFor="instrumentSearch" className="visually-hidden">
        Filter instruments
      </label>
      <input
        type="search"
        id="instrumentSearch"
        placeholder={placeholder}
        autoComplete="off"
      />
      <div id="instrumentResults" />
      <p id="instrumentEmpty" role="status" hidden>
        {emptyText}
      </p>
    </dialog>
  );
}

export default InstrumentPickerDialog;
