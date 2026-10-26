// "Remove background" for a video: Apple Vision person masks (cutout.swift) are merged with the
// original frames by FFmpeg into a VP9 WebM with an alpha channel, which both Chromium and FFmpeg read.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFile } = require('child_process');
const { ffmpegPath } = require('./ffmpeg.cjs');

const SOURCE = path.join(__dirname, 'cutout.swift').replace('app.asar', 'app.asar.unpacked');
const MAX_W = 720;

// Compile the Swift helper once per version into the user data folder.
function helperBinary(dataDir) {
  const bin = path.join(dataDir, 'bin', `cutout-${fs.statSync(SOURCE).mtimeMs.toFixed(0)}`);
  if (fs.existsSync(bin)) return Promise.resolve(bin);
  fs.mkdirSync(path.dirname(bin), { recursive: true });
  return new Promise((resolve, reject) => {
    execFile('xcrun', ['swiftc', '-O', SOURCE, '-o', bin], (err, _out, stderr) => {
      if (err) reject(new Error('Détourage khasso Xcode Command Line Tools (xcode-select --install).\n' + stderr));
      else resolve(bin);
    });
  });
}

// Returns { promise, cancel }; promise resolves to the path of the cut-out WebM.
function removeBackground(media, outDir, dataDir, onProgress) {
  if (process.platform !== 'darwin') throw new Error('Enlever le fond khddam ghir f macOS daba.');
  let swift = null;
  let ff = null;
  let canceled = false;
  const w = Math.min(MAX_W, media.width) & ~1;
  const h = Math.round((w * media.height) / media.width) & ~1;
  const out = path.join(outDir, `${path.parse(media.path).name}-cutout-${Date.now()}.webm`);

  const promise = (async () => {
    const bin = await helperBinary(dataDir);
    if (canceled) throw new Error('canceled');
    await new Promise((resolve, reject) => {
      swift = spawn(bin, [media.path, String(w), String(h)]);
      ff = spawn(ffmpegPath, [
        '-y', '-hide_banner', '-loglevel', 'error',
        '-i', media.path,
        '-f', 'rawvideo', '-pix_fmt', 'gray', '-s', `${w}x${h}`, '-framerate', String(media.fps || 30), '-i', 'pipe:0',
        '-filter_complex', `[0:v]scale=${w}:${h},format=yuva420p[v];[1:v]format=gray[m];[v][m]alphamerge,format=yuva420p[out]`,
        '-map', '[out]', '-map', '0:a?', '-shortest',
        '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '32', '-row-mt', '1', '-deadline', 'realtime', '-cpu-used', '8',
        '-c:a', 'libopus', out,
      ]);
      swift.stdout.pipe(ff.stdin);
      let log = '';
      swift.stderr.on('data', (d) => {
        const m = /progress ([\d.]+)/.exec(d.toString());
        if (m) onProgress?.(Math.min(0.99, Number(m[1])));
        else log += d;
      });
      ff.stderr.on('data', (d) => (log += d));
      ff.stdin.on('error', () => {});
      swift.on('error', reject);
      ff.on('error', reject);
      ff.on('close', (code) => {
        if (canceled) return reject(new Error('canceled'));
        if (code === 0 && fs.existsSync(out)) resolve();
        else reject(new Error(`Détourage fchel (code ${code}):\n${log.slice(-2000)}`));
      });
    });
    onProgress?.(1);
    return out;
  })();

  return {
    promise,
    cancel: () => {
      canceled = true;
      swift?.kill('SIGKILL');
      ff?.kill('SIGKILL');
      fs.rmSync(out, { force: true });
    },
  };
}

module.exports = { removeBackground };

// Self-test: node electron/cutout.cjs <video>
if (require.main === module) {
  const { probe } = require('./ffmpeg.cjs');
  (async () => {
    const file = process.argv[2];
    const info = await probe(file);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ussama-cutout-'));
    const job = removeBackground({ path: file, ...info, fps: 30 }, dir, dir, (p) => process.stdout.write(`\rcutout ${(p * 100).toFixed(0)}%`));
    console.log('\n', await job.promise);
  })().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
