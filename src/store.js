// UssamaEditing project model.
//
// A project holds media and five clip lists. The main video list is sequential: clips follow each
// other (minus transition overlaps), so their times come from videoLayout(). Every other list places
// its clips freely with a `start` time. All edits go through dispatch(action) and are undoable.

export const uid = () => (Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 6));
export const MIN_CLIP = 0.1;

export const FORMATS = {
  '9:16': { width: 1080, height: 1920, label: '9:16 · Reels / TikTok' },
  '4:5': { width: 1080, height: 1350, label: '4:5 · Post Instagram' },
  '1:1': { width: 1080, height: 1080, label: '1:1 · Carré' },
  '16:9': { width: 1920, height: 1080, label: '16:9 · YouTube' },
};

// Dips fade through a colour at the cut. The others overlap the two clips (FFmpeg xfade), which
// shortens the timeline by the transition length, like CapCut.
export const TRANSITIONS = {
  none: 'Bla',
  fade: 'Fondu',
  black: 'Fondu noir',
  white: 'Fondu blanc',
  flash: 'Flash',
  slideleft: 'Glisser ←',
  slideright: 'Glisser →',
  slideup: 'Glisser ↑',
  slidedown: 'Glisser ↓',
  wipeleft: 'Balayage ←',
  wiperight: 'Balayage →',
  circleopen: 'Cercle',
  zoomin: 'Zoom',
  hblur: 'Flou',
  dissolve: 'Dissolve',
  pixelize: 'Pixels',
  radial: 'Radial',
  squeezeh: 'Squeeze',
};
export const DIP_TRANSITIONS = ['black', 'white', 'flash'];
export const isXfade = (type) => !!type && type !== 'none' && !DIP_TRANSITIONS.includes(type);

// Overlap between a clip and the one before it (0 unless its transition is an xfade).
export function overlapOf(clip, prevLen, len) {
  const tr = clip.transition;
  return isXfade(tr?.type) ? Math.max(0, Math.min(tr.duration || 0.5, prevLen / 2, len / 2)) : 0;
}

export const MOTIONS = { none: 'Bla', zoomIn: 'Zoom in', zoomOut: 'Zoom out' };

export const TEXT_STYLES = { outline: 'Contour', box: 'Boîte', shadow: 'Ombre' };
export const TEXT_ANIMS = { none: 'Bla', fade: 'Fondu', pop: 'Pop', slide: 'Glissement' };

export const CAPTION_PRESETS = {
  bold: { label: 'Bold · kelma mlowna', words: 3 },
  box: { label: 'Boîte · ligne f boîte', words: 4 },
  word: { label: 'Kelma b kelma · pop', words: 1 },
  clean: { label: 'Clean · bla effets', words: 5 },
};

export function defaultCaptionStyle() {
  return { preset: 'bold', size: 78, y: 0.72, color: '#ffffff', highlight: '#e9b949' };
}

export function emptyProject() {
  return {
    name: 'Untitled', format: '9:16', width: 1080, height: 1920, fps: 30,
    media: [], videoClips: [], overlayClips: [], textClips: [], audioClips: [], captions: [],
    captionStyle: defaultCaptionStyle(),
  };
}

// Older project files lack the newer fields.
export function normalizeProject(p) {
  return {
    ...emptyProject(),
    ...p,
    format: p.format || (p.width && p.height ? null : '9:16'),
    captions: p.captions || [],
    overlayClips: p.overlayClips || [],
    captionStyle: { ...defaultCaptionStyle(), ...(p.captionStyle || {}) },
  };
}

export const clipSpeed = (c) => c.speed || 1;
// Images have no natural length: their clips can be stretched up to an hour.
export const mediaMax = (m) => (m?.type === 'image' ? 3600 : m?.duration ?? 0);
export const overlayLength = (c) => (c.out - c.in) / clipSpeed(c);
export const SHAPES = { none: 'Normal', rounded: 'Arrondi', circle: 'Cercle' };
export const clipLength = (c) => (c.out - c.in) / clipSpeed(c);

export function videoLayout(videoClips) {
  let t = 0;
  let prevLen = 0;
  return videoClips.map((c, i) => {
    const len = clipLength(c);
    const overlap = i > 0 ? overlapOf(c, prevLen, len) : 0;
    const item = { clip: c, start: t - overlap, end: t - overlap + len, overlap };
    t = item.end;
    prevLen = len;
    return item;
  });
}

export function projectDuration(p) {
  const v = videoLayout(p.videoClips);
  const ends = [v.length ? v[v.length - 1].end : 0];
  p.textClips.forEach((c) => ends.push(c.start + c.duration));
  p.audioClips.forEach((c) => ends.push(c.start + (c.out - c.in)));
  (p.overlayClips || []).forEach((c) => ends.push(c.start + overlayLength(c)));
  (p.captions || []).forEach((c) => ends.push(c.end));
  return Math.max(0, ...ends);
}

// Total duration of what gets exported (the video track drives the output length).
export function exportDuration(p) {
  const v = videoLayout(p.videoClips);
  return v.length ? v[v.length - 1].end : 0;
}

export function videoClipAt(p, t) {
  // During an overlap the incoming clip wins.
  return videoLayout(p.videoClips).filter((l) => t >= l.start && t < l.end).pop() || null;
}

// Transition of clip i is played across the cut between clip i-1 and clip i:
// the previous clip fades out over the first half, this clip fades in over the second half.
export function transitionHalf(clip) {
  const tr = clip.transition;
  if (!tr || !DIP_TRANSITIONS.includes(tr.type)) return 0;
  return (tr.type === 'flash' ? Math.min(tr.duration, 0.3) : tr.duration) / 2;
}

// Opacity of the colour veil over the picture at time t (0 = clear, 1 = full colour), plus its colour.
export function veilAt(p, t) {
  const layout = videoLayout(p.videoClips);
  for (let i = 0; i < layout.length; i++) {
    const { clip, start, end } = layout[i];
    if (t < start || t >= end) continue;
    const len = end - start;
    let a = 0;
    let color = '#000';
    const half = transitionHalf(clip);
    if (i > 0 && half > 0 && t - start < half) {
      a = 1 - (t - start) / half;
      color = transitionColor(clip.transition.type);
    }
    const next = layout[i + 1];
    const nHalf = next ? transitionHalf(next.clip) : 0;
    if (nHalf > 0 && end - t < nHalf) {
      a = Math.max(a, 1 - (end - t) / nHalf);
      color = transitionColor(next.clip.transition.type);
    }
    if (clip.fadeIn && t - start < clip.fadeIn) a = Math.max(a, 1 - (t - start) / clip.fadeIn);
    if (clip.fadeOut && end - t < clip.fadeOut) a = Math.max(a, 1 - (end - t) / clip.fadeOut);
    return { a: Math.min(1, Math.max(0, a)), color, len };
  }
  return { a: 0, color: '#000' };
}

export const transitionColor = (type) => (type === 'white' || type === 'flash' ? '#fff' : '#000');

// Which project list a track name refers to.
const LIST = { video: 'videoClips', overlay: 'overlayClips', text: 'textClips', audio: 'audioClips', caption: 'captions' };

export function newTextClip(id, at, preset = 'title') {
  const common = {
    id, start: at, duration: 3, x: 0.5, y: 0.5, size: 96, color: '#ffffff',
    style: 'outline', bg: '#000000', anim: 'pop', bold: true,
  };
  const presets = {
    hook: { text: 'Hook dyalk hna', y: 0.22, size: 88, style: 'box', bg: '#e9b949', color: '#111111' },
    sub: { text: 'Sous-titre', y: 0.85, size: 56, anim: 'fade', bold: false },
    title: { text: 'Kteb hna' },
  };
  return { ...common, ...(presets[preset] || presets.title) };
}

function newMainClip(id, media) {
  return {
    id, mediaId: media.id, in: 0, out: media.type === 'image' ? 3 : media.duration,
    speed: 1, volume: 1, muted: false, fit: 'fill', mirror: false, motion: 'none',
    brightness: 0, contrast: 1, saturation: 1, filter: 'none', filterIntensity: 1,
    fadeIn: 0, fadeOut: 0, transition: { type: 'none', duration: 0.5 },
  };
}

// Default overlay: videos become a ringed circle bottom-right (PiP), stickers sit centred and pop in.
function newOverlay(id, media, at) {
  const sticker = Boolean(media.sticker);
  const still = media.type === 'image';
  return {
    id, mediaId: media.id, start: at, in: 0, out: still ? 3 : media.duration, speed: 1,
    x: sticker ? 0.5 : 0.72, y: sticker ? 0.35 : 0.78, scale: sticker ? 0.3 : 0.4, rotation: 0, opacity: 1,
    shape: sticker || still ? 'none' : 'circle', ring: sticker ? 0 : 8, ringColor: '#e9b949',
    volume: 1, muted: false, anim: sticker ? 'pop' : 'none', keyframes: [],
    chroma: { on: false, color: '#00ff00', similarity: 0.3 },
  };
}

// Timeline span [from, to) of a clip on any track.
function spanOf(p, track, clip) {
  if (track === 'video') {
    const item = videoLayout(p.videoClips).find((l) => l.clip === clip);
    return item ? [item.start, item.end] : null;
  }
  if (track === 'text') return [clip.start, clip.start + clip.duration];
  if (track === 'audio') return [clip.start, clip.start + clip.out - clip.in];
  if (track === 'overlay') return [clip.start, clip.start + overlayLength(clip)];
  return null;
}

// The two halves of a clip cut at timeline time t (null when t is too close to an edge).
function cutClip(p, track, clip, t, newId) {
  const span = spanOf(p, track, clip);
  if (!span || t - span[0] < MIN_CLIP || span[1] - t < MIN_CLIP) return null;
  const local = t - span[0];
  if (track === 'text') {
    return [{ ...clip, duration: local }, { ...clip, id: newId, start: t, duration: span[1] - t }];
  }
  const srcCut = clip.in + local * (track === 'audio' ? 1 : clipSpeed(clip));
  const left = { ...clip, out: srcCut };
  const right = { ...clip, id: newId, in: srcCut };
  if (track === 'video') {
    left.fadeOut = 0;
    right.fadeIn = 0;
    right.transition = { type: 'none', duration: 0.5 };
  } else {
    right.start = t;
  }
  if (track === 'overlay') {
    const kfs = clip.keyframes || [];
    left.keyframes = kfs.filter((k) => k.t <= local);
    right.keyframes = kfs.filter((k) => k.t >= local).map((k) => ({ ...k, t: k.t - local }));
  }
  return [left, right];
}

function splitClip(p, track, id, t, newId) {
  const key = LIST[track];
  const i = p[key]?.findIndex((c) => c.id === id) ?? -1;
  if (i < 0) return p;
  const halves = cutClip(p, track, p[key][i], t, newId);
  if (!halves) return p;
  const list = p[key].slice();
  list.splice(i, 1, ...halves);
  return { ...p, [key]: list };
}

const mapList = (p, key, fn) => ({ ...p, [key]: p[key].map(fn) });
const sameTime = (a, b) => Math.abs(a - b) <= 0.02;

const ACTIONS = {
  load: (p, a) => normalizeProject(a.project),
  setName: (p, a) => ({ ...p, name: a.name }),
  setFormat: (p, a) => (FORMATS[a.format] ? { ...p, format: a.format, width: FORMATS[a.format].width, height: FORMATS[a.format].height } : p),
  setCaptionStyle: (p, a) => ({ ...p, captionStyle: { ...p.captionStyle, ...a.patch } }),
  setCaptions: (p, a) => ({ ...p, captions: a.captions }),
  addMedia: (p, a) => ({ ...p, media: p.media.concat(a.items) }),
  removeMedia: (p, a) => {
    const keep = (c) => c.mediaId !== a.id;
    return {
      ...p, media: p.media.filter((m) => m.id !== a.id),
      videoClips: p.videoClips.filter(keep), overlayClips: p.overlayClips.filter(keep), audioClips: p.audioClips.filter(keep),
    };
  },
  addToTimeline: (p, a) => {
    const media = p.media.find((m) => m.id === a.mediaId);
    if (!media) return p;
    if (media.type === 'audio') {
      const clip = { id: a.clipId, mediaId: media.id, start: a.at, in: 0, out: media.duration, volume: 1, fadeIn: 0, fadeOut: 0 };
      return { ...p, audioClips: p.audioClips.concat(clip) };
    }
    const list = p.videoClips.slice();
    list.splice(a.index ?? list.length, 0, newMainClip(a.clipId, media));
    return { ...p, videoClips: list };
  },
  addOverlay: (p, a) => {
    const media = p.media.find((m) => m.id === a.mediaId);
    return media ? { ...p, overlayClips: p.overlayClips.concat(newOverlay(a.clipId, media, a.at)) } : p;
  },
  addText: (p, a) => ({ ...p, textClips: p.textClips.concat(newTextClip(a.clipId, a.at, a.preset)) }),
  applyTemplate: (p, a) => {
    const f = FORMATS[a.format];
    return {
      ...p, ...(f ? { format: a.format, width: f.width, height: f.height } : {}),
      captionStyle: { ...p.captionStyle, ...a.captions }, textClips: p.textClips.concat(a.texts),
    };
  },
  update: (p, a) => mapList(p, LIST[a.track], (c) => (c.id === a.id ? { ...c, ...a.patch } : c)),
  updateAllVideo: (p, a) => mapList(p, 'videoClips', (c, i) => (a.skipFirst && i === 0 ? c : { ...c, ...a.patch })),
  delete: (p, a) => ({ ...p, [LIST[a.track]]: p[LIST[a.track]].filter((c) => c.id !== a.id) }),
  moveVideo: (p, a) => {
    const clip = p.videoClips.find((c) => c.id === a.id);
    if (!clip) return p;
    const rest = p.videoClips.filter((c) => c !== clip);
    const at = Math.min(Math.max(a.toIndex, 0), rest.length);
    return { ...p, videoClips: [...rest.slice(0, at), clip, ...rest.slice(at)] };
  },
  split: (p, a) => splitClip(p, a.track, a.id, a.t, a.newId),
  // CapCut Q / W: keep only the part of the clip after (left) or before (right) the playhead.
  trimSide: (p, a) => {
    const key = LIST[a.track];
    const i = p[key]?.findIndex((c) => c.id === a.id) ?? -1;
    const halves = i < 0 ? null : cutClip(p, a.track, p[key][i], a.t, a.id);
    if (!halves) return p;
    const list = p[key].slice();
    list.splice(i, 1, a.side === 'right' ? halves[0] : halves[1]);
    return { ...p, [key]: list };
  },
  duplicate: (p, a) => {
    if (a.track === 'caption') return p;
    const key = LIST[a.track];
    const i = p[key].findIndex((c) => c.id === a.id);
    if (i < 0) return p;
    const src = p[key][i];
    const copy = { ...src, id: a.newId };
    const span = spanOf(p, a.track, src);
    if (a.track !== 'video' && span) copy.start = span[1];
    const list = p[key].slice();
    list.splice(i + 1, 0, copy);
    return { ...p, [key]: list };
  },
  // Overlay keyframes (time relative to the clip start); one keyframe per time.
  setKeyframe: (p, a) => mapList(p, 'overlayClips', (c) => {
    if (c.id !== a.id) return c;
    const others = (c.keyframes || []).filter((k) => !sameTime(k.t, a.t));
    const kf = { t: a.t, x: c.x, y: c.y, scale: c.scale, ...a.values };
    return { ...c, keyframes: others.concat(kf).sort((u, v) => u.t - v.t) };
  }),
  removeKeyframe: (p, a) => mapList(p, 'overlayClips', (c) => (c.id === a.id ? { ...c, keyframes: (c.keyframes || []).filter((k) => !sameTime(k.t, a.t)) } : c)),
};

export function applyAction(p, a) {
  const fn = ACTIONS[a.type];
  return fn ? fn(p, a) : p;
}

// Undo history around applyAction. A drag is one undo step: 'beginGesture' remembers the project,
// every move replaces it silently, and 'endGesture' files the remembered version as the undo point.
const MAX_UNDO = 100;

export const initialHistory = (project) => ({ project, undo: [], redo: [], dragFrom: null });
export const canUndo = (h) => h.undo.length > 0;
export const canRedo = (h) => h.redo.length > 0;

export function historyReducer(h, a) {
  switch (a.type) {
    case 'undo':
      return h.undo.length ? { ...h, project: h.undo[h.undo.length - 1], undo: h.undo.slice(0, -1), redo: [h.project, ...h.redo] } : h;
    case 'redo':
      return h.redo.length ? { ...h, project: h.redo[0], undo: [...h.undo, h.project], redo: h.redo.slice(1) } : h;
    case 'beginGesture':
      return { ...h, dragFrom: h.project };
    case 'endGesture':
      if (!h.dragFrom) return h;
      return h.dragFrom === h.project ? { ...h, dragFrom: null } : { ...h, undo: [...h.undo, h.dragFrom].slice(-MAX_UNDO), redo: [], dragFrom: null };
    default: {
      const next = applyAction(h.project, a);
      if (next === h.project) return h;
      if (a.type === 'load') return initialHistory(next);
      if (a.transient || h.dragFrom) return { ...h, project: next };
      return { ...h, project: next, undo: [...h.undo, h.project].slice(-MAX_UNDO), redo: [] };
    }
  }
}

// Local path -> file:// URL usable by <video>/<img> (macOS and Windows paths).
export function toFileUrl(path) {
  const unix = path.replace(/\\/g, '/');
  const segments = unix.split('/').map((seg, i) => (i === 0 && /^[A-Za-z]:$/.test(seg) ? seg : encodeURIComponent(seg)));
  const joined = segments.join('/');
  return joined.startsWith('/') ? `file://${joined}` : `file:///${joined}`;
}

// 75.4 -> "01:15.40"
export function formatTime(seconds) {
  const total = Math.round(Math.max(0, seconds) * 100) / 100;
  const mm = Math.floor(total / 60);
  const ss = total - mm * 60;
  return `${String(mm).padStart(2, '0')}:${ss.toFixed(2).padStart(5, '0')}`;
}
