// Where UssamaEditing keeps things on disk, and how files become media items.
//   <userData>/projects/<id>.json   saved projects ({ meta, project })
//   <userData>/generated/<kind>/    files the app makes: stickers, voice, freeze frames, cut-outs…
const fs = require('fs');
const path = require('path');
const { probe, thumbnail, peaks, PEAKS_PER_SEC } = require('./media.cjs');

const KINDS = {
  video: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v'],
  audio: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'aiff', 'webm'],
  image: ['png', 'jpg', 'jpeg', 'webp'],
};
const ALL_EXT = [...new Set(Object.values(KINDS).flat())];
const extOf = (file) => path.extname(file).slice(1).toLowerCase();

function createLibrary(userData) {
  const ensure = (...parts) => {
    const dir = path.join(userData, ...parts);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  };
  const generated = (kind) => ensure('generated', kind);
  const projectPath = (id) => path.join(ensure('projects'), `${String(id).replace(/[^\w-]/g, '')}.json`);

  // File on disk -> media item for the UI (or { error } when it cannot be used).
  async function describe(file) {
    const name = path.basename(file);
    const ext = extOf(file);
    if (!ALL_EXT.includes(ext)) return { path: file, name, error: 'format ma mdaboumch' };
    try {
      const info = await probe(file);
      const still = KINDS.image.includes(ext);
      const [thumb, wave] = await Promise.all([
        info.hasVideo ? thumbnail(file, still ? 0 : Math.min(1, info.duration / 2)) : null,
        info.hasAudio && !still ? peaks(file) : null,
      ]);
      const type = still ? 'image' : info.hasVideo ? 'video' : 'audio';
      return { ...info, path: file, name, type, thumb, peaks: wave, peaksPerSec: PEAKS_PER_SEC, ...(still && { duration: 0, hasAudio: false }) };
    } catch (e) {
      return { path: file, name, error: e.message };
    }
  }
  const describeAll = (files) => Promise.all(files.map(describe));

  const projects = {
    list() {
      const dir = ensure('projects');
      const metas = [];
      for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
        try {
          metas.push(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).meta);
        } catch {
          // Unreadable file: skip it rather than hide every project.
        }
      }
      return metas.filter(Boolean).sort((a, b) => b.updatedAt - a.updatedAt);
    },
    load: (id) => JSON.parse(fs.readFileSync(projectPath(id), 'utf8')).project,
    // Atomic write: a crash mid-save leaves the previous version intact.
    save(meta, project) {
      const file = projectPath(meta.id);
      fs.writeFileSync(`${file}.part`, JSON.stringify({ meta: { ...meta, updatedAt: Date.now() }, project }));
      fs.renameSync(`${file}.part`, file);
      return true;
    },
    file: projectPath,
  };

  return { generated, describe, describeAll, projects };
}

module.exports = { KINDS, ALL_EXT, createLibrary };
