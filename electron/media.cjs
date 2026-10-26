// Media helpers around the bundled FFmpeg / FFprobe binaries: inspect files, make thumbnails and
// waveforms, and run one-off jobs (freeze frame, reverse). No Electron imports: usable from plain Node.
const { spawn, execFile } = require('child_process');

// Inside a packaged app the binaries live next to the asar archive, not in it.
const unpacked = (p) => p.replace('app.asar', 'app.asar.unpacked');
const FFMPEG = unpacked(require('ffmpeg-static'));
const FFPROBE = unpacked(require('ffprobe-static').path);

const sec = (n) => Number(n).toFixed(3);

// Runs a binary and collects stdout as a Buffer.
function run(bin, args, { quiet = true } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    const out = [];
    let err = '';
    child.stdout.on('data', (b) => out.push(b));
    child.stderr.on('data', (b) => {
      err = (err + b).slice(-4000);
    });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(quiet ? err.trim() || `${bin} → ${code}` : err))));
  });
}

const ffmpeg = (args) => run(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', ...args]);

// What the editor needs to know about a file. Portrait phone videos are often stored landscape with a
// rotation flag, so width/height describe the picture as displayed.
async function probe(file) {
  const json = await new Promise((resolve, reject) => {
    execFile(FFPROBE, ['-v', 'error', '-of', 'json', '-show_format', '-show_streams', file], { maxBuffer: 16 << 20 }, (err, stdout, stderr) =>
      err ? reject(new Error(stderr || err.message)) : resolve(JSON.parse(stdout)));
  });
  const streams = json.streams || [];
  const video = streams.find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic);
  const audio = streams.find((s) => s.codec_type === 'audio');
  const rotation = Number(video?.tags?.rotate ?? video?.side_data_list?.find((d) => 'rotation' in d)?.rotation ?? 0);
  const sideways = Math.abs(rotation) % 180 === 90;
  const [num, den] = String(video?.r_frame_rate || '30/1').split('/').map(Number);
  return {
    duration: Number(json.format?.duration) || 0,
    hasVideo: Boolean(video),
    hasAudio: Boolean(audio),
    width: video ? (sideways ? video.height : video.width) : 0,
    height: video ? (sideways ? video.width : video.height) : 0,
    fps: video ? (den ? num / den : 30) : 0,
  };
}

// One frame as a small JPEG data: URL (library tiles, timeline filmstrip, project cards).
async function thumbnail(file, at) {
  try {
    const jpg = await run(FFMPEG, ['-v', 'error', '-ss', sec(at), '-i', file, '-frames:v', '1', '-vf', 'scale=-2:120', '-f', 'image2', '-c:v', 'mjpeg', '-q:v', '5', 'pipe:1']);
    return jpg.length ? `data:image/jpeg;base64,${jpg.toString('base64')}` : null;
  } catch {
    return null;
  }
}

// Loudness envelope for waveforms: PEAKS_PER_SEC values per second, scaled 0..100.
const PEAKS_PER_SEC = 20;
async function peaks(file) {
  const rate = 2000;
  let pcm;
  try {
    pcm = await run(FFMPEG, ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', String(rate), '-f', 's16le', 'pipe:1']);
  } catch {
    return null;
  }
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2));
  const per = rate / PEAKS_PER_SEC;
  const env = [];
  for (let i = 0; i + per <= samples.length; i += per) {
    let top = 0;
    for (let j = i; j < i + per; j++) top = Math.max(top, Math.abs(samples[j]));
    env.push(top);
  }
  if (!env.length) return null;
  const loudest = Math.max(1, ...env);
  return env.map((v) => Math.round((100 * v) / loudest));
}

// Full-resolution still of the source frame at `at` (freeze frame).
const extractFrame = (file, at, out) => ffmpeg(['-ss', sec(at), '-i', file, '-frames:v', '1', out]);

// Reversed copy of file[from..to], picture and sound. The reverse filter buffers the whole range in memory.
function reverseClip(file, from, to, out, hasAudio) {
  const audio = hasAudio ? ['-af', 'areverse', '-c:a', 'aac', '-b:a', '192k'] : ['-an'];
  return ffmpeg(['-ss', sec(from), '-t', sec(to - from), '-i', file, '-vf', 'reverse', ...audio, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', out]);
}

module.exports = { FFMPEG, FFPROBE, PEAKS_PER_SEC, probe, thumbnail, peaks, extractFrame, reverseClip, ffmpeg };
