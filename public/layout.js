'use strict';
// Responsive shell: on narrow screens the sidebar becomes a slide-out drawer
// and secondary controls move into its Practice / Mix tabs. The same DOM nodes
// are moved (not cloned), so ids and event handlers keep working.
(() => {
  const $ = id => document.getElementById(id);
  const drawer = $('drawer'), scrim = $('scrim'), toggle = $('menuToggle');
  const main = document.querySelector('main');
  const compact = matchMedia('(max-width: 860px), (max-width: 1000px) and (max-height: 500px)');
  const tabs = [...drawer.querySelectorAll('[role=tab]')];
  const panels = {songs: $('panel-songs'), practice: $('panel-practice'), mix: $('panel-mix')};

  // Remember where each movable block lives on desktop.
  const movable = [...document.querySelectorAll('[data-mobile-home]')].map(el => {
    const anchor = document.createComment('home:' + el.className);
    el.before(anchor);
    let wrap = el;
    if (el.dataset.mobileHeading) {
      wrap = document.createElement('div');
      wrap.className = 'drawer-group';
      const heading = document.createElement('h3');
      heading.textContent = el.dataset.mobileHeading;
      wrap.append(heading);
    }
    return {el, anchor, wrap, home: panels[el.dataset.mobileHome]};
  });

  function arrange() {
    for (const m of movable) {
      if (compact.matches) {
        if (m.wrap !== m.el) m.wrap.append(m.el);
        m.home.append(m.wrap);
      } else {
        m.anchor.after(m.el);
        if (m.wrap !== m.el) m.wrap.remove();
      }
    }
    if (!compact.matches) setOpen(false, false);
    syncInert();
  }

  function syncInert() {
    const open = compact.matches && drawer.classList.contains('open');
    main.inert = open;
    drawer.inert = compact.matches && !open;
    scrim.hidden = !open;
  }

  function setOpen(open, focus = true) {
    drawer.classList.toggle('open', open);
    document.body.classList.toggle('drawer-open', open && compact.matches);
    toggle.setAttribute('aria-expanded', open);
    syncInert();
    if (!focus) return;
    if (open) (drawer.querySelector('[role=tab][aria-selected=true]') || drawer).focus();
    else toggle.focus();
  }

  function selectTab(name, focus) {
    for (const tab of tabs) {
      const on = tab.id === 'tab-' + name;
      tab.setAttribute('aria-selected', on);
      tab.tabIndex = on ? 0 : -1;
      panels[tab.id.slice(4)].hidden = !on;
      if (on && focus) tab.focus();
    }
  }

  toggle.addEventListener('click', () => setOpen(!drawer.classList.contains('open')));
  $('closeDrawer').addEventListener('click', () => setOpen(false));
  scrim.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && drawer.classList.contains('open') && !document.querySelector('dialog[open]:modal')) setOpen(false);
  });
  drawer.querySelector('.drawer-tabs').addEventListener('click', e => {
    const tab = e.target.closest('[role=tab]');
    if (tab) selectTab(tab.id.slice(4));
  });
  drawer.querySelector('.drawer-tabs').addEventListener('keydown', e => {
    const step = {ArrowRight: 1, ArrowLeft: -1}[e.key];
    if (!step) return;
    const i = tabs.findIndex(t => t.getAttribute('aria-selected') === 'true');
    selectTab(tabs[(i + step + tabs.length) % tabs.length].id.slice(4), true);
    e.preventDefault();
  });
  // Picking a song should reveal the score again.
  $('files').addEventListener('click', e => {
    if (compact.matches && e.target.closest('button')) setOpen(false, false);
  });
  // Swipe left on the open drawer to dismiss it.
  let swipe;
  drawer.addEventListener('touchstart', e => {
    const t = e.touches[0];
    swipe = {x: t.clientX, y: t.clientY};
  }, {passive: true});
  drawer.addEventListener('touchend', e => {
    if (!swipe) return;
    const t = e.changedTouches[0], dx = t.clientX - swipe.x, dy = t.clientY - swipe.y;
    swipe = null;
    if (dx < -60 && Math.abs(dx) > Math.abs(dy) * 1.5 && !e.target.closest('input[type=range]')) setOpen(false, false);
  }, {passive: true});

  compact.addEventListener('change', arrange);
  selectTab('songs');
  arrange();
})();

// Brand mark plays a quick scale on load, on hover and whenever playback starts.
(() => {
  const mark = document.querySelector('.brand .keys-hover');
  if (!mark) return;
  let timer;
  function playScale() {
    mark.classList.remove('playing');
    void mark.getBoundingClientRect(); // restart the CSS animation
    mark.classList.add('playing');
    clearTimeout(timer);
    timer = setTimeout(() => mark.classList.remove('playing'), 2500); // run + stagger
  }
  mark.closest('.brand').addEventListener('pointerenter', playScale);
  document.getElementById('play').addEventListener('click', () => setTimeout(() => {
    if (/pause/i.test(document.getElementById('play').textContent)) playScale();
  }, 50));
  window.addEventListener('library-ready', () => setTimeout(playScale, 400), {once: true});
})();
