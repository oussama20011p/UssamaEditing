// Turns a project into one FFmpeg command (inputs + filter graph) and runs it with progress.
//
// Pipeline: every main-track clip becomes a normalised video + audio stream, the clips are joined
// (xfade / acrossfade where a transition overlaps them, concat otherwise), overlays are composited
// lane by lane, text and captions are burned in with libass, then music is mixed in.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { FFMPEG } = require('./media.cjs');
const { buildAss } = require('./ass.cjs');
const { clipLook } = require('../shared/look.cjs');
const kf = require('../shared/keyframes.cjs');

const FONTS_DIR = path.join(__dirname, '..', 'assets', 'fonts').replace('app.asar', 'app.asar.unpacked');

const f3 = (n) => Number(n).toFixed(3);
const rate = (c) => c.speed || 1;
const playLength = (c) => (c.out - c.in) / rate(c);

// Transition rules, mirrored from src/store.js.
const COLOUR_DIPS = new Set(['black', 'white', 'flash']);
const overlaps = (type) => Boolean(type) && type !== 'none' && !COLOUR_DIPS.has(type);
const overlapLength = (clip, prevLen, len) => (overlaps(clip.transition?.type) ? Math.max(0, Math.min(clip.transition.duration || 0.5, prevLen / 2, len / 2)) : 0);
const dipHalf = (clip) => {
  const tr = clip.transition;
  if (!tr || !COLOUR_DIPS.has(tr.type)) return 0;
  return (tr.type === 'flash' ? Math.min(tr.duration, 0.3) : tr.duration) / 2;
};
const dipColour = (type) => (type === 'black' ? 'black' : 'white');

// atempo works between 0.5x and 100x per instance; slower speeds are a chain of halvings.
function tempoChain(speed) {
  const steps = [];
  for (let s = speed; ; s /= 0.5) {
    if (s >= 0.5) return [...steps, `atempo=${f3(s)}`];
    steps.push('atempo=0.5');
  }
}

const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

// Collects inputs and filter chains, handing out unique stream labels.
class Graph {
  constructor() {
    this.args = [];
    this.count = 0;
    this.chains = [];
    this.serial = 0;
  }
  input(...args) {
    this.args.push(...args);
    return this.count++;
  }
  label(prefix) {
    this.serial += 1;
    return `${prefix}${this.serial}`;
  }
  // chain(['0:v'], ['trim=…', 'setpts=…'], 'v1') => "[0:v]trim=…,setpts=…[v1]"
  chain(from, filters, to) {
    this.chains.push(`${from.map((l) => `[${l}]`).join('')}${filters.join(',')}[${to}]`);
    return to;
  }
}

function addMediaInput(g, media, { fps, seconds } = {}) {
  if (media.type === 'image') return g.input('-loop', '1', '-framerate', String(fps), '-t', f3(seconds), '-i', media.path);
  if (media.alpha) return g.input('-c:v', 'libvpx-vp9', '-i', media.path); // libvpx keeps WebM transparency
  return g.input('-i', media.path);
}

function frameFilters(clip, W, H) {
  return clip.fit === 'fit'
    ? [`scale=${W}:${H}:force_original_aspect_ratio=decrease`, `pad=${W}:${H}:-1:-1:color=black`]
    : [`scale=${W}:${H}:force_original_aspect_ratio=increase`, `crop=${W}:${H}`];
}

// One main-track clip -> [videoLabel, audioLabel] of exactly its play length.
function mainClip(g, project, clips, i, media, wantVideo) {
  const { width: W, height: H, fps } = project;
  const clip = clips[i];
  const len = playLength(clip);
  const index = addMediaInput(g, media, { fps, seconds: clip.out });

  const dipIn = i > 0 ? dipHalf(clip) : 0;
  const dipOut = i + 1 < clips.length ? dipHalf(clips[i + 1]) : 0;
  const fadeIn = Math.min(len, Math.max(dipIn, clip.fadeIn || 0));
  const fadeOut = Math.min(len, Math.max(dipOut, clip.fadeOut || 0));

  let video = null;
  if (wantVideo) {
    const vf = [`trim=${f3(clip.in)}:${f3(clip.out)}`, `setpts=(PTS-STARTPTS)/${f3(rate(clip))}`, ...frameFilters(clip, W, H), 'setsar=1', `fps=${fps}`];
    if (clip.motion === 'zoomIn' || clip.motion === 'zoomOut') {
      // Ken Burns: grow / shrink 15% over the clip, cropped back to the frame each frame.
      const zoom = clip.motion === 'zoomIn' ? `1+0.15*t/${f3(len)}` : `1.15-0.15*t/${f3(len)}`;
      vf.push(`scale=w='${W}*(${zoom})':h=-2:eval=frame`, `crop=${W}:${H}`, 'setsar=1');
    }
    if (clip.mirror) vf.push('hflip');
    const { eq, matrix } = clipLook(clip);
    if (eq.b || eq.c !== 1 || eq.s !== 1) vf.push(`eq=brightness=${f3(eq.b)}:contrast=${f3(eq.c)}:saturation=${f3(eq.s)}`);
    if (matrix) vf.push(`colorchannelmixer=${matrix.flatMap((row) => [...row, 0]).map(f3).join(':')}`);
    if (fadeIn) vf.push(`fade=in:st=0:d=${f3(fadeIn)}:color=${dipIn ? dipColour(clip.transition.type) : 'black'}`);
    if (fadeOut) vf.push(`fade=out:st=${f3(len - fadeOut)}:d=${f3(fadeOut)}:color=${dipOut ? dipColour(clips[i + 1].transition.type) : 'black'}`);
    vf.push('format=yuv420p', 'settb=AVTB');
    video = g.chain([`${index}:v`], vf, g.label('v'));
  }

  const audioLabel = g.label('a');
  if (media.hasAudio && !clip.muted) {
    const af = [`atrim=${f3(clip.in)}:${f3(clip.out)}`, 'asetpts=PTS-STARTPTS'];
    if (rate(clip) !== 1) af.push(...tempoChain(rate(clip)));
    af.push(`volume=${clip.volume ?? 1}`);
    if (fadeIn) af.push(`afade=in:st=0:d=${f3(fadeIn)}`);
    if (fadeOut) af.push(`afade=out:st=${f3(len - fadeOut)}:d=${f3(fadeOut)}`);
    // Pad / cut so the audio is exactly as long as the picture.
    af.push('aresample=48000', 'aformat=sample_fmts=fltp:channel_layouts=stereo', `apad=whole_dur=${f3(len)}`, `atrim=duration=${f3(len)}`);
    g.chain([`${index}:a`], af, audioLabel);
  } else {
    g.chains.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${f3(len)},aformat=sample_fmts=fltp[${audioLabel}]`);
  }
  return [video, audioLabel];
}

// Joins the main track; returns { video, audio, duration }.
function mainTrack(g, project, mediaById, wantVideo) {
  const clips = project.videoClips.filter((c) => mediaById[c.mediaId]);
  if (!clips.length) throw new Error('The video track is empty.');
  const parts = clips.map((_, i) => mainClip(g, project, clips, i, mediaById[clips[i].mediaId], wantVideo));
  let [video, audio] = parts[0];
  let duration = playLength(clips[0]);
  for (let i = 1; i < clips.length; i++) {
    const len = playLength(clips[i]);
    const ov = overlapLength(clips[i], playLength(clips[i - 1]), len);
    const [v, a] = parts[i];
    if (ov) {
      if (wantVideo) video = g.chain([video, v], [`xfade=transition=${clips[i].transition.type}:duration=${f3(ov)}:offset=${f3(duration - ov)}`], g.label('jv'));
      audio = g.chain([audio, a], [`acrossfade=d=${f3(ov)}:c1=tri:c2=tri`], g.label('ja'));
    } else {
      if (wantVideo) video = g.chain([video, v], ['concat=n=2:v=1:a=0'], g.label('jv'));
      audio = g.chain([audio, a], ['concat=n=2:v=0:a=1'], g.label('ja'));
    }
    duration += len - ov;
  }
  return { video, audio, duration };
}

// Timeline audio (music, voice, SFX, overlay sound): placed at its start time, mixed later.
function placedAudio(g, index, clip) {
  const len = playLength(clip);
  const ms = Math.round(clip.start * 1000);
  const af = [`atrim=${f3(clip.in)}:${f3(clip.out)}`, 'asetpts=PTS-STARTPTS'];
  if (rate(clip) !== 1) af.push(...tempoChain(rate(clip)));
  af.push(`volume=${clip.volume ?? 1}`);
  if (clip.fadeIn > 0) af.push(`afade=in:st=0:d=${f3(Math.min(clip.fadeIn, len))}`);
  if (clip.fadeOut > 0) af.push(`afade=out:st=${f3(Math.max(0, len - clip.fadeOut))}:d=${f3(Math.min(clip.fadeOut, len))}`);
  af.push('aresample=48000', 'aformat=sample_fmts=fltp:channel_layouts=stereo', `adelay=${ms}|${ms}`);
  return g.chain([`${index}:a`], af, g.label('x'));
}

// Shape mask (and the circle's ring) painted with geq on a 540 px working copy.
function shapeFilters(o, W) {
  if (o.shape === 'circle') {
    const ring = ((o.ring || 0) * 540) / (W * (o.scale || 0.4));
    const [r, gg, b] = rgbOf(o.ringColor || '#ffffff');
    const dist = 'hypot(X-W/2,Y-H/2)';
    const onRing = `gte(${dist},W/2-${f3(ring)})`;
    const paint = (v, c) => `${c}='if(${onRing},${v},${c}(X,Y))'`;
    return ["crop='min(iw,ih)':'min(iw,ih)'", 'scale=540:540', 'format=rgba',
      `geq=${paint(r, 'r')}:${paint(gg, 'g')}:${paint(b, 'b')}:a='if(lte(${dist},W/2),if(${onRing},255,alpha(X,Y)),0)'`];
  }
  if (o.shape === 'rounded') {
    const rad = 'min(W,H)*0.12';
    const ex = `max(0,abs(X-W/2)-(W/2-${rad}))`;
    const ey = `max(0,abs(Y-H/2)-(H/2-${rad}))`;
    return ['scale=540:-2', 'format=rgba', `geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lte(hypot(${ex},${ey}),${rad}),alpha(X,Y),0)'`];
  }
  return [];
}

// Composites the overlay lanes onto `base`; returns the new video label. Overlay audio goes to `mix`.
function overlayTrack(g, project, mediaById, base, mix) {
  const { width: W, height: H, fps } = project;
  const lanes = (project.overlayClips || []).filter((o) => mediaById[o.mediaId]).sort((a, b) => (a.lane || 0) - (b.lane || 0));
  let video = base;
  for (const o of lanes) {
    const media = mediaById[o.mediaId];
    const len = playLength(o);
    const S = o.start;
    const index = addMediaInput(g, media, { fps, seconds: o.in + len });
    const vf = [`trim=${f3(o.in)}:${f3(o.out)}`, `setpts=(PTS-STARTPTS)/${f3(rate(o))}+${f3(S)}/TB`, 'format=rgba'];
    if (o.chroma?.on) vf.push(`colorkey=0x${(o.chroma.color || '#00ff00').slice(1)}:${f3(o.chroma.similarity ?? 0.3)}:0.08`);
    vf.push(...shapeFilters(o, W));
    if (o.rotation) {
      const rad = f3((o.rotation * Math.PI) / 180);
      vf.push(`rotate=${rad}:c=none:ow='rotw(${rad})':oh='roth(${rad})'`);
    }
    if ((o.opacity ?? 1) < 1) vf.push(`colorchannelmixer=aa=${f3(o.opacity)}`);
    // The animated scale must be last: filters after it would be configured for the first frame's size.
    vf.push(`scale=w='max(2,trunc(${W}*${kf.expr(o, 'scale', S)}*${kf.popExpr(o, S)}/2)*2)':h=-2:eval=frame`);
    const layer = g.chain([`${index}:v`], vf, g.label('ov'));
    const x = `W*(${kf.expr(o, 'x', S)})-w/2`;
    const y = `H*(${kf.expr(o, 'y', S)})-h/2`;
    video = g.chain([video, layer], [`overlay=x='${x}':y='${y}':eval=frame:enable='between(t,${f3(S)},${f3(S + len)})'`], g.label('vo'));
    if (media.type !== 'image' && media.hasAudio && !o.muted) mix.push(placedAudio(g, index, o));
  }
  return video;
}

// Builds { args, total, cwd }. opts.audioOnly: only the main track's sound, as 16 kHz mono WAV (for Whisper).
function buildExportArgs(project, outFile, workDir, opts = {}) {
  const mediaById = Object.fromEntries(project.media.map((m) => [m.id, m]));
  const g = new Graph();
  const main = mainTrack(g, project, mediaById, !opts.audioOnly);

  if (opts.audioOnly) {
    const args = ['-y', '-hide_banner', ...g.args, '-filter_complex', g.chains.join(';'), '-map', `[${main.audio}]`,
      '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '-t', f3(main.duration), outFile];
    return { args, total: main.duration, cwd: workDir };
  }

  const mix = [main.audio];
  let video = overlayTrack(g, project, mediaById, main.video, mix);

  // Text and captions on top. The ASS file and a link to the fonts sit in the work folder, so the
  // filter can use short relative names instead of escaped absolute paths.
  const ass = buildAss(project);
  if (ass) {
    fs.writeFileSync(path.join(workDir, 'text.ass'), ass, 'utf8');
    const fontsLink = path.join(workDir, 'fonts');
    if (!fs.existsSync(fontsLink)) fs.symlinkSync(FONTS_DIR, fontsLink, 'junction');
    video = g.chain([video], ['ass=text.ass:fontsdir=fonts'], g.label('vt'));
  }
  if (video !== main.video) video = g.chain([video], ['format=yuv420p'], g.label('vf'));

  for (const clip of project.audioClips.filter((c) => mediaById[c.mediaId])) {
    mix.push(placedAudio(g, g.input('-i', mediaById[clip.mediaId].path), clip));
  }
  const audio = mix.length > 1 ? g.chain(mix, [`amix=inputs=${mix.length}:duration=first:normalize=0`], g.label('mx')) : main.audio;

  const crf = { high: 18, medium: 21, small: 25 }[opts.quality] ?? 20;
  const args = [
    '-y', '-hide_banner', ...g.args,
    '-filter_complex', g.chains.join(';'),
    '-map', `[${video}]`, '-map', `[${audio}]`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(crf), '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-t', f3(main.duration), '-movflags', '+faststart',
    '-progress', 'pipe:1', '-nostats', outFile,
  ];
  return { args, total: main.duration, cwd: workDir };
}

// Runs an export. onProgress gets 0..1. Returns { promise, cancel }.
function runExport(project, outFile, onProgress, opts = {}) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ussamai-'));
  const target = path.resolve(outFile);
  const { args, total } = buildExportArgs(project, target, workDir, opts);
  const child = spawn(FFMPEG, args, { cwd: workDir, windowsHide: true });
  let tail = '';
  let pending = '';
  const promise = new Promise((resolve, reject) => {
    // -progress prints key=value lines; out_time_us is how far the encode has got.
    child.stdout.on('data', (chunk) => {
      const lines = (pending + chunk).split('\n');
      pending = lines.pop();
      for (const line of lines) {
        if (line.startsWith('out_time_us=') && total > 0) onProgress?.(Math.min(1, Number(line.slice(12)) / 1e6 / total));
      }
    });
    child.stderr.on('data', (chunk) => {
      tail = (tail + chunk).slice(-20000);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      fs.rmSync(workDir, { recursive: true, force: true });
      if (code !== 0) return reject(new Error(`FFmpeg failed (code ${code}):\n${tail.slice(-3000)}`));
      onProgress?.(1);
      resolve(target);
    });
  });
  return { promise, cancel: () => child.kill('SIGKILL') };
}

module.exports = { FONTS_DIR, buildExportArgs, runExport };
