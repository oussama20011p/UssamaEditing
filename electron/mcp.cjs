// UssamaEditing MCP server: lets Claude (Claude Desktop / Claude Code) edit UssamaEditing projects.
//
// Speaks MCP over stdio (one JSON-RPC message per line). Every tool loads a project from the app's
// library, changes it with the same actions as the UI (src/store.js), and saves it back marked
// `by: 'claude'`; the open app picks the change up live. Exports and captions use the app's engine.
//
// Run: node electron/mcp.cjs   (or the app binary with ELECTRON_RUN_AS_NODE=1, see README)
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { runExport } = require('./ffmpeg.cjs');
const whisper = require('./whisper.cjs');
const { removeBackground } = require('./cutout.cjs');
const { SFX, ensureSfx } = require('./sfx.cjs');
const { createLibrary } = require('./library.cjs');
const FILTERS = require('../shared/filters.json');
const { version } = require('../package.json');

// Same folder Electron uses for app.getPath('userData').
function userDataDir() {
  if (process.env.USSAMA_DATA) return process.env.USSAMA_DATA;
  const home = os.homedir();
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'UssamaEditing');
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'UssamaEditing');
  return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'UssamaEditing');
}

const lib = createLibrary(userDataDir());
// The project model is the UI's own ES modules, unpacked from app.asar in the installed app.
const model = (name) => import(pathToFileURL(path.join(__dirname, '..', 'src', name).replace('app.asar', 'app.asar.unpacked')).href);
let store;
let captions;
let templates;
const loadModel = async () => {
  store ??= await model('store.js');
  captions ??= await model('captions.js');
  templates ??= await model('templates.js');
};

// --- project helpers ---
function load(id) {
  if (!fs.existsSync(lib.projects.file(id))) throw new Error(`No project "${id}". Call list_projects.`);
  return store.normalizeProject(lib.projects.load(id));
}
function save(id, project) {
  lib.projects.save({ ...store.projectMeta(id, project), by: 'claude' }, project);
  return summary(id, project);
}
const act = (p, type, extra) => store.applyAction(p, { type, ...extra });
const r2 = (n) => Math.round(n * 100) / 100;

function summary(id, p) {
  const name = (mid) => p.media.find((m) => m.id === mid)?.name;
  return {
    project_id: id, name: p.name, format: p.format, duration: r2(store.projectDuration(p)),
    main: store.videoLayout(p.videoClips).map(({ clip, start, end }) => ({
      clip_id: clip.id, media: name(clip.mediaId), start: r2(start), end: r2(end), speed: clip.speed, filter: clip.filter,
      transition: clip.transition?.type, motion: clip.motion,
    })),
    overlays: p.overlayClips.map((c) => ({ clip_id: c.id, media: name(c.mediaId), start: r2(c.start), end: r2(c.start + store.overlayLength(c)), shape: c.shape })),
    texts: p.textClips.map((c) => ({ clip_id: c.id, text: c.text, start: r2(c.start), end: r2(c.start + c.duration), y: c.y })),
    audio: p.audioClips.map((c) => ({ clip_id: c.id, media: name(c.mediaId), start: r2(c.start), end: r2(c.start + c.out - c.in), volume: c.volume })),
    captions: { count: p.captions.length, style: p.captionStyle.preset, preview: p.captions.slice(0, 4).map((g) => g.words.map((w) => w.text).join(' ')) },
  };
}

async function importFiles(paths) {
  const missing = paths.filter((f) => !fs.existsSync(f));
  if (missing.length) throw new Error(`File not found: ${missing.join(', ')}`);
  const items = await lib.describeAll(paths);
  const bad = items.filter((i) => i.error);
  if (bad.length) throw new Error(bad.map((b) => `${b.name}: ${b.error}`).join('\n'));
  return items.map((i) => ({ ...i, id: store.uid() }));
}

// Adds media to the project and places it: main track (in order), overlay, or audio (music / voice).
function place(p, items, where, at) {
  p = act(p, 'addMedia', { items });
  for (const item of items) {
    if (where === 'library') continue;
    if (where === 'overlay') p = act(p, 'addOverlay', { mediaId: item.id, clipId: store.uid(), at });
    else if (where === 'audio' || item.type === 'audio') p = act(p, 'addToTimeline', { mediaId: item.id, clipId: store.uid(), at });
    else p = act(p, 'addToTimeline', { mediaId: item.id, clipId: store.uid() });
  }
  return p;
}

const TRACKS = { main: 'video', overlay: 'overlay', text: 'text', audio: 'audio' };
function findClip(p, clipId) {
  for (const [key, track] of [['videoClips', 'video'], ['overlayClips', 'overlay'], ['textClips', 'text'], ['audioClips', 'audio']]) {
    const clip = p[key].find((c) => c.id === clipId);
    if (clip) return { clip, track };
  }
  throw new Error(`No clip "${clipId}" in this project. Call get_project to see clip ids.`);
}

// Runs one of the engine's { promise, cancel } jobs to completion.
const finish = (job) => job.promise;

// --- tools ---
const S = { type: 'string' };
const N = { type: 'number' };
const PID = { project_id: { ...S, description: 'Project id from list_projects / create_project' } };
const obj = (properties, required = []) => ({ type: 'object', properties, required });

const TOOLS = {
  list_projects: {
    description: 'List the projects saved in UssamaEditing (newest first).',
    input: obj({}),
    run: () => lib.projects.list().map((m) => ({ project_id: m.id, name: m.name, format: m.format, duration: r2(m.duration || 0), clips: m.clips })),
  },
  create_project: {
    description: 'Create a new project from video/image files on disk. They go on the main track in order. It appears in the UssamaEditing app right away.',
    input: obj({ name: S, format: { type: 'string', enum: ['9:16', '4:5', '1:1', '16:9'], description: 'Default 9:16 (Reels/TikTok)' }, files: { type: 'array', items: S, description: 'Absolute file paths' } }, ['files']),
    run: async ({ name, format = '9:16', files }) => {
      const id = store.uid();
      let p = act(store.emptyProject(), 'setFormat', { format });
      if (name) p = act(p, 'setName', { name });
      return save(id, place(p, await importFiles(files), 'main'));
    },
  },
  get_project: {
    description: 'Show a project: clips on each track with their ids and times, texts, audio and captions.',
    input: obj(PID, ['project_id']),
    run: ({ project_id }) => summary(project_id, load(project_id)),
  },
  add_media: {
    description: 'Add files to a project. place: "main" (appended to the main video track), "overlay" (picture-in-picture on top, at `at` seconds), "audio" (music / voice-over at `at`), "library" (just import).',
    input: obj({ ...PID, files: { type: 'array', items: S }, place: { type: 'string', enum: ['main', 'overlay', 'audio', 'library'] }, at: N }, ['project_id', 'files']),
    run: async ({ project_id, files, place: where = 'main', at = 0 }) => save(project_id, place(load(project_id), await importFiles(files), where, at)),
  },
  auto_captions: {
    description: 'Transcribe the speech offline (Whisper) and add word-by-word animated captions. Works in Darija/Arabic ("ar"), French ("fr"), English ("en") or "auto".',
    input: obj({ ...PID, language: { ...S, description: 'ar | fr | en | auto (default ar)' }, style: { type: 'string', enum: ['bold', 'box', 'word', 'clean'], description: 'bold = spoken word highlighted (default)' }, color: S, highlight: { ...S, description: 'Colour of the spoken word, e.g. #e9b949' }, y: { ...N, description: 'Vertical position 0 (top) .. 1 (bottom), default 0.72' }, size: N }, ['project_id']),
    run: async ({ project_id, language = 'ar', style, ...look }) => {
      let p = load(project_id);
      if (!p.videoClips.length && !p.audioClips.length) throw new Error('The project has no audio to transcribe.');
      const words = await finish(whisper.transcribe(p, language));
      if (!words.length) throw new Error('No speech heard in the video.');
      p = act(p, 'setCaptionStyle', { patch: { ...(style && { preset: style }), ...look } });
      p = act(p, 'setCaptions', { captions: captions.groupWords(words, p.captionStyle.preset) });
      return { words: words.length, ...save(project_id, p) };
    },
  },
  set_caption_style: {
    description: 'Change the caption look without re-transcribing.',
    input: obj({ ...PID, style: { type: 'string', enum: ['bold', 'box', 'word', 'clean'] }, color: S, highlight: S, y: N, size: N }, ['project_id']),
    run: ({ project_id, style, ...look }) => {
      let p = load(project_id);
      p = act(p, 'setCaptionStyle', { patch: { ...(style && { preset: style }), ...look } });
      if (style && p.captions.length) p = act(p, 'setCaptions', { captions: captions.groupWords(captions.flattenWords(p.captions), style) });
      return save(project_id, p);
    },
  },
  add_text: {
    description: 'Add a text on the video (hook, title, subtitle). Arabic/Darija right-to-left works. preset "hook" = coloured box near the top.',
    input: obj({
      ...PID, text: S, preset: { type: 'string', enum: ['hook', 'title', 'sub'] }, start: N, duration: N,
      x: { ...N, description: '0..1, default 0.5' }, y: { ...N, description: '0 top .. 1 bottom' }, size: N, color: S, bg: { ...S, description: 'Box colour' },
      style: { type: 'string', enum: ['outline', 'box', 'shadow'] }, anim: { type: 'string', enum: ['none', 'fade', 'pop', 'slide'] }, bold: { type: 'boolean' },
    }, ['project_id', 'text']),
    run: ({ project_id, preset = 'title', start = 0, ...patch }) => {
      const clipId = store.uid();
      let p = act(load(project_id), 'addText', { clipId, at: start, preset });
      p = act(p, 'update', { track: 'text', id: clipId, patch });
      return { clip_id: clipId, ...save(project_id, p) };
    },
  },
  add_sound_effect: {
    description: `Add a built-in sound effect at a time. Sounds: ${Object.keys(SFX).join(', ')}.`,
    input: obj({ ...PID, sound: { type: 'string', enum: Object.keys(SFX) }, at: N, volume: { ...N, description: '0..2, default 1' } }, ['project_id', 'sound', 'at']),
    run: async ({ project_id, sound, at, volume = 1 }) => {
      const file = (await ensureSfx(lib.generated('sfx-v2'))).find((s) => s.id === sound);
      let p = load(project_id);
      let item = p.media.find((m) => m.id === `sfx-${sound}`);
      if (!item) {
        item = { ...(await lib.describe(file.path)), id: `sfx-${sound}`, name: SFX[sound][0], sfx: sound };
        p = act(p, 'addMedia', { items: [item] });
      }
      const clipId = store.uid();
      p = act(p, 'addToTimeline', { mediaId: item.id, clipId, at });
      p = act(p, 'update', { track: 'audio', id: clipId, patch: { volume } });
      return { clip_id: clipId, ...save(project_id, p) };
    },
  },
  edit_clip: {
    description: 'Change a clip. Main clips: speed (0.5-3), volume, muted, filter, filterIntensity, brightness, contrast, saturation, motion (none|zoomIn|zoomOut), mirror, fit (fill|fit), fadeIn, fadeOut, transition {type, duration} (into this clip), in/out (trim, source seconds). Texts: text, start, duration, x, y, size, color, bg, style, anim. Overlays: start, x, y, scale, rotation, opacity, shape (none|rounded|circle). Audio: start, volume, fadeIn, fadeOut.',
    input: obj({ ...PID, clip_id: S, changes: { type: 'object', description: 'Fields to change' } }, ['project_id', 'clip_id', 'changes']),
    run: ({ project_id, clip_id, changes }) => {
      const p = load(project_id);
      const { track } = findClip(p, clip_id);
      return save(project_id, act(p, 'update', { track, id: clip_id, patch: changes }));
    },
  },
  edit_all_main_clips: {
    description: 'Apply the same change to every clip on the main track, e.g. {"filter":"cine"} or {"transition":{"type":"fade","duration":0.4}} (the transition skips the first clip).',
    input: obj({ ...PID, changes: { type: 'object' } }, ['project_id', 'changes']),
    run: ({ project_id, changes }) => save(project_id, act(load(project_id), 'updateAllVideo', { patch: changes, skipFirst: Boolean(changes.transition) })),
  },
  split_clip: {
    description: 'Cut a clip in two at a timeline time (seconds).',
    input: obj({ ...PID, clip_id: S, at: N }, ['project_id', 'clip_id', 'at']),
    run: ({ project_id, clip_id, at }) => {
      const p = load(project_id);
      const { track } = findClip(p, clip_id);
      const next = act(p, 'split', { track, id: clip_id, t: at, newId: store.uid() });
      if (next === p) throw new Error('Cannot split there (outside the clip or too close to its edge).');
      return save(project_id, next);
    },
  },
  delete_clip: {
    description: 'Remove a clip from the timeline.',
    input: obj({ ...PID, clip_id: S }, ['project_id', 'clip_id']),
    run: ({ project_id, clip_id }) => {
      const p = load(project_id);
      const { track } = findClip(p, clip_id);
      return save(project_id, act(p, 'delete', { track, id: clip_id }));
    },
  },
  apply_template: {
    description: `Add a ready-made look (texts + caption style). Templates: ${'hook, podcast, product, tuto, youtube'}.`,
    input: obj({ ...PID, template: { type: 'string', enum: ['hook', 'podcast', 'product', 'tuto', 'youtube'] } }, ['project_id', 'template']),
    run: ({ project_id, template }) => {
      const p = load(project_id);
      const t = templates.TEMPLATES.find((x) => x.id === template);
      const d = Math.max(3, store.projectDuration(p) || 10);
      return save(project_id, act(p, 'applyTemplate', { format: t.format, captions: t.captions, texts: t.texts(d, store.uid) }));
    },
  },
  remove_background: {
    description: 'Remove the background behind the person in an OVERLAY video clip (macOS only, offline). Add the video with add_media place "overlay" first.',
    input: obj({ ...PID, clip_id: S }, ['project_id', 'clip_id']),
    run: async ({ project_id, clip_id }) => {
      const p = load(project_id);
      const { clip, track } = findClip(p, clip_id);
      if (track !== 'overlay') throw new Error('remove_background works on overlay clips. Add the video with add_media place "overlay".');
      const media = p.media.find((m) => m.id === clip.mediaId);
      const file = await finish(removeBackground(media, lib.generated('cutouts'), userDataDir()));
      const item = { ...(await lib.describe(file)), alpha: true, name: `${media.name} (détouré)`, id: store.uid() };
      const fresh = act(load(project_id), 'addMedia', { items: [item] });
      return save(project_id, act(fresh, 'update', { track: 'overlay', id: clip_id, patch: { mediaId: item.id, shape: 'none', ring: 0, chroma: { ...clip.chroma, on: false } } }));
    },
  },
  export_video: {
    description: 'Render the project to an MP4 file (H.264 + AAC, no watermark).',
    input: obj({ ...PID, output_path: { ...S, description: 'Absolute .mp4 path. Default: Desktop/<project name>.mp4' }, quality: { type: 'string', enum: ['high', 'medium', 'small'] } }, ['project_id']),
    run: async ({ project_id, output_path, quality = 'high' }) => {
      const p = load(project_id);
      if (!p.videoClips.length) throw new Error('Nothing on the main track to export.');
      const out = output_path || path.join(os.homedir(), 'Desktop', `${(p.name && p.name !== 'Untitled' ? p.name : 'ussamai').replace(/[\\/:*?"<>|]/g, '_')}.mp4`);
      await finish(runExport(p, out, null, { quality }));
      return { file: out, duration: r2(store.exportDuration(p)) };
    },
  },
  list_options: {
    description: 'Names of the filters, transitions, caption styles, text presets, motions, sounds and templates the other tools accept.',
    input: obj({}),
    run: () => ({
      filters: Object.keys(FILTERS).filter((k) => !k.startsWith('_')),
      transitions: Object.keys(store.TRANSITIONS),
      caption_styles: store.CAPTION_PRESETS,
      text_presets: ['hook', 'title', 'sub'],
      text_styles: Object.keys(store.TEXT_STYLES),
      text_anims: Object.keys(store.TEXT_ANIMS),
      motions: Object.keys(store.MOTIONS),
      overlay_shapes: Object.keys(store.SHAPES),
      formats: Object.keys(store.FORMATS),
      sounds: Object.fromEntries(Object.entries(SFX).map(([id, [label]]) => [id, label])),
      templates: templates.TEMPLATES.map((t) => ({ id: t.id, label: t.label, desc: t.desc })),
      captions_ready: whisper.status(),
      remove_background: process.platform === 'darwin',
    }),
  },
};

// --- MCP over stdio ---
const reply = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
const fail = (id, code, message) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n');

async function handle(msg) {
  const { id, method, params = {} } = msg;
  if (id === undefined) return; // notifications (initialized, cancelled) need no answer
  switch (method) {
    case 'initialize':
      return reply(id, {
        protocolVersion: params.protocolVersion || '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'ussama-editing', version },
        instructions: 'Edit videos in UssamaEditing. Start with list_projects or create_project, use get_project to see clip ids, then edit. Changes show live in the open app. Use absolute file paths.',
      });
    case 'ping':
      return reply(id, {});
    case 'tools/list':
      return reply(id, { tools: Object.entries(TOOLS).map(([name, t]) => ({ name, description: t.description, inputSchema: t.input })) });
    case 'tools/call': {
      const tool = TOOLS[params.name];
      if (!tool) return fail(id, -32602, `Unknown tool ${params.name}`);
      try {
        await loadModel();
        const out = await tool.run(params.arguments || {});
        return reply(id, { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] });
      } catch (e) {
        return reply(id, { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true });
      }
    }
    default:
      return fail(id, -32601, `Method not found: ${method}`);
  }
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      fail(null, -32700, 'Parse error');
      continue;
    }
    handle(msg).catch((e) => fail(msg.id ?? null, -32603, e.message));
  }
});
// Logs go to stderr: stdout is the protocol channel.
console.log = console.error;
