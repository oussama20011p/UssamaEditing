// Offline transcription with whisper.cpp (`whisper-cli`), word by word.
// Install on macOS: `brew install whisper-cpp`, then put a ggml model in ~/.cache/whisper
// (ggml-large-v3-turbo.bin is the best for Darija; ggml-base.bin is faster).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { runExport } = require('./ffmpeg.cjs');

const BIN_CANDIDATES = ['/opt/homebrew/bin/whisper-cli', '/usr/local/bin/whisper-cli'];
const MODEL_DIRS = [path.join(os.homedir(), '.cache', 'whisper'), '/opt/homebrew/share/whisper.cpp', '/usr/local/share/whisper.cpp'];
const MODEL_PREFERENCE = ['large-v3-turbo', 'large-v3', 'medium', 'small', 'base'];

function findBinary() {
  const fromPath = (process.env.PATH || '').split(path.delimiter).map((d) => path.join(d, 'whisper-cli'));
  return [...BIN_CANDIDATES, ...fromPath].find((p) => fs.existsSync(p)) || null;
}

function findModel() {
  const models = MODEL_DIRS.flatMap((d) => {
    try {
      return fs.readdirSync(d).filter((f) => /^ggml-.*\.bin$/.test(f) && !f.includes('for-tests')).map((f) => path.join(d, f));
    } catch {
      return [];
    }
  });
  for (const name of MODEL_PREFERENCE) {
    const m = models.find((p) => path.basename(p).startsWith(`ggml-${name}`));
    if (m) return m;
  }
  return models[0] || null;
}

function status() {
  return { binary: findBinary(), model: findModel() };
}

// whisper-cli JSON (with -ml 1 -sow) has one segment per word.
function parseWords(json) {
  return (json.transcription || [])
    .map((s) => ({ text: s.text.trim(), start: s.offsets.from / 1000, end: s.offsets.to / 1000 }))
    .filter((w) => w.text && !/^\[.*\]$/.test(w.text) && w.end > w.start);
}

// Returns { promise, cancel }; promise resolves to [{ text, start, end }] on the project timeline.
function transcribe(project, language, onProgress) {
  const { binary, model } = status();
  if (!binary) throw new Error('whisper-cli ma kaynch. 7elli Terminal w kteb: brew install whisper-cpp');
  if (!model) throw new Error('Ma kayn ta model Whisper f ~/.cache/whisper. Nzzel ggml-large-v3-turbo.bin (ra README).');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ussama-asr-'));
  const wav = path.join(tmpDir, 'audio.wav');
  const outBase = path.join(tmpDir, 'words');
  let proc = null;
  let canceled = false;
  const audioJob = runExport(project, wav, null, { audioOnly: true });

  const promise = (async () => {
    try {
      onProgress?.(0.05);
      await audioJob.promise;
      if (canceled) throw new Error('canceled');
      await new Promise((resolve, reject) => {
        const args = ['-m', model, '-f', wav, '-l', language || 'auto', '-ml', '1', '-sow', '-oj', '-of', outBase, '-pp', '-t', String(Math.max(2, os.cpus().length - 2))];
        proc = spawn(binary, args);
        let log = '';
        const onData = (d) => {
          const s = d.toString();
          log = (log + s).slice(-6000);
          const m = /progress\s*=\s*(\d+)%/.exec(s);
          if (m) onProgress?.(0.1 + (Number(m[1]) / 100) * 0.9);
        };
        proc.stdout.on('data', onData);
        proc.stderr.on('data', onData);
        proc.on('error', reject);
        proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(canceled ? 'canceled' : `whisper-cli fchel (code ${code}):\n${log.slice(-2000)}`))));
      });
      const json = JSON.parse(fs.readFileSync(outBase + '.json', 'utf8'));
      onProgress?.(1);
      return parseWords(json);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  })();

  return {
    promise,
    cancel: () => {
      canceled = true;
      audioJob.cancel();
      proc?.kill('SIGKILL');
    },
  };
}

module.exports = { status, transcribe, parseWords };
