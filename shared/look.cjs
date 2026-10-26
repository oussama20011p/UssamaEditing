// Resolves a clip's colour look (filter preset at an intensity, plus manual adjustments) into
// eq values and a 3x3 colour matrix. Used by both the export and the preview so they match.
const FILTERS = require('./filters.json');

const IDENTITY = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const lerp = (a, b, k) => a + (b - a) * k;

function clipLook(clip) {
  const f = FILTERS[clip.filter] || FILTERS.none;
  const k = clip.filter && clip.filter !== 'none' ? clip.filterIntensity ?? 1 : 0;
  const fe = f.eq || { b: 0, c: 1, s: 1 };
  // Manual sliders stack on top of the preset.
  const eq = {
    b: lerp(0, fe.b, k) + (clip.brightness || 0),
    c: lerp(1, fe.c, k) * (clip.contrast ?? 1),
    s: lerp(1, fe.s, k) * (clip.saturation ?? 1),
  };
  const matrix = f.matrix && k > 0 ? IDENTITY.map((row, i) => row.map((v, j) => lerp(v, f.matrix[i][j], k))) : null;
  return { eq, matrix };
}

module.exports = { FILTERS, clipLook };
