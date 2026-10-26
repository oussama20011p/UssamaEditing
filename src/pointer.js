// Pointer drags for the timeline and the player. onMove gets the distance moved since the press
// (dx, dy in CSS px) and the event. With `history`, the whole drag becomes one undo step.
export function startDrag(event, { onMove, onEnd, history }) {
  event.stopPropagation();
  event.preventDefault();
  const x0 = event.clientX;
  const y0 = event.clientY;
  history?.({ type: 'beginGesture' });
  const move = (ev) => onMove(ev.clientX - x0, ev.clientY - y0, ev);
  const stop = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', stop);
    window.removeEventListener('pointercancel', stop);
    history?.({ type: 'endGesture' });
    onEnd?.();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', stop);
  window.addEventListener('pointercancel', stop);
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
