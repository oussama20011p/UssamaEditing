// CSS for text clips and captions in the live preview.
// Mirrors electron/ass.cjs so the preview matches the export. Sizes are in project pixels; `k` scales to screen.
import { activeWord } from './captions.js';

const easeOut = (x) => 1 - (1 - x) ** 3;

function stroke(px, color = '#000') {
  return { WebkitTextStroke: `${px * 2}px ${color}`, paintOrder: 'stroke fill' };
}

// Animation state of a text clip at local time lt (seconds since its start).
function animState(t, lt) {
  const left = t.duration - lt;
  let opacity = 1;
  let scale = 1;
  let dy = 0;
  if (t.anim === 'fade') opacity = Math.min(1, lt / 0.3, left / 0.25);
  if (t.anim === 'pop') {
    opacity = Math.min(1, lt / 0.08, left / 0.12);
    scale = lt < 0.14 ? 0.6 + 0.52 * (lt / 0.14) : lt < 0.24 ? 1.12 - 0.12 * ((lt - 0.14) / 0.1) : 1;
  }
  if (t.anim === 'slide') {
    opacity = Math.min(1, lt / 0.2, left / 0.15);
    dy = (1 - easeOut(Math.min(1, lt / 0.28))) * 0.04;
  }
  return { opacity: Math.max(0, opacity), scale, dy };
}

export function textClipStyle(t, lt, k, H) {
  const size = t.size || 64;
  const { opacity, scale, dy } = animState(t, lt);
  const css = {
    left: `${t.x * 100}%`,
    top: `${(t.y + dy) * 100}%`,
    fontSize: size * k,
    color: t.color,
    fontWeight: t.bold === false ? 400 : 700,
    opacity,
    transform: `translate(-50%, -50%) scale(${scale})`,
  };
  if (t.style === 'box') {
    const pad = size * 0.22 * k;
    return { ...css, background: t.bg, padding: `${pad * 0.35}px ${pad}px`, borderRadius: 2 * k, boxDecorationBreak: 'clone' };
  }
  if (t.style === 'shadow') {
    const s = Math.max(2, size * 0.06) * k;
    return { ...css, textShadow: `${s}px ${s}px 0 rgba(0,0,0,0.65)` };
  }
  return { ...css, ...stroke(Math.max(2, size * 0.07) * k) };
}

// Returns { style, words: [{ text, style }] } for the caption group visible at time t, or null.
export function captionView(groups, cs, t, k) {
  const g = groups.find((x) => t >= x.start && t < x.end);
  if (!g || !g.words.length) return null;
  const size = cs.size || 78;
  const base = {
    left: '50%',
    top: `${(cs.y ?? 0.72) * 100}%`,
    fontSize: size * k,
    fontWeight: 700,
    color: cs.color,
    transform: 'translate(-50%, -50%)',
  };
  const ai = activeWord(g, t);
  if (cs.preset === 'clean') {
    return { style: { ...base, textShadow: `0 ${3 * k}px ${6 * k}px rgba(0,0,0,0.6)` }, words: g.words.map((w) => ({ text: w.text })) };
  }
  if (cs.preset === 'word') {
    const w = g.words[Math.max(0, ai)];
    const lt = t - (ai <= 0 ? g.start : w.start);
    const scale = lt < 0.11 ? 0.7 + 0.38 * (lt / 0.11) : lt < 0.2 ? 1.08 - 0.08 * ((lt - 0.11) / 0.09) : 1;
    return {
      style: { ...base, fontSize: size * 1.35 * k, color: cs.highlight, transform: `translate(-50%, -50%) scale(${scale})`, ...stroke(size * 0.09 * k) },
      words: [{ text: w.text }],
    };
  }
  const boxed = cs.preset === 'box';
  const style = boxed
    ? { ...base, background: 'rgba(0,0,0,0.75)', padding: `${size * 0.08 * k}px ${size * 0.25 * k}px`, borderRadius: 4 * k }
    : { ...base, ...stroke(size * 0.08 * k) };
  return {
    style,
    words: g.words.map((w, i) => ({
      text: w.text,
      style: i === ai ? { color: cs.highlight } : undefined,
    })),
  };
}
