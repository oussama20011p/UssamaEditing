// Pure timeline edit maths: given a clip and how far the pointer moved (in seconds), return the patch.
import { MIN_CLIP, clipSpeed, mediaMax, overlayLength, videoLayout } from './store.js';
import { clamp } from './pointer.js';

// Main track: edges trim the source (scaled by the clip speed); clips never move freely.
export function trimMain(clip, edge, dt, media) {
  const src = dt * clipSpeed(clip);
  return edge === 'start'
    ? { in: clamp(clip.in + src, 0, clip.out - MIN_CLIP) }
    : { out: clamp(clip.out + src, clip.in + MIN_CLIP, mediaMax(media)) };
}

// Where a dragged main-track clip should be inserted, from the pointer time.
export function reorderIndex(videoClips, clipId, pointerTime) {
  const rest = videoLayout(videoClips.filter((c) => c.id !== clipId));
  return rest.filter((item) => item.start + (item.end - item.start) / 2 < pointerTime).length;
}

const freeEnd = (track, c) => c.start + (track === 'text' ? c.duration : track === 'overlay' ? overlayLength(c) : c.out - c.in);

// Free tracks (text, overlay, audio): move, or trim either edge, with optional snapping.
// `snap(t)` returns t moved onto a nearby snap point (or t unchanged).
export function editFree(track, clip, edge, dt, media, snap) {
  const end = freeEnd(track, clip);
  if (!edge) {
    // Snap whichever edge lands near a point.
    const wanted = Math.max(0, clip.start + dt);
    const byStart = snap(wanted);
    const start = byStart !== wanted ? byStart : snap(wanted + (end - clip.start)) - (end - clip.start);
    return { start: Math.max(0, start) };
  }
  if (track === 'text') {
    if (edge === 'start') {
      const start = clamp(snap(clip.start + dt), 0, end - MIN_CLIP);
      return { start, duration: end - start };
    }
    return { duration: Math.max(MIN_CLIP, snap(end + dt) - clip.start) };
  }
  // Media clips: trimming the start also shifts the source in-point (time-stretched by speed).
  const sp = track === 'audio' ? 1 : clipSpeed(clip);
  if (edge === 'start') {
    const shift = clamp(snap(clip.start + dt) - clip.start, -Math.min(clip.in / sp, clip.start), (clip.out - clip.in) / sp - MIN_CLIP);
    return { start: clip.start + shift, in: clip.in + shift * sp };
  }
  const grow = snap(end + dt) - end;
  return { out: clamp(clip.out + grow * sp, clip.in + MIN_CLIP, mediaMax(media) || clip.out) };
}

// Ruler spacing: the smallest "nice" step that keeps labels at least ~80 px apart.
const STEPS = [0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
export const rulerStep = (pxPerSecond) => STEPS.find((s) => s * pxPerSecond >= 80) ?? STEPS[STEPS.length - 1];
