import {
  Brand,
  DrawerTabs,
  ShortcutGuide,
  type DrawerTabItem,
  type ShortcutItem,
} from '../ui';

const DRAWER_TABS: DrawerTabItem[] = [
  { id: 'tab-songs', panelId: 'panel-songs', label: 'Songs' },
  { id: 'tab-practice', panelId: 'panel-practice', label: 'Practice' },
  { id: 'tab-mix', panelId: 'panel-mix', label: 'Mix' },
];

const STUDIO_SHORTCUTS: ShortcutItem[] = [
  { action: 'Play / Pause', keys: ['Space'] },
  { action: 'Natural notes', keys: ["A–'"] },
  { action: 'Sharps / flats', keys: ['W–P'] },
  { action: 'Octave down / up', keys: ['Z', 'X'] },
  { action: 'Return to cue', keys: ['R'] },
  { action: 'Toggle loop', keys: ['Shift', 'L'] },
];

export function SidebarDrawer() {
  return (
    <>
      <aside id="drawer" className="sidebar" aria-label="Library and rehearsal settings">
        <Brand
          title="midi-mixer"
          subtitle="Rehearsal Studio"
          logoPlay="hover"
          logoClassName="logo"
          action={
            <button
              id="closeDrawer"
              className="drawer-close"
              type="button"
              aria-label="Close menu"
            >
              ×
            </button>
          }
        />
        <DrawerTabs tabs={DRAWER_TABS} activeTabId="tab-songs" />
        <section
          id="panel-songs"
          className="drawer-panel songs-panel"
          role="tabpanel"
          aria-labelledby="tab-songs"
        >
          <button id="import" type="button" className="import">
            ＋ Load MIDI files
          </button>
          <input hidden type="file" id="upload" accept=".mid,.midi,audio/midi" multiple />
          <input type="search" placeholder="Filter songs…" aria-label="Filter songs" id="filter" />
          <div className="libhead">
            Rehearsal playlist <span id="filecount" />
          </div>
          <nav id="files" />
          <footer className="sidebar-footer">
            <ShortcutGuide shortcuts={STUDIO_SHORTCUTS} />
            <div className="local">Imported files stay on this device.</div>
          </footer>
        </section>
        <section
          id="panel-practice"
          className="drawer-panel practice-panel"
          role="tabpanel"
          aria-labelledby="tab-practice"
          hidden
        />
        <section
          id="panel-mix"
          className="drawer-panel mix-panel"
          role="tabpanel"
          aria-labelledby="tab-mix"
          hidden
        />
      </aside>
      <div id="scrim" className="scrim" hidden />
    </>
  );
}

export default SidebarDrawer;
