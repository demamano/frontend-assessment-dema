import { useSyncExternalStore } from 'react';

// Filter state lives in the URL (constraint 3). useSyncExternalStore treats the
// URL as an external store, so reload, back/forward (popstate) and our own
// history writes all flow through one path — with no useEffect (constraint 4).
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener('popstate', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('popstate', onChange);
  };
}

export function useSearchParam(key: string): string {
  return useSyncExternalStore(subscribe, () => new URLSearchParams(location.search).get(key) ?? '');
}

// 'replace' while typing keeps every keystroke out of the history stack;
// 'push' for discrete choices (status toggles) so Back steps through them.
export function setSearchParam(key: string, value: string, mode: 'push' | 'replace') {
  const params = new URLSearchParams(location.search);
  if (value) params.set(key, value);
  else params.delete(key);
  const query = params.toString();
  history[mode === 'push' ? 'pushState' : 'replaceState'](null, '', query ? `?${query}` : location.pathname);
  notify();
}
