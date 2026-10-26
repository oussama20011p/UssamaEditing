// Editor keyboard shortcuts (CapCut-style). "mod" is ⌘ on macOS and Ctrl elsewhere.
import { useEffect, useRef } from 'react';

const FRAME = 1 / 30;

// [combo, action(handlers, event)] — combos are lower-case: "mod+shift+z", "space", "q"…
const MAP = [
  ['space', (h) => h.togglePlay()],
  ['s', (h) => h.split()],
  ['mod+b', (h) => h.split()],
  ['q', (h) => h.trimSide('left')],
  ['w', (h) => h.trimSide('right')],
  ['mod+d', (h) => h.duplicate()],
  ['delete', (h) => h.remove()],
  ['backspace', (h) => h.remove()],
  ['mod+z', (h) => h.undo()],
  ['mod+shift+z', (h) => h.redo()],
  ['mod+y', (h) => h.redo()],
  ['arrowleft', (h) => h.seekBy(-FRAME)],
  ['arrowright', (h) => h.seekBy(FRAME)],
  ['shift+arrowleft', (h) => h.seekBy(-1)],
  ['shift+arrowright', (h) => h.seekBy(1)],
  ['home', (h) => h.seekTo(0)],
];

function comboOf(e) {
  const key = e.code === 'Space' ? 'space' : e.key.toLowerCase();
  return [(e.metaKey || e.ctrlKey) && 'mod', e.shiftKey && 'shift', key].filter(Boolean).join('+');
}

const typing = (el) => el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);

// handlers may change every render; the listener always uses the latest ones.
export function useShortcuts(handlers) {
  const latest = useRef(handlers);
  latest.current = handlers;
  useEffect(() => {
    const onKey = (e) => {
      if (typing(e.target)) return;
      const hit = MAP.find(([combo]) => combo === comboOf(e));
      if (!hit) return;
      e.preventDefault();
      hit[1](latest.current, e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
