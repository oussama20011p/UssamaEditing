// Drives the MCP server (electron/mcp.cjs) the way Claude does, against a throwaway library:
// create a project, add a hook text + sound effect, edit clips, caption it (if Whisper is installed), export.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const { ffmpegPath, probe } = require('../electron/ffmpeg.cjs');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ussama-mcp-test-'));
const clip = path.join(dir, 'clip.mp4');
execFileSync(ffmpegPath, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=720x1280:d=3', '-f', 'lavfi', '-i', 'sine=f=440:d=3', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', clip]);
const speech = process.argv[2]; // optional: a clip with speech, to test auto_captions

const server = spawn(process.execPath, [path.join(__dirname, '..', 'electron', 'mcp.cjs')], { env: { ...process.env, USSAMA_DATA: path.join(dir, 'data') } });
server.stderr.on('data', (d) => process.env.DEBUG && process.stderr.write(d));
let buf = '';
const waiting = new Map();
server.stdout.on('data', (d) => {
  buf += d;
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const msg = JSON.parse(buf.slice(0, nl));
    buf = buf.slice(nl + 1);
    waiting.get(msg.id)?.(msg);
  }
});
let next = 1;
const rpc = (method, params) => new Promise((resolve) => {
  const id = next++;
  waiting.set(id, resolve);
  server.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
});
const call = async (name, args) => {
  const res = (await rpc('tools/call', { name, arguments: args })).result;
  if (res.isError) throw new Error(`${name}: ${res.content[0].text}`);
  return JSON.parse(res.content[0].text);
};
const assert = (ok, what) => {
  if (!ok) throw new Error('FAILED: ' + what);
  console.log('ok -', what);
};

(async () => {
  const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
  assert(init.result.serverInfo.name === 'ussama-editing', 'initialize');
  server.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  const { tools } = (await rpc('tools/list')).result;
  assert(tools.length >= 15 && tools.every((t) => t.inputSchema.type === 'object'), `tools/list (${tools.length} tools)`);

  const files = speech ? [clip, speech] : [clip, clip];
  const p = await call('create_project', { name: 'MCP test', files });
  assert(p.main.length === 2 && p.format === '9:16', 'create_project puts both clips on the main track');
  const id = p.project_id;
  assert((await call('list_projects', {})).some((m) => m.project_id === id), 'list_projects sees it');
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'data', 'projects', `${id}.json`), 'utf8'));
  assert(saved.meta.by === 'claude', 'saved with the claude mark (live reload in the app)');

  const t = await call('add_text', { project_id: id, text: 'ما تبقاش تخلص CapCut 👇', preset: 'hook', start: 0, duration: 2, y: 0.2 });
  assert(t.texts.length === 1 && t.texts[0].text.includes('CapCut'), 'add_text');
  const s = await call('add_sound_effect', { project_id: id, sound: 'whoosh', at: 1 });
  assert(s.audio.length === 1 && s.audio[0].start === 1, 'add_sound_effect');
  const e = await call('edit_clip', { project_id: id, clip_id: p.main[0].clip_id, changes: { filter: 'cine', motion: 'zoomIn' } });
  assert(e.main[0].filter === 'cine' && e.main[0].motion === 'zoomIn', 'edit_clip');
  const all = await call('edit_all_main_clips', { project_id: id, changes: { transition: { type: 'fade', duration: 0.4 } } });
  assert(all.main[1].transition === 'fade' && all.main[0].transition === 'none', 'edit_all_main_clips (transition skips first clip)');
  const sp = await call('split_clip', { project_id: id, clip_id: p.main[0].clip_id, at: 1.5 });
  assert(sp.main.length === 3, 'split_clip');
  const opts = await call('list_options', {});
  assert(opts.sounds.whoosh && opts.filters.includes('cine'), 'list_options');

  const bad = (await rpc('tools/call', { name: 'get_project', arguments: { project_id: 'nope' } })).result;
  assert(bad.isError, 'unknown project is a tool error, not a crash');

  if (speech && opts.captions_ready.binary && opts.captions_ready.model) {
    const c = await call('auto_captions', { project_id: id, language: 'ar' });
    assert(c.words > 3 && c.captions.count > 0, `auto_captions (${c.words} words: ${c.captions.preview[0]})`);
  } else console.log('skip - auto_captions (pass a speech clip and install whisper-cli)');

  const out = path.join(dir, 'out.mp4');
  const x = await call('export_video', { project_id: id, output_path: out, quality: 'small' });
  const info = await probe(out);
  assert(info.hasVideo && info.hasAudio && Math.abs(info.duration - x.duration) < 0.3, `export_video (${x.duration}s)`);

  server.kill();
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('MCP test passed');
})().catch((e) => {
  console.error(e.message);
  server.kill();
  process.exit(1);
});
