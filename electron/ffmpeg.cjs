// Single entry point for everything FFmpeg: media helpers (media.cjs) and project rendering (render.cjs).
const media = require('./media.cjs');
const render = require('./render.cjs');

module.exports = {
  ffmpegPath: media.FFMPEG,
  ffprobePath: media.FFPROBE,
  FONTS_DIR: render.FONTS_DIR,
  PEAKS_PER_SEC: media.PEAKS_PER_SEC,
  probe: media.probe,
  thumbnail: media.thumbnail,
  peaks: media.peaks,
  extractFrame: media.extractFrame,
  reverseClip: media.reverseClip,
  buildExportArgs: render.buildExportArgs,
  runExport: render.runExport,
};
