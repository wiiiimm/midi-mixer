export interface DrawerTabItem {
  id: string;
  panelId: string;
  label: string;
}

export interface DrawerTabsProps {
  tabs: DrawerTabItem[];
  activeTabId: string;
  ariaLabel?: string;
  className?: string;
}

export function DrawerTabs({
  tabs,
  activeTabId,
  ariaLabel = 'Menu sections',
  className = '',
}: DrawerTabsProps) {
  const classes = ['drawer-tabs', className].filter(Boolean).join(' ');

  return (
    <div className={classes} role="tablist" aria-label={ariaLabel}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={tab.id}
          aria-controls={tab.panelId}
          aria-selected={tab.id === activeTabId}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export default DrawerTabs;
