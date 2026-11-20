// The brand mark plays a quick scale on load, on hover and when playback starts.
let timer: ReturnType<typeof setTimeout> | undefined;

export function playBrandScale(): void {
  const mark = document.querySelector('.brand .keys-hover');
  if (!mark) return;
  mark.classList.remove('playing');
  void mark.getBoundingClientRect(); // restart the CSS animation
  mark.classList.add('playing');
  clearTimeout(timer);
  timer = setTimeout(() => mark.classList.remove('playing'), 2500); // run + stagger
}

export function initBrand(): void {
  document.querySelector('.brand')?.addEventListener('pointerenter', playBrandScale);
}
