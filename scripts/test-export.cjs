// End-to-end export check: synthesise test media, render a 9:16 project that uses most features
// (speed, fill/fit, filters, slow zoom, mirror, dips and overlap transitions, PiP circle with
// keyframes, sticker, chroma key, styled Arabic text, word-highlight captions, music) and verify
// the output. `--frames` also saves stills for a visual look.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { ffmpegPath, probe, runExport } = require('../electron/ffmpeg.cjs');

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'ussamai-export-'));
const file = (name) => path.join(work, name);
const synth = (...args) => execFileSync(ffmpegPath, ['-y', '-hide_banner', '-loglevel', 'error', ...args]);
const expect = (ok, what) => {
  if (!ok) throw new Error(`check failed: ${what}`);
};

const SOURCES = {
  bars: ['bars.mp4', ['-f', 'lavfi', '-i', 'testsrc=size=1920x1080:rate=30:duration=5', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=5', '-shortest']],
  silent: ['silent clip.mp4', ['-f', 'lavfi', '-i', 'smptebars=size=640x480:rate=25:duration=4']],
  tune: ['tune.mp3', ['-f', 'lavfi', '-i', 'sine=frequency=880:duration=10']],
  // Transparent PNG with an opaque yellow disc.
  disc: ['disc.png', ['-f', 'lavfi', '-i', 'color=c=black@0:s=300x300,format=rgba,geq=r=255:g=200:b=0:a=255*lte(hypot(X-150\\,Y-150)\\,140)', '-frames:v', '1']],
};

async function main() {
  const media = [];
  for (const [id, [name, args]] of Object.entries(SOURCES)) {
    synth(...args, file(name));
    const info = await probe(file(name));
    const type = name.endsWith('.png') ? 'image' : info.hasVideo ? 'video' : 'audio';
    media.push({ id, path: file(name), name, type, ...info });
  }

  const project = {
    format: '9:16', width: 1080, height: 1920, fps: 30, media,
    videoClips: [
      { id: 'v1', mediaId: 'bars', in: 1, out: 3, speed: 2, fit: 'fill', saturation: 1.4, fadeIn: 0.3, filter: 'golden', filterIntensity: 0.8, motion: 'zoomIn' },
      { id: 'v2', mediaId: 'silent', in: 0, out: 2.5, fit: 'fit', mirror: true, filter: 'nb', motion: 'zoomOut', transition: { type: 'flash', duration: 0.4 } },
      { id: 'v3', mediaId: 'bars', in: 3, out: 4, speed: 0.5, fadeOut: 0.4, transition: { type: 'black', duration: 0.6 } },
      { id: 'v4', mediaId: 'bars', in: 0, out: 2, transition: { type: 'slideleft', duration: 0.5 } },
      { id: 'v5', mediaId: 'silent', in: 0, out: 2, transition: { type: 'circleopen', duration: 0.8 } },
    ],
    overlayClips: [
      { id: 'pip', mediaId: 'bars', start: 0.5, in: 0, out: 4, x: 0.72, y: 0.78, scale: 0.4, shape: 'circle', ring: 8, ringColor: '#e9b949', volume: 0.3,
        keyframes: [{ t: 0, x: 0.72, y: 0.78, scale: 0.4 }, { t: 2, x: 0.3, y: 0.3, scale: 0.25 }] },
      { id: 'sticker', mediaId: 'disc', start: 1, in: 0, out: 2, x: 0.5, y: 0.6, scale: 0.2, shape: 'none', anim: 'pop', rotation: 15, opacity: 0.9 },
      { id: 'keyed', mediaId: 'silent', start: 3, in: 0, out: 2, x: 0.5, y: 0.5, scale: 0.5, shape: 'rounded', chroma: { on: true, color: '#00ff00', similarity: 0.3 } },
    ],
    textClips: [
      { id: 'hook', text: "Hook: 100% free 'test' 🔥", start: 0.2, duration: 2, x: 0.5, y: 0.2, size: 80, color: '#111111', style: 'box', bg: '#e9b949', anim: 'pop' },
      { id: 'ar', text: 'شنو هو الـAI؟', start: 1.5, duration: 2, x: 0.5, y: 0.45, size: 90, color: '#ffffff', style: 'outline', anim: 'slide' },
    ],
    captions: [
      { id: 'c1', start: 0, end: 1.5, words: [{ text: 'واش', start: 0, end: 0.5 }, { text: 'عارف', start: 0.5, end: 1 }, { text: 'AI؟', start: 1, end: 1.5 }] },
      { id: 'c2', start: 2, end: 3, words: [{ text: 'Salam', start: 2, end: 2.5 }, { text: 'bikom', start: 2.5, end: 3 }] },
    ],
    captionStyle: { preset: 'bold', size: 78, y: 0.72, color: '#ffffff', highlight: '#e9b949' },
    audioClips: [{ id: 'music', mediaId: 'tune', start: 1, in: 0, out: 4, volume: 0.5, fadeOut: 1 }],
  };
  // 2/2 + 2.5 + 1/0.5 + (2 − 0.5 overlap) + (2 − 0.8 overlap)
  const expected = 8.2;

  const video = file('out.mp4');
  await runExport(project, video, (p) => process.stdout.write(`\rexport ${Math.round(p * 100)}%`)).promise;
  const v = await probe(video);
  console.log(`\n${video}`, v);
  expect(Math.abs(v.duration - expected) < 0.2, `duration ${v.duration} ≈ ${expected}`);
  expect(v.hasAudio && v.width === 1080 && v.height === 1920, '1080×1920 with sound');

  const wav = file('voice.wav');
  await runExport(project, wav, null, { audioOnly: true }).promise;
  const w = await probe(wav);
  expect(!w.hasVideo && Math.abs(w.duration - expected) < 0.2, 'audio-only export for captions');

  if (process.argv.includes('--frames')) {
    for (const at of [0.6, 1.3, 2.3, 3.4, 4.6, 5.25, 7]) synth('-ss', String(at), '-i', video, '-frames:v', '1', file(`frame_${at}.png`));
    console.log('frames in', work);
  }
  console.log('EXPORT OK');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
