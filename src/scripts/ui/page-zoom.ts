// Stops pinch gestures from zooming the whole page, so the controls stay put while
// you play. The score has its own pinch zoom (score-zoom.ts), which keeps working.
//
// - Chrome, Edge, Firefox and Safari on iOS 13+ honour `touch-action: pan-x pan-y`
//   (set on every element in the page's CSS), which allows scrolling but not pinching
//   or double-tap zooming.
// - Safari on iPhone and iPad ignores `user-scalable=no`, and doesn't always apply
//   touch-action, so its gesture events are cancelled here too. On a Mac they are the
//   trackpad pinch.
// - Chrome, Edge and Firefox report a trackpad pinch as Ctrl+wheel.
//
// Keyboard zoom (Ctrl/⌘ with + or −), browser text size and the operating system's
// zoom tools are left alone, so people who need larger text can still have it.

export function blockPagePinchZoom(): void {
  const cancel = (event: Event) => event.preventDefault();
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, cancel, {passive: false});
  }
  document.addEventListener('wheel', event => { if (event.ctrlKey) event.preventDefault(); }, {passive: false});
}
