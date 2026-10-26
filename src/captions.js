// Caption helpers: turn word timings (from Whisper) into on-screen caption groups.
import { CAPTION_PRESETS, uid } from './store.js';

const PUNCT_END = /[.!?؟…,،]$/;

// words: [{ text, start, end }] -> groups: [{ id, start, end, words }]
export function groupWords(words, preset) {
  const max = CAPTION_PRESETS[preset]?.words ?? 3;
  const groups = [];
  let cur = [];
  const flush = () => {
    if (!cur.length) return;
    groups.push({ id: uid(), start: cur[0].start, end: cur[cur.length - 1].end, words: cur });
    cur = [];
  };
  words.forEach((w, i) => {
    const prev = words[i - 1];
    if (cur.length && (cur.length >= max || (prev && w.start - prev.end > 0.6))) flush();
    cur.push(w);
    if (PUNCT_END.test(w.text) && max > 1) flush();
  });
  flush();
  // Close tiny gaps so captions don't flicker between groups.
  for (let i = 0; i < groups.length - 1; i++) {
    if (groups[i + 1].start - groups[i].end < 0.3) groups[i].end = groups[i + 1].start;
  }
  return groups;
}

export const flattenWords = (groups) => groups.flatMap((g) => g.words);

// Re-time edited caption text: keep the group's span and spread the new words over it by length.
export function retimeText(group, text) {
  const parts = text.split(/\s+/).filter(Boolean);
  if (!parts.length) return { ...group, words: [] };
  const total = parts.reduce((s, w) => s + w.length + 1, 0);
  let t = group.start;
  const span = group.end - group.start;
  const words = parts.map((w) => {
    const d = (span * (w.length + 1)) / total;
    const word = { text: w, start: t, end: t + d };
    t += d;
    return word;
  });
  return { ...group, words };
}

// Index of the word being spoken at time t inside a group (-1 if between words).
export function activeWord(group, t) {
  return group.words.findIndex((w, i) => t >= w.start && t < (group.words[i + 1]?.start ?? group.end));
}
