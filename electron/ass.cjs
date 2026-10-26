// Builds an ASS subtitle script for all text clips and captions of a project.
// libass shapes Arabic and other right-to-left scripts correctly, which FFmpeg's drawtext does not.
// Keep the look in sync with the live preview (src/components/Preview.jsx).

const FONT = 'Cairo';
// libass sizes text by line height; Cairo's line height is ~1.9 em. Sizes in the project are CSS px (em),
// so multiply to match the browser preview.
const FS_RATIO = 1.9;
const fs = (px) => Math.round(px * FS_RATIO);

// '#rrggbb' -> ASS '&HAABBGGRR' (alpha 00 = opaque)
function assColor(hex, alpha = 0) {
  const h = (hex || '#ffffff').replace('#', '').padEnd(6, 'f');
  const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
  return `&H${a}${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toUpperCase();
}

function assTime(t) {
  const cs = Math.max(0, Math.round(t * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}

// Text written into an event: escape override braces and keep line breaks.
const esc = (s) => String(s).replace(/[{}]/g, '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\N');
// Emoji are drawn with the monochrome Noto Emoji font (libass cannot draw colour emoji); same in the preview CSS.
const EMOJI = /(\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*\uFE0F?)/gu;
const txt = (s) => esc(s).replace(EMOJI, `{\\fnNoto Emoji}$1{\\fn${FONT}}`);

function textEvent(t, W, H) {
  const x = Math.round((t.x ?? 0.5) * W);
  const y = Math.round((t.y ?? 0.5) * H);
  const size = Math.round(t.size || 64);
  const bold = t.bold === false ? 0 : 1;
  const tags = [`\\an5`, `\\fn${FONT}`, `\\fs${fs(size)}`, `\\b${bold}`, `\\1c${assColor(t.color)}`];
  if (t.style === 'box') {
    // BorderStyle 3 draws an opaque box in the outline colour.
    tags.push(`\\3c${assColor(t.bg || '#000000')}`, `\\bord${Math.round(size * 0.22)}`, `\\shad0`);
  } else if (t.style === 'shadow') {
    tags.push(`\\bord0`, `\\4c${assColor('#000000', 0.35)}`, `\\shad${Math.max(2, Math.round(size * 0.06))}`);
  } else {
    tags.push(`\\3c${assColor('#000000')}`, `\\bord${Math.max(2, Math.round(size * 0.07))}`, `\\shad0`);
  }
  if (t.anim === 'slide') tags.push(`\\move(${x},${y + Math.round(H * 0.04)},${x},${y},0,280)`, `\\fad(200,150)`);
  else tags.push(`\\pos(${x},${y})`);
  if (t.anim === 'fade') tags.push(`\\fad(300,250)`);
  if (t.anim === 'pop') tags.push(`\\fscx60\\fscy60\\t(0,140,\\fscx112\\fscy112)\\t(140,240,\\fscx100\\fscy100)`, `\\fad(80,120)`);
  const style = t.style === 'box' ? 'Box' : 'Main';
  return `Dialogue: ${1 + (t.lane || 0)},${assTime(t.start)},${assTime(t.start + t.duration)},${style},,0,0,0,,{${tags.join('')}}${txt(t.text)}`;
}

// One event per spoken word, so the active word can be highlighted.
function captionEvents(groups, cs, W, H) {
  const out = [];
  const x = Math.round(W / 2);
  const y = Math.round((cs.y ?? 0.72) * H);
  const size = Math.round(cs.size || 78);
  const base = `\\an5\\pos(${x},${y})\\fn${FONT}\\fs${fs(size)}\\b1\\1c${assColor(cs.color)}`;
  const hi = assColor(cs.highlight);
  groups.forEach((g) => {
    if (!g.words.length) return;
    if (cs.preset === 'clean') {
      out.push(`Dialogue: 0,${assTime(g.start)},${assTime(g.end)},Cap,,0,0,0,,{${base}\\bord0\\shad3\\4c${assColor('#000000', 0.4)}}${txt(g.words.map((w) => w.text).join(' '))}`);
      return;
    }
    g.words.forEach((w, i) => {
      const s = i === 0 ? g.start : w.start;
      const e = g.words[i + 1]?.start ?? g.end;
      if (e <= s) return;
      if (cs.preset === 'word') {
        out.push(`Dialogue: 0,${assTime(s)},${assTime(e)},Cap,,0,0,0,,{${base}\\fs${fs(size * 1.35)}\\1c${hi}\\bord${Math.round(size * 0.09)}\\fscx70\\fscy70\\t(0,110,\\fscx108\\fscy108)\\t(110,200,\\fscx100\\fscy100)}${txt(w.text)}`);
        return;
      }
      const boxed = cs.preset === 'box';
      const border = boxed ? `\\3c${assColor('#000000', 0.25)}\\bord${Math.round(size * 0.25)}` : `\\3c&H000000&\\bord${Math.round(size * 0.08)}`;
      const line = g.words.map((ww, j) => (j === i ? `{\\1c${hi}}${txt(ww.text)}{\\1c${assColor(cs.color)}}` : txt(ww.text))).join(' ');
      out.push(`Dialogue: 0,${assTime(s)},${assTime(e)},${boxed ? 'CapBox' : 'Cap'},,0,0,0,,{${base}${border}\\shad0}${line}`);
    });
  });
  return out;
}

function buildAss(project) {
  const W = project.width;
  const H = project.height;
  const events = [
    ...(project.captions || []).length ? captionEvents(project.captions, project.captionStyle || {}, W, H) : [],
    ...project.textClips.map((t) => textEvent(t, W, H)),
  ];
  if (!events.length) return null;
  const style = (name, borderStyle) =>
    `Style: ${name},${FONT},64,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,${borderStyle},3,0,5,0,0,0,-1`;
  return [
    '[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${W}`, `PlayResY: ${H}`, 'WrapStyle: 2', 'ScaledBorderAndShadow: yes', '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    style('Main', 1), style('Box', 3), style('Cap', 1), style('CapBox', 3), '',
    '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...events, '',
  ].join('\n');
}

module.exports = { buildAss, assColor, assTime };
