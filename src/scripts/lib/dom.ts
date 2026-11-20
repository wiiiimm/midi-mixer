/** Looks up an element that the page markup guarantees to exist. */
export function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error('Missing element #' + id);
  return element as T;
}

const entities: Record<string, string> = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'};
export const esc = (value: unknown): string => String(value).replace(/[&<>"']/g, char => entities[char]);

export const formatTime = (seconds: number): string =>
  Math.floor(seconds / 60) + ':' + String(Math.floor(seconds % 60)).padStart(2, '0');

/** Resolves after the browser has had a chance to paint. */
export const nextFrame = (): Promise<void> =>
  new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
