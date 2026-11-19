import { Fragment } from 'react';

export interface ShortcutItem {
  action: string;
  keys: string[];
}

export interface ShortcutGuideProps {
  summary?: string;
  shortcuts: ShortcutItem[];
  defaultOpen?: boolean;
  className?: string;
}

export function ShortcutGuide({
  summary = 'Keyboard shortcuts',
  shortcuts,
  defaultOpen = true,
  className = '',
}: ShortcutGuideProps) {
  const classes = ['shortcut-guide', className].filter(Boolean).join(' ');

  return (
    <details className={classes} open={defaultOpen}>
      <summary>{summary}</summary>
      <dl>
        {shortcuts.map((item) => (
          <div key={item.action}>
            <dt>{item.action}</dt>
            <dd>
              {item.keys.map((key, index) => (
                <Fragment key={`${item.action}-${key}`}>
                  {index > 0 ? ' ' : null}
                  <kbd>{key}</kbd>
                </Fragment>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

export default ShortcutGuide;
