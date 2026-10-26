// UssamaEditing — Electron main process: window, file dialogs, and the long jobs the UI asks for.
const { app, BrowserWindow, ipcMain, dialog, shell, nativeImage, session, systemPreferences } = require('electron');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { runExport, extractFrame, reverseClip } = require('./ffmpeg.cjs');
const whisper = require('./whisper.cjs');
const { removeBackground } = require('./cutout.cjs');
const { ensureSfx } = require('./sfx.cjs');
const { KINDS, ALL_EXT, createLibrary } = require('./library.cjs');

const ICON = path.join(__dirname, '..', 'assets', 'icon.png');
const SMOKE = process.env.USSAMA_SMOKE;

app.setName('UssamaEditing');
// Automated UI checks use a throwaway profile so they never touch real projects.
if (SMOKE) app.setPath('userData', path.join(SMOKE, 'userData'));

let win = null;
let lib = null;
const send = (channel, value) => win?.webContents.send(channel, value);

// Cancellable jobs (export, transcription, cut-out), one per kind at a time.
const jobs = new Map();
async function runJob(kind, start, toResult) {
  const job = start();
  jobs.set(kind, job);
  try {
    return { ok: true, ...toResult(await job.promise) };
  } catch (e) {
    return job.canceled || e.message === 'canceled' ? { canceled: true } : { ok: false, error: e.message };
  } finally {
    jobs.delete(kind);
  }
}
function cancelJob(kind) {
  const job = jobs.get(kind);
  if (!job) return;
  job.canceled = true;
  job.cancel();
}

// macOS `say` voices: "Majed   ar_001   # …" -> { name, lang }
function systemVoices() {
  if (process.platform !== 'darwin') return Promise.resolve([]);
  return new Promise((resolve) => execFile('say', ['-v', '?'], (err, out) => {
    if (err) return resolve([]);
    const voices = [];
    for (const line of out.split('\n')) {
      const m = line.match(/^(.+?)\s{2,}([a-z]{2}_[A-Z0-9]+)\s+#/);
      if (m) voices.push({ name: m[1].trim(), lang: m[2] });
    }
    resolve(voices);
  }));
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');
const firstItem = async (file, extra = {}) => ({ ...(await lib.describe(file)), ...extra });

const handlers = {
  // --- media in ---
  'media:import': async () => {
    const pick = await dialog.showOpenDialog(win, {
      title: 'Import',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Media', extensions: ALL_EXT },
        { name: 'Video', extensions: KINDS.video },
        { name: 'Images', extensions: KINDS.image },
        { name: 'Audio', extensions: KINDS.audio },
      ],
    });
    return pick.canceled ? [] : lib.describeAll(pick.filePaths);
  },
  'media:importPaths': (files) => lib.describeAll(files.filter((f) => typeof f === 'string' && fs.existsSync(f))),

  // --- things the app generates ---
  'sticker:save': (name, dataUrl) => {
    const base64 = String(dataUrl).match(/^data:image\/png;base64,(.+)$/)?.[1];
    if (!base64) throw new Error('bad sticker');
    const file = path.join(lib.generated('stickers'), `${String(name).replace(/[^\w-]/g, '_')}.png`);
    fs.writeFileSync(file, Buffer.from(base64, 'base64'));
    return lib.describe(file);
  },
  'sfx:list': async () => {
    const sounds = await ensureSfx(lib.generated('sfx-v2'));
    const items = await lib.describeAll(sounds.map((s) => s.path));
    return items.map((item, i) => ({ ...item, name: sounds[i].label, sfx: sounds[i].id }));
  },
  'voice:save': (bytes) => {
    const file = path.join(lib.generated('voice'), `voix-${stamp()}.webm`);
    fs.writeFileSync(file, Buffer.from(bytes));
    return lib.describe(file);
  },
  'mic:access': () => {
    if (process.platform !== 'darwin' || systemPreferences.getMediaAccessStatus('microphone') === 'granted') return true;
    return systemPreferences.askForMediaAccess('microphone');
  },
  'tts:voices': () => systemVoices(),
  'tts:make': async (text, voice, speed) => {
    if (!(await systemVoices()).some((v) => v.name === voice)) throw new Error('Voix ma kaynach');
    const file = path.join(lib.generated('voice'), `tts-${stamp()}.aiff`);
    const args = ['-v', voice, '-o', file, ...(speed ? ['-r', String(Math.round(speed))] : []), '--', String(text).slice(0, 5000)];
    await new Promise((resolve, reject) => execFile('say', args, (err) => (err ? reject(err) : resolve())));
    return firstItem(file, { name: `🗣 ${String(text).slice(0, 30)}` });
  },
  'clip:freeze': async (media, at) => {
    const file = path.join(lib.generated('freeze'), `${path.parse(media.path).name}-${at.toFixed(2)}-${stamp()}.png`);
    await extractFrame(media.path, at, file);
    return firstItem(file, { name: `❄ ${media.name} @${at.toFixed(1)}s` });
  },
  'clip:reverse': async (media, from, to) => {
    if (to - from > 60) throw new Error('Reverse khddam 7ta l 60 tanya. 9ss l-clip 9bel.');
    const file = path.join(lib.generated('reversed'), `${path.parse(media.path).name}-rev-${stamp()}.mp4`);
    await reverseClip(media.path, from, to, file, media.hasAudio);
    return firstItem(file, { name: `⟲ ${media.name}` });
  },

  // --- long jobs ---
  // Background removal makes a transparent WebM, imported as a new media item.
  'cutout:start': async (media) => {
    const res = await runJob('cutout',
      () => removeBackground(media, lib.generated('cutouts'), app.getPath('userData'), (p) => send('cutout:progress', p)),
      (file) => ({ file }));
    return res.ok ? { ok: true, item: await firstItem(res.file, { alpha: true, name: `${media.name} (détouré)` }) } : res;
  },
  'cutout:cancel': () => cancelJob('cutout'),
  'export:start': async (project, quality) => {
    const where = await dialog.showSaveDialog(win, {
      title: 'Export',
      defaultPath: `${project.name && project.name !== 'Untitled' ? project.name : 'ussamai'}.mp4`,
      filters: [{ name: 'MP4', extensions: ['mp4'] }],
    });
    if (where.canceled) return { canceled: true };
    return runJob('export', () => runExport(project, where.filePath, (p) => send('export:progress', p), { quality }), (file) => ({ file }));
  },
  'export:cancel': () => cancelJob('export'),
  'captions:status': () => whisper.status(),
  'captions:generate': (project, language) => runJob('captions', () => whisper.transcribe(project, language, (p) => send('captions:progress', p)), (words) => ({ words })),
  'captions:cancel': () => cancelJob('captions'),

  // --- projects ---
  'projects:list': () => lib.projects.list(),
  'projects:load': (id) => lib.projects.load(id),
  'projects:save': (meta, project) => lib.projects.save(meta, project),
  // Deleted projects go to the Trash so they can be recovered.
  'projects:delete': async (id) => {
    const file = lib.projects.file(id);
    if (fs.existsSync(file)) await shell.trashItem(file);
    return true;
  },
  'project:save': async (json) => {
    const where = await dialog.showSaveDialog(win, { title: 'Save', defaultPath: 'projet.ussama.json', filters: [{ name: 'Project', extensions: ['json'] }] });
    if (where.canceled) return null;
    fs.writeFileSync(where.filePath, json, 'utf8');
    return where.filePath;
  },
  'project:open': async () => {
    const pick = await dialog.showOpenDialog(win, { title: 'Open', properties: ['openFile'], filters: [{ name: 'Project', extensions: ['json'] }] });
    return pick.canceled ? null : fs.readFileSync(pick.filePaths[0], 'utf8');
  },
  'shell:show': (file) => shell.showItemInFolder(file),
};

for (const [channel, fn] of Object.entries(handlers)) ipcMain.handle(channel, (_event, ...args) => fn(...args));

function openWindow() {
  win = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    title: 'UssamaEditing',
    icon: ICON,
    backgroundColor: '#030303',
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false },
  });
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  if (SMOKE) win.webContents.once('did-finish-load', () => require('./smoke.cjs')(win, app, SMOKE));
}

app.whenReady().then(() => {
  lib = createLibrary(app.getPath('userData'));
  // The UI only ever asks for the microphone (voice-over).
  session.defaultSession.setPermissionRequestHandler((_wc, permission, allow) => allow(permission === 'media'));
  if (process.platform === 'darwin' && app.dock && fs.existsSync(ICON)) app.dock.setIcon(nativeImage.createFromPath(ICON));
  openWindow();
});
app.on('window-all-closed', () => app.quit());
