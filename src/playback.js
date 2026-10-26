// Preview playback: a wall-clock playhead drives every <video>/<audio> element, which are nudged
// back into line only when they drift, so playback stays smooth.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const TOLERANCE = { playing: 0.25, paused: 0.01 }; // seconds

// Keep one media element on `src`, at source time `at`, playing or not, at `volume` and `rate`.
export function follow(el, { src, at, playing, volume = 1, rate = 1 }) {
  if (el.dataset.src !== src) {
    el.dataset.src = src;
    el.src = src;
  }
  el.volume = Math.min(1, Math.max(0, volume));
  if (el.playbackRate !== rate) el.playbackRate = rate;
  const slack = playing ? TOLERANCE.playing * rate : TOLERANCE.paused;
  if (el.readyState > 0 && Math.abs(el.currentTime - at) > slack) el.currentTime = at;
  if (playing === el.paused) {
    if (playing) el.play().catch(() => {});
    else el.pause();
  }
}

export const halt = (el) => {
  if (el && !el.paused) el.pause();
};

// Calls render(t, playing) for the current frame. While playing, time advances from the moment play
// started (or the last seek); it stops at `end`.
export function usePlayhead({ time, playing, end, restartKey, render, onTime, onEnd }) {
  const renderRef = useRef(render);
  renderRef.current = render;

  // Paused: draw the frame at `time` after every update.
  useLayoutEffect(() => {
    if (!playing) renderRef.current(time, false);
  });

  useEffect(() => {
    if (!playing) return undefined;
    const from = time;
    const startedAt = performance.now();
    let frame = 0;
    const step = (now) => {
      const t = from + (now - startedAt) / 1000;
      if (t >= end) {
        renderRef.current(end, false);
        onTime(end);
        onEnd();
        return;
      }
      renderRef.current(t, true);
      onTime(t);
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, restartKey, end]);
}

// Screen pixels per project pixel for an element showing a `projectWidth`-wide frame.
export function useFitScale(ref, projectWidth) {
  const [k, setK] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => setK(el.clientWidth / projectWidth);
    measure();
    const watcher = new ResizeObserver(measure);
    watcher.observe(el);
    return () => watcher.disconnect();
  }, [ref, projectWidth]);
  return k;
}
